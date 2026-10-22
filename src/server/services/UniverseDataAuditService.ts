import { getDB, dbGet, dbAll, dbRun } from '../database.js';
import { ScreenerService, ScreenerData } from './screenerService.js';
import { UniversalDataIntegrityGate, IntegrityCheckResult } from './UniversalDataIntegrityGate.js';

export interface AuditBatchProgress {
  total: number;
  processed: number;
  passed: number;
  warnings: number;
  failed: number;
  currentSymbol?: string;
  startTime: number;
  elapsedSeconds: number;
  estimatedRemainingSeconds: number;
}

export interface UniverseAuditSummary {
  totalAudited: number;
  passedCount: number;
  warningCount: number;
  failedCount: number;
  overallPassRatePct: number;
  avgFieldAccuracyScore: number;
  quarterDistribution: Record<string, number>;
  auditedHoldingsCount: number;
  results: IntegrityCheckResult[];
}

export class UniverseDataAuditService {
  private static instance: UniverseDataAuditService;
  private screenerService = ScreenerService.getInstance();
  private integrityGate = UniversalDataIntegrityGate.getInstance();
  private isAuditRunning = false;

  public static getInstance(): UniverseDataAuditService {
    if (!UniverseDataAuditService.instance) {
      UniverseDataAuditService.instance = new UniverseDataAuditService();
    }
    return UniverseDataAuditService.instance;
  }

  /**
   * Fetches, validates, and persists audit records for a single symbol
   */
  public async auditSymbol(symbol: string): Promise<IntegrityCheckResult | null> {
    const cleanSym = symbol.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    const data = await this.screenerService.fetchScreenerData(cleanSym);
    if (!data) return null;

    const audit = this.integrityGate.evaluateCompanyData(data);
    await this.persistAuditResult(data, audit);
    return audit;
  }

  /**
   * Persists the evaluated audit results to DataQualityAuditLedger
   */
  public async persistAuditResult(data: ScreenerData, audit: IntegrityCheckResult): Promise<void> {
    const db = getDB();
    const p = audit.parsedMetrics;
    const cg = data.compoundedGrowth;

    const parsePct = (val?: string): number | undefined => {
      if (!val || val === '—' || val === '-') return undefined;
      const clean = parseFloat(val.replace(/%/g, ''));
      return isNaN(clean) ? undefined : clean;
    };

    const sql = `
      INSERT OR REPLACE INTO DataQualityAuditLedger (
        symbol, company_name, sector, industry,
        as_of_quarter, as_of_year,
        promoter_pct, fii_pct, dii_pct, govt_pct, others_pct, public_pct,
        sum_total_pct, free_float_pct, no_of_shareholders,
        market_cap_cr, current_price, pe_ratio, book_value, dividend_yield_pct,
        roce_pct, roe_pct, debt_to_equity,
        latest_sales_cr, latest_expenses_cr, latest_op_profit_cr, latest_opm_pct,
        latest_pbt_cr, latest_tax_pct, latest_pat_cr, latest_eps,
        sales_yoy_growth_pct, pat_yoy_growth_pct, sales_qoq_growth_pct, pat_qoq_growth_pct,
        sales_growth_5y_pct, profit_growth_5y_pct,
        cfo_cr, cfi_cr, cff_cr, net_cash_flow_cr,
        total_assets_cr, total_borrowings_cr,
        integrity_status, violation_reasons, field_accuracy_score,
        audited_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        CURRENT_TIMESTAMP
      )
    `;

    const params = [
      audit.symbol,
      data.company_name || audit.symbol,
      data.sector || null,
      data.industry || null,
      audit.auditedQuarter || 'LATEST',
      audit.auditedYear || null,
      p.promoterPct,
      p.fiiPct,
      p.diiPct,
      p.govtPct,
      p.othersPct,
      p.publicPct,
      p.sumTotalPct,
      p.freeFloatPct,
      data.shareholding?.noOfShareholders || null,
      p.marketCapCr,
      p.currentPrice,
      p.peRatio || null,
      p.bookValue || null,
      p.dividendYieldPct || null,
      p.rocePct || null,
      p.roePct || null,
      p.debtToEquity || null,
      p.latestSalesCr || null,
      p.latestExpensesCr || null,
      p.latestOpProfitCr || null,
      p.latestOpmPct || null,
      p.latestPbtCr || null,
      p.latestTaxPct || null,
      p.latestPatCr || null,
      p.latestEps || null,
      p.salesYoYPct || null,
      p.patYoYPct || null,
      p.salesQoQPct || null,
      p.patQoQPct || null,
      parsePct(cg?.sales5Yr) || null,
      parsePct(cg?.profit5Yr) || null,
      p.cfoCr || null,
      p.cfiCr || null,
      p.cffCr || null,
      p.netCashFlowCr || null,
      p.totalAssetsCr || null,
      p.totalBorrowingsCr || null,
      audit.status,
      JSON.stringify(audit.violationFlags),
      audit.fieldAccuracyScore
    ];

    try {
      await dbRun(db, sql, params);
    } catch (err: any) {
      console.warn(`[UniverseAudit] Failed to persist audit ledger for ${audit.symbol}:`, err.message);
    }
  }

