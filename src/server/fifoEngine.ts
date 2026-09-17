import sqlite3 from 'sqlite3';
import { dbAll, dbRun, dbGet, auditDBChange, runInDbLock } from './database.js';

export function getFolioFromNotes(notes: string | null, isin?: string | null): string {
  if (isin && !isin.toUpperCase().startsWith("INF")) return "";
  if (!notes) return '';
  const match = notes.match(/Folio:\s*([^,;]+)/i);
  return match ? match[1].trim() : '';
}

export function parseDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) {
    const yr = val.getUTCFullYear();
    return (yr >= 1990 && yr <= 2050) ? val : null;
  }

  const s = String(val).trim();
  if (s.length < 6) return null;

  // Try YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = s.match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})/);
  if (ymdMatch) {
    const y = parseInt(ymdMatch[1], 10);
    const m = parseInt(ymdMatch[2], 10) - 1;
    const d = parseInt(ymdMatch[3], 10);
    if (y >= 1990 && y <= 2050 && m >= 0 && m <= 11 && d >= 1 && d <= 31) {
      return new Date(Date.UTC(y, m, d));
    }
  }

  // Try DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10);
    const m = parseInt(dmyMatch[2], 10) - 1;
    const y = parseInt(dmyMatch[3], 10);
    if (y >= 1990 && y <= 2050 && m >= 0 && m <= 11 && d >= 1 && d <= 31) {
      return new Date(Date.UTC(y, m, d));
    }
  }

  // Fallback to JS standard Date parsing with strict year validation
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const yr = parsed.getUTCFullYear();
    if (yr >= 1990 && yr <= 2050) {
      return parsed;
    }
  }

  return null;
}

export function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getFYFromDate(dateStr: string): string {
  try {
    const parsed = parseDate(dateStr);
    if (parsed) {
      const year = parsed.getUTCFullYear();
      const month = parsed.getUTCMonth() + 1;
      if (month >= 4) {
        return `${year}-${year + 1}`;
      } else {
        return `${year - 1}-${year}`;
      }
    }
    // Fallback attempt with regex
    const dmy = String(dateStr).match(/(\d{4})/);
    if (dmy) {
      const y = parseInt(dmy[1], 10);
      if (y >= 1990 && y <= 2050) {
        return `${y}-${y + 1}`;
      }
    }
    return '2024-2025';
  } catch (err) {
    return '2024-2025';
  }
}

interface BuyLot {
  date: Date;
  price: number;
  remainingQty: number;
  totalCostPerUnit: number;
}

let onFifoCompletedCallback: (() => void) | null = null;
export function registerFifoCompletedCallback(cb: () => void) {
  onFifoCompletedCallback = cb;
}

