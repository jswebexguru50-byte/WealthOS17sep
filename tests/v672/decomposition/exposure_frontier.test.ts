import { describe, it, expect } from 'vitest';
import { V65BaselineReproducer } from '../../../src/server/services/research/V65BaselineReproducer.js';
import { AlphaRiskReplayEngine } from '../../../src/server/services/research/AlphaRiskReplayEngine.js';

describe('V672 Track F — Exposure Collapse Frontier Tests', () => {
  const base = new V65BaselineReproducer().loadCanonicalBaseline();
  const replayEngine = new AlphaRiskReplayEngine();

  it('guarantees average exposure >= 40% and trade count >= 1,000 for C12', () => {
    const r3 = replayEngine.replay({ configurationId: 'R3', baselineRunId: base.replayRunId, inputSnapshotHash: 'h', strategyIds: [], alphaEngineIds: ['A'], riskControlIds: ['R'], sizingModelId: 'V', costModelId: 'C', slippageModelId: 'S', startDate: '2020-02-27', endDate: '2026-09-15' }, base.trades, base.equity);

    expect(r3.averageExposure).toBeGreaterThanOrEqual(40.0);
    expect(r3.tradeCount).toBeGreaterThanOrEqual(1000);
    expect(r3.cagrPct / r3.averageExposure).toBeGreaterThan(0.20);
  });
});
