import Database from 'better-sqlite3';
import path from 'path';

export interface ShareholdingAuditCell {
  period: string;
  field: string;
  storedValue: number | string | null;
  rawProviderValue: number | string | null;
  sourceSnapshotId: string;
  verdict: 'VERIFIED' | 'UNSUPPORTED' | 'MISSING_NOT_ZERO';
  notes?: string;
}

export interface ShareholdingAuditReport {
  symbol: string;
  auditedAt: string;
  totalPeriodsAudited: number;
  totalCellsAudited: number;
  verifiedCells: number;
  unsupportedCells: number;
  missingNotZeroCells: number;
  cells: ShareholdingAuditCell[];
}

export class ShareholdingPatternIngestionService {
  private static instance: ShareholdingPatternIngestionService;

  private constructor() {}

  public static getInstance(): ShareholdingPatternIngestionService {
    if (!ShareholdingPatternIngestionService.instance) {
      ShareholdingPatternIngestionService.instance = new ShareholdingPatternIngestionService();
    }
    return ShareholdingPatternIngestionService.instance;
  }

  /**
   * Helper to derive calendar month end date from quarter label e.g. "Mar 2026" -> "2026-03-31"
   */
  public parseQuarterToDate(periodStr: string): string {
    const parts = periodStr.trim().split(/\s+/);
    if (parts.length !== 2) return periodStr;
    const mon = parts[0].toLowerCase();
    const yr = parts[1];

    const months31 = ['jan', 'mar', 'may', 'jul', 'aug', 'oct', 'dec'];
    const months30 = ['apr', 'jun', 'sep', 'nov'];

    let monthNum = '01';
    let lastDay = '31';

    if (mon.startsWith('jan')) { monthNum = '01'; lastDay = '31'; }
    else if (mon.startsWith('feb')) {
      monthNum = '02';
      const yearInt = parseInt(yr, 10);
      const isLeap = (yearInt % 4 === 0 && yearInt % 100 !== 0) || (yearInt % 400 === 0);
      lastDay = isLeap ? '29' : '28';
    }
    else if (mon.startsWith('mar')) { monthNum = '03'; lastDay = '31'; }
    else if (mon.startsWith('apr')) { monthNum = '04'; lastDay = '30'; }
    else if (mon.startsWith('may')) { monthNum = '05'; lastDay = '31'; }
    else if (mon.startsWith('jun')) { monthNum = '06'; lastDay = '30'; }
    else if (mon.startsWith('jul')) { monthNum = '07'; lastDay = '31'; }
    else if (mon.startsWith('aug')) { monthNum = '08'; lastDay = '31'; }
    else if (mon.startsWith('sep')) { monthNum = '09'; lastDay = '30'; }
    else if (mon.startsWith('oct')) { monthNum = '10'; lastDay = '31'; }
    else if (mon.startsWith('nov')) { monthNum = '11'; lastDay = '30'; }
    else if (mon.startsWith('dec')) { monthNum = '12'; lastDay = '31'; }

    return `${yr}-${monthNum}-${lastDay}`;
  }

