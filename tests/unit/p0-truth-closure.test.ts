import { describe, expect, it } from 'vitest';
import { EvidenceBus } from '../../src/server/services/composable/EvidenceBus';
import { SmartMoneyAdapter } from '../../src/server/services/adapters/SmartMoneyAdapter';
import { FundamentalAlphaAdapter } from '../../src/server/services/adapters/FundamentalAlphaAdapter';
import { DoubleMomentumAdapter } from '../../src/server/services/adapters/DoubleMomentumAdapter';
import { SectorRotationAdapter } from '../../src/server/services/adapters/SectorRotationAdapter';
import { OpportunityScannerEngine } from '../../src/server/services/OpportunityScannerEngine';
import { SmartMoneyFlowEngine } from '../../src/server/services/SmartMoneyFlowEngine';
import { TrendlyneIntelligenceService } from '../../src/server/services/TrendlyneIntelligenceService';

const context: any = {
  contextHash: 'test-context',
  decisionDate: '2026-09-29',
  decisionTimestamp: '2026-09-29T00:00:00.000Z'
};

describe('P0 truth closure', () => {
  it('does not emit fixed adapter evidence when canonical inputs are absent', async () => {
    const bus = new EvidenceBus();
    await new SmartMoneyAdapter().evaluate(bus, context, ['INFY']);
    await new FundamentalAlphaAdapter().evaluate(bus, context, ['INFY']);
    await new DoubleMomentumAdapter().evaluate(bus, context, ['INFY']);
    await new SectorRotationAdapter().evaluate(bus, context, ['INFY']);
    expect(bus.getAll()).toEqual([]);
  });

  it('returns data-insufficient rather than a synthetic opportunity score', async () => {
    const result: any = await OpportunityScannerEngine.getInstance().scanSingleScrip('INFY');
    expect(result.status).toBe('DATA_INSUFFICIENT');
    expect(result.compositeScore).toBeNull();
    expect(result.bullishProbabilityPct).toBeNull();
    expect(result.targetPrice).toBeNull();
    expect(result.stopLossPrice).toBeNull();
  });

  it('does not manufacture a legacy Trendlyne report or smart-money participant flow', async () => {
    await expect(TrendlyneIntelligenceService.getInstance().getScripIntelligence('INFY')).resolves.toBeNull();
    await expect(SmartMoneyFlowEngine.getInstance().computeStockMetrics('INFY', '1D')).rejects.toThrow('SOURCE_UNAVAILABLE');
  });
});
