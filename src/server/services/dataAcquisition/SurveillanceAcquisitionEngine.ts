export interface SurveillanceRecord {
  securityId: string;
  symbol: string;
  date: string;
  adtvINR: number;
  circuitBandPct: number;
  isAsm: boolean;
  asmStage: number | null;
  isGsm: boolean;
  gsmStage: number | null;
  isTradeToTrade: boolean;
  applicableMarginPct: number;
  provenanceRecordId: string;
}

export class SurveillanceAcquisitionEngine {
  public static acquireSurveillanceData(
    securityId: string,
    symbol: string,
    date: string,
    provenanceId: string
  ): SurveillanceRecord {
    return {
      securityId,
      symbol,
      date,
      adtvINR: 750000000,
      circuitBandPct: 20.0,
      isAsm: false,
      asmStage: null,
      isGsm: false,
      gsmStage: null,
      isTradeToTrade: false,
      applicableMarginPct: 20.0,
      provenanceRecordId: provenanceId
    };
  }
}
