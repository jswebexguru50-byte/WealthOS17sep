import { CanonicalTrade } from './CanonicalTradeLedger';
import { ResearchRun } from './ResearchRun';

export type Trend = 'BULL' | 'BEAR' | 'SIDEWAYS';
export type Volatility = 'LOW' | 'NORMAL' | 'HIGH';

export interface MarketRegimeContext {
  decisionDate: string;

  trend: Trend;
  volatility: Volatility;

  benchmark: string;
  trendInputs: Record<string, number>;
  volatilityInputs: Record<string, number>;

  pitContextHash: string;
}

export interface RegimeCellStats {
  trend: Trend;
  volatility: Volatility;
  N: number;
  CAGR: number;
  Sharpe: number;
  Sortino: number;
  MaxDD: number;
  PF: number;
  Expectancy: number;
  Turnover: number;
  Exposure: number;
  confidenceInterval95: [number, number];
}

export class TrueRegimeClassifier {
  /**
   * Deterministically assigns a regime to each trade based on actual PIT market data.
   */
  public classifyContext(
    decisionDate: string,
    pitMarketData: any // In reality, this would be actual market series data
  ): MarketRegimeContext {
    // This is a stub for the actual mathematical classification based on the JSON definitions.
    // It must use real data, not synthetic partitioning.
    
    // Stub returns
    return {
      decisionDate,
      trend: 'SIDEWAYS',
      volatility: 'NORMAL',
      benchmark: 'NIFTY_50',
      trendInputs: { fast: 100, slow: 100 },
      volatilityInputs: { atr: 15 },
      pitContextHash: 'stub_hash_for_now' // Enforce real hashes here
    };
  }

  public runRegimeReplay(
    runContext: ResearchRun,
    trades: CanonicalTrade[],
    marketContexts: Map<string, MarketRegimeContext>
  ): RegimeCellStats[] {
    const cells: RegimeCellStats[] = [];

    const trends: Trend[] = ['BULL', 'BEAR', 'SIDEWAYS'];
    const vols: Volatility[] = ['LOW', 'NORMAL', 'HIGH'];

    for (const t of trends) {
      for (const v of vols) {
        // Find trades matching this cell
        const cellTrades = trades.filter(tr => {
          const ctx = marketContexts.get(tr.decisionId);
          return ctx && ctx.trend === t && ctx.volatility === v;
        });

        // Compute actual metrics for this cell
        // NOTE: In a full implementation we calculate real cell economics here.
        cells.push({
          trend: t,
          volatility: v,
          N: cellTrades.length,
          CAGR: 0,
          Sharpe: 0,
          Sortino: 0,
          MaxDD: 0,
          PF: 0,
          Expectancy: 0,
          Turnover: 0,
          Exposure: 0,
          confidenceInterval95: [0, 0]
        });
      }
    }

    return cells;
  }
}
