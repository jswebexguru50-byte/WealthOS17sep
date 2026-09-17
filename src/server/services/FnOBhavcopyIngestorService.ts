import { getDB, dbRun, dbAll, dbGet } from '../database.js';

const NSE_FO_BHAVCOPY_BASE = 'https://archives.nseindia.com/content/fo/BhavCopy_';
const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Referer': 'https://www.nseindia.com/',
};

export interface FnOIngestProgress {
  status: 'IDLE' | 'RUNNING' | 'COMPLETE' | 'ERROR';
  date: string;
  rowsInserted: number;
  symbolsProcessed: number;
  error?: string;
}

export interface FnOIngestSummary {
  date: string;
  rowsInserted: number;
  symbolsProcessed: number;
}

export class FnOBhavcopyIngestorService {
  private static instance: FnOBhavcopyIngestorService;
  static progress: FnOIngestProgress = { status: 'IDLE', date: '', rowsInserted: 0, symbolsProcessed: 0 };

  public static getInstance(): FnOBhavcopyIngestorService {
    if (!FnOBhavcopyIngestorService.instance) {
      FnOBhavcopyIngestorService.instance = new FnOBhavcopyIngestorService();
    }
    return FnOBhavcopyIngestorService.instance;
  }

  private formatDate(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}${mm}${yyyy}`;
  }

  private parseExpiryDate(expiryStr: string): string {
    // NSE format: "28-NOV-2024" → "2024-11-28"
    const months: Record<string, string> = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
    };
    const parts = expiryStr.trim().split('-');
    if (parts.length !== 3) return expiryStr;
    return `${parts[2]}-${months[parts[1].toUpperCase()] || '01'}-${parts[0].padStart(2, '0')}`;
  }

  public async fetchDailyFnOBhavcopy(dateStr?: string): Promise<FnOIngestSummary> {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    const formatted = this.formatDate(targetDate);
    const isoDate = targetDate.toISOString().slice(0, 10);
    const url = `${NSE_FO_BHAVCOPY_BASE}${formatted}.csv`;

    FnOBhavcopyIngestorService.progress = { status: 'RUNNING', date: isoDate, rowsInserted: 0, symbolsProcessed: 0 };

    let csvText: string;
    let attempt = 0;
    while (attempt < 3) {
      try {
        const res = await fetch(url, { headers: NSE_HEADERS, signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        csvText = await res.text();
        break;
      } catch (err: any) {
        attempt++;
        if (attempt >= 3) {
          FnOBhavcopyIngestorService.progress = { status: 'ERROR', date: isoDate, rowsInserted: 0, symbolsProcessed: 0, error: err.message };
          throw new Error(`FnO Bhavcopy fetch failed after 3 attempts: ${err.message}`);
        }
        await new Promise(r => setTimeout(r, attempt * 1000));
      }
    }

    const lines = csvText!.trim().split('\n');
    if (lines.length < 2) {
      FnOBhavcopyIngestorService.progress = { status: 'COMPLETE', date: isoDate, rowsInserted: 0, symbolsProcessed: 0 };
      return { date: isoDate, rowsInserted: 0, symbolsProcessed: 0 };
    }

    // Header: INSTRUMENT,SYMBOL,EXPIRY_DT,STRIKE_PR,OPTION_TYP,OPEN,HIGH,LOW,CLOSE,SETTLE_PR,CONTRACTS,VAL_INLAKH,OPEN_INT,CHG_IN_OI,TIMESTAMP
    const db = getDB();
    let rowsInserted = 0;
    const symbolSet = new Set<string>();
    const batchSize = 500;
    let batch: any[][] = [];

    const flush = async () => {
      if (batch.length === 0) return;
      await dbRun(db, 'BEGIN TRANSACTION');
      try {
        for (const row of batch) {
          await dbRun(db, `
            INSERT OR REPLACE INTO options_chain_snapshot
            (symbol, expiry, strike, option_type, oi, oi_change, volume, ltp, as_of_date, data_source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'NSE_FO_BHAVCOPY')
          `, row);
          rowsInserted++;
        }
        await dbRun(db, 'COMMIT');
      } catch (e) {
        await dbRun(db, 'ROLLBACK');
        throw e;
      }
      batch = [];
    };

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length < 14) continue;
      const instrument = parts[0]?.trim().toUpperCase();
      if (!instrument?.includes('OPT')) continue;

      const symbol = parts[1]?.trim().toUpperCase();
      const expiry = this.parseExpiryDate(parts[2]?.trim() || '');
      const strike = parseFloat(parts[3]?.trim() || '0');
      const optionType = parts[4]?.trim().toUpperCase(); // CE or PE
      const ltp = parseFloat(parts[8]?.trim() || '0');
      const oi = parseInt(parts[12]?.trim() || '0', 10);
      const oiChange = parseInt(parts[13]?.trim() || '0', 10);
      const volume = parseInt(parts[10]?.trim() || '0', 10);

      if (!symbol || !optionType || isNaN(strike) || strike <= 0) continue;

      symbolSet.add(symbol);
      batch.push([symbol, expiry, strike, optionType, oi, oiChange, volume, ltp, isoDate]);
      if (batch.length >= batchSize) await flush();
    }
    await flush();

    FnOBhavcopyIngestorService.progress = {
      status: 'COMPLETE', date: isoDate,
      rowsInserted, symbolsProcessed: symbolSet.size
    };
    console.log(`[FnOBhavcopy] ${isoDate}: ${rowsInserted} rows, ${symbolSet.size} symbols`);
    return { date: isoDate, rowsInserted, symbolsProcessed: symbolSet.size };
  }

  public async computeDerivedMetrics(symbol: string, date: string): Promise<void> {
    const db = getDB();
    const rows = await dbAll(db, `
      SELECT expiry, strike, option_type, oi, oi_change, iv, volume, ltp
      FROM options_chain_snapshot
      WHERE symbol = ? AND as_of_date = ?
      ORDER BY expiry ASC, strike ASC
    `, [symbol.toUpperCase(), date]) as any[];

    if (!rows || rows.length === 0) return;

    // Get nearest expiry
    const expiries = [...new Set(rows.map((r: any) => r.expiry as string))].sort();
    const nearestExpiry = expiries[0];
    const nearRows = rows.filter((r: any) => r.expiry === nearestExpiry);

    const ceRows = nearRows.filter((r: any) => r.option_type === 'CE');
    const peRows = nearRows.filter((r: any) => r.option_type === 'PE');

    const totalCeOI = ceRows.reduce((s: number, r: any) => s + (r.oi || 0), 0);
    const totalPeOI = peRows.reduce((s: number, r: any) => s + (r.oi || 0), 0);
    const totalCeVol = ceRows.reduce((s: number, r: any) => s + (r.volume || 0), 0);
    const totalPeVol = peRows.reduce((s: number, r: any) => s + (r.volume || 0), 0);

    const pcrOI = totalCeOI > 0 ? totalPeOI / totalCeOI : 0;
    const pcrVolume = totalCeVol > 0 ? totalPeVol / totalCeVol : 0;

    // Max pain: strike where total losses for option writers are minimized
    const strikes = [...new Set(nearRows.map((r: any) => r.strike as number))].sort((a, b) => a - b);
    let maxPainStrike = strikes[Math.floor(strikes.length / 2)] || 0;
    let minLoss = Infinity;
    for (const testStrike of strikes) {
      let totalLoss = 0;
      for (const r of ceRows) {
        totalLoss += Math.max(0, testStrike - r.strike) * (r.oi || 0);
      }
      for (const r of peRows) {
        totalLoss += Math.max(0, r.strike - testStrike) * (r.oi || 0);
      }
      if (totalLoss < minLoss) { minLoss = totalLoss; maxPainStrike = testStrike; }
    }

    // Spot price proxy: weighted average of ATM strikes by OI
    const spotProxy = nearRows.length > 0
      ? nearRows.reduce((s: number, r: any) => s + r.strike * (r.oi || 0), 0) /
        Math.max(1, nearRows.reduce((s: number, r: any) => s + (r.oi || 0), 0))
      : 0;

    // IV skew: OTM puts (5-10% below spot) vs OTM calls (5-10% above spot)
    let ivSkew: number | null = null;
    if (spotProxy > 0) {
      const otmPuts = peRows.filter((r: any) => r.strike >= spotProxy * 0.90 && r.strike <= spotProxy * 0.95 && r.iv > 0);
      const otmCalls = ceRows.filter((r: any) => r.strike >= spotProxy * 1.05 && r.strike <= spotProxy * 1.10 && r.iv > 0);
      const avgPutIV = otmPuts.length > 0 ? otmPuts.reduce((s: number, r: any) => s + r.iv, 0) / otmPuts.length : 0;
      const avgCallIV = otmCalls.length > 0 ? otmCalls.reduce((s: number, r: any) => s + r.iv, 0) / otmCalls.length : 0;
      if (avgPutIV > 0 && avgCallIV > 0) ivSkew = avgPutIV - avgCallIV;
    }

    // Unusual OI buildup: strikes where oi_change > 2x average oi_change
    const allOiChanges = nearRows.map((r: any) => Math.abs(r.oi_change || 0));
    const avgOiChange = allOiChanges.length > 0 ? allOiChanges.reduce((a, b) => a + b, 0) / allOiChanges.length : 0;
    const unusualStrikes = nearRows
      .filter((r: any) => Math.abs(r.oi_change || 0) > 2 * avgOiChange && avgOiChange > 0)
      .map((r: any) => `${r.strike}${r.option_type}`)
      .slice(0, 10);

    await dbRun(db, `
      INSERT INTO derived_options_metrics
        (symbol, as_of_date, pcr_oi, pcr_volume, max_pain_strike, iv_skew_25delta, unusual_oi_buildup_strikes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol, as_of_date) DO UPDATE SET
        pcr_oi = excluded.pcr_oi,
        pcr_volume = excluded.pcr_volume,
        max_pain_strike = excluded.max_pain_strike,
        iv_skew_25delta = excluded.iv_skew_25delta,
        unusual_oi_buildup_strikes = excluded.unusual_oi_buildup_strikes
    `, [
      symbol.toUpperCase(), date, pcrOI, pcrVolume, maxPainStrike,
      ivSkew, unusualStrikes.length > 0 ? JSON.stringify(unusualStrikes) : null
    ]);
  }

  public async batchComputeForUniverse(date?: string): Promise<{ computed: number; date: string }> {
    const db = getDB();
    const isoDate = date || new Date().toISOString().slice(0, 10);
    const rows = await dbAll(db, `
      SELECT DISTINCT symbol FROM options_chain_snapshot WHERE as_of_date = ?
    `, [isoDate]) as any[];

    let computed = 0;
    for (const row of rows) {
      try {
        await this.computeDerivedMetrics(row.symbol, isoDate);
        computed++;
      } catch (e) {
        console.warn(`[FnODerived] Failed for ${row.symbol}:`, e);
      }
    }
    console.log(`[FnODerived] Computed metrics for ${computed} symbols on ${isoDate}`);
    return { computed, date: isoDate };
  }
}