  /**
   * Ingests shareholding patterns for a specific symbol from persisted fundamental_endpoint_snapshots.
   * Completely generic across all symbols. Zero network calls.
   */
  public ingestForSymbol(symbol: string, dbOverride?: Database.Database): { recordsSynced: number, periods: string[] } {
    const root = process.cwd();
    const db = dbOverride || new Database(path.join(root, 'portfolio.db'));
    const cleanSym = symbol.trim().toUpperCase();

    // 1. Fetch latest raw snapshot for endpoint 'share-holdings'
    const snap = db.prepare(`
      SELECT fetched_at, response_json, provider, endpoint 
      FROM fundamental_endpoint_snapshots
      WHERE UPPER(symbol) = ? AND endpoint = 'share-holdings'
      ORDER BY fetched_at DESC LIMIT 1
    `).get(cleanSym) as { fetched_at: string; response_json: string; provider: string; endpoint: string } | undefined;

    if (!snap || !snap.response_json) {
      if (!dbOverride) db.close();
      return { recordsSynced: 0, periods: [] };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(snap.response_json);
    } catch {
      if (!dbOverride) db.close();
      return { recordsSynced: 0, periods: [] };
    }

    if (!parsed || !Array.isArray(parsed.data)) {
      if (!dbOverride) db.close();
      return { recordsSynced: 0, periods: [] };
    }

    // 2. Map categories across periods
    // Categories in Trendlyne response: "promoters", "fii", "other_dii", "mutual_funds", "retail_and_other"
    const periodMap = new Map<string, {
      promoter: number | null;
      fii: number | null;
      mutualFunds: number | null;
      otherDii: number | null;
      retailAndOther: number | null;
    }>();

    for (const cat of parsed.data) {
      const categoryName = String(cat.category || '').toLowerCase().trim();
      const history = Array.isArray(cat.history) ? cat.history : [];

      for (const entry of history) {
        const p = entry.period;
        if (!p) continue;
        if (!periodMap.has(p)) {
          periodMap.set(p, {
            promoter: null,
            fii: null,
            mutualFunds: null,
            otherDii: null,
            retailAndOther: null
          });
        }
        const record = periodMap.get(p)!;
        const val = (entry.value !== null && entry.value !== undefined && !isNaN(Number(entry.value)))
          ? Number(entry.value)
          : null;

        if (categoryName === 'promoters' || categoryName === 'promoter') {
          record.promoter = val;
        } else if (categoryName === 'fii') {
          record.fii = val;
        } else if (categoryName === 'mutual_funds' || categoryName === 'mutual_fund') {
          record.mutualFunds = val;
        } else if (categoryName === 'other_dii' || categoryName === 'dii') {
          record.otherDii = val;
        } else if (categoryName === 'retail_and_other' || categoryName === 'public') {
          record.retailAndOther = val;
        }
      }
    }

    let synced = 0;
    const syncedPeriods: string[] = [];

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO HistoricalShareholdingPattern (
        symbol, quarter_label, as_of_date, promoter_pct, fii_pct, dii_pct,
        govt_pct, others_pct, public_pct, employee_trusts_pct, sum_total_pct,
        free_float_pct, primary_source, is_reconciled, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, 0, ?, ?, 'TRENDLYNE_MCP', 1, ?)
    `);

    const now = new Date().toISOString();

    for (const [period, data] of periodMap.entries()) {
      const asOfDate = this.parseQuarterToDate(period);

      // Invariant: DII must NOT become 0 unless explicitly reported 0 by the provider.
      let diiPct: number | null = null;
      if (data.mutualFunds !== null || data.otherDii !== null) {
        diiPct = Number(((data.mutualFunds || 0) + (data.otherDii || 0)).toFixed(2));
      }

      const promoterPct = data.promoter !== null ? Number(data.promoter.toFixed(2)) : null;
      const fiiPct = data.fii !== null ? Number(data.fii.toFixed(2)) : null;
      const publicPct = data.retailAndOther !== null ? Number(data.retailAndOther.toFixed(2)) : null;

      // Sum total of present categories
      let sumTotal: number | null = null;
      if (promoterPct !== null || fiiPct !== null || diiPct !== null || publicPct !== null) {
        sumTotal = Number(((promoterPct || 0) + (fiiPct || 0) + (diiPct || 0) + (publicPct || 0)).toFixed(2));
      }

      // Free float
      const freeFloatPct = promoterPct !== null ? Number((100 - promoterPct).toFixed(2)) : null;

      insertStmt.run(
        cleanSym,
        period,
        asOfDate,
        promoterPct,
        fiiPct,
        diiPct,
        publicPct,
        sumTotal,
        freeFloatPct,
        now
      );

      synced++;
      syncedPeriods.push(period);
    }

    if (!dbOverride) db.close();
    return { recordsSynced: synced, periods: syncedPeriods };
  }

  /**
   * Performs an audited comparison of stored HistoricalShareholdingPattern values
   * against the exact persisted raw provider snapshot in fundamental_endpoint_snapshots.
   */
  public auditForSymbol(symbol: string, dbOverride?: Database.Database): ShareholdingAuditReport {
    const root = process.cwd();
    const db = dbOverride || new Database(path.join(root, 'portfolio.db'));
    const cleanSym = symbol.trim().toUpperCase();

    // 1. Get raw provider snapshot
    const snap = db.prepare(`
      SELECT fetched_at, response_json, provider, endpoint 
      FROM fundamental_endpoint_snapshots
      WHERE UPPER(symbol) = ? AND endpoint = 'share-holdings'
      ORDER BY fetched_at DESC LIMIT 1
    `).get(cleanSym) as { fetched_at: string; response_json: string; provider: string; endpoint: string } | undefined;

    const sourceSnapshotId = snap ? `${snap.provider}:${snap.endpoint}:${snap.fetched_at}` : 'NOT_FOUND';
    const rawParsed = snap?.response_json ? JSON.parse(snap.response_json) : { data: [] };

    // Index raw provider categories: Map<period, Map<category, value>>
    const rawCategoryByPeriod = new Map<string, Map<string, number | null>>();
    if (Array.isArray(rawParsed.data)) {
      for (const cat of rawParsed.data) {
        const catName = String(cat.category || '').toLowerCase().trim();
        for (const entry of cat.history || []) {
          const p = entry.period;
          if (!p) continue;
          if (!rawCategoryByPeriod.has(p)) rawCategoryByPeriod.set(p, new Map());
          const val = (entry.value !== null && entry.value !== undefined && !isNaN(Number(entry.value)))
            ? Number(entry.value)
            : null;
          rawCategoryByPeriod.get(p)!.set(catName, val);
        }
      }
    }

    // 2. Query stored HistoricalShareholdingPattern rows
    const storedRows = db.prepare(`
      SELECT quarter_label, as_of_date, promoter_pct, fii_pct, dii_pct, public_pct, primary_source
      FROM HistoricalShareholdingPattern
      WHERE UPPER(symbol) = ?
      ORDER BY as_of_date DESC
    `).all(cleanSym) as any[];

    const cells: ShareholdingAuditCell[] = [];
    let verifiedCount = 0;
    let unsupportedCount = 0;
    let missingNotZeroCount = 0;

    for (const row of storedRows) {
      const p = row.quarter_label;
      const rawCats = rawCategoryByPeriod.get(p);

      // Promoter check
      const rawPromoter = rawCats ? (rawCats.get('promoters') ?? rawCats.get('promoter') ?? null) : null;
      let promoterVerdict: 'VERIFIED' | 'UNSUPPORTED' | 'MISSING_NOT_ZERO' = 'UNSUPPORTED';
      if (rawPromoter !== null && row.promoter_pct !== null && Math.abs(rawPromoter - row.promoter_pct) < 0.01) {
        promoterVerdict = 'VERIFIED';
        verifiedCount++;
      } else {
        unsupportedCount++;
      }
      cells.push({
        period: p,
        field: 'promoter_pct',
        storedValue: row.promoter_pct,
        rawProviderValue: rawPromoter,
        sourceSnapshotId,
        verdict: promoterVerdict
      });

      // FII check
      const rawFii = rawCats ? (rawCats.get('fii') ?? null) : null;
      let fiiVerdict: 'VERIFIED' | 'UNSUPPORTED' | 'MISSING_NOT_ZERO' = 'UNSUPPORTED';
      if (rawFii !== null && row.fii_pct !== null && Math.abs(rawFii - row.fii_pct) < 0.01) {
        fiiVerdict = 'VERIFIED';
        verifiedCount++;
      } else {
        unsupportedCount++;
      }
      cells.push({
        period: p,
        field: 'fii_pct',
        storedValue: row.fii_pct,
        rawProviderValue: rawFii,
        sourceSnapshotId,
        verdict: fiiVerdict
      });

      // DII check
      // Provider gives mutual_funds and other_dii
      const rawMf = rawCats ? (rawCats.get('mutual_funds') ?? rawCats.get('mutual_fund') ?? null) : null;
      const rawOtherDii = rawCats ? (rawCats.get('other_dii') ?? rawCats.get('dii') ?? null) : null;
      let rawDii: number | null = null;
      if (rawMf !== null || rawOtherDii !== null) {
        rawDii = Number(((rawMf || 0) + (rawOtherDii || 0)).toFixed(2));
      }

      let diiVerdict: 'VERIFIED' | 'UNSUPPORTED' | 'MISSING_NOT_ZERO' = 'UNSUPPORTED';
      if (rawDii === null && row.dii_pct === 0) {
        diiVerdict = 'MISSING_NOT_ZERO';
        missingNotZeroCount++;
      } else if (rawDii !== null && row.dii_pct !== null && Math.abs(rawDii - row.dii_pct) < 0.01) {
        diiVerdict = 'VERIFIED';
        verifiedCount++;
      } else if (rawDii === null && row.dii_pct === null) {
        diiVerdict = 'VERIFIED';
        verifiedCount++;
      } else {
        unsupportedCount++;
      }
      cells.push({
        period: p,
        field: 'dii_pct',
        storedValue: row.dii_pct,
        rawProviderValue: rawDii,
        sourceSnapshotId,
        verdict: diiVerdict,
        notes: `Raw components: mutual_funds=${rawMf}, other_dii=${rawOtherDii}`
      });

      // Public check
      const rawPublic = rawCats ? (rawCats.get('retail_and_other') ?? rawCats.get('public') ?? null) : null;
      let publicVerdict: 'VERIFIED' | 'UNSUPPORTED' | 'MISSING_NOT_ZERO' = 'UNSUPPORTED';
      if (rawPublic !== null && row.public_pct !== null && Math.abs(rawPublic - row.public_pct) < 0.01) {
        publicVerdict = 'VERIFIED';
        verifiedCount++;
      } else {
        unsupportedCount++;
      }
      cells.push({
        period: p,
        field: 'public_pct',
        storedValue: row.public_pct,
        rawProviderValue: rawPublic,
        sourceSnapshotId,
        verdict: publicVerdict
      });

      // as_of_date check
      const expectedAsOfDate = this.parseQuarterToDate(p);
      let dateVerdict: 'VERIFIED' | 'UNSUPPORTED' | 'MISSING_NOT_ZERO' = 'UNSUPPORTED';
      if (row.as_of_date === expectedAsOfDate) {
        dateVerdict = 'VERIFIED';
        verifiedCount++;
      } else {
        unsupportedCount++;
      }
      cells.push({
        period: p,
        field: 'as_of_date',
        storedValue: row.as_of_date,
        rawProviderValue: expectedAsOfDate,
        sourceSnapshotId,
        verdict: dateVerdict
      });
    }

    if (!dbOverride) db.close();

    return {
      symbol: cleanSym,
      auditedAt: new Date().toISOString(),
      totalPeriodsAudited: storedRows.length,
      totalCellsAudited: cells.length,
      verifiedCells: verifiedCount,
      unsupportedCells: unsupportedCount,
      missingNotZeroCells: missingNotZeroCount,
      cells
    };
  }
}
