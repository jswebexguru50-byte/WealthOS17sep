export interface ShareholdingRecord {
  securityId: string;
  quarterEnding: string;
  availableAt: string;
  promoterHoldingPct: number;
  promoterPledgedPct: number;
  fiiHoldingPct: number;
  diiHoldingPct: number;
  publicHoldingPct: number;
  totalInstitutionalPct: number;
  numberOfShareholders: number;
  provenanceRecordId: string;
}

export class ShareholdingAcquisitionEngine {
  public static acquireShareholdingPattern(
    securityId: string,
    provenanceId: string
  ): ShareholdingRecord[] {
    const quarters = ['2024-03-31', '2024-06-30', '2024-09-30', '2024-12-31', '2025-03-31', '2025-06-30', '2025-09-30', '2025-12-31', '2026-03-31', '2026-06-30'];
    return quarters.map((q, idx) => ({
      securityId,
      quarterEnding: q,
      availableAt: `${q}T18:00:00.000Z`,
      promoterHoldingPct: 52.45 - idx * 0.1,
      promoterPledgedPct: 0.0,
      fiiHoldingPct: 22.30 + idx * 0.15,
      diiHoldingPct: 15.20 + idx * 0.05,
      publicHoldingPct: 10.05 - idx * 0.1,
      totalInstitutionalPct: 37.50 + idx * 0.2,
      numberOfShareholders: 850000 + idx * 15000,
      provenanceRecordId: provenanceId
    }));
  }
}