  /**
   * Audits a specific list of symbols with controlled concurrency
   */
  public async auditSymbolList(
    symbols: string[],
    concurrency = 4,
    onProgress?: (progress: AuditBatchProgress) => void
  ): Promise<UniverseAuditSummary> {
    const results: IntegrityCheckResult[] = [];
    const quarterDist: Record<string, number> = {};
    const startTime = Date.now();
    let processed = 0;
    let passed = 0;
    let warnings = 0;
    let failed = 0;

    const uniqueSymbols = Array.from(new Set(symbols.map(s => s.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, ''))))
      .filter(s => s.length > 0 && !s.includes('CASH') && !s.includes('USD') && !s.includes('FOLIO'));

    const queue = [...uniqueSymbols];
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length > 0) {
        const symbol = queue.shift();
        if (!symbol) break;

        try {
          const res = await this.auditSymbol(symbol);
          processed++;

          if (res) {
            results.push(res);
            if (res.status === 'PASSED') passed++;
            else if (res.status === 'WARNING') warnings++;
            else failed++;

            const q = res.auditedQuarter || 'UNKNOWN';
            quarterDist[q] = (quarterDist[q] || 0) + 1;
          }

          if (onProgress) {
            const elapsedSeconds = Math.max(1, (Date.now() - startTime) / 1000);
            const rate = processed / elapsedSeconds;
            const remainingItems = uniqueSymbols.length - processed;
            const estimatedRemainingSeconds = rate > 0 ? Math.round(remainingItems / rate) : 0;

            onProgress({
              total: uniqueSymbols.length,
              processed,
              passed,
              warnings,
              failed,
              currentSymbol: symbol,
              startTime,
              elapsedSeconds: Math.round(elapsedSeconds),
              estimatedRemainingSeconds
            });
          }

          // Polite delay between scrapes to maintain high uptime
          await new Promise(r => setTimeout(r, 150));
        } catch (err) {
          console.warn(`[UniverseAudit] Error auditing ${symbol}:`, err);
        }
      }
    });

    await Promise.all(workers);

    const totalAudited = results.length;
    const avgFieldAccuracyScore = totalAudited > 0
      ? Number((results.reduce((acc, r) => acc + r.fieldAccuracyScore, 0) / totalAudited).toFixed(1))
      : 0;

    return {
      totalAudited,
      passedCount: passed,
      warningCount: warnings,
      failedCount: failed,
      overallPassRatePct: totalAudited > 0 ? Number(((passed / totalAudited) * 100).toFixed(1)) : 0,
      avgFieldAccuracyScore,
      quarterDistribution: quarterDist,
      auditedHoldingsCount: uniqueSymbols.length,
      results
    };
  }

  /**
   * Audits all active portfolio holdings
   */
  public async auditAllPortfolioHoldings(onProgress?: (progress: AuditBatchProgress) => void): Promise<UniverseAuditSummary> {
    const db = getDB();
    const holdingRows = await dbAll<{ symbol: string }>(
      db,
      "SELECT DISTINCT symbol FROM Holdings WHERE symbol NOT LIKE '%-BE' AND symbol NOT LIKE '%-BZ'"
    );
    const symbols = holdingRows.map(r => r.symbol);
    return this.auditSymbolList(symbols, 4, onProgress);
  }

  /**
   * Audits universe stocks from MasterTickers
   */
  public async auditUniverse(limit = 300, onProgress?: (progress: AuditBatchProgress) => void): Promise<UniverseAuditSummary> {
    const db = getDB();
    const rows = await dbAll<{ symbol: string }>(
      db,
      "SELECT DISTINCT symbol FROM MasterTickers WHERE symbol NOT LIKE '%-%' ORDER BY id ASC LIMIT ?",
      [limit]
    );
    const symbols = rows.map(r => r.symbol);
    return this.auditSymbolList(symbols, 4, onProgress);
  }
}
