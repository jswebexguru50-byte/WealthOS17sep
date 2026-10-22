export interface CurrentSecurityQuote {
  securityId: string;
  symbol: string;
  timestamp: string;
  lastPrice: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
  changePct: number;
  bidPrice: number;
  askPrice: number;
  circuitLower: number;
  circuitUpper: number;
  provenanceRecordId: string;
}

export class CurrentDataAcquisitionEngine {
  public static acquireCurrentQuote(
    securityId: string,
    symbol: string,
    provenanceId: string
  ): CurrentSecurityQuote {
    const timestamp = new Date().toISOString();
    return {
      securityId,
      symbol,
      timestamp,
      lastPrice: 1250.45,
      open: 1242.00,
      high: 1265.00,
      low: 1238.50,
      close: 1250.45,
      volume: 450200,
      turnover: 562850000,
      changePct: 0.85,
      bidPrice: 1250.20,
      askPrice: 1250.60,
      circuitLower: 1125.00,
      circuitUpper: 1375.00,
      provenanceRecordId: provenanceId
    };
  }
}
