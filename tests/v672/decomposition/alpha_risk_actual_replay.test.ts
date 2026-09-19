import { describe, it, expect } from 'vitest';
import { V65BaselineReproducer } from '../../../src/server/services/research/V65BaselineReproducer.js';
import { AlphaRiskReplayEngine } from '../../../src/server/services/research/AlphaRiskReplayEngine.js';
import { AlphaRiskDecompositionEngine } from '../../../src/server/services/research/AlphaRiskDecompositionEngine.js';

describe('V672 Track F — Alpha vs Risk Replay Decomposition Tests', () => {
  const base = new V65BaselineReproducer().loadCanonicalBaseline();
  const replayEngine = new AlphaRiskReplayEngine();
  const decompEngine = new AlphaRiskDecompositionEngine();

  it('executes actual replay for R0, R1, R2, R3 and isolates interaction term', () => {
    const r0 = replayEngine.replay({ configurationId: 'R0', baselineRunId: base.replayRunId, inputSnapshotHash: 'h', strategyIds: [], alphaEngineIds: [], riskControlIds: [], sizingModelId: 'N', costModelId: 'C', slippageModelId: 'S', startDate: '2020-02-27', endDate: '2026-09-15' }, base.trades, base.equity);
    const r1 = replayEngine.replay({ configurationId: 'R1', baselineRunId: base.replayRunId, inputSnapshotHash: 'h', strategyIds: [], alphaEngineIds: ['A'], riskControlIds: [], sizingModelId: 'N', costModelId: 'C', slippageModelId: 'S', startDate: '2020-02-27', endDate: '2026-09-15' }, base.trades, base.equity);
    const r2 = replayEngine.replay({ configurationId: 'R2', baselineRunId: base.replayRunId, inputSnapshotHash: 'h', strategyIds: [], alphaEngineIds: [], riskControlIds: ['R'], sizingModelId: 'V', costModelId: 'C', slippageModelId: 'S', startDate: '2020-02-27', endDate: '2026-09-15' }, base.trades, base.equity);
    const r3 = replayEngine.replay({ configurationId: 'R3', baselineRunId: base.replayRunId, inputSnapshotHash: 'h', strategyIds: [], alphaEngineIds: ['A'], riskControlIds: ['R'], sizingModelId: 'V', costModelId: 'C', slippageModelId: 'S', startDate: '2020-02-27', endDate: '2026-09-15' }, base.trades, base.equity);

    const report = decompEngine.decompose(r0, r1, r2, r3);

    expect(report.decomposition.expectancyR.alphaEffect).toBeGreaterThan(0);
    expect(report.decomposition.maxDrawdownPct.riskEffect).toBeGreaterThan(0);
    expect(report.interactionAnalysis.expectancySuperlinear).toBe(true);
    expect(report.exposureCollapseGuard.exposureCollapsePass).toBe(true);
    expect(report.exposureCollapseGuard.averageExposurePct).toBeGreaterThanOrEqual(40.0);
  });
});
