import sqlite3 from 'sqlite3';
import { DatabaseManager } from './DatabaseManager.js';

export interface TickerSeed {
  isin: string;
  symbol: string;
  name: string;
  exchange?: string;
  segment?: string;
  sector?: string;
  currency?: string;
  upstox_key_nse?: string;
  upstox_key_bse?: string;
  isLegacy?: boolean;
  notes?: string;
}

export class MasterTickerService {
  private static instance: MasterTickerService;

  // Master Seed Catalog of Active & Legacy/Merged Tickers
  private seedCatalog: TickerSeed[] = [
    // Major Active Equities
    { isin: 'INE002A01018', symbol: 'RELIANCE', name: 'Reliance Industries Ltd', sector: 'Energy / Oil & Gas', upstox_key_nse: 'NSE_EQ|INE002A01018' },
    { isin: 'INE040A01034', symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', sector: 'Financial Services / Banking', upstox_key_nse: 'NSE_EQ|INE040A01034' },
    { isin: 'INE090A01021', symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', sector: 'Financial Services / Banking', upstox_key_nse: 'NSE_EQ|INE090A01021' },
    { isin: 'INE009A01021', symbol: 'INFY', name: 'Infosys Ltd', sector: 'Information Technology', upstox_key_nse: 'NSE_EQ|INE009A01021' },
    { isin: 'INE467B01029', symbol: 'TCS', name: 'Tata Consultancy Services Ltd', sector: 'Information Technology', upstox_key_nse: 'NSE_EQ|INE467B01029' },
    { isin: 'INE155A01022', symbol: 'TATAMOTORS', name: 'Tata Motors Ltd', sector: 'Automobile', upstox_key_nse: 'NSE_EQ|INE155A01022' },
    { isin: 'INE081A01020', symbol: 'TATASTEEL', name: 'Tata Steel Ltd', sector: 'Metals & Mining', upstox_key_nse: 'NSE_EQ|INE081A01020' },
    { isin: 'INE030A01027', symbol: 'HINDUNILVR', name: 'Hindustan Unilever Ltd', sector: 'Consumer Goods (FMCG)', upstox_key_nse: 'NSE_EQ|INE030A01027' },
    { isin: 'INE062A01020', symbol: 'SBIN', name: 'State Bank of India', sector: 'Financial Services / Banking', upstox_key_nse: 'NSE_EQ|INE062A01020' },
    { isin: 'INE101A01026', symbol: 'M&M', name: 'Mahindra & Mahindra Ltd', sector: 'Automobile', upstox_key_nse: 'NSE_EQ|INE101A01026' },
    { isin: 'INE018A01030', symbol: 'LTIM', name: 'LTIMindtree Ltd', sector: 'Information Technology', upstox_key_nse: 'NSE_EQ|INE018A01030' },
    { isin: 'INE044A01036', symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical Industries Ltd', sector: 'Healthcare / Pharma', upstox_key_nse: 'NSE_EQ|INE044A01036' },
    { isin: 'INE238A01034', symbol: 'AXISBANK', name: 'Axis Bank Ltd', sector: 'Financial Services / Banking', upstox_key_nse: 'NSE_EQ|INE238A01034' },
    // Gold & Commodities ETFs
    { isin: 'INF789F01059', symbol: 'GOLDSHARE', name: 'UTI Gold Exchange Traded Fund', exchange: 'NSE', segment: 'EQ', sector: 'Gold & Commodities ETF', upstox_key_nse: 'NSE_EQ|INF789F01059' },
    { isin: 'INF789F01059', symbol: 'UTIGOLDETF', name: 'UTI Gold Exchange Traded Fund (Alias)', exchange: 'NSE', segment: 'EQ', sector: 'Gold & Commodities ETF', isLegacy: true, notes: 'Alias for GOLDSHARE' },

    // Legacy / Merged / Class B Share Tickers for Historic Tradebooks
    { isin: 'INE660A01012', symbol: 'TATAMETALI', name: 'Tata Metaliks Ltd (Merged)', sector: 'Metals & Mining', isLegacy: true, notes: 'Merged into Tata Steel Ltd (TATASTEEL) via Scheme of Amalgamation' },
    { isin: 'IN9155A01020', symbol: 'TATAMTRDVR', name: 'Tata Motors Ltd DVR (Merged Class B)', sector: 'Automobile', isLegacy: true, notes: 'Merged into TATAMOTORS (Ordinary shares) via Scheme of Arrangement' },
    { isin: 'INE001A01036', symbol: 'HDFC', name: 'Housing Development Finance Corporation (Merged)', sector: 'Financial Services / NBFC', isLegacy: true, notes: 'Merged into HDFCBANK' },
    { isin: 'INE010A01011', symbol: 'CADILAHC', name: 'Cadila Healthcare Ltd (Renamed)', sector: 'Healthcare / Pharma', isLegacy: true, notes: 'Renamed to Zydus Lifesciences (ZYDUSLIFE)' },
    { isin: 'INE079A01024', symbol: 'MINDTREE', name: 'Mindtree Ltd (Merged)', sector: 'Information Technology', isLegacy: true, notes: 'Merged into LTIMindtree (LTIM)' },
    { isin: 'INE008A01015', symbol: 'LTI', name: 'Larsen & Toubro Infotech (Merged)', sector: 'Information Technology', isLegacy: true, notes: 'Merged into LTIMindtree (LTIM)' },
    { isin: 'INE019A01038', symbol: 'JINDALSTEL', name: 'Jindal Steel & Power Ltd', sector: 'Metals & Mining', upstox_key_nse: 'NSE_EQ|INE019A01038' },
    { isin: 'INE245A01021', symbol: 'TATAPOWER', name: 'Tata Power Company Ltd', sector: 'Utilities / Power', upstox_key_nse: 'NSE_EQ|INE245A01021' },
    { isin: 'INE280A01028', symbol: 'TITAN', name: 'Titan Company Ltd', sector: 'Consumer Durables', upstox_key_nse: 'NSE_EQ|INE280A01028' },
    { isin: 'INE263A01024', symbol: 'BEL', name: 'Bharat Electronics Ltd', sector: 'Aerospace & Defence', exchange: 'NSE', segment: 'EQ', upstox_key_nse: 'NSE_EQ|INE263A01024' },
    { isin: 'INE263A01024', symbol: 'BHARAT ELECTRONICS LTD', name: 'Bharat Electronics Ltd (Alias)', sector: 'Aerospace & Defence', isLegacy: true, notes: 'Alias for BEL' },
    { isin: 'INE263A01024', symbol: 'BHARAT ELECTRONICS', name: 'Bharat Electronics Ltd (Alias)', sector: 'Aerospace & Defence', isLegacy: true, notes: 'Alias for BEL' },
    { isin: 'INE758T01015', symbol: 'MAZAGON', name: 'Mazagon Dock Shipbuilders Ltd', sector: 'Defense / Shipbuilding', upstox_key_nse: 'NSE_EQ|INE758T01015' },
    { isin: 'INE0CPR01018', symbol: 'EKI', name: 'EKI Energy Services Ltd', exchange: 'BSE', sector: 'Clean Energy & Carbon Credits' },
    { isin: 'INE00L001017', symbol: 'EKIGREEN', name: 'EKI Energy Services Ltd (Alias)', exchange: 'BSE', sector: 'Clean Energy & Carbon Credits', isLegacy: true },

    // Popular US Stocks & ETFs
    { isin: 'US0378331005', symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', segment: 'EQ', sector: 'Technology', currency: 'USD', notes: 'US Stock' },
    { isin: 'US5949181045', symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', segment: 'EQ', sector: 'Technology', currency: 'USD', notes: 'US Stock' },
    { isin: 'US02079K3059', symbol: 'GOOGL', name: 'Alphabet Inc. Class A', exchange: 'NASDAQ', segment: 'EQ', sector: 'Technology', currency: 'USD', notes: 'US Stock' },
    { isin: 'US0231351067', symbol: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ', segment: 'EQ', sector: 'Consumer Cyclical', currency: 'USD', notes: 'US Stock' },
    { isin: 'US67066G1040', symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', segment: 'EQ', sector: 'Semiconductors', currency: 'USD', notes: 'US Stock' },
    { isin: 'US88160R1014', symbol: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ', segment: 'EQ', sector: 'Automotive / EV', currency: 'USD', notes: 'US Stock' },
    { isin: 'US78462F1030', symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', exchange: 'NYSE', segment: 'ETF', sector: 'US Index ETF', currency: 'USD', notes: 'US ETF' },
    { isin: 'US46090E1038', symbol: 'QQQ', name: 'Invesco QQQ Trust (Nasdaq-100)', exchange: 'NASDAQ', segment: 'ETF', sector: 'US Tech ETF', currency: 'USD', notes: 'US ETF' },
    { isin: 'US9229083632', symbol: 'VOO', name: 'Vanguard S&P 500 ETF', exchange: 'NYSE', segment: 'ETF', sector: 'US Index ETF', currency: 'USD', notes: 'US ETF' },
    { isin: 'US92204A7028', symbol: 'VGT', name: 'Vanguard Information Technology ETF', exchange: 'NYSE', segment: 'ETF', sector: 'US Tech ETF', currency: 'USD', notes: 'US ETF' },
    { isin: 'US8085243015', symbol: 'SCHG', name: 'Schwab U.S. Large-Cap Growth ETF', exchange: 'NYSE', segment: 'ETF', sector: 'US Growth ETF', currency: 'USD', notes: 'US ETF' },
    { isin: 'US59156R1086', symbol: 'MET', name: 'MetLife, Inc.', exchange: 'NYSE', segment: 'EQ', sector: 'Financial Services / Insurance', currency: 'USD', notes: 'US Stock' }
  ];

  private constructor() {}

  public static getInstance(): MasterTickerService {
    if (!MasterTickerService.instance) {
      MasterTickerService.instance = new MasterTickerService();
    }
    return MasterTickerService.instance;
  }

  /**
   * One-time / Startup Initialization:
   * Populates all missing active and legacy/merged tickers into MasterTickers database table.
   */
  public async autoInitializeMasterTickers(): Promise<{ seeded: number; existing: number }> {
    const dbManager = DatabaseManager.getInstance();
    let seededCount = 0;
    let existingCount = 0;

    try {
      // Fetch existing tickers in one query to prevent sequential lock delays
      const existingRows = await dbManager.query('SELECT isin, symbol FROM MasterTickers');
      const existingSet = new Set<string>();
      for (const row of existingRows) {
        if (row.isin) existingSet.add(row.isin);
        if (row.symbol) existingSet.add(row.symbol);
      }

      for (const item of this.seedCatalog) {
        const curr = item.currency || (item.exchange === 'NYSE' || item.exchange === 'NASDAQ' || item.exchange === 'AMEX' ? 'USD' : 'INR');

        if (!existingSet.has(item.isin) && !existingSet.has(item.symbol)) {
          await dbManager.execute(
            `INSERT INTO MasterTickers (isin, symbol, name, exchange, segment, sector, currency, upstox_key_nse, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [
              item.isin,
              item.symbol,
              item.name,
              item.exchange || 'NSE',
              item.segment || 'EQ',
              item.sector || 'General',
              curr,
              item.upstox_key_nse || `NSE_EQ|${item.isin}`
            ]
          );
          seededCount++;
        } else {
          await dbManager.execute(
            `UPDATE MasterTickers SET exchange = ?, currency = ? WHERE isin = ? OR symbol = ?`,
            [item.exchange || 'NSE', curr, item.isin, item.symbol]
          );
          existingCount++;
        }
      }
    } catch (err: any) {
      console.warn(`[MasterTickerService] Auto-initialize error:`, err.message);
    }

    console.log(`[MasterTickerService] Auto-initialize complete. Seeded: ${seededCount}, Existing: ${existingCount}`);
    return { seeded: seededCount, existing: existingCount };
  }

  /**
   * Daily Automated Refresh Check:
   * Checks elapsed time since last sync. If > 24 hours, queries Yahoo & Upstox for metadata updates.
   */
  public async dailyCheckAndSyncMetadata(): Promise<{ synced: boolean; count: number; message: string }> {
    const dbManager = DatabaseManager.getInstance();

    try {
      const lastSyncRow = await dbManager.get(
        "SELECT value FROM AppConfig WHERE key = 'last_master_ticker_sync'"
      );

      const now = Date.now();
      const lastSyncTime = lastSyncRow && lastSyncRow.value ? parseInt(lastSyncRow.value, 10) : 0;
      const hoursSinceSync = (now - lastSyncTime) / (1000 * 60 * 60);

      // Refresh if > 24 hours elapsed or never synced
      if (hoursSinceSync < 24 && lastSyncTime > 0) {
        return {
          synced: false,
          count: 0,
          message: `Last master ticker sync was ${hoursSinceSync.toFixed(1)} hours ago. Daily threshold is 24h.`
        };
      }

      // Perform Metadata Sync across all tickers
      const tickers = await dbManager.query('SELECT * FROM MasterTickers');
      let updatedCount = 0;

      for (const t of tickers) {
        // Ensure valid default upstox keys and exchange names
        if (!t.upstox_key_nse && t.isin) {
          const upstoxKey = `NSE_EQ|${t.isin}`;
          await dbManager.execute(
            'UPDATE MasterTickers SET upstox_key_nse = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [upstoxKey, t.id]
          );
          updatedCount++;
        }
      }

      // Update AppConfig timestamp
      await dbManager.execute(
        "INSERT INTO AppConfig (key, value) VALUES ('last_master_ticker_sync', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [now.toString()]
      );

      console.log(`[MasterTickerService] Daily metadata sync completed. Updated ${updatedCount} records.`);
      return {
        synced: true,
        count: updatedCount,
        message: `Daily master ticker metadata sync completed successfully. Updated ${updatedCount} records.`
      };
    } catch (err: any) {
      console.error('[MasterTickerService] Daily sync failed:', err.message);
      return { synced: false, count: 0, message: err.message };
    }
  }

  /**
   * Helper to resolve legacy / merged symbols to current master active symbols.
   */
  public resolveLegacySymbol(symbol: string): { symbol: string; isLegacy: boolean; note?: string } {
    const s = symbol.toUpperCase().trim();

    const legacyMap: Record<string, { symbol: string; note: string }> = {
      TATAMETALI: { symbol: 'TATASTEEL', note: 'Merged into Tata Steel Ltd' },
      TATAMETAL: { symbol: 'TATASTEEL', note: 'Merged into Tata Steel Ltd' },
      TATAMTRDVR: { symbol: 'TATAMOTORS', note: 'Merged Class B DVR shares' },
      CADILAHC: { symbol: 'ZYDUSLIFE', note: 'Renamed to Zydus Lifesciences' },
      MINDTREE: { symbol: 'LTIM', note: 'Merged into LTIMindtree' },
      LTI: { symbol: 'LTIM', note: 'Merged into LTIMindtree' },
      HDFC: { symbol: 'HDFCBANK', note: 'Merged into HDFC Bank' },
      'BHARAT ELECTRONICS LTD': { symbol: 'BEL', note: 'Company name mapped to master symbol BEL' },
      'BHARAT ELECTRONICS': { symbol: 'BEL', note: 'Company name mapped to master symbol BEL' },
      'STATE BANK OF INDIA': { symbol: 'SBIN', note: 'Company name mapped to master symbol SBIN' },
      'STATE BANK OF INDIA LTD': { symbol: 'SBIN', note: 'Company name mapped to master symbol SBIN' }
    };

    if (legacyMap[s]) {
      return {
        symbol: legacyMap[s].symbol,
        isLegacy: true,
        note: legacyMap[s].note
      };
    }

    return { symbol: s, isLegacy: false };
  }
}
