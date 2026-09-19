/**
 * WealthOS v6.6–v6.7 - PKScreener Indicator Adapter
 * External Reference Acceleration Layer
 * 
 * Extracts and normalizes reference technical indicators (RSI, ATR, VSA, Volume Ratio).
 */

export interface PKScreenerIndicators {
  rsi14?: number;
  atr14?: number;
  sma20?: number;
  sma50?: number;
  sma200?: number;
  volumeRatio?: number;
}

export class PKScreenerIndicatorAdapter {
  public parseIndicators(raw: Record<string, unknown>): PKScreenerIndicators {
    return {
      rsi14: typeof raw.RSI === 'number' ? raw.RSI : typeof raw.rsi14 === 'number' ? raw.rsi14 : undefined,
      atr14: typeof raw.ATR === 'number' ? raw.ATR : undefined,
      sma20: typeof raw.SMA20 === 'number' ? raw.SMA20 : undefined,
      sma50: typeof raw.SMA50 === 'number' ? raw.SMA50 : undefined,
      sma200: typeof raw.SMA200 === 'number' ? raw.SMA200 : undefined,
      volumeRatio: typeof raw.VolumeRatio === 'number' ? raw.VolumeRatio : undefined
    };
  }
}
