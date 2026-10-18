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
  /**
   * No real shareholding source is wired up. Returns no records (unavailable) rather than
   * fabricating quarterly holdings; callers must treat an empty result as "unknown".
   */
  public static acquireShareholdingPattern(
    _securityId: string,
    _provenanceId: string
  ): ShareholdingRecord[] {
    return [];
  }
}
