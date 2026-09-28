export interface MarketContextPayload {
  stockTrend: 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'UNKNOWN';
  sectorName: string | null;
  sectorTrend: 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'UNKNOWN' | 'DATA_INSUFFICIENT';
  nifty50Trend: 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'UNKNOWN';
  nifty500Trend: 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'UNKNOWN';
  sectorRelativeStrength: number | null;
  stockRelativeStrength: number | null;
  sectorFlowProxy: string | null;
  dataAsOf: string | null;
}
