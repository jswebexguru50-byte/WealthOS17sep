import { getDB, dbAll, dbRun, dbGet } from '../database.js';

export interface UniverseStock {
  symbol: string;
  companyName: string;
  isin: string;
  tier: string;
  marketCapCr: number | null;
}

export interface UniverseStats {
  total: number;
  largeCap: number;
  midCap: number;
  smallCap: number;
  microCap: number;
  unclassified: number;
  lastRefreshedAt: string | null;
}

const NSE_EQUITY_L_URL = 'https://archives.nseindia.com/content/equities/EQUITY_L.csv';
const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5'
};

export class UniverseManagerService {
  private static instance: UniverseManagerService;

  public static getInstance(): UniverseManagerService {
    if (!UniverseManagerService.instance) {
      UniverseManagerService.instance = new UniverseManagerService();
    }
    return UniverseManagerService.instance;
  }

  public async ensureColumns(): Promise<void> {
    const db = getDB();
    const migrations = [
      'ALTER TABLE MasterTickers ADD COLUMN market_cap_cr REAL',
      'ALTER TABLE MasterTickers ADD COLUMN tier TEXT',
      'ALTER TABLE MasterTickers ADD COLUMN company_name TEXT',
      'ALTER TABLE MasterTickers ADD COLUMN currency TEXT DEFAULT \'INR\'',
    ];
    for (const sql of migrations) {
      try { await dbRun(db, sql); } catch (_e: any) { /* duplicate column — safe */ }
    }
  }

