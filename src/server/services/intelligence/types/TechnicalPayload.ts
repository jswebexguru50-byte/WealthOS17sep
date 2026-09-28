export interface StrategySignal {
  strategyId: string;
  name: string;
  qualified: boolean;
  score?: number;
  details?: Record<string, any>;
}

export interface TechnicalPayload {
  price: number | null;
  ema20: number | null;
  ema50: number | null;
  sma200: number | null;
  rsi14: number | null;
  atrPct: number | null;
  high52w: number | null;
  low52w: number | null;
  rsPercentile: number | null;
  trend: 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'UNKNOWN';
  signals: StrategySignal[];
  dataAsOf: string | null;
}
