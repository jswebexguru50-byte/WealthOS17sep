export interface SectorIndexRecord {
  indexSymbol: string;
  indexName: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  peRatio: number;
  pbRatio: number;
  dividendYield: number;
  historicalConstituents: { securityId: string; weightPct: number; effectiveFrom: string; effectiveTo: string | null }[];
  provenanceRecordId: string;
}

export class SectorIndexAcquisitionEngine {
  public static acquireSectorIndex(
    indexSymbol: string,
    date: string,
    provenanceId: string
  ): SectorIndexRecord {
    return {
      indexSymbol,
      indexName: indexSymbol === 'NIFTY50' ? 'Nifty 50 Index' : 'Nifty 500 Index',
      date,
      open: 24800.0,
      high: 25050.0,
      low: 24750.0,
      close: 24980.0,
      peRatio: 22.4,
      pbRatio: 4.1,
      dividendYield: 1.25,
      historicalConstituents: [
        { securityId: 'SEC_INE002A01018', weightPct: 9.8, effectiveFrom: '2020-01-01', effectiveTo: null },
        { securityId: 'SEC_INE040A01034', weightPct: 11.2, effectiveFrom: '2020-01-01', effectiveTo: null },
        { securityId: 'SEC_INE090A01021', weightPct: 7.9, effectiveFrom: '2020-01-01', effectiveTo: null }
      ],
      provenanceRecordId: provenanceId
    };
  }
}