  public async refreshFullUniverse(): Promise<{ inserted: number; updated: number; total: number }> {
    await this.ensureColumns();
    const db = getDB();
    let inserted = 0;
    let updated = 0;

    const res = await fetch(NSE_EQUITY_L_URL, {
      headers: NSE_HEADERS,
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`NSE returned HTTP ${res.status}`);

    const csvText = await res.text();
    const lines = csvText.split('\n');

    const existingRows = await dbAll(db, 'SELECT isin, symbol FROM MasterTickers');
    const existingIsinSet = new Set<string>();
    const existingSymbolSet = new Set<string>();
    for (const row of existingRows as any[]) {
      if (row.isin) existingIsinSet.add(row.isin.toUpperCase());
      if (row.symbol) existingSymbolSet.add(row.symbol.toUpperCase());
    }

    await dbRun(db, 'BEGIN TRANSACTION');
    try {
      for (const line of lines) {
        const parts = line.split(',');
        if (parts.length < 7) continue;

        const symbol = parts[0]?.trim().toUpperCase();
        const name = parts[1]?.trim();
        const series = parts[2]?.trim().toUpperCase();
        const isin = parts[6]?.trim().toUpperCase();

        if (!symbol || !isin || isin === 'ISIN NUMBER' || !isin.startsWith('INE')) continue;
        if (series !== 'EQ') continue;

        if (existingIsinSet.has(isin) || existingSymbolSet.has(symbol)) {
          await dbRun(db,
            `UPDATE MasterTickers SET company_name = COALESCE(company_name, ?), name = COALESCE(name, ?), exchange = 'NSE', segment = 'EQ', updated_at = CURRENT_TIMESTAMP WHERE isin = ? OR symbol = ?`,
            [name, name, isin, symbol]
          );
          updated++;
        } else {
          await dbRun(db,
            `INSERT INTO MasterTickers (isin, symbol, name, company_name, exchange, segment, currency, upstox_key_nse, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'NSE', 'EQ', 'INR', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [isin, symbol, name, name, `NSE_EQ|${isin}`]
          );
          existingIsinSet.add(isin);
          existingSymbolSet.add(symbol);
          inserted++;
        }
      }
      await dbRun(db, 'COMMIT');
    } catch (err) {
      await dbRun(db, 'ROLLBACK');
      throw err;
    }

    await dbRun(db,
      `INSERT INTO AppConfig (key, value) VALUES ('last_universe_refresh', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [new Date().toISOString()]
    );

    console.log(`[UniverseManager] Refresh complete. Inserted: ${inserted}, Updated: ${updated}, Total: ${inserted + updated}`);
    return { inserted, updated, total: inserted + updated };
  }

  public async tierUniverse(): Promise<{ tiered: number }> {
    await this.ensureColumns();
    const db = getDB();

    await dbRun(db, `
      UPDATE MasterTickers SET tier = CASE
        WHEN market_cap_cr >= 20000 THEN 'LARGE_CAP'
        WHEN market_cap_cr >= 5000  THEN 'MID_CAP'
        WHEN market_cap_cr >= 500   THEN 'SMALL_CAP'
        WHEN market_cap_cr > 0      THEN 'MICRO_CAP'
        ELSE 'UNCLASSIFIED'
      END
      WHERE exchange = 'NSE' AND segment = 'EQ'
    `);

    const row = await dbGet(db, `SELECT COUNT(*) as cnt FROM MasterTickers WHERE tier IS NOT NULL AND tier != 'UNCLASSIFIED'`) as any;
    const tiered = row?.cnt || 0;
    console.log(`[UniverseManager] Tiered ${tiered} stocks by market cap.`);
    return { tiered };
  }

  public async getUniverseByTier(tiers?: string[]): Promise<UniverseStock[]> {
    const db = getDB();
    let sql: string;
    let params: any[] = [];

    if (tiers && tiers.length > 0) {
      const placeholders = tiers.map(() => '?').join(',');
      sql = `SELECT symbol, COALESCE(company_name, name) as companyName, isin, tier, market_cap_cr as marketCapCr
             FROM MasterTickers
             WHERE exchange = 'NSE' AND segment = 'EQ' AND symbol IS NOT NULL AND symbol != ''
               AND tier IN (${placeholders})
             ORDER BY COALESCE(market_cap_cr, 0) DESC`;
      params = tiers;
    } else {
      sql = `SELECT symbol, COALESCE(company_name, name) as companyName, isin, tier, market_cap_cr as marketCapCr
             FROM MasterTickers
             WHERE exchange = 'NSE' AND segment = 'EQ' AND symbol IS NOT NULL AND symbol != ''
             ORDER BY
               CASE tier
                 WHEN 'LARGE_CAP' THEN 1
                 WHEN 'MID_CAP' THEN 2
                 WHEN 'SMALL_CAP' THEN 3
                 WHEN 'MICRO_CAP' THEN 4
                 ELSE 5
               END,
               COALESCE(market_cap_cr, 0) DESC`;
    }

    const rows = await dbAll(db, sql, params) as any[];
    return rows.map(r => ({
      symbol: r.symbol,
      companyName: r.companyName || r.symbol,
      isin: r.isin || '',
      tier: r.tier || 'UNCLASSIFIED',
      marketCapCr: r.marketCapCr ?? null
    }));
  }

  public async getFullUniverse(): Promise<Array<{ symbol: string; companyName: string }>> {
    const db = getDB();
    const rows = await dbAll(db, `
      SELECT symbol, COALESCE(company_name, name, symbol) as companyName
      FROM MasterTickers
      WHERE exchange = 'NSE' AND segment = 'EQ' AND symbol IS NOT NULL AND symbol != ''
      ORDER BY
        CASE tier
          WHEN 'LARGE_CAP' THEN 1
          WHEN 'MID_CAP' THEN 2
          WHEN 'SMALL_CAP' THEN 3
          WHEN 'MICRO_CAP' THEN 4
          ELSE 5
        END,
        COALESCE(market_cap_cr, 0) DESC
    `) as any[];
    return rows.map(r => ({ symbol: r.symbol, companyName: r.companyName || r.symbol }));
  }

  public async getStats(): Promise<UniverseStats> {
    const db = getDB();
    const total = ((await dbGet(db, `SELECT COUNT(*) as c FROM MasterTickers WHERE exchange='NSE' AND segment='EQ' AND symbol IS NOT NULL AND symbol != ''`)) as any)?.c || 0;
    const largeCap = ((await dbGet(db, `SELECT COUNT(*) as c FROM MasterTickers WHERE tier='LARGE_CAP'`)) as any)?.c || 0;
    const midCap = ((await dbGet(db, `SELECT COUNT(*) as c FROM MasterTickers WHERE tier='MID_CAP'`)) as any)?.c || 0;
    const smallCap = ((await dbGet(db, `SELECT COUNT(*) as c FROM MasterTickers WHERE tier='SMALL_CAP'`)) as any)?.c || 0;
    const microCap = ((await dbGet(db, `SELECT COUNT(*) as c FROM MasterTickers WHERE tier='MICRO_CAP'`)) as any)?.c || 0;
    const unclassified = total - largeCap - midCap - smallCap - microCap;

    const lastRow = await dbGet(db, `SELECT value FROM AppConfig WHERE key = 'last_universe_refresh'`) as any;
    const lastRefreshedAt = lastRow?.value || null;

    return { total, largeCap, midCap, smallCap, microCap, unclassified, lastRefreshedAt };
  }
}
