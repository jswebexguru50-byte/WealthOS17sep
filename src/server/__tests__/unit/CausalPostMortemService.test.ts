import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CausalPostMortemService, FailedTradeContext } from '../../services/CausalPostMortemService.js';
import { setDbMockHooks } from '../../database.js';
import { AutonomousSelfLearningService } from '../../services/AutonomousSelfLearningService.js';

describe('Unit: CausalPostMortemService', () => {
  let service: CausalPostMortemService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = CausalPostMortemService.getInstance();
    jest.spyOn(AutonomousSelfLearningService.getInstance(), 'recordFailureObservation').mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    setDbMockHooks({});
  });

  // U-CPM-01
  it('U-CPM-01: Volume surge < 1.35 includes VOLUME_EXHAUSTION_TRAP in compound causes', async () => {
    setDbMockHooks({
      dbRun: async () => ({ lastID: 11, changes: 1 })
    });
    jest.spyOn(service as any, 'evaluateTemporalContext').mockReturnValue({
      isExpiryWeek: false,
      daysToMonthlyExpiry: 18,
      isEarningsSeason: false,
      isMacroPolicyWindow: false,
      marketRegime: 'RANGE_BOUND'
    });
    jest.spyOn(service as any, 'checkSectorContagionRisk').mockReturnValue({ isDrag: false, sectorVelocityPct: 0.5 });
    jest.spyOn(service as any, 'checkResistanceRejection').mockReturnValue({ isRejected: false });

    const context: FailedTradeContext = {
      symbol: 'SBIN',
      entryPrice: 800,
      exitPrice: 770,
      targetPrice: 850,
      stopLossPrice: 775,
      pnlPct: -3.75,
      volumeSurgeRatio: 1.20,
      sector: 'Banking'
    };

    const report = await service.conductPostMortem(context);

    const volumeTrap = report.compoundCauses.find(c => c.category === 'VOLUME_EXHAUSTION_TRAP');
    expect(volumeTrap).toBeDefined();
    expect(volumeTrap?.title).toContain('Volume Follow-Through Exhaustion');
  });

  // U-CPM-02
  it('U-CPM-02: temporalContext.isExpiryWeek true adds FNO_DERIVATIVES_UNWINDING', async () => {
    setDbMockHooks({
      dbRun: async () => ({ lastID: 12, changes: 1 })
    });
    jest.spyOn(service as any, 'evaluateTemporalContext').mockReturnValue({
      isExpiryWeek: true,
      daysToMonthlyExpiry: 2,
      isEarningsSeason: false,
      isMacroPolicyWindow: false,
      marketRegime: 'HIGH_VOLATILITY'
    });
    jest.spyOn(service as any, 'checkSectorContagionRisk').mockReturnValue({ isDrag: false });
    jest.spyOn(service as any, 'checkResistanceRejection').mockReturnValue({ isRejected: false });

    const context: FailedTradeContext = {
      symbol: 'NIFTY_CALL',
      entryPrice: 100,
      exitPrice: 85,
      targetPrice: 130,
      stopLossPrice: 90,
      pnlPct: -15.0,
      volumeSurgeRatio: 1.50
    };

    const report = await service.conductPostMortem(context);

    const fnoCause = report.compoundCauses.find(c => c.category === 'FNO_DERIVATIVES_UNWINDING');
    expect(fnoCause).toBeDefined();
    expect(fnoCause?.title).toContain('F&O Expiry Gamma');
  });

  // U-CPM-03
  it('U-CPM-03: Multiple failures ensure weights sum <= 100 and primary is the highest weight', async () => {
    setDbMockHooks({
      dbRun: async () => ({ lastID: 13, changes: 1 })
    });
    jest.spyOn(service as any, 'evaluateTemporalContext').mockReturnValue({
      isExpiryWeek: true,
      daysToMonthlyExpiry: 3,
      isEarningsSeason: false,
      isMacroPolicyWindow: false,
      marketRegime: 'CHOPPY'
    });
    jest.spyOn(service as any, 'checkSectorContagionRisk').mockReturnValue({ isDrag: true, sectorVelocityPct: -2.8 });
    jest.spyOn(service as any, 'checkResistanceRejection').mockReturnValue({ isRejected: true });

    const context: FailedTradeContext = {
      symbol: 'WIPRO',
      entryPrice: 500,
      exitPrice: 470,
      targetPrice: 550,
      stopLossPrice: 480,
      pnlPct: -6.0,
      volumeSurgeRatio: 1.10, // Triggers volume trap too
      sector: 'IT'
    };

    const report = await service.conductPostMortem(context);

    expect(report.compoundCauses.length).toBeGreaterThan(1);
    const sumWeights = report.compoundCauses.reduce((sum, c) => sum + c.weightPct, 0);
    expect(sumWeights).toBeLessThanOrEqual(100);
    expect(sumWeights).toBeGreaterThanOrEqual(95);

    // Primary cause must match the first cause and have highest weight
    expect(report.primaryFailureCategory).toBe(report.compoundCauses[0].category);
    for (let i = 1; i < report.compoundCauses.length; i++) {
      expect(report.compoundCauses[0].weightPct).toBeGreaterThanOrEqual(report.compoundCauses[i].weightPct);
    }
  });

  // U-CPM-04
  it('U-CPM-04: Missing optional volumeSurgeRatio defaults to 1.15 and triggers low-volume rule', async () => {
    setDbMockHooks({
      dbRun: async () => ({ lastID: 14, changes: 1 })
    });
    jest.spyOn(service as any, 'evaluateTemporalContext').mockReturnValue({
      isExpiryWeek: false,
      daysToMonthlyExpiry: 20,
      isEarningsSeason: false,
      isMacroPolicyWindow: false,
      marketRegime: 'STABLE'
    });
    jest.spyOn(service as any, 'checkSectorContagionRisk').mockReturnValue({ isDrag: false });
    jest.spyOn(service as any, 'checkResistanceRejection').mockReturnValue({ isRejected: false });

    const context: FailedTradeContext = {
      symbol: 'TITAN',
      entryPrice: 3200,
      exitPrice: 3100,
      targetPrice: 3400,
      stopLossPrice: 3120,
      pnlPct: -3.1
    };

    const report = await service.conductPostMortem(context);

    const volumeTrap = report.compoundCauses.find(c => c.category === 'VOLUME_EXHAUSTION_TRAP');
    expect(volumeTrap).toBeDefined();
    expect(volumeTrap?.evidence).toContain('1.15x');
  });

  // U-CPM-05
  it('U-CPM-05: DB insertion error is logged and re-thrown for higher-level handling', async () => {
    const dbErr = new Error('UNIQUE constraint failed: AutonomousPostMortems.id');
    setDbMockHooks({
      dbRun: async () => { throw dbErr; }
    });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const context: FailedTradeContext = {
      symbol: 'FAIL_DB',
      entryPrice: 100,
      exitPrice: 90,
      targetPrice: 120,
      stopLossPrice: 95,
      pnlPct: -10.0
    };

    await expect(service.conductPostMortem(context)).rejects.toThrow('UNIQUE constraint failed');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[CausalPostMortemService] conductPostMortem error:'),
      dbErr
    );
  });

  // U-CPM-06
  it('U-CPM-06: conductPostMortem returns a fully-typed PostMortemReport with all mandatory fields present and correctly typed', async () => {
    setDbMockHooks({
      dbRun: async () => ({ lastID: 105, changes: 1 })
    });

    const context: FailedTradeContext = {
      recommendationId: 999,
      symbol: 'BAJFINANCE',
      companyName: 'Bajaj Finance Ltd',
      timeframe: 'SWING_1_TO_2_WEEKS',
      entryPrice: 7000,
      exitPrice: 6750,
      targetPrice: 7500,
      stopLossPrice: 6800,
      pnlPct: -3.57,
      volumeSurgeRatio: 1.22,
      sector: 'Financial Services'
    };

    const report = await service.conductPostMortem(context);

    expect(report.id).toBe(105);
    expect(report.recommendationId).toBe(999);
    expect(typeof report.symbol).toBe('string');
    expect(typeof report.primaryFailureCategory).toBe('string');
    expect(Array.isArray(report.compoundCauses)).toBe(true);
    expect(typeof report.causalConfidencePct).toBe('number');
    expect(typeof report.rootCauseAnalysis).toBe('string');
    expect(typeof report.correctiveAction).toBe('string');
    expect(typeof report.counterfactualAction).toBe('string');
    expect(typeof report.appliedParameterMutation).toBe('string');
    expect(typeof report.temporalContext.isExpiryWeek).toBe('boolean');
    expect(typeof report.learnedAt).toBe('string');
  });
});
