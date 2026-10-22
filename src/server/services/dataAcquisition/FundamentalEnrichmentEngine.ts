export interface FundamentalStatementRecord {
  securityId: string;
  asOfDate: string;
  availableAt: string;
  periodType: 'QUARTERLY' | 'ANNUAL' | 'TTM';
  periodStart: string;
  periodEnd: string;
  revenueINR: number;
  ebitdaINR: number;
  ebitINR: number;
  patINR: number;
  cfoINR: number;
  capexINR: number;
  totalDebtINR: number;
  cashAndEquivalentsINR: number;
  totalEquityINR: number;
  totalAssetsINR: number;
  totalLiabilitiesINR: number;
  sharesOutstanding: number;
  piotroskiFScore: number;
  sloanAccrualRatio: number;
  provenanceRecordId: string;
}

export class FundamentalEnrichmentEngine {
  public static acquireStatements(
    securityId: string,
    provenanceId: string
  ): FundamentalStatementRecord[] {
    void securityId;
    void provenanceId;
    throw new Error('FERE_FINANCIAL_SOURCE_UNAVAILABLE: verified statement acquisition is not configured');
  }
}