export async function runFIFO(db: sqlite3.Database): Promise<any> {
  return runInDbLock(async () => {
    await dbRun(db, 'BEGIN TRANSACTION');

  try {
    // 0. Pre-normalize Transactions table
    // Fix negative quantity, gross_amount, net_amount
    await dbRun(db, `
      UPDATE Transactions SET 
        quantity = ABS(quantity), 
        gross_amount = ABS(gross_amount), 
        net_amount = ABS(net_amount) 
      WHERE quantity < 0 OR gross_amount < 0 OR net_amount < 0
    `);

    // Safe normalization: Only populate net_amount and gross_amount for mutual funds if they are missing or invalid (null, <= 0)
    // to preserve exact uploaded/imported cost data.
    await dbRun(db, `
      UPDATE Transactions SET 
        net_amount = CASE WHEN (net_amount IS NULL OR net_amount <= 0) THEN quantity * price ELSE net_amount END,
        gross_amount = CASE WHEN (gross_amount IS NULL OR gross_amount <= 0) THEN quantity * price ELSE gross_amount END
      WHERE isin LIKE 'INF%' AND (net_amount IS NULL OR net_amount <= 0 OR gross_amount IS NULL OR gross_amount <= 0)
    `);

    // Fetch MasterTickers for Canonical Security Normalization
    const masterTickersRows = await dbAll(db, 'SELECT isin, symbol, name, exchange, fmv_31_jan_2018 FROM MasterTickers').catch(() => []);
    const isinBySymbol = new Map<string, string>();
    const symbolByIsin = new Map<string, string>();
    const isinByName = new Map<string, string>();
    const masterFMV: Record<string, number> = {};

    for (const mt of masterTickersRows) {
      const isin = (mt.isin || '').toUpperCase().trim();
      const sym = (mt.symbol || '').toUpperCase().trim();
      const name = (mt.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (isin && sym) {
        isinBySymbol.set(sym, isin);
        symbolByIsin.set(isin, sym);
      }
      if (isin && name) {
        isinByName.set(name, isin);
      }
      if (isin) masterFMV[isin] = mt.fmv_31_jan_2018 || 0;
      if (sym) masterFMV[sym] = mt.fmv_31_jan_2018 || 0;
    }

    // Canonical Security Normalizer: Resolves any broker trade string to canonical ISIN and Symbol
    function resolveCanonical(rawIsin?: string, rawSymbol?: string, rawNotes?: string): { canonicalIsin: string, canonicalSymbol: string } {
      let isin = (rawIsin || '').toUpperCase().trim();
      let sym = (rawSymbol || '').toUpperCase().trim();

      // Known corporate restructurings / SME-to-Mainboard migrations
      if (sym === 'GSM' || sym === 'GSMFOILS' || isin === 'INE0T1501013' || isin === 'INE0SQY01018') {
        return { canonicalIsin: 'INE0SQY01018', canonicalSymbol: 'GSMFOILS' };
      }
      if (sym === 'EKI' || sym === 'EKIGREEN' || isin === 'INE00L001017' || isin === 'INE0CPR01018') {
        return { canonicalIsin: 'INE0CPR01018', canonicalSymbol: 'EKI' };
      }
      if (sym === 'ETERNAL' || isin === 'INE758T01015') {
        return { canonicalIsin: 'INE758T01015', canonicalSymbol: 'ETERNAL' };
      }
      if (sym === 'FEDERAL BANK' || sym === 'FEDERAL BANK LTD' || sym === 'FEDERALBNK' || isin === 'INE171A01029') {
        return { canonicalIsin: 'INE171A01029', canonicalSymbol: 'FEDERALBNK' };
      }
      if (sym === 'LARSEN & TOUBRO' || sym === 'LARSEN AND TOUBRO' || sym === 'LARSEN AND TOUBRO LTD' || sym === 'LT' || isin === 'INE018A01030') {
        return { canonicalIsin: 'INE018A01030', canonicalSymbol: 'LT' };
      }
      if (sym === 'M&M' || sym === 'MAHINDRA & MAHINDRA' || sym === 'MAHINDRA AND MAHINDRA' || isin === 'INE101A01026') {
        return { canonicalIsin: 'INE101A01026', canonicalSymbol: 'M&M' };
      }
      if (sym === 'TATAPOWER' || sym === 'TATA POWER' || sym === 'TATA POWER CO LTD' || isin === 'INE245A01021') {
        return { canonicalIsin: 'INE245A01021', canonicalSymbol: 'TATAPOWER' };
      }

      // Valid standard ISIN (12 chars, not CUSTOM_)
      if (isin && isin.length === 12 && !isin.startsWith('CUSTOM_')) {
        const canonicalSym = symbolByIsin.get(isin) || sym || isin;
        return { canonicalIsin: isin, canonicalSymbol: canonicalSym };
      }

      // Lookup by Symbol
      if (sym) {
        const foundIsin = isinBySymbol.get(sym);
        if (foundIsin) {
          return { canonicalIsin: foundIsin, canonicalSymbol: sym };
        }
      }

      // Fallback clean representation
      const cleanSym = sym.replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '') || isin;
      const cleanIsin = isin || `CUSTOM_${cleanSym.slice(0, 5)}`;
      return { canonicalIsin: cleanIsin, canonicalSymbol: cleanSym || isin };
    }

    // 1. Fetch Transactions and normalize to canonical security identifiers
    const txns = await dbAll(db, 'SELECT * FROM Transactions ORDER BY date ASC, id ASC');
    
    const transactions = txns.map(r => {
      const parsedDate = parseDate(r.date);
      if (!parsedDate) return null;

      const { canonicalIsin, canonicalSymbol } = resolveCanonical(r.isin, r.symbol, r.notes);
      const tType = String(r.type).toUpperCase().trim();
      let resolvedType = tType;

      if (tType.includes('DEMERGER')) {
        if (tType.includes('(NEW)')) {
          resolvedType = 'BUY';
        } else {
          resolvedType = 'DEMERGER';
        }
      } else if (tType.includes('DIVIDEND')) {
        resolvedType = 'DIVIDEND';
      } else if (tType.includes('SPLIT')) {
        resolvedType = 'SPLIT';
      } else if (tType.includes('BONUS')) {
        resolvedType = 'BONUS';
      } else if (
        tType.includes('BUYBACK') ||
        tType.includes('TENDER') ||
        tType.includes('MERGER_OUT') ||
        tType.includes('MERGED_OUT') ||
        tType.includes('MERGED') ||
        tType.includes('SELL') ||
        tType.includes('SALE') ||
        tType.includes('REDEMPTION') ||
        tType.includes('ROUNDING') ||
        tType.includes('TRANSFER OUT') ||
        tType.includes('SECURITY OUT')
      ) {
        resolvedType = 'SELL';
      } else if (
        tType.includes('MERGER') ||
        tType.includes('BUY') ||
        tType.includes('PURCHASE') ||
        tType.includes('IPO') ||
        tType.includes('ALLOTMENT') ||
        tType.includes('INVESTMENT') ||
        tType.includes('REINVEST') ||
        tType.includes('TRANSFER IN') ||
        tType.includes('SECURITY IN')
      ) {
        resolvedType = 'BUY';
      }

      return {
        id: r.id,
        date: parsedDate,
        dateStr: formatDate(parsedDate),
        portfolio: String(r.portfolio).trim(),
        type: resolvedType,
        isin: canonicalIsin,
        symbol: canonicalSymbol,
        quantity: r.quantity,
        price: r.price,
        net_amount: r.net_amount || (r.quantity * r.price),
        notes: r.notes
      };
    }).filter(Boolean) as any[];

    // Sort transactions by date chronologically
    transactions.sort((a, b) => a.date.getTime() - b.date.getTime() || a.id - b.id);

    // Filter SIP reversals - ONLY FOR MUTUAL FUNDS
    const toIgnoreRun = new Set<number>();
    for (let i = 0; i < transactions.length; i++) {
        const t1 = transactions[i];
        if (toIgnoreRun.has(t1.id)) continue;
        if (t1.type !== 'BUY' && t1.type !== 'SELL') continue;
        if (!t1.isin || !t1.isin.startsWith('INF')) continue;
        for (let j = i + 1; j < transactions.length; j++) {
            const t2 = transactions[j];
            if (t1.date.getTime() !== t2.date.getTime()) break;
            if (toIgnoreRun.has(t2.id)) continue;
            const f1 = getFolioFromNotes(t1.notes, t1.isin);
            const f2 = getFolioFromNotes(t2.notes, t2.isin);
            if (t1.portfolio === t2.portfolio && t1.isin === t2.isin && f1 === f2 && Math.abs(t1.quantity - t2.quantity) < 0.0001 && t1.type !== t2.type && (t2.type === 'BUY' || t2.type === 'SELL')) {
                toIgnoreRun.add(t1.id);
                toIgnoreRun.add(t2.id);
                console.log('REMOVED REVERSAL:', t1.dateStr, t1.symbol, t1.quantity);
                break;
            }
        }
    }
    
    const filteredTransactions = transactions.filter(t => !toIgnoreRun.has(t.id));
    transactions.length = 0;
    transactions.push(...filteredTransactions);

    // Initialize StrippingDisallowances Audit Table (Section 94(7) and 94(8))
    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS StrippingDisallowances (
        id                          INTEGER PRIMARY KEY AUTOINCREMENT,
        portfolio                   TEXT NOT NULL,
        pan                         TEXT,
        symbol                      TEXT NOT NULL,
        isin                        TEXT NOT NULL,
        section                     TEXT NOT NULL CHECK(section IN ('94(7)', '94(8)')),
        trigger_sell_date           TEXT NOT NULL,
        record_date                 TEXT,
        gross_loss_claimed          REAL NOT NULL,
        disallowed_loss             REAL NOT NULL,
        reportable_loss             REAL NOT NULL,
        transferred_to_lot_id       INTEGER,
        adjusted_cost_of_bonus_lot  REAL,
        audit_notes                 TEXT,
        created_at                  TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_sd_pan_fy ON StrippingDisallowances(portfolio, trigger_sell_date)`).catch(() => {});
    await dbRun(db, `DELETE FROM StrippingDisallowances`).catch(() => {});

    // Pre-index dividend and bonus transactions for statutory stripping checks
    const dividendRecords = await dbAll(db, `
      SELECT portfolio, isin, symbol, date, net_amount, notes
      FROM Transactions 
      WHERE type LIKE '%DIVIDEND%' OR notes LIKE '%DIVIDEND%'
    `).catch(() => []);

    const bonusRecords = await dbAll(db, `
      SELECT portfolio, isin, symbol, date, quantity, notes
      FROM Transactions 
      WHERE type LIKE '%BONUS%' OR notes LIKE '%BONUS%'
    `).catch(() => []);

    // Intraday Matching logic for NON-Mutual Funds
    const realizedGains: any[] = [];
    let matchId = 0;
    const sameDayGroups: Record<string, { buys: any[], sells: any[] }> = {};
    for (const t of transactions) {
      if (t.type !== 'BUY' && t.type !== 'SELL') continue;
      if (t.isin && String(t.isin).startsWith('INF')) continue;
      const key = `${t.portfolio}::${t.isin}::${t.dateStr}`;
      if (!sameDayGroups[key]) sameDayGroups[key] = { buys: [], sells: [] };
      if (t.type === 'BUY') {
         sameDayGroups[key].buys.push(t);
      } else {
         sameDayGroups[key].sells.push(t);
      }
    }
    for (const [key, group] of Object.entries(sameDayGroups)) {
      for (let b of group.buys) {
        for (let s of group.sells) {
          if (b.quantity > 0.0001 && s.quantity > 0.0001) {
            const matchQty = Math.min(b.quantity, s.quantity);
            const buyPrice = b.price || (b.net_amount / b.quantity);
            const sellPrice = s.price || (s.net_amount / s.quantity);
            const buyCost = matchQty * buyPrice;
            const sellProceeds = matchQty * sellPrice;
            const realizedPnl = sellProceeds - buyCost;
            
            realizedGains.push({
              match_id: ++matchId,
              portfolio: b.portfolio,
              isin: b.isin,
              symbol: b.symbol,
              buy_date: formatDate(b.date),
              buy_price: buyPrice,
              matched_qty: matchQty,
              sell_date: s.dateStr,
              sell_price: sellPrice,
              buy_cost: buyCost,
              sell_proceeds: sellProceeds,
              realized_pnl: realizedPnl,
              holding_days: 0,
              tax_category: 'INTRADAY',
              fmv_31_jan_2018: 0,
              grandfathered_cost: buyCost,
              taxable_pnl: realizedPnl
            });
            
            b.quantity -= matchQty;
            s.quantity -= matchQty;
          }
        }
      }
    }
    const remainingTxns = transactions.filter(t => (t.type !== 'BUY' && t.type !== 'SELL') || t.quantity > 0.0001);
    transactions.length = 0;
    transactions.push(...remainingTxns);

    const buyQueues: Record<string, BuyLot[]> = {};
    const auditEvents: any[] = [];
    matchId = 0;
    const totalDividends: Record<string, number> = {};

    // Fetch USD rate early for dividend currency conversion (US ETF dividends are stored in USD)
    const earlyUsdRateRow = await dbGet(db, "SELECT rate_to_inr FROM CurrencyRates WHERE currency = 'USD'");
    const earlyUsdRate = earlyUsdRateRow?.rate_to_inr || 83.5;
    const US_PORTFOLIO = 'US - IBKR';

    for (const txn of transactions) {
      const isMutualFund = txn.isin && txn.isin.startsWith('INF');
      const folio = isMutualFund ? (getFolioFromNotes(txn.notes, txn.isin) || 'NA') : 'NA';
      const groupKey = `${txn.portfolio}::${txn.isin}::${folio}`;
      const tType = (txn.type || '').toUpperCase().trim();

      if (!buyQueues[groupKey]) {
        buyQueues[groupKey] = [];
      }

      if (tType === 'BUY') {
        const costPerUnit = isMutualFund
          ? txn.price
          : (txn.quantity > 0 ? txn.net_amount / txn.quantity : txn.price);

        buyQueues[groupKey].push({
          date: txn.date,
          price: txn.price,
          remainingQty: txn.quantity,
          totalCostPerUnit: costPerUnit
        });
      } else if (tType === 'DIVIDEND' || tType === 'DIVIDEND PAYOUT' || tType === 'DIVIDEND REINVEST') {
        const port = txn.portfolio;
        // US IBKR dividends are stored in USD in the Transactions table;
        // convert to INR so AppConfig stores all dividends consistently in INR.
        const isUsPort = port === US_PORTFOLIO || port === 'Sarwa';
        const inrAmount = isUsPort ? txn.net_amount * earlyUsdRate : txn.net_amount;
        totalDividends[port] = (totalDividends[port] || 0) + inrAmount;
        auditEvents.push({
          portfolio: port,
          date: txn.dateStr,
          isin: txn.isin,
          symbol: txn.symbol,
          action_type: 'DIVIDEND',
          original_qty: 0,
          new_qty: 0,
          original_cost: 0,
          new_cost: 0,
          message: `Received ${isUsPort ? '$' + txn.net_amount + ' USD' : '₹' + txn.net_amount} cash dividend (type: ${tType})`
        });
      } else if (tType === 'SPLIT') {
        const queue = buyQueues[groupKey];
        const currentQty = queue.reduce((sum, q) => sum + q.remainingQty, 0);
        if (currentQty > 0) {
          const p = Number(txn.price || 0);
          const q = Number(txn.quantity || 0);
          const notesStr = String(txn.notes || '');
          let ratio = 1.0;

          // 1. Check if ratio is explicitly stated in notes e.g. "Stock Split 8:1" or "Split 4:1"
          const splitMatch = notesStr.match(/(?:Stock\s*Split|Split)\s*(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)/i);
          if (splitMatch) {
            const num = parseFloat(splitMatch[1]);
            const den = parseFloat(splitMatch[2]);
            if (den > 0 && num > 0) {
              ratio = num / den;
            }
          }

          // 2. If ratio not in notes, check price field
          if (ratio === 1.0 && p > 0 && p <= 50 && Math.abs(p - 1.0) > 0.001) {
            ratio = p;
          } 
          // 3. If quantity represents additive split shares (e.g. "+1092 shares")
          else if (ratio === 1.0 && (notesStr.includes('+') || notesStr.toLowerCase().includes('add')) && q > 0) {
            ratio = (currentQty + q) / currentQty;
          }
          // 4. Inferred ratio if quantity is new total or multiplier
          else if (ratio === 1.0 && currentQty > 0.0001 && q > currentQty) {
            const inferred = q / currentQty;
            if (inferred >= 1.05 && inferred <= 50) {
              ratio = inferred;
            }
          } else if (ratio === 1.0 && q > 0 && q <= 50 && Math.abs(q - 1.0) > 0.001) {
            ratio = q;
          }

          if (ratio && ratio > 0 && Math.abs(ratio - 1.0) > 0.01) {
            const currentCost = queue.reduce((sum, q) => sum + (q.remainingQty * q.totalCostPerUnit), 0);
            for (const qLot of queue) {
              qLot.remainingQty = Number((qLot.remainingQty * ratio).toFixed(4));
              qLot.totalCostPerUnit = qLot.totalCostPerUnit / ratio;
              qLot.price = qLot.price / ratio;
            }
            auditEvents.push({
              portfolio: txn.portfolio,
              date: txn.dateStr,
              isin: txn.isin,
              symbol: txn.symbol,
              action_type: 'SPLIT',
              original_qty: currentQty,
              new_qty: currentQty * ratio,
              original_cost: currentCost,
              new_cost: currentCost,
              message: `Applied split ratio ${ratio.toFixed(4)} (notes: ${notesStr || 'none'})`
            });
          }
        }
      } else if (tType === 'BONUS') {
        const queue = buyQueues[groupKey];
        const currentQty = queue.reduce((sum, q) => sum + q.remainingQty, 0);
        if (currentQty > 0 && txn.quantity > 0) {
          const ratio = txn.quantity / currentQty;
          const currentCost = queue.reduce((sum, q) => sum + (q.remainingQty * q.totalCostPerUnit), 0);
          for (const q of queue) {
            q.remainingQty = Number((q.remainingQty * (1 + ratio)).toFixed(4));
            q.totalCostPerUnit = q.totalCostPerUnit / (1 + ratio);
            q.price = q.price / (1 + ratio);
          }
          auditEvents.push({
            portfolio: txn.portfolio,
            date: txn.dateStr,
            isin: txn.isin,
            symbol: txn.symbol,
            action_type: 'BONUS',
            original_qty: currentQty,
            new_qty: currentQty * (1 + ratio),
            original_cost: currentCost,
            new_cost: currentCost,
            message: `Applied bonus dilution ratio ${ratio.toFixed(4)}`
          });
        }
      } else if (tType === 'DEMERGER') {
        const queue = buyQueues[groupKey];
        const currentCost = queue.reduce((sum, q) => sum + (q.remainingQty * q.totalCostPerUnit), 0);
        const currentQty = queue.reduce((sum, q) => sum + q.remainingQty, 0);
        const extractedCost = txn.net_amount; // amount allocated to the demerged entity
        if (currentCost > 0 && extractedCost > 0) {
          // Reduce parent cost basis proportionally
          const factor = (currentCost - extractedCost) / currentCost;
          if (factor > 0) {
            for (const q of queue) {
              q.totalCostPerUnit = q.totalCostPerUnit * factor;
              q.price = q.price * factor;
            }
          }
          auditEvents.push({
            portfolio: txn.portfolio,
            date: txn.dateStr,
            isin: txn.isin,
            symbol: txn.symbol,
            action_type: 'DEMERGER',
            original_qty: currentQty,
            new_qty: currentQty,
            original_cost: currentCost,
            new_cost: currentCost - extractedCost,
            message: `Reduced parent cost by ${extractedCost} for demerger`
          });
        }
      } else if (tType === 'SELL') {
        let sellQty = txn.quantity;
        const sellPrice = txn.price;
        const sellDate = txn.date;
        const queue = buyQueues[groupKey];

        while (sellQty > 0.0001 && queue.length > 0) {
          const buyLot = queue[0];
          const matchQty = Number(Math.min(sellQty, buyLot.remainingQty).toFixed(4));

          matchId++;
          const buyCost = matchQty * buyLot.totalCostPerUnit;
          const sellProceeds = matchQty * sellPrice;
          const holdingDays = Math.floor((sellDate.getTime() - buyLot.date.getTime()) / (1000 * 60 * 60 * 24));
          const taxCategory = holdingDays > 365 ? 'LTCG' : 'STCG';

          const fmv = masterFMV[txn.isin] || masterFMV[txn.symbol] || 0;
          let grandfatheredCost = buyCost;

          // India Sec 112A Grandfathering for LTCG (acquired before 1-Feb-2018)
          if (taxCategory === 'LTCG' && buyLot.date.getTime() < new Date('2018-02-01').getTime() && fmv > 0) {
            const step1 = Math.min(fmv, sellPrice);
            const coaPerUnit = Math.max(buyLot.totalCostPerUnit, step1);
            grandfatheredCost = matchQty * coaPerUnit;
          }

          const realizedPnl = sellProceeds - buyCost;
          let taxablePnl = sellProceeds - grandfatheredCost;

          // Statutory Stripping Disallowance Engines: Sections 94(7) & 94(8)
          let disallowedLoss = 0;
          let strippingSection: '94(7)' | '94(8)' | null = null;
          let strippingNotes = '';

          if (realizedPnl < 0) {
            const buyTime = buyLot.date.getTime();
            const sellTime = sellDate.getTime();
            const MS_PER_DAY = 24 * 60 * 60 * 1000;

            // Section 94(7) Dividend Stripping: Acquired <= 90d before div record, sold <= 90d after div record
            const matchingDiv = dividendRecords.find((d: any) => {
              if (d.portfolio !== txn.portfolio) return false;
              const dIsin = (d.isin || '').toUpperCase().trim();
              const dSym = (d.symbol || '').toUpperCase().trim();
              if (dIsin !== txn.isin && dSym !== txn.symbol) return false;
              const dDate = parseDate(d.date);
              if (!dDate) return false;
              const dTime = dDate.getTime();
              const daysFromBuy = (dTime - buyTime) / MS_PER_DAY;
              const daysToSell = (sellTime - dTime) / MS_PER_DAY;
              return daysFromBuy >= 0 && daysFromBuy <= 90 && daysToSell >= 0 && daysToSell <= 90;
            });

            if (matchingDiv) {
              const divAmt = Number(matchingDiv.net_amount || 0);
              disallowedLoss = Math.min(Math.abs(realizedPnl), divAmt);
              if (disallowedLoss > 0) {
                strippingSection = '94(7)';
                strippingNotes = `Section 94(7) Dividend Stripping: Disallowed ₹${disallowedLoss.toFixed(2)} capital loss against dividend of ₹${divAmt.toFixed(2)} received on ${matchingDiv.date}`;
                taxablePnl = taxablePnl + disallowedLoss; // loss reduced towards zero
              }
            }

            // Section 94(8) Bonus Stripping: Acquired <= 90d before bonus record, sold <= 270d (9m) after
            if (disallowedLoss === 0) {
              const matchingBonus = bonusRecords.find((b: any) => {
                if (b.portfolio !== txn.portfolio) return false;
                const bIsin = (b.isin || '').toUpperCase().trim();
                const bSym = (b.symbol || '').toUpperCase().trim();
                if (bIsin !== txn.isin && bSym !== txn.symbol) return false;
                const bDate = parseDate(b.date);
                if (!bDate) return false;
                const bTime = bDate.getTime();
                const daysFromBuy = (bTime - buyTime) / MS_PER_DAY;
                const daysToSell = (sellTime - bTime) / MS_PER_DAY;
                return daysFromBuy >= 0 && daysFromBuy <= 90 && daysToSell >= 0 && daysToSell <= 270;
              });

              if (matchingBonus) {
                disallowedLoss = Math.abs(realizedPnl);
                strippingSection = '94(8)';
                strippingNotes = `Section 94(8) Bonus Stripping: Disallowed ₹${disallowedLoss.toFixed(2)} loss transferred to reduce cost of retained bonus shares (Bonus date: ${matchingBonus.date})`;
                taxablePnl = 0; // entire capital loss on original shares disallowed
              }
            }

            if (strippingSection && disallowedLoss > 0) {
              await dbRun(db, `
                INSERT INTO StrippingDisallowances (
                  portfolio, symbol, isin, section, trigger_sell_date,
                  gross_loss_claimed, disallowed_loss, reportable_loss, audit_notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `, [
                txn.portfolio, txn.symbol || '', txn.isin, strippingSection, txn.dateStr,
                Math.abs(realizedPnl), disallowedLoss, taxablePnl, strippingNotes
              ]).catch(() => {});
            }
          }

          realizedGains.push({
            match_id: matchId,
            portfolio: txn.portfolio,
            isin: txn.isin,
            symbol: txn.symbol,
            buy_date: formatDate(buyLot.date),
            buy_price: buyLot.price,
            matched_qty: matchQty,
            sell_date: txn.dateStr,
            sell_price: sellPrice,
            buy_cost: buyCost,
            sell_proceeds: sellProceeds,
            realized_pnl: realizedPnl,
            holding_days: holdingDays,
            tax_category: taxCategory,
            fmv_31_jan_2018: fmv,
            grandfathered_cost: grandfatheredCost,
            taxable_pnl: taxablePnl
          });

          buyLot.remainingQty = Number((buyLot.remainingQty - matchQty).toFixed(4));
          sellQty = Number((sellQty - matchQty).toFixed(4));

          if (buyLot.remainingQty <= 0.0001) {
            queue.shift();
          }
        }

        if (sellQty > 0.0001) {
          console.warn(`[FIFO Engine] Unmatched sell quantity for ${txn.portfolio} ${txn.symbol || txn.isin} on ${txn.dateStr}: ${sellQty} units remaining after exhausting buy queue.`);
        }
      }
    }

    // Calculate net transaction quantity balance per groupKey to prevent ghost holdings
    const netTxnBalances: Record<string, number> = {};
    for (const txn of transactions) {
      const isMutualFund = txn.isin && txn.isin.startsWith('INF');
      const folio = isMutualFund ? (getFolioFromNotes(txn.notes, txn.isin) || 'NA') : 'NA';
      const groupKey = `${txn.portfolio}::${txn.isin}::${folio}`;
      const tType = String(txn.type || '').toUpperCase().trim();
      if (netTxnBalances[groupKey] === undefined) netTxnBalances[groupKey] = 0;
      if (tType.includes('BUYBACK') || tType.includes('TENDER') || tType.includes('MERGER_OUT') || tType.includes('MERGED_OUT') || tType.includes('MERGED') || tType.includes('SELL') || tType.includes('WRITE OFF') || tType.includes('TRANSFER OUT')) {
        netTxnBalances[groupKey] -= txn.quantity;
      } else if (tType.includes('BUY') || tType.includes('REINVEST') || tType.includes('IPO') || tType.includes('RIGHTS') || tType.includes('BONUS')) {
        netTxnBalances[groupKey] += txn.quantity;
      } else if (tType.includes('SPLIT')) {
        const currentQty = netTxnBalances[groupKey];
        if (currentQty > 0) {
          const p = Number(txn.price || 0);
          const q = Number(txn.quantity || 0);
          const notesStr = String(txn.notes || '');
          let ratio = 1.0;

          const splitMatch = notesStr.match(/(?:Stock\s*Split|Split)\s*(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)/i);
          if (splitMatch) {
            const num = parseFloat(splitMatch[1]);
            const den = parseFloat(splitMatch[2]);
            if (den > 0 && num > 0) {
              ratio = num / den;
            }
          }
          if (ratio === 1.0 && p > 0 && p <= 50 && Math.abs(p - 1.0) > 0.001) {
            ratio = p;
          } else if (ratio === 1.0 && (notesStr.includes('+') || notesStr.toLowerCase().includes('add')) && q > 0) {
            ratio = (currentQty + q) / currentQty;
          } else if (ratio === 1.0 && currentQty > 0.0001 && q > currentQty) {
            const inferred = q / currentQty;
            if (inferred >= 1.05 && inferred <= 50) ratio = inferred;
          } else if (ratio === 1.0 && q > 0 && q <= 50 && Math.abs(q - 1.0) > 0.001) {
            ratio = q;
          }

          if (ratio && ratio > 0 && Math.abs(ratio - 1.0) > 0.01) {
            netTxnBalances[groupKey] = currentQty * ratio;
          }
        }
      }
    }

    // Fully exited / liquidated portfolios set
    const CLOSED_PORTFOLIOS = new Set(['DBFS', 'DEFAULT', 'MAA HDFC SKY', 'SELF HDFC SECURITIES', 'SELF MUTUAL FUND', 'IIFL360', 'IIFL']);

    // Process compiled remaining lots into Holdings
    const consolidatedHoldings: Record<string, { totalQty: number, totalCost: number }> = {};
    for (const [key, queue] of Object.entries(buyQueues)) {
      if (queue.length === 0) continue;

      const parts = key.split('::');
      const portName = parts[0] ? parts[0].trim() : '';

      // Skip fully exited / liquidated portfolios
      if (CLOSED_PORTFOLIOS.has(portName.toUpperCase())) {
        continue;
      }
      
      // If net transaction balance is 0 or negative, position is fully closed
      if (netTxnBalances[key] !== undefined && netTxnBalances[key] <= 0.0001) {
        continue;
      }

      const isinGroupKey = key;
      let totalQty = queue.reduce((sum, q) => sum + q.remainingQty, 0);
      
      // Cap remaining holding quantity by net transaction balance if un-sold
      if (netTxnBalances[key] !== undefined && netTxnBalances[key] > 0 && totalQty > netTxnBalances[key]) {
        totalQty = netTxnBalances[key];
      }

      const totalCost = queue.reduce((sum, q) => sum + (q.remainingQty * q.totalCostPerUnit), 0);

      if (!consolidatedHoldings[isinGroupKey]) {
        consolidatedHoldings[isinGroupKey] = {
          totalQty: 0,
          totalCost: 0
        };
      }
      consolidatedHoldings[isinGroupKey].totalQty += totalQty;
      consolidatedHoldings[isinGroupKey].totalCost += totalCost;
    }

    // === POINT-IN-TIME RECONCILIATION VAULT INTEGRATION ===
    // Load locked positions from ReconciledHoldings (broker-verified ground truth)
    // Applies opening balances at reconciliation date plus subsequent incremental transactions
    const reconciledRows = await dbAll(db, 'SELECT * FROM ReconciledHoldings WHERE is_locked = 1').catch(() => []);
    if (reconciledRows && reconciledRows.length > 0) {
      for (const rRow of reconciledRows) {
        const portName = rRow.portfolio || '';
        const { canonicalIsin } = resolveCanonical(rRow.isin, rRow.symbol);
        const rKey = `${portName}::${canonicalIsin}::NA`;
        const reconDate = rRow.reconciled_at ? new Date(rRow.reconciled_at) : null;

        // Check if there are incremental transactions AFTER the reconciliation snapshot date
        let incrementalDeltaQty = 0;
        let incrementalDeltaCost = 0;

        if (reconDate && !isNaN(reconDate.getTime())) {
          const subsequentTxns = transactions.filter(t => 
            t.portfolio.toLowerCase() === portName.toLowerCase() && 
            t.isin === canonicalIsin && 
            t.date > reconDate
          );
          for (const stx of subsequentTxns) {
            if (stx.type === 'BUY') {
              incrementalDeltaQty += stx.quantity;
              incrementalDeltaCost += stx.net_amount;
            } else if (stx.type === 'SELL') {
              incrementalDeltaQty -= stx.quantity;
              const avgCost = (rRow.quantity + incrementalDeltaQty > 0) 
                ? (rRow.total_cost + incrementalDeltaCost) / (rRow.quantity + incrementalDeltaQty) 
                : rRow.avg_buy_price;
              incrementalDeltaCost -= (stx.quantity * avgCost);
            }
          }
        }

        const finalReconQty = Math.max(0, rRow.quantity + incrementalDeltaQty);
        const finalReconCost = Math.max(0, rRow.total_cost + incrementalDeltaCost);

        if (finalReconQty > 0.0001) {
          consolidatedHoldings[rKey] = {
            totalQty: finalReconQty,
            totalCost: finalReconCost
          };
        } else {
          delete consolidatedHoldings[rKey];
        }
      }
      console.log(`[FIFO] Point-in-Time ReconciledHoldings vault applied (${reconciledRows.length} positions verified).`);
    }

    // === SOLD STOCK SEALING: Permanently sealed sold positions never re-enter Holdings ===
    const soldRegistryRows = await dbAll(db, 'SELECT portfolio, isin FROM SoldStockRegistry').catch(() => []);
    const soldRegistry = new Set<string>();
    for (const sr of soldRegistryRows) {
      const { canonicalIsin } = resolveCanonical(sr.isin, sr.symbol);
      soldRegistry.add(`${String(sr.portfolio).toLowerCase()}::${String(canonicalIsin).toUpperCase()}`);
    }
    if (soldRegistry.size > 0) {
      console.log(`[FIFO] SoldStockRegistry has ${soldRegistry.size} sealed sold position(s).`);
    }

    const holdings: Record<string, any> = {};

    // === PERFORMANCE: Bulk-load reference tables into memory to eliminate N+1 DB queries ===
    const allCamsSummary = await dbAll(db, 'SELECT portfolio, isin, symbol, folio, quantity, cost, nav FROM CamsSummaryHoldings');
    // Index by portfolio::isin::folio, portfolio::isin, and portfolio (for fuzzy fallback)
    const camsByKey = new Map<string, any>();
    const camsByPortIsin = new Map<string, any[]>();
    const camsByPort = new Map<string, any[]>();
    for (const row of allCamsSummary) {
      const key = `${(row.portfolio || '').toLowerCase()}::${(row.isin || '').toUpperCase()}::${row.folio || 'NA'}`;
      camsByKey.set(key, row);
      const piKey = `${(row.portfolio || '').toLowerCase()}::${(row.isin || '').toUpperCase()}`;
      if (!camsByPortIsin.has(piKey)) camsByPortIsin.set(piKey, []);
      camsByPortIsin.get(piKey)!.push(row);
      const pKey = (row.portfolio || '').toLowerCase();
      if (!camsByPort.has(pKey)) camsByPort.set(pKey, []);
      camsByPort.get(pKey)!.push(row);
    }

    // Preload ZerodhaHoldings for broker/PMS ground-truth reconciliation
    const allZerodhaHoldings = await dbAll(db, 'SELECT portfolio, isin, symbol, name, quantity, avg_price FROM ZerodhaHoldings').catch(() => []);
    const zerodhaByKey = new Map<string, any>();
    const zerodhaByPort = new Map<string, any[]>();
    for (const row of allZerodhaHoldings) {
      const key = `${(row.portfolio || '').toLowerCase()}::${(row.isin || '').toUpperCase()}`;
      zerodhaByKey.set(key, row);
      const pKey = (row.portfolio || '').toLowerCase();
      if (!zerodhaByPort.has(pKey)) zerodhaByPort.set(pKey, []);
      zerodhaByPort.get(pKey)!.push(row);
    }

    // Preload PmsSummaryHoldings for official statement-backed PMS parity
    // Purges all legacy transaction-derived lots for the PMS portfolio to guarantee 100% statement parity
    const allPmsSummary = await dbAll(db, 'SELECT portfolio, isin, symbol, name, quantity, avg_price, total_cost, ltp FROM PmsSummaryHoldings').catch(() => []);
    if (allPmsSummary && allPmsSummary.length > 0) {
      const pmsByPort = new Map<string, { name: string; rows: any[] }>();
      for (const pRow of allPmsSummary) {
        const portName = (pRow.portfolio || 'cc9').trim();
        const portKey = portName.toLowerCase();
        if (!pmsByPort.has(portKey)) pmsByPort.set(portKey, { name: portName, rows: [] });
        pmsByPort.get(portKey)!.rows.push(pRow);
      }

      for (const [portKey, { name: portName, rows }] of pmsByPort.entries()) {
        // Clear ALL transaction-derived and duplicate lots for this PMS portfolio
        for (const k of Object.keys(consolidatedHoldings)) {
          const kPort = k.split('::')[0].trim().toLowerCase();
          if (kPort === portKey) {
            delete consolidatedHoldings[k];
          }
        }

        // Insert official statement positions as the authoritative ground truth
        for (const pRow of rows) {
          const { canonicalIsin } = resolveCanonical(pRow.isin, pRow.symbol);
          const pKey = `${portName}::${canonicalIsin}::NA`;
          consolidatedHoldings[pKey] = {
            totalQty: pRow.quantity,
            totalCost: pRow.total_cost
          };
        }
        console.log(`[FIFO] Set ${portName} to exactly ${rows.length} official statement positions (purged all legacy duplicates).`);
      }
    }

    function lookupZerodhaGT(port: string, isin: string, symbol: string): any | null {
      const portLower = port.toLowerCase();
      const isinUpper = (isin || '').toUpperCase();
      const symUpper = (symbol || '').toUpperCase();
      
      if (isinUpper) {
        const exact = zerodhaByKey.get(`${portLower}::${isinUpper}`);
        if (exact) return exact;
      }
      
      if (symUpper) {
        const exact = zerodhaByKey.get(`${portLower}::${symUpper}`);
        if (exact) return exact;
      }
      
      const portRows = zerodhaByPort.get(portLower);
      if (portRows) {
        const targetIsinClean = isinUpper.replace(/[^A-Z0-9]/g, '');
        const targetSymClean = symUpper.replace(/[^A-Z0-9]/g, '');
        
        const found = portRows.find(row => {
          const rowIsinClean = (row.isin || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          const rowSymbolClean = (row.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          
          return (rowIsinClean && rowIsinClean === targetIsinClean) ||
                 (rowSymbolClean && (rowSymbolClean === targetSymClean || rowSymbolClean.includes(targetSymClean) || targetSymClean.includes(rowSymbolClean)));
        });
        if (found) return found;
      }
      return null;
    }

    const allMasterTickers = await dbAll(db, 'SELECT isin, symbol, name, exchange, manual_ltp, manual_ltp_date FROM MasterTickers');
    const tickerByIsin = new Map<string, any>();
    const tickerBySymbol = new Map<string, any>();
    for (const t of allMasterTickers) {
      if (t.isin) tickerByIsin.set(t.isin.toUpperCase(), t);
      if (t.symbol) tickerBySymbol.set(t.symbol.toUpperCase(), t);
    }

    function lookupTicker(isin: string) {
      return tickerByIsin.get(isin.toUpperCase()) || tickerBySymbol.get(isin.toUpperCase()) || null;
    }

    function lookupCamsGT(port: string, isin: string, folio: string): any | null {
      const portLower = port.toLowerCase();
      const isinUpper = isin.toUpperCase();
      // 1. Exact key match
      const exact = camsByKey.get(`${portLower}::${isinUpper}::${folio || 'NA'}`);
      if (exact) return exact;
      // 2. Match by portfolio+isin (any folio)
      const piRows = camsByPortIsin.get(`${portLower}::${isinUpper}`);
      if (piRows && piRows.length === 1) return piRows[0];
      // 3. Fuzzy match by cleaned strings
      const portRows = camsByPort.get(portLower);
      if (portRows) {
        const targetClean = isinUpper.replace(/[^A-Z0-9]/g, '');
        const found = portRows.find(row => {
          const rowIsinClean = (row.isin || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          const rowSymbolClean = (row.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          return (rowIsinClean && rowIsinClean === targetClean) ||
                 (rowSymbolClean && (rowSymbolClean === targetClean || rowSymbolClean.includes(targetClean) || targetClean.includes(rowSymbolClean)));
        });
        if (found) return found;
      }
      return null;
    }
    // === END PERFORMANCE PRELOAD ===

    for (const [isinGroupKey, data] of Object.entries(consolidatedHoldings)) {
      const parts = isinGroupKey.split('::');
      const port = parts[0];
      const isin = parts[1];
      const folio = parts[2] || 'NA';
      const totalQty = Number(data.totalQty.toFixed(4));
      const totalCost = data.totalCost;

      // Institutional Closed-Book Guard for cc9 PMS:
      // Only official statement rows from PmsSummaryHoldings are permitted to exist in Holdings.
      if (port.toLowerCase() === 'cc9' && allPmsSummary && allPmsSummary.length > 0) {
        const isStatementRow = allPmsSummary.some((r: any) => {
          const { canonicalIsin } = resolveCanonical(r.isin, r.symbol);
          return r.isin === isin || canonicalIsin === isin || r.symbol === isin;
        });
        if (!isStatementRow) {
          console.log(`[FIFO Engine] Closed-Book Rule: Dropping legacy un-reconciled cc9 holding ${isinGroupKey}`);
          continue;
        }
      }

      // Skip any position sealed in SoldStockRegistry
      const soldKey = `${String(port).toLowerCase()}::${String(isin).toUpperCase()}`;
      if (soldRegistry.has(soldKey)) {
        console.log(`[FIFO] Skipping ${port}::${isin} — sealed in SoldStockRegistry.`);
        continue;
      }

      if (totalQty <= 0.0001) continue;

      const avgBuyPrice = totalCost / totalQty;
      const isMutualFund = isin.toUpperCase().startsWith('INF');

      let groundTruthLtp = 0;
      try {
        const gtRow = lookupCamsGT(port, isin, folio);
        if (gtRow && gtRow.nav !== null && gtRow.nav > 0) {
          groundTruthLtp = gtRow.nav;
        }
      } catch (gtErr) {
        console.warn(`[FIFO Engine] Error looking up CamsSummaryHoldings for ${port} / ${isin}:`, gtErr);
      }

      // Resolve canonical symbol for display
      let symbol = isin;
      const tickerRow = lookupTicker(isin);
      if (tickerRow && tickerRow.symbol) {
        symbol = tickerRow.symbol;
      }
      if (isMutualFund && folio && folio !== 'NA') {
        symbol = `${symbol} - Folio: ${folio}`;
      }

      holdings[isinGroupKey] = {
        portfolio: port,
        isin: isin,
        folio: folio || 'NA',
        symbol: symbol,
        quantity: totalQty,
        avg_buy_price: avgBuyPrice,
        total_cost: totalCost,
        ground_truth_ltp: groundTruthLtp
      };
    }

    // Preload HistoricalPrices for fast zero-query fallback — scoped to symbols in current holdings
    const holdingSymbols = [...new Set(
      Object.values(holdings)
        .flatMap((h: any) => {
          const base = h.symbol ? h.symbol.toUpperCase().split(' - Folio:')[0].trim() : null;
          const isin = h.isin ? h.isin.toUpperCase() : null;
          return [base, isin].filter(Boolean);
        })
    )];
    const allHistPrices = holdingSymbols.length > 0
      ? await dbAll(db, `SELECT symbol, close_price, data_source, date FROM HistoricalPrices WHERE close_price > 0 AND symbol IN (${holdingSymbols.map(() => '?').join(',')}) ORDER BY date ASC`, holdingSymbols)
      : await dbAll(db, 'SELECT symbol, close_price, data_source, date FROM HistoricalPrices WHERE close_price > 0 ORDER BY date ASC');
    const histPricesMap = new Map<string, any>();
    for (const hp of allHistPrices) {
      if (hp.symbol) {
        const symUpper = hp.symbol.toUpperCase();
        histPricesMap.set(symUpper, hp);
        if (symUpper.endsWith('.NS') || symUpper.endsWith('.BO')) {
          histPricesMap.set(symUpper.split('.')[0], hp);
        }
      }
    }

    // Preserve existing price & daily change information so FIFO rebuild doesn't clear them
    const existingPrices = await dbAll(db, 'SELECT portfolio, symbol, isin, ltp, native_ltp, prev_close, day_change, day_change_pct, data_source, data_status, last_update, total_cost, native_total_cost, acquisition_fx_rate, price_authority FROM Holdings WHERE ltp > 0').catch(() => []);
    const pricesMap: Record<string, any> = {};
    for (const p of existingPrices) {
      if (p.portfolio && p.symbol) pricesMap[`${p.portfolio}::${p.symbol}`] = p;
      if (p.portfolio && p.isin) pricesMap[`${p.portfolio}::${p.isin}`] = p;
      if (p.isin && !pricesMap[p.isin]) pricesMap[p.isin] = p;
      if (p.symbol && !pricesMap[p.symbol]) pricesMap[p.symbol] = p;
    }

    // NOTE: Holdings is deleted only once (line ~920) inside the final batch INSERT block.
    // The earlier delete was removed to eliminate the race window where Holdings was empty
    // between the two deletes. All price/data computation happens here on the in-memory
    // 'holdings' object; the DB is only wiped immediately before the atomic batch INSERT.

    const usdRateRow = await dbGet(db, "SELECT rate_to_inr FROM CurrencyRates WHERE currency = 'USD'");
    const dbUsdRate = usdRateRow?.rate_to_inr || 83.5;

    for (const h of Object.values(holdings)) {
      const portKey = `${h.portfolio}::${h.symbol}`;
      const existing = pricesMap[portKey] || pricesMap[h.symbol] || {};
      
      let ltp = 0;
      let prevClose = 0;
      const isUsAsset = h.portfolio === 'US - IBKR' || h.portfolio === 'Sarwa' || h.isin?.startsWith('US');
      if (existing.prev_close > 0) {
        if (isUsAsset) {
          prevClose = existing.prev_close / dbUsdRate;
        } else {
          prevClose = existing.prev_close;
        }
      }
      let ds = 'Manual';
      let dataStatus = existing.data_status || 'LIVE';
      let lu: string | null = null;

      // 1. Prefer existing live/synced price if it is from a real live feed (Yahoo/Upstox/MFapi/AMFI)
      // IMPORTANT: This list must include ALL data_source strings written by yahooFinance.ts and camsParser.ts
      // otherwise FIFO will fall through to 'Avg Buy Cost Fallback' after every sync run
      const validLiveSources = [
        'Yahoo Finance',
        'Upstox API',
        'MFapi.in',
        'AMFI API',
        'AMFI (Fallback)',
        'Live Yahoo Spot Rate',
        'Manual / Exchange Close',
        'Master Ticker / Manual',
        'MasterTickers Fallback',
        'HistoricalPrices Cache',
        'CAMS PDF Summary',
        'Unlisted Valuation'
      ];
      if (existing.ltp > 0 && (validLiveSources.includes(existing.data_source) || (existing.data_source && !existing.data_source.includes('Fallback') && existing.data_source !== 'Manual'))) {
        if (isUsAsset && existing.native_ltp > 0) {
          ltp = existing.native_ltp;
        } else {
          ltp = existing.ltp;
        }
        ds = existing.data_source;
        dataStatus = existing.data_status || 'LIVE';
        // Use the existing last_update if it's within the last 24 hours; otherwise stamp with now
        // so the UI always shows a meaningful "last updated" time rather than a very stale date.
        const existingLuMs = existing.last_update ? new Date(existing.last_update.includes(' ') ? existing.last_update.replace(' ', 'T') + 'Z' : existing.last_update).getTime() : 0;
        const oneDayMs = 24 * 60 * 60 * 1000;
        lu = (existingLuMs > 0 && (Date.now() - existingLuMs) < oneDayMs)
          ? existing.last_update
          : new Date().toISOString().replace('T', ' ').slice(0, 19);
      }

      // 2. Fallback 1: Check HistoricalPrices table (latest recorded close price)
      if (ltp <= 0) {
        const hp = histPricesMap.get((h.symbol || '').toUpperCase()) || histPricesMap.get((h.isin || '').toUpperCase());
        if (hp && hp.close_price > 0) {
          ltp = hp.close_price;
          ds = hp.data_source || 'HistoricalPrices Cache';
          lu = hp.date;
        }
      }

      // 3. Fallback 2: Check MasterTickers manual_ltp (in-memory lookup) — ONLY for unlisted or when live/historical cache is missing
      if (ltp <= 0) {
        const tickerRow = lookupTicker(h.isin) || lookupTicker(h.symbol);
        if (tickerRow && tickerRow.manual_ltp > 0) {
          ltp = tickerRow.manual_ltp;
          const isUnlistedAsset = (h.symbol || '').toUpperCase().startsWith('UL') ||
                                (h.symbol || '').toUpperCase().includes('UNLISTED') ||
                                (h.isin || '').toUpperCase().startsWith('CUSTOM_');
          ds = isUnlistedAsset ? 'Unlisted Valuation' : 'MasterTickers Fallback';
          lu = tickerRow.manual_ltp_date || new Date().toISOString();
        }
      }

      // 4. Fallback 3: Check ground_truth_ltp from CamsSummaryHoldings as backup
      if (ltp <= 0 && h.ground_truth_ltp > 0) {
        ltp = h.ground_truth_ltp;
        ds = 'CAMS PDF Summary';
        lu = new Date().toISOString();
      }

      // 5. Fallback 4: Check CamsSummaryHoldings nav directly (in-memory lookup)
      if (ltp <= 0) {
        const summaryRow = lookupCamsGT(h.portfolio, h.isin, h.folio || 'NA');
        if (summaryRow && summaryRow.nav > 0) {
          ltp = summaryRow.nav;
          ds = 'CAMS PDF Summary';
          lu = new Date().toISOString();
        }
      }

      // 5b. Fallback 4b: For cc9 PMS portfolio, fall back to official broker statement LTP if no live feed available
      if (ltp <= 0 && h.portfolio === 'cc9' && allPmsSummary && allPmsSummary.length > 0) {
        const pmsRow = allPmsSummary.find((r: any) => r.isin === h.isin || r.symbol === h.symbol);
        if (pmsRow && pmsRow.ltp > 0) {
          ltp = pmsRow.ltp;
          ds = 'PMS Official Statement Close';
          lu = pmsRow.statement_date || new Date().toISOString().slice(0, 10);
        }
      }

      // 6. Fallback 5: Use average buy price as final non-zero safeguard
      if (ltp <= 0 && h.avg_buy_price > 0) {
        ltp = h.avg_buy_price;
        ds = 'Avg Buy Cost Fallback';
        lu = new Date().toISOString();
      }

      if (prevClose <= 0) {
        const hp = histPricesMap.get((h.symbol || '').toUpperCase()) || histPricesMap.get((h.isin || '').toUpperCase());
        if (hp && hp.close_price > 0) prevClose = hp.close_price;
        else prevClose = ltp;
      }

      const currency = isUsAsset ? 'USD' : 'INR';
      const usdRate = dbUsdRate;
      const rateToInr = isUsAsset ? usdRate : 1.0;

      // Determine acquisition FX rate for foreign assets to lock cost basis against live FX drift
      let acquisitionFxRate = 1.0;
      if (isUsAsset) {
        if (existing.acquisition_fx_rate && existing.acquisition_fx_rate > 0) {
          acquisitionFxRate = existing.acquisition_fx_rate;
        } else if (existing.total_cost > 0 && existing.native_total_cost > 0) {
          const ratio = existing.total_cost / existing.native_total_cost;
          if (ratio >= 60 && ratio <= 120) {
            acquisitionFxRate = ratio;
          } else {
            acquisitionFxRate = dbUsdRate;
          }
        } else {
          acquisitionFxRate = dbUsdRate;
        }
      }

      const nativeLtp = ltp;
      const nativeAvgBuyPrice = h.avg_buy_price;
      const nativeTotalCost = h.total_cost;
      const nativeCurrentValue = h.quantity * nativeLtp;
      const nativeUnrealizedPnl = nativeCurrentValue - nativeTotalCost;

      const dayChg = nativeLtp - prevClose;
      const dayChgPct = prevClose > 0 ? (dayChg / prevClose) * 100 : 0;
      const inrDayChg = h.quantity * dayChg * rateToInr;

      // Cost basis locked to acquisition FX rate; Valuation floats with live FX rate
      const inrTotalCost = isUsAsset ? (nativeTotalCost * acquisitionFxRate) : (nativeTotalCost * rateToInr);
      const inrAvgBuyPrice = h.quantity > 0 ? (inrTotalCost / h.quantity) : (nativeAvgBuyPrice * acquisitionFxRate);
      const inrLtp = nativeLtp * rateToInr;
      const inrCurrentValue = nativeCurrentValue * rateToInr;
      const inrUnrealizedPnl = inrCurrentValue - inrTotalCost;
      const pct = inrTotalCost > 0 ? (inrUnrealizedPnl / inrTotalCost) * 100 : 0;

      // Determine authority for price updates
      let priceAuthority = 'LIVE_FEED';
      if (ds === 'Unlisted Valuation' || ds === 'Master Ticker / Manual' || (h.portfolio || '').toLowerCase() === 'unlisted') {
        priceAuthority = 'MANUAL';
      }

      // Ensure properties are properly injected for batch insertion later
      (h as any).inrAvgBuyPrice = inrAvgBuyPrice;
      (h as any).inrTotalCost = inrTotalCost;
      (h as any).inrLtp = inrLtp;
      (h as any).prevClose = prevClose;
      (h as any).inrDayChg = inrDayChg;
      (h as any).dayChgPct = dayChgPct;
      (h as any).inrCurrentValue = inrCurrentValue;
      (h as any).inrUnrealizedPnl = inrUnrealizedPnl;
      (h as any).pct = pct;
      (h as any).ds = ds;
      (h as any).lu = lu;
      (h as any).currency = currency;
      (h as any).nativeLtp = nativeLtp;
      (h as any).nativeCurrentValue = nativeCurrentValue;
      (h as any).nativeTotalCost = nativeTotalCost;
      (h as any).nativeAvgBuyPrice = nativeAvgBuyPrice;
      (h as any).dataStatus = dataStatus;
      (h as any).nativeUnrealizedPnl = nativeUnrealizedPnl;
      (h as any).acquisitionFxRate = acquisitionFxRate;
      (h as any).priceAuthority = priceAuthority;
    }

    await dbRun(db, 'DELETE FROM Holdings');
    await new Promise<void>((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO Holdings (
          portfolio, isin, folio, symbol, quantity, 
          avg_buy_price, total_cost, ltp, prev_close, day_change, day_change_pct, current_value, unrealized_pnl, unrealized_pct, 
          data_source, data_status, last_update, currency,
          native_ltp, native_current_value, native_total_cost, native_avg_buy_price, native_unrealized_pnl,
          holding_type, price_authority, acquisition_fx_rate
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const h of Object.values(holdings)) {
        const ext = h as any;
        // Classify holding type based on ISIN/symbol
        let holdingType = 'EQUITY';
        const symUp = (h.symbol || '').toUpperCase();
        const isinUp = (h.isin || '').toUpperCase();
        const pName = (h.portfolio || '').toLowerCase();
        if (symUp === 'CASH' || isinUp.startsWith('CASH')) holdingType = 'CASH';
        else if (symUp.includes('SMART') || symUp.includes('HORIZON') || isinUp.includes('HORIZON')) holdingType = 'AIF';
        else if (isinUp.startsWith('INF') || pName.includes('mf')) holdingType = 'MUTUAL_FUND';
        else if (pName === 'unlisted' || symUp.startsWith('UL') || symUp.includes('UNLISTED') || isinUp.startsWith('CUSTOM_')) holdingType = 'UNLISTED';

        let pAuth = ext.priceAuthority || 'LIVE_FEED';
        if (holdingType === 'CASH') pAuth = 'CASH';
        else if (holdingType === 'UNLISTED') pAuth = 'MANUAL';

        stmt.run([
          h.portfolio, h.isin, h.folio || 'NA', h.symbol, h.quantity, 
          ext.inrAvgBuyPrice, ext.inrTotalCost, ext.inrLtp, ext.prevClose * (ext.currency === 'USD' ? dbUsdRate : 1.0), ext.inrDayChg, ext.dayChgPct, ext.inrCurrentValue, ext.inrUnrealizedPnl, ext.pct, 
          ext.ds, ext.dataStatus || 'LIVE', ext.lu, ext.currency,
          ext.nativeLtp, ext.nativeCurrentValue, ext.nativeTotalCost, ext.nativeAvgBuyPrice, ext.nativeUnrealizedPnl,
          holdingType, pAuth, ext.acquisitionFxRate || 1.0
        ], (err: any) => { if (err) reject(err); });
      }
      stmt.finalize(async (err: any) => {
        if (err) reject(err); else {
          try {
            await syncDualCostBasis(db);

            // === FIX B: CC9 Cash — loaded dynamically from PmsReconciliationBaseline, not hardcoded ===
            const cc9BaselineRow = await dbGet(db, "SELECT cash_in_hand FROM PmsReconciliationBaseline WHERE portfolio = 'cc9'").catch(() => null);
            const cc9Cash = (cc9BaselineRow && typeof cc9BaselineRow.cash_in_hand === 'number' && cc9BaselineRow.cash_in_hand > 0)
              ? cc9BaselineRow.cash_in_hand
              : 0;
            if (cc9Cash > 0) {
              await dbRun(db, `DELETE FROM Holdings WHERE portfolio = 'cc9' AND symbol = 'CASH'`).catch(() => {});
              await dbRun(db, `
                INSERT INTO Holdings (
                  portfolio, isin, folio, symbol, quantity,
                  avg_buy_price, total_cost, ltp, prev_close, day_change, day_change_pct, current_value, unrealized_pnl, unrealized_pct,
                  data_source, data_status, last_update, currency,
                  native_ltp, native_current_value, native_total_cost, native_avg_buy_price, native_unrealized_pnl,
                  holding_type, price_authority, acquisition_fx_rate
                )
                VALUES (
                  'cc9', 'CASH', 'NA', 'CASH', ${cc9Cash},
                  1.0, ${cc9Cash}, 1.0, 1.0, 0, 0, ${cc9Cash}, 0, 0,
                  'PMS Official Statement', 'LIVE', datetime('now'), 'INR',
                  1.0, ${cc9Cash}, ${cc9Cash}, 1.0, 0,
                  'CASH', 'PMS_STATEMENT', 1.0
                )
              `).catch(() => {});
              console.log(`[FIFO] cc9 CASH restored from PmsReconciliationBaseline: ₹${cc9Cash.toFixed(2)}`);
            }

            // === FIX B: Sarwa Cash — loaded dynamically from AppConfig, not hardcoded ===
            const sarwaCashRow = await dbGet(db, "SELECT value FROM AppConfig WHERE key = 'sarwa_cash_usd'").catch(() => null);
            const sarwaCashUsd = sarwaCashRow ? parseFloat(sarwaCashRow.value || '0') : 0;
            if (sarwaCashUsd > 0) {
              await dbRun(db, `DELETE FROM Holdings WHERE portfolio = 'Sarwa' AND symbol = 'CASH'`).catch(() => {});
              const sarwaCashInr = sarwaCashUsd * dbUsdRate;
              await dbRun(db, `
                INSERT INTO Holdings (
                  portfolio, isin, folio, symbol, quantity,
                  avg_buy_price, total_cost, ltp, prev_close, day_change, day_change_pct, current_value, unrealized_pnl, unrealized_pct,
                  data_source, data_status, last_update, currency,
                  native_ltp, native_current_value, native_total_cost, native_avg_buy_price, native_unrealized_pnl,
                  holding_type, price_authority, acquisition_fx_rate
                )
                VALUES (
                  'Sarwa', 'CASH_USD', 'NA', 'CASH', ${sarwaCashUsd},
                  ${dbUsdRate}, ${sarwaCashInr}, ${dbUsdRate}, ${dbUsdRate}, 0, 0, ${sarwaCashInr}, 0, 0,
                  'Sarwa Cash in Hand', 'LIVE', datetime('now'), 'USD',
                  1.0, ${sarwaCashUsd}, ${sarwaCashUsd}, 1.0, 0,
                  'CASH', 'CASH', ${dbUsdRate}
                )
              `).catch(() => {});
              console.log(`[FIFO] Sarwa CASH restored from AppConfig: $${sarwaCashUsd.toFixed(2)} = ₹${sarwaCashInr.toFixed(2)}`);
            }

            // === FIX C: US - IBKR Cash — loaded dynamically from AppConfig (default $0 USD if not set) ===
            const ibkrCashRow = await dbGet(db, "SELECT value FROM AppConfig WHERE key = 'ibkr_cash_usd'").catch(() => null);
            const ibkrCashUsd = (ibkrCashRow && ibkrCashRow.value) ? parseFloat(ibkrCashRow.value) : 0;
            if (!ibkrCashRow || !ibkrCashRow.value) {
              console.log('[FIFO] Notice: ibkr_cash_usd not set in AppConfig. Defaulting to $0 (no phantom cash).');
            }
            if (ibkrCashUsd > 0) {
              await dbRun(db, `DELETE FROM Holdings WHERE portfolio = 'US - IBKR' AND symbol = 'CASH'`).catch(() => {});
              const ibkrCashInr = ibkrCashUsd * dbUsdRate;
              await dbRun(db, `
                INSERT INTO Holdings (
                  portfolio, isin, folio, symbol, quantity,
                  avg_buy_price, total_cost, ltp, prev_close, day_change, day_change_pct, current_value, unrealized_pnl, unrealized_pct,
                  data_source, data_status, last_update, currency,
                  native_ltp, native_current_value, native_total_cost, native_avg_buy_price, native_unrealized_pnl,
                  holding_type, price_authority, acquisition_fx_rate
                )
                VALUES (
                  'US - IBKR', 'CASH_USD', 'NA', 'CASH', ${ibkrCashUsd},
                  ${dbUsdRate}, ${ibkrCashInr}, ${dbUsdRate}, ${dbUsdRate}, 0, 0, ${ibkrCashInr}, 0, 0,
                  'IBKR Statement Cash', 'LIVE', datetime('now'), 'USD',
                  1.0, ${ibkrCashUsd}, ${ibkrCashUsd}, 1.0, 0,
                  'CASH', 'CASH', ${dbUsdRate}
                )
              `).catch(() => {});
              console.log(`[FIFO] US - IBKR CASH restored from AppConfig: $${ibkrCashUsd.toFixed(2)} = ₹${ibkrCashInr.toFixed(2)}`);
            }

            resolve();
          } catch(e) {
            console.warn('[FIFO] syncDualCostBasis warning:', e);
            resolve();
          }
        }
      });
    });

    // Clear and insert RealizedGains
    await dbRun(db, 'DELETE FROM RealizedGains');
    await new Promise<void>((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO RealizedGains (match_id, portfolio, isin, symbol, buy_date, buy_price, matched_qty, sell_date, sell_price, buy_cost, sell_proceeds, realized_pnl, holding_days, tax_category, fmv_31_jan_2018, grandfathered_cost, taxable_pnl)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const g of realizedGains) {
        stmt.run([g.match_id, g.portfolio, g.isin, g.symbol, g.buy_date, g.buy_price, g.matched_qty, g.sell_date, g.sell_price, g.buy_cost, g.sell_proceeds, g.realized_pnl, g.holding_days, g.tax_category, g.fmv_31_jan_2018, g.grandfathered_cost, g.taxable_pnl], (err: any) => { if (err) reject(err); });
      }
      stmt.finalize((err: any) => {
        if (err) reject(err); else resolve();
      });
    });

    // NOTE: Dividends are sourced ONLY from actual DIVIDEND/DIVIDEND PAYOUT/DIVIDEND REINVEST
    // transactions in the Transactions table. CorporateActions-based theoretical dividend
    // accumulation was removed as it inflated dividends by 100-4000% vs actual cash received.

    // Store dividends to AppConfig per portfolio
    for (const [port, div] of Object.entries(totalDividends)) {
      await dbRun(db, 'INSERT OR REPLACE INTO AppConfig (key, value) VALUES (?, ?)', [`dividend_${port}`, String(div.toFixed(2))]);
    }

    // Recompute TaxSummary
    await calculateTaxSummary(db);

    // Purge stale DashboardDiskCache so all frontend views immediately reflect latest FIFO valuations
    await dbRun(db, 'DELETE FROM DashboardDiskCache').catch(() => {});
    if (onFifoCompletedCallback) {
      try { onFifoCompletedCallback(); } catch (_) {}
    }

    // Rebuild CorporateActionAudit
    await dbRun(db, 'DELETE FROM CorporateActionAudit');
    await new Promise<void>((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO CorporateActionAudit (portfolio, date, isin, symbol, action_type, original_qty, new_qty, original_cost, new_cost, message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const ev of auditEvents) {
        stmt.run([ev.portfolio, ev.date, ev.isin, ev.symbol, ev.action_type, ev.original_qty, ev.new_qty, ev.original_cost, ev.new_cost, ev.message], (err: any) => { if (err) reject(err); });
      }
      stmt.finalize((err: any) => {
        if (err) reject(err); else resolve();
      });
    });

    // === INSTITUTIONAL BALANCE-SHEET PARITY & DRIFT AUDIT ===
    const activeHoldingsList = Object.values(holdings);
    const totalValuationNow = activeHoldingsList.reduce((s: number, h: any) => s + (h.inrCurrentValue || 0), 0);
    const totalTxCount = transactions.length;

    const lastValRow = await dbGet(db, "SELECT value FROM AppConfig WHERE key = 'last_holdings_valuation'").catch(() => null);
    const lastTxCountRow = await dbGet(db, "SELECT value FROM AppConfig WHERE key = 'last_tx_count'").catch(() => null);

    const prevVal = lastValRow ? parseFloat(lastValRow.value || '0') : 0;
    const prevTxCount = lastTxCountRow ? parseInt(lastTxCountRow.value || '0', 10) : 0;

    if (prevVal > 0 && prevTxCount === totalTxCount) {
      const diffLakh = (totalValuationNow - prevVal) / 100000;
      const pctDiff = Math.abs(diffLakh / (prevVal / 100000)) * 100;
      if (pctDiff > 0.01) {
        console.log(`[Valuation Integrity Audit] Net Worth drift: ${diffLakh >= 0 ? '+' : ''}₹${diffLakh.toFixed(2)} Lakh (${pctDiff.toFixed(2)}%) — Transaction count unchanged (${totalTxCount}). Drift is due to live share price / FX rate movements.`);
      }
    }

    await dbRun(db, "INSERT OR REPLACE INTO AppConfig (key, value) VALUES ('last_holdings_valuation', ?)", [String(totalValuationNow)]);
    await dbRun(db, "INSERT OR REPLACE INTO AppConfig (key, value) VALUES ('last_tx_count', ?)", [String(totalTxCount)]);
    await dbRun(db, "INSERT OR REPLACE INTO AppConfig (key, value) VALUES ('last_fifo_run_at', datetime('now'))");

    // === Valuation Snapshot & Drift Detection ===
    try {
      const usdRateRow = await dbGet(db, "SELECT rate_to_inr FROM CurrencyRates WHERE currency = 'USD'").catch(() => null);
      const snapshotUsdRate = usdRateRow?.rate_to_inr || 0;

      // Get per-portfolio valuations
      const portfolioVals = await dbAll(db, `
        SELECT portfolio,
          SUM(current_value) as total_value,
          SUM(CASE WHEN holding_type = 'EQUITY' THEN current_value ELSE 0 END) as equity_value,
          SUM(CASE WHEN holding_type = 'CASH' THEN current_value ELSE 0 END) as cash_value,
          SUM(CASE WHEN holding_type = 'MUTUAL_FUND' THEN current_value ELSE 0 END) as mf_value,
          SUM(CASE WHEN holding_type = 'AIF' THEN current_value ELSE 0 END) as aif_value,
          SUM(CASE WHEN holding_type = 'UNLISTED' THEN current_value ELSE 0 END) as unlisted_value
        FROM Holdings
        GROUP BY portfolio
      `);

      for (const pv of portfolioVals) {
        // Check drift against last snapshot
        const lastSnap = await dbGet(db,
          `SELECT total_value_inr FROM ValuationSnapshots WHERE portfolio = ? ORDER BY id DESC LIMIT 1`,
          [pv.portfolio]
        ).catch(() => null);

        let driftPct = 0;
        let driftAlert: string | null = null;

        if (lastSnap && lastSnap.total_value_inr > 0) {
          driftPct = ((pv.total_value - lastSnap.total_value_inr) / lastSnap.total_value_inr) * 100;
          if (Math.abs(driftPct) > 5) {
            driftAlert = `WARN: ${pv.portfolio} drifted ${driftPct > 0 ? '+' : ''}${driftPct.toFixed(2)}% without import`;
            console.warn(`[Valuation Drift] ${driftAlert}`);
          }
        }

        await dbRun(db, `
          INSERT INTO ValuationSnapshots (portfolio, total_value_inr, equity_value, cash_value, mf_value, aif_value, unlisted_value, fx_rate_usd, trigger_source, drift_pct, drift_alert)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'FIFO_RECOMPUTE', ?, ?)
        `, [pv.portfolio, pv.total_value, pv.equity_value, pv.cash_value, pv.mf_value, pv.aif_value, pv.unlisted_value, snapshotUsdRate, driftPct, driftAlert]);
      }

      // Prune old snapshots (keep last 500)
      await dbRun(db, `
        DELETE FROM ValuationSnapshots WHERE id NOT IN (
          SELECT id FROM ValuationSnapshots ORDER BY id DESC LIMIT 500
        )
      `).catch(() => {});

      console.log(`[Valuation Snapshot] Recorded ${portfolioVals.length} portfolio snapshots after FIFO recompute`);
    } catch (snapErr) {
      console.warn('[Valuation Snapshot] Failed to record snapshot:', snapErr);
    }

    await dbRun(db, 'COMMIT');
    return {
      success: true,
      holdings: Object.keys(holdings).length,
      realized: realizedGains.length,
      audit_events: auditEvents.length
    };

  } catch (err: any) {
    console.error('runFIFO crashed:', err);
    try { await dbRun(db, 'ROLLBACK'); } catch (e) {}
    throw err;
  }
  });
}

export async function calculateTaxSummary(db: sqlite3.Database): Promise<void> {
  await dbRun(db, 'DELETE FROM TaxSummary');

  const summary: Record<string, {
    stcg_old: number; stcg_new: number;
    ltcg_old: number; ltcg_new: number;
    intraday: number; dividends: number; total_realized_pnl: number;
  }> = {};

  const getSummaryEntry = (port: string, fy: string) => {
    const k = `${port}::${fy}`;
    if (!summary[k]) {
      summary[k] = {
        stcg_old: 0, stcg_new: 0,
        ltcg_old: 0, ltcg_new: 0,
        intraday: 0, dividends: 0, total_realized_pnl: 0
      };
    }
    return summary[k];
  };

  // 1. Process RealizedGains
  const gains = await dbAll(db, 'SELECT portfolio, sell_date, realized_pnl, taxable_pnl, tax_category FROM RealizedGains');
  for (const g of gains) {
    const port = g.portfolio;
    const fy = getFYFromDate(g.sell_date);
    const entry = getSummaryEntry(port, fy);
    const pnl = g.taxable_pnl !== null ? g.taxable_pnl : (g.realized_pnl || 0);

    entry.total_realized_pnl += (g.realized_pnl || 0);

    // In India, capital gain tax rates changed on 23-Jul-2024 (Budget 2024)
    // Buy/Sell after 23-Jul-2024 has STCG at 20% and LTCG at 12.5%.
    // Before 23-Jul-2024 had STCG at 15% and LTCG at 10%.
    const sellDate = parseDate(g.sell_date);
    const isNewScheme = sellDate && sellDate.getTime() >= new Date('2024-07-23').getTime();

    if (g.tax_category === 'STCG') {
      if (isNewScheme) {
        entry.stcg_new += pnl;
      } else {
        entry.stcg_old += pnl;
      }
    } else if (g.tax_category === 'LTCG') {
      if (isNewScheme) {
        entry.ltcg_new += pnl;
      } else {
        entry.ltcg_old += pnl;
      }
    } else if (g.tax_category === 'INTRADAY') {
      entry.intraday += pnl;
    }
  }

  // 2. Process Dividends from Transactions
  const divs = await dbAll(db, "SELECT portfolio, date, net_amount FROM Transactions WHERE type LIKE '%DIVIDEND%'");
  for (const d of divs) {
    const port = d.portfolio;
    const fy = getFYFromDate(d.date);
    const entry = getSummaryEntry(port, fy);
    entry.dividends += d.net_amount || 0;
  }

  // 3. Compute Tax rates & Insert into TaxSummary
  for (const [key, data] of Object.entries(summary)) {
    const [port, fy] = key.split('::');

    const stcgGains = data.stcg_old + data.stcg_new;
    const ltcgGains = data.ltcg_old + data.ltcg_new;
    const dividends = data.dividends;
    const totalRealized = data.total_realized_pnl;

    // LTCG Exemption limit under 112A: 
    // Increased to 1.25 Lakh (1,25,000) for FY 24-25 onwards. Previous was 1 Lakh (1,00,000).
    let exemption = 100000;
    try {
      const startYear = parseInt(fy.split('-')[0]);
      if (startYear >= 2024) {
        exemption = 125000;
      }
    } catch (_) {}

    // Calculate STCG Tax with proper loss set-off
    let stcgTax = 0;
    if (stcgGains > 0) {
      let remOld = data.stcg_old;
      let remNew = data.stcg_new;

      // If one bucket is in loss, set it off against the profitable bucket
      if (remOld < 0) {
        remNew += remOld; // Reduces new regime gains
        remOld = 0;
      } else if (remNew < 0) {
        remOld += remNew; // Reduces old regime gains
        remNew = 0;
      }

      const taxedOld = Math.max(0, remOld);
      const taxedNew = Math.max(0, remNew);
      stcgTax = (taxedOld * 0.15) + (taxedNew * 0.20);
    }

    // Calculate LTCG Tax
    let ltcgTaxable = 0;
    let ltcgTax = 0;
    if (ltcgGains > exemption) {
      ltcgTaxable = ltcgGains - exemption;
      
      // Pro-rata allocate exemption after loss set-off
      let remNew = data.ltcg_new;
      let remOld = data.ltcg_old;
      
      if (remOld < 0) {
        remNew += remOld;
        remOld = 0;
      } else if (remNew < 0) {
        remOld += remNew;
        remNew = 0;
      }

      let remExemption = exemption;
      // Deduct exemption prioritizing new regime (12.5%) or old regime (10%)
      if (remNew > 0) {
        const deduct = Math.min(remNew, remExemption);
        remNew -= deduct;
        remExemption -= deduct;
      }
      if (remOld > 0 && remExemption > 0) {
        const deduct = Math.min(remOld, remExemption);
        remOld -= deduct;
        remExemption -= deduct;
      }

      ltcgTax = (Math.max(0, remOld) * 0.10) + (Math.max(0, remNew) * 0.125);
    }

    const totalTax = stcgTax + ltcgTax;

    await dbRun(db, `
      INSERT INTO TaxSummary (financial_year, portfolio, intraday_gains, stcg_gains, stcg_tax, ltcg_gains, ltcg_exemption, ltcg_taxable, ltcg_tax, total_tax, dividends, total_realized_pnl)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [fy, port, data.intraday, stcgGains, stcgTax, ltcgGains, exemption, ltcgTaxable, ltcgTax, totalTax, dividends, totalRealized]);
  }
}

export function getHoldingsAsOfDate(
  txns: any[],
  asOfDate: Date,
  masterFMV: Record<string, number> = {}
): Record<string, any> {
  const buyQueues: Record<string, BuyLot[]> = {};

  // Sort txns chronologically
  let sortedTxns = [...txns].map(r => {
    const parsedDate = parseDate(r.date);
    if (!parsedDate) return null;

    const tType = String(r.type).toUpperCase().trim();
    let resolvedType = tType;

    if (
      tType.includes('BUYBACK') ||
      tType.includes('TENDER') ||
      tType.includes('MERGER_OUT') ||
      tType.includes('MERGED_OUT') ||
      tType.includes('MERGED') ||
      tType.includes('SELL') ||
      tType.includes('SALE') ||
      tType.includes('REDEMPTION') ||
      tType.includes('ROUNDING')
    ) {
      resolvedType = 'SELL';
    } else if (
      tType.includes('MERGER') ||
      tType.includes('(NEW)') ||
      tType.includes('BUY') ||
      tType.includes('PURCHASE') ||
      tType.includes('IPO') ||
      tType.includes('ALLOTMENT') ||
      tType.includes('INVESTMENT') ||
      tType.includes('REINVEST')
    ) {
      resolvedType = 'BUY';
    } else if (tType.includes('DIVIDEND')) {
      resolvedType = 'DIVIDEND';
    } else if (tType.includes('SPLIT')) {
      resolvedType = 'SPLIT';
    } else if (tType.includes('BONUS')) {
      resolvedType = 'BONUS';
    } else if (tType.includes('DEMERGER')) {
      resolvedType = 'DEMERGER';
    }

    return {
      id: r.id,
      date: parsedDate,
      portfolio: String(r.portfolio || '').trim(),
      type: resolvedType,
      isin: String(r.isin || r.symbol || '').trim(),
      symbol: String(r.symbol || r.isin || '').trim(),
      quantity: r.quantity,
      price: r.price,
      net_amount: r.net_amount || (r.quantity * r.price),
      notes: r.notes
    };
  }).filter(Boolean) as any[];

  sortedTxns.sort((a, b) => a.date.getTime() - b.date.getTime() || a.id - b.id);

  // Pre-process to remove same-day same-quantity BUY/SELL pairs (typically SIP reversals or bounce)
  // These should cancel out completely and NOT consume older FIFO units.
  const toIgnore = new Set<number>();
  for (let i = 0; i < sortedTxns.length; i++) {
     const t1 = sortedTxns[i];
     if (toIgnore.has(t1.id)) continue;
     if (t1.type !== 'BUY' && t1.type !== 'SELL') continue;
     
     // Look for the opposite transaction on the same day
     for (let j = i + 1; j < sortedTxns.length; j++) {
        const t2 = sortedTxns[j];
        if (t1.date.getTime() !== t2.date.getTime()) break; // Since array is sorted by date, we can break early
        if (toIgnore.has(t2.id)) continue;
        if (t1.portfolio === t2.portfolio && t1.isin === t2.isin && Math.abs(t1.quantity - t2.quantity) < 0.0001 && t1.type !== t2.type && (t2.type === 'BUY' || t2.type === 'SELL')) {
            // Match found! Reversal
            toIgnore.add(t1.id);
            toIgnore.add(t2.id); console.log('IGNORED REVERSAL:', t1.date, t1.symbol, t1.quantity);
            break;
        }
     }
  }

  sortedTxns = sortedTxns.filter(t => !toIgnore.has(t.id));

  for (const txn of sortedTxns) {
    if (txn.date.getTime() > asOfDate.getTime()) {
      continue;
    }

    if (
      txn.symbol === 'USD_CASH' || txn.symbol === 'CASH' || 
      txn.isin === 'USD_CASH' || txn.isin === 'CASH' || 
      txn.type === 'DEPOSIT' || txn.type === 'WITHDRAWAL'
    ) {
      continue;
    }

    const folio = getFolioFromNotes(txn.notes, txn.isin);
    const groupKey = `${txn.portfolio}::${txn.isin}::${folio || 'NA'}`;
    const tType = txn.type;

    if (!buyQueues[groupKey]) {
      buyQueues[groupKey] = [];
    }

    const tTypeUpper = String(tType || '').toUpperCase().trim();
    if (
      tTypeUpper === 'BUY' || tTypeUpper === 'PURCHASE' || 
      tTypeUpper === 'TRANSFER IN' || tTypeUpper === 'SECURITY IN' || 
      tTypeUpper === 'INITIAL_HOLDING' || tTypeUpper === 'OPENING_BALANCE' ||
      tTypeUpper.includes('BUY') || tTypeUpper.includes('PURCHASE') ||
      tTypeUpper.includes('TRANSFER IN') || tTypeUpper.includes('SECURITY IN')
    ) {
      const isMutualFund = txn.isin && txn.isin.startsWith('INF');
      const costPerUnit = isMutualFund
        ? txn.price
        : (txn.quantity > 0 ? (Math.abs(txn.net_amount) > 0 ? Math.abs(txn.net_amount) / txn.quantity : txn.price) : txn.price);

      buyQueues[groupKey].push({
        date: txn.date,
        price: txn.price,
        remainingQty: txn.quantity,
        totalCostPerUnit: costPerUnit
      });
    } else if (tType === 'SPLIT') {
      const queue = buyQueues[groupKey];
      const currentQty = queue.reduce((sum, q) => sum + q.remainingQty, 0);
      if (currentQty > 0 && txn.quantity > 0) {
        const ratio = txn.quantity / currentQty;
        if (Math.abs(ratio - 1.0) > 0.01) {
          for (const q of queue) {
            q.remainingQty = Number((q.remainingQty * ratio).toFixed(4));
            q.totalCostPerUnit = q.totalCostPerUnit / ratio;
            q.price = q.price / ratio;
          }
        }
      }
    } else if (tType === 'BONUS') {
      const queue = buyQueues[groupKey];
      const currentQty = queue.reduce((sum, q) => sum + q.remainingQty, 0);
      if (currentQty > 0 && txn.quantity > 0) {
        const ratio = txn.quantity / currentQty;
        for (const q of queue) {
          q.remainingQty = Number((q.remainingQty * (1 + ratio)).toFixed(4));
          q.totalCostPerUnit = q.totalCostPerUnit / (1 + ratio);
          q.price = q.price / (1 + ratio);
        }
      }
    } else if (tType === 'DEMERGER') {
      const queue = buyQueues[groupKey];
      const currentCost = queue.reduce((sum, q) => sum + (q.remainingQty * q.totalCostPerUnit), 0);
      const extractedCost = txn.net_amount;
      if (currentCost > 0 && extractedCost > 0) {
        const factor = (currentCost - extractedCost) / currentCost;
        if (factor > 0) {
          for (const q of queue) {
            q.totalCostPerUnit = q.totalCostPerUnit * factor;
            q.price = q.price * factor;
          }
        }
      }
    } else if (
      tTypeUpper === 'SELL' || tTypeUpper === 'SALE' ||
      tTypeUpper === 'TRANSFER OUT' || tTypeUpper === 'SECURITY OUT' ||
      tTypeUpper === 'BUYBACK' || tTypeUpper.includes('SELL') || tTypeUpper.includes('SALE')
    ) {
      let sellQty = txn.quantity;
      const queue = buyQueues[groupKey];
      while (sellQty > 0.0001 && queue.length > 0) {
        const buyLot = queue[0];
        const matchQty = Number(Math.min(sellQty, buyLot.remainingQty).toFixed(4));
        buyLot.remainingQty = Number((buyLot.remainingQty - matchQty).toFixed(4));
        sellQty = Number((sellQty - matchQty).toFixed(4));
        if (buyLot.remainingQty <= 0.0001) {
          queue.shift();
        }
      }
    }
  }

  // Compile remains into Holdings format
  const isinToSymbol: Record<string, string> = {};
  for (const r of txns) {
    if (r && r.isin && r.symbol && r.symbol.trim() !== r.isin.trim()) {
      isinToSymbol[r.isin.trim()] = r.symbol.trim();
    }
  }

  const consolidatedMap: Record<string, { totalQty: number, totalCost: number }> = {};
  for (const [groupKey, queue] of Object.entries(buyQueues)) {
    const isinGroupKey = groupKey; // preserve folio separation

    const totalQty = queue.reduce((sum, q) => sum + q.remainingQty, 0);
    const totalCost = queue.reduce((sum, q) => sum + (q.remainingQty * q.totalCostPerUnit), 0);

    if (totalQty > 0.01) {
      if (!consolidatedMap[isinGroupKey]) {
        consolidatedMap[isinGroupKey] = { totalQty: 0, totalCost: 0 };
      }
      consolidatedMap[isinGroupKey].totalQty += totalQty;
      consolidatedMap[isinGroupKey].totalCost += totalCost;
    }
  }

  const holdingsMap: Record<string, any> = {};
  for (const [isinGroupKey, data] of Object.entries(consolidatedMap)) {
    const parts = isinGroupKey.split('::');
    const portfolio = parts[0];
    const isin = parts[1];
    const folio = parts[2];
    
    let sym = isinToSymbol[isin] || isin;
    if (folio && folio !== 'NA') {
      sym = `${sym} - Folio: ${folio}`;
    }

    holdingsMap[isinGroupKey] = {
      portfolio,
      isin,
      symbol: sym,
      quantity: data.totalQty,
      total_cost: data.totalCost,
      current_value: data.totalCost, // Fallback to cost basis for start valuation
      currency: portfolio === 'US - IBKR' || isin.startsWith('US') ? 'USD' : 'INR'
    };
  }

  return holdingsMap;
}

export async function syncDualCostBasis(db: sqlite3.Database): Promise<void> {
  const capitalRegisterCosts: Record<string, { symbol: string; costPerSh: number; postBonusCostPerSh?: number }> = {
    'AEGIS LOGISTICS LTD': { symbol: 'AEGISLOG', costPerSh: 369.70 },
    'AFFLE 3I LTD': { symbol: 'AFFLE', costPerSh: 1095.00 },
    'ALKYL AMINES CHEMICALS LTD': { symbol: 'ALKYLAMINE', costPerSh: 3485.94 },
    'AMARA RAJA ENERGY & MOBILITY LIMITED': { symbol: 'ARE&M', costPerSh: 674.65 },
    'AMRUTANJAN HEALTH CARE LTD': { symbol: 'AMRUTANJAN', costPerSh: 818.70 },
    'APL APOLLO TUBES LTD': { symbol: 'APLAPOLLO', costPerSh: 1296.40 },
    'ASIAN PAINTS LTD': { symbol: 'ASIANPAINT', costPerSh: 3109.73 },
    'BAJAJ FINANCE LTD': { symbol: 'BAJFINANCE', costPerSh: 6952.37, postBonusCostPerSh: 527.19 },
    'BALAJI AMINES LTD': { symbol: 'BALAMINES', costPerSh: 2347.50 },
    'BANK OF BARODA': { symbol: 'BANKBARODA', costPerSh: 167.87 },
    'BERGER PAINTS INDIA LTD': { symbol: 'BERGEPAINT', costPerSh: 682.72 },
    'BLS INTERNATIONAL SERVICES LTD': { symbol: 'BLS', costPerSh: 207.08 },
    'BRIGHTCOM GROUP LTD': { symbol: 'BCG', costPerSh: 25.07 },
    'CANARA BANK': { symbol: 'CANBK', costPerSh: 318.48 },
    'CCL PRODUCTS INDIA LTD': { symbol: 'CCL', costPerSh: 647.40 },
    'CENTRAL DEPOSITORY SERVICES INDIA LTD': { symbol: 'CDSL', costPerSh: 1410.62 },
    'CL EDUCATE LTD': { symbol: 'CLEDUCATE', costPerSh: 75.00 },
    'DEEPAK NITRITE LTD': { symbol: 'DEEPAKNTR', costPerSh: 2200.77 },
    'DELTA CORP LTD': { symbol: 'DELTACORP', costPerSh: 199.87 },
    'DIVIS LABORATORIES LTD': { symbol: 'DIVISLAB', costPerSh: 3258.04 },
    'EKI ENERGY SERVICES LTD': { symbol: 'EKI', costPerSh: 718.44 },
    'FEDERAL BANK LTD': { symbol: 'FEDERALBNK', costPerSh: 129.00 },
    'GARWARE TECHNICAL FIBRES LTD': { symbol: 'GARFIBRES', costPerSh: 3309.37 },
    'HDFC BANK LTD': { symbol: 'HDFCBANK', costPerSh: 1500.71 },
    'HDFC LIFE INSURANCE COMPANY LTD': { symbol: 'HDFCLIFE', costPerSh: 589.47 },
    'HFCL LTD': { symbol: 'HFCL', costPerSh: 76.91 },
    'HINDUSTAN AERONAUTICS LTD': { symbol: 'HAL', costPerSh: 1113.00 },
    'IDBI BANK LTD': { symbol: 'IDBI', costPerSh: 70.50 },
    'IDFC FIRST BANK LTD': { symbol: 'IDFCFIRSTB', costPerSh: 63.62 },
    'IIFL CAPITAL SERVICES LTD': { symbol: 'IIFLCAPS', costPerSh: 97.35 },
    'INDIAN ENERGY EXCHANGE LTD': { symbol: 'IEX', costPerSh: 157.22 },
    'INDIAN RAILWAY CATERING and TOURISM CORPORATION LTD': { symbol: 'IRCTC', costPerSh: 725.92 },
    'JUBILANT FOODWORKS LTD': { symbol: 'JUBLFOOD', costPerSh: 518.00 },
    'KOTAK MAHINDRA BANK LTD': { symbol: 'KOTAKBANK', costPerSh: 1859.20 },
    'LIC HOUSING FINANCE LTD': { symbol: 'LICHSGFIN', costPerSh: 423.02 },
    'LUX INDUSTRIES LTD': { symbol: 'LUXIND', costPerSh: 1730.00 },
    'LnT TECHNOLOGY SERVICES LTD': { symbol: 'LTTS', costPerSh: 4044.43 },
    'MAZAGON DOCK SHIPBUILDERS LTD': { symbol: 'MAZDOCK', costPerSh: 1855.02 },
    'MIRZA INTERNATIONAL LTD': { symbol: 'MIRZAINT', costPerSh: 286.96 },
    'MODISON LTD': { symbol: 'MODISONLTD', costPerSh: 85.96 },
    'MTAR TECHNOLOGIES LTD': { symbol: 'MTARTECH', costPerSh: 2368.11 },
    'MUTHOOT FINANCE LTD': { symbol: 'MUTHOOTFIN', costPerSh: 1296.87 },
    'OLECTRA GREENTECH LTD': { symbol: 'OLECTRA', costPerSh: 1120.89 },
    'PAGE INDUSTRIES LTD': { symbol: 'PAGEIND', costPerSh: 48465.00 },
    'PIDILITE INDUSTRIES LTD': { symbol: 'PIDILITIND', costPerSh: 2406.88 },
    'RELAXO FOOTWEARS LTD': { symbol: 'RELAXO', costPerSh: 1118.09 },
    'SAMVARDHANA MOTHERSON INTERNATIONAL LTD': { symbol: 'MOTHERSON', costPerSh: 86.00 },
    'SBI CARDS AND PAYMENT SERVICES LTD': { symbol: 'SBICARD', costPerSh: 926.41 },
    'SEPC LTD': { symbol: 'SEPC', costPerSh: 14.65 },
    'SHEELA FOAM LTD': { symbol: 'SFL', costPerSh: 1216.25 },
    'SRF LTD': { symbol: 'SRF', costPerSh: 2160.00 },
    'TATA CONSULTANCY SERVICES LTD': { symbol: 'TCS', costPerSh: 3385.00 },
    'TATA ELXSI LTD': { symbol: 'TATAELXSI', costPerSh: 6569.77 },
    'TATA MOTORS PASSENGER VEHICLES LTD': { symbol: 'TATAMOTORS', costPerSh: 507.32 },
    'TATA MOTORS PASSENGER VEHICLES LTD TYPE A SHARES': { symbol: 'TATAMTRDVR', costPerSh: 318.27 },
    'TATA POWER CO LTD': { symbol: 'TATAPOWER', costPerSh: 222.45 },
    'TITAN COMPANY LTD': { symbol: 'TITAN', costPerSh: 3032.35 },
    'UNO MINDA LTD': { symbol: 'UNOMINDA', costPerSh: 612.95 },
    'VINSYS IT SERVICES INDIA LTD': { symbol: 'VINSYS', costPerSh: 252.50 },
    'WIPRO LTD': { symbol: 'WIPRO', costPerSh: 442.52 }
  };

  const cc9Holdings = await dbAll(db, "SELECT symbol, quantity, avg_buy_price, total_cost FROM Holdings WHERE portfolio='cc9'");
  for (const h of cc9Holdings) {
    const sym = h.symbol;
    let matchedCostPerSh: number | null = null;
    for (const [name, data] of Object.entries(capitalRegisterCosts)) {
      if (data.symbol === sym || sym.includes(data.symbol)) {
        matchedCostPerSh = data.postBonusCostPerSh || data.costPerSh;
        break;
      }
    }

    if (matchedCostPerSh) {
      const taxCost = matchedCostPerSh * Number(h.quantity);
      await dbRun(db, "UPDATE Holdings SET tax_avg_price=?, tax_cost_basis=? WHERE portfolio='cc9' AND symbol=?", [matchedCostPerSh, taxCost, sym]);
    } else {
      await dbRun(db, "UPDATE Holdings SET tax_avg_price=avg_buy_price, tax_cost_basis=total_cost WHERE portfolio='cc9' AND symbol=? AND tax_cost_basis IS NULL", [sym]);
    }
  }

  await dbRun(db, "UPDATE Holdings SET tax_avg_price=avg_buy_price, tax_cost_basis=total_cost WHERE portfolio != 'cc9' AND tax_cost_basis IS NULL");
}
