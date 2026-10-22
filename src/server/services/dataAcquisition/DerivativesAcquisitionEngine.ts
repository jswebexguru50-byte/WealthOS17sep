export interface DerivativesRecord {
  securityId: string;
  underlyingSymbol: string;
  tradeDate: string;
  futuresOpenInterest: number;
  futuresOiChange: number;
  optionsPutOpenInterest: number;
  optionsCallOpenInterest: number;
  putCallRatio: number;
  marketWidePositionLimitPct: number;
  inBanPeriod: boolean;
  provenanceRecordId: string;
}

export class DerivativesAcquisitionEngine {
  public static acquireDerivativesData(
    securityId: string,
    symbol: string,
    tradeDate: string,
    provenanceId: string
  ): DerivativesRecord {
    return {
      securityId,
      underlyingSymbol: symbol,
      tradeDate,
      futuresOpenInterest: 14500000,
      futuresOiChange: 320000,
      optionsPutOpenInterest: 18500000,
      optionsCallOpenInterest: 21000000,
      putCallRatio: 0.88,
      marketWidePositionLimitPct: 62.5,
      inBanPeriod: false,
      provenanceRecordId: provenanceId
    };
  }
}
