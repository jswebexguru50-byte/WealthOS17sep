/**
 * BSE ISIN Mapper Service
 * Maps ticker symbols to ISINs using MasterTickers database
 */

import { Database } from 'sqlite3';

export interface ISINRecord {
  isin: string;
  symbol: string;
  name: string;
  fmv_31_jan_2018: number | null;
  exchange: 'BSE' | 'NSE';
}

// In-memory cache for ISINs
const isinCache = new Map<string, ISINRecord>();

/**
 * Resolve a symbol to its ISIN record
 * @param db Database instance
 * @param symbol Ticker symbol
 * @param exchange Exchange ('BSE' or 'NSE')
 * @returns ISINRecord or error
 */
export async function resolveISIN(
  db: Database,
  symbol: string,
  exchange: 'BSE' | 'NSE'
): Promise<ISINRecord> {
  // Check cache first (case-insensitive)
  const cacheKey = `${symbol.toUpperCase()}_${exchange}`;
  if (isinCache.has(cacheKey)) {
    return isinCache.get(cacheKey)!;
  }

  // Query database (case-insensitive)
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT isin, symbol, name, fmv_31_jan_2018, exchange
      FROM MasterTickers
      WHERE UPPER(symbol) = UPPER(?) AND exchange = ?
      LIMIT 1
    `;
    db.get(sql, [symbol, exchange], (err: any, row: any) => {
      if (err) {
        reject(new Error(`DB_ERROR: ${err.message}`));
      } else if (!row) {
        reject(new Error('NO_MATCHING_ISIN'));
      } else {
        const record: ISINRecord = {
          isin: row.isin,
          symbol: row.symbol,
          name: row.name,
          fmv_31_jan_2018: row.fmv_31_jan_2018,
          exchange: row.exchange
        };
        isinCache.set(cacheKey, record);
        resolve(record);
      }
    });
  });
}

/**
 * Bulk resolve symbols to ISINs
 * @param db Database instance
 * @param symbols Array of symbols
 * @param exchange Exchange constraint
 * @returns Map of symbol → ISINRecord or error code
 */
export async function resolveISINBulk(
  db: Database,
  symbols: string[],
  exchange: 'BSE' | 'NSE'
): Promise<Map<string, ISINRecord | string>> {
  const results = new Map<string, ISINRecord | string>();

  // Process in batches of 100
  const batchSize = 100;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const placeholders = batch.map(() => '?').join(',');
    const params = batch.flatMap(sym => [sym.toUpperCase(), sym, exchange]);

    // Query database
    await new Promise<void>((resolve, reject) => {
      const sql = `
        SELECT symbol, isin, name, fmv_31_jan_2018, exchange
        FROM MasterTickers
        WHERE (UPPER(symbol) IN (${placeholders}) OR symbol IN (${placeholders}))
        AND exchange = ?
      `;
      const finalParams = [...batch.map(s => s.toUpperCase()), ...batch, exchange];

      db.all(sql, finalParams, (err: any, rows: any[]) => {
        if (err) {
          // Log error but continue
          batch.forEach(sym => results.set(sym, 'DB_ERROR'));
          resolve();
        } else {
          const foundSymbols = new Set<string>();
          (rows || []).forEach((row: any) => {
            const record: ISINRecord = {
              isin: row.isin,
              symbol: row.symbol,
              name: row.name,
              fmv_31_jan_2018: row.fmv_31_jan_2018,
              exchange: row.exchange
            };
            results.set(row.symbol, record);
            foundSymbols.add(row.symbol.toUpperCase());
          });

          // Mark unfound symbols
          batch.forEach(sym => {
            if (!foundSymbols.has(sym.toUpperCase())) {
              results.set(sym, 'NO_MATCHING_ISIN');
            }
          });
          resolve();
        }
      });
    });
  }

  return results;
}
