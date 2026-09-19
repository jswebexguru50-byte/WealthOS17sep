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
    const records: FundamentalStatementRecord[] = [];
    const quarters = [
      { end: '2023-06-30', avail: '2023-07-28' },
      { end: '2023-09-30', avail: '2023-10-25' },
      { end: '2023-12-31', avail: '2024-01-26' },
      { end: '2024-03-31', avail: '2024-05-18' },
      { end: '2024-06-30', avail: '2024-07-26' },
      { end: '2024-09-30', avail: '2024-10-24' },
      { end: '2024-12-31', avail: '2025-01-28' },
      { end: '2025-03-31', avail: '2025-05-20' },
      { end: '2025-06-30', avail: '2025-07-25' },
      { end: '2025-09-30', avail: '2025-10-29' },
      { end: '2025-12-31', avail: '2026-01-27' },
      { end: '2026-03-31', avail: '2026-05-22' },
      { end: '2026-06-30', avail: '2026-07-24' }
    ];

    for (const q of quarters) {
      records.push({
        securityId,
        asOfDate: q.end,
        availableAt: `${q.avail}T18:00:00.000Z`,
        periodType: 'QUARTERLY',
        periodStart: q.end.substring(0, 7) + '-01',
        periodEnd: q.end,
        revenueINR: 2500000000,
        ebitdaINR: 550000000,
        ebitINR: 420000000,
        patINR: 310000000,
        cfoINR: 480000000,
        capexINR: 120000000,
        totalDebtINR: 800000000,
        cashAndEquivalentsINR: 650000000,
        totalEquityINR: 3200000000,
        totalAssetsINR: 4500000000,
        totalLiabilitiesINR: 1300000000,
        sharesOutstanding: 100000000,
        piotroskiFScore: 7,
        sloanAccrualRatio: 0.045,
        provenanceRecordId: provenanceId
      });
    }

    return records;
  }
}
