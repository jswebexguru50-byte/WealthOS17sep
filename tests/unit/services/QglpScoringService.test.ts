import { describe, expect, it } from 'vitest';
import { calculateQglp } from '../../../src/server/services/QglpScoringService';

describe('QGLP deterministic scoring', () => {
  it('withholds the score when any pillar lacks evidence', () => {
    const result = calculateQglp({
      roePct: 30, rocePct: 40, cfoToPatPct: 90, cfoToOperatingProfitPct: 60,
      debtToEquity: 0.2, promoterPledgePct: 0, profitableQuarterCount: 8,
      salesCagr3yPct: null, profitCagr3yPct: null, profitableYears: null,
      positiveCfoYears: null, roceConsistencyPct: null, marginStabilityPct: null,
      peVsHistoryPct: null, peVsSectorPct: null, peg: null, fcfYieldPct: null,
    });
    expect(result.status).toBe('PARTIAL');
    expect(result.score).toBeNull();
  });

  it('produces a reproducible score only with complete evidence', () => {
    const input = {
      roePct: 30, rocePct: 40, cfoToPatPct: 90, cfoToOperatingProfitPct: 60,
      debtToEquity: 0.2, promoterPledgePct: 0, profitableQuarterCount: 8,
      salesCagr3yPct: 18, profitCagr3yPct: 22, profitableYears: 6,
      positiveCfoYears: 6, roceConsistencyPct: 85, marginStabilityPct: 80,
      peVsHistoryPct: 20, peVsSectorPct: 15, peg: 1.2, fcfYieldPct: 6,
    };
    const first = calculateQglp(input);
    const second = calculateQglp(input);
    expect(first.score).not.toBeNull();
    expect(first.score).toBe(second.score);
    expect(first.evidenceCompletenessPct).toBe(100);
  });
});
