import { XbrlIngestionService } from '../XbrlIngestionService.js';

export interface FundamentalStatementRecord {
  securityId: string;
  asOfDate: string;
  availableAt: string;
  periodType: 'QUARTERLY' | 'ANNUAL' | 'TTM';
  periodStart: string;
  periodEnd: string;
  revenueINR: number | null;
  ebitdaINR: number | null;
  ebitINR: number | null;
  patINR: number | null;
  cfoINR: number | null;
  capexINR: number | null;
  totalDebtINR: number | null;
  cashAndEquivalentsINR: number | null;
  totalEquityINR: number | null;
  totalAssetsINR: number | null;
  totalLiabilitiesINR: number | null;
  sharesOutstanding: number | null;
  piotroskiFScore: number | null;
  sloanAccrualRatio: number | null;
  provenanceRecordId: string;
}

/**
 * Typed result returned by acquireStatements.
 * Duplicate direct-fetch paths (BSE/screener) have been removed — A8.
 * The canonical acquisition path is exclusively through XbrlIngestionService.
 */
export interface AcquireStatementsResult {
  /** Security identifier passed to the call (securityId or symbol). */
  symbol: string;
  /** Dominant period type across all records; 'MIXED' when both QUARTERLY and ANNUAL are present. */
  statementType: 'QUARTERLY' | 'ANNUAL' | 'TTM' | 'MIXED';
  /** Sorted list of distinct period-end dates present in records. */
  periods: string[];
  /** Acquisition path that produced the records. */
  source: 'xbrl-ingestion' | 'empty';
  /** Normalised financial statement rows. */
  records: FundamentalStatementRecord[];
}

export class FundamentalEnrichmentEngine {
  /**
   * Acquire financial statements for a security.
   *
   * Canonical path: XbrlIngestionService.getPromotedFinancialStatements.
   * Duplicate direct-fetch paths (BSE API, screener) have been removed — A8.
   * If XbrlIngestionService is unavailable, returns an empty result with
   * source 'empty' rather than falling back to an alternative fetch.
   *
   * // TODO A8: delegate to XbrlIngestionService once available (already done —
   * //           this comment remains for traceability).
   */
  public static async acquireStatements(
    securityId: string,
    provenanceId: string
  ): Promise<AcquireStatementsResult> {
    try {
      // Single canonical acquisition path through XbrlIngestionService.
      const rows = await XbrlIngestionService.getInstance().getPromotedFinancialStatements(securityId);
      const records: FundamentalStatementRecord[] = rows.map((row: any) => ({
        securityId,
        asOfDate: String(row.period_date || row.created_at || ''),
        availableAt: String(row.created_at || row.period_date || new Date().toISOString()),
        periodType: String(row.statement_type || '').includes('QUARTERLY') ? 'QUARTERLY' : 'ANNUAL',
        periodStart: String(row.period_date || ''),
        periodEnd: String(row.period_date || ''),
        revenueINR: toNumber(row.sales_cr), ebitdaINR: null, ebitINR: toNumber(row.operating_profit_cr),
        patINR: toNumber(row.net_profit_pat_cr), cfoINR: toNumber(row.cfo_cr), capexINR: null,
        totalDebtINR: toNumber(row.borrowings_cr), cashAndEquivalentsINR: null,
        totalEquityINR: toNumber(row.equity_capital_cr), totalAssetsINR: toNumber(row.total_assets_cr),
        totalLiabilitiesINR: toNumber(row.total_liabilities_cr), sharesOutstanding: null,
        piotroskiFScore: null, sloanAccrualRatio: null, provenanceRecordId: provenanceId,
      }));

      const periodTypes = [...new Set(records.map(r => r.periodType))];
      const statementType: AcquireStatementsResult['statementType'] =
        periodTypes.length === 1 ? periodTypes[0] : 'MIXED';
      const periods = [...new Set(records.map(r => r.periodEnd))].sort();

      return { symbol: securityId, statementType, periods, source: 'xbrl-ingestion', records };
    } catch (error) {
      console.warn(`[FundamentalEnrichmentEngine] statutory statement lookup failed for ${securityId} (${provenanceId})`, error);
      return { symbol: securityId, statementType: 'MIXED', periods: [], source: 'empty', records: [] };
    }
  }
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
