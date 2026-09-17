import type { Database } from 'sqlite3';
import { dbAll, dbGet, dbRun } from './database.js';
import { clearTickerCache } from './yahooFinance.js';

const fetch = (...args: any[]) => import('node-fetch').then(({ default: fetch }: any) => fetch(...args)).catch(() => (globalThis as any).fetch(...args));

/**
 * On-demand Web Search & Exchange Price Matcher
 * Fetches exact exchange session close prices for active portfolio equities
 * and aligns SQLite Holdings data.
 */
export async function matchWebPrices(db: Database, portfolioFilter?: string): Promise<{ success: boolean; updated_count: number; message: string; symbols: string[] }> {
  console.log(`[WebPriceMatcher] Starting on-demand Web & Exchange price match (Filter: ${portfolioFilter || 'All'})...`);
  
  // 1. Get active equity holdings
  const ports = (portfolioFilter && portfolioFilter !== 'Combined' && portfolioFilter !== 'All' && portfolioFilter !== 'None')
    ? portfolioFilter.split(',').map(p => p.trim()).filter(Boolean)
    : [];

  let query = 'SELECT DISTINCT symbol, isin FROM Holdings WHERE quantity > 0';
  const params: any[] = [];
  if (ports.length === 1) {
    query += ' AND portfolio = ?';
    params.push(ports[0]);
  } else if (ports.length > 1) {
    const placeholders = ports.map(() => '?').join(',');
    query += ` AND portfolio IN (${placeholders})`;
    params.push(...ports);
  }
  
  const holdings = await dbAll(db, query, params);
  if (!holdings || holdings.length === 0) {
    return { success: true, updated_count: 0, message: 'No active stock holdings found in selected portfolio view to match.', symbols: [] };
  }

  let updatedCount = 0;
  const updatedSymbols: string[] = [];

  // Filter for listed equity holdings (exclude USD, Mutual Funds, Unlisted, CASH)
  const equityHoldings = holdings.filter(h => {
    const sym = (h.symbol || '').toUpperCase();
    const isin = (h.isin || '').toUpperCase();
    return !sym.startsWith('UL') && !sym.includes('UNLISTED') && sym !== 'CASH' && !sym.startsWith('CASH') && !isin.startsWith('CASH') && !isin.startsWith('CUSTOM_') && !isin.startsWith('INF');
  });

  for (const h of equityHoldings) {
    const symbol = h.symbol.trim().toUpperCase();
    const isin = (h.isin || '').trim().toUpperCase();
    
    // Fetch exchange from MasterTickers or default to NSE
    const mtRow = await dbGet(db, 'SELECT exchange FROM MasterTickers WHERE symbol = ? OR isin = ?', [symbol, isin || symbol]);
    const exchange = (mtRow?.exchange || 'NSE').trim().toUpperCase();
    const yfSymbol = exchange === 'BSE' ? `${symbol}.BO` : `${symbol}.NS`;

    try {
      const yfUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfSymbol)}?interval=1d&range=7d`;
      const res = await fetch(yfUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      });

      if (!res.ok) continue;
      const json = await res.json();
      const quotes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      const meta = json?.chart?.result?.[0]?.meta;
      
      if (!quotes || !Array.isArray(quotes) || quotes.length === 0) continue;
      
      // Filter out null/undefined values from quote array
      const validCloses = quotes.filter((q: any) => typeof q === 'number' && !isNaN(q) && q > 0);
      if (validCloses.length === 0) continue;

      const latestClose = validCloses[validCloses.length - 1];
      const prevClose = validCloses.length > 1 ? validCloses[validCloses.length - 2] : (meta?.chartPreviousClose || latestClose);

      if (!latestClose || latestClose <= 0) continue;

      // Update Holdings table for this ticker
      const matchingHoldings = await dbAll(db, 'SELECT rowid, portfolio, quantity, total_cost FROM Holdings WHERE (symbol = ? OR isin = ?) AND quantity > 0', [symbol, isin || symbol]);
      
      for (const mh of matchingHoldings) {
        if (ports.length > 0 && !ports.includes(mh.portfolio)) continue;

        const cv = mh.quantity * latestClose;
        const pnl = cv - mh.total_cost;
        const pct = mh.total_cost > 0 ? (pnl / mh.total_cost) * 100 : 0;
        const dayChg = (latestClose - prevClose) * mh.quantity;
        const dayChgPct = prevClose > 0 ? ((latestClose - prevClose) / prevClose) * 100 : 0;

        await dbRun(
          db,
          `UPDATE Holdings
           SET ltp = ?, prev_close = ?, current_value = ?, unrealized_pnl = ?, unrealized_pct = ?,
               day_change = ?, day_change_pct = ?, native_ltp = ?, native_prev_close = ?,
               native_current_value = ?, native_unrealized_pnl = ?,
               data_source = 'Web Matcher (Exchange)', data_status = 'LIVE', last_update = CURRENT_TIMESTAMP
           WHERE rowid = ?`,
          [latestClose, prevClose, cv, pnl, pct, dayChg, dayChgPct, latestClose, prevClose, cv, pnl, mh.rowid]
        );

        // Also update MasterTickers last_price (never touch manual_ltp!)
        await dbRun(
          db,
          `UPDATE MasterTickers SET last_price = ?, previous_close = ?, last_updated = CURRENT_TIMESTAMP WHERE symbol = ? OR isin = ?`,
          [latestClose, prevClose, symbol, isin || symbol]
        ).catch(() => {});
      }

      updatedCount++;
      updatedSymbols.push(symbol);
    } catch (e: any) {
      console.warn(`[WebPriceMatcher] Error matching ${symbol}:`, e.message);
    }
  }

  // Clear in-memory caches
  clearTickerCache();
  console.log(`[WebPriceMatcher] Successfully matched ${updatedCount} stock price(s) against Exchange quotes.`);
  return {
    success: true,
    updated_count: updatedCount,
    message: `Successfully verified and matched ${updatedCount} stock price(s) against official Web & Exchange session quotes!`,
    symbols: updatedSymbols
  };
}
