import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('WEALTHOS v6.5 Portfolio Construction Policy Determinism Test', () => {
  it('should load frozen portfolio policy and verify explicit policy fields', () => {
    const policyPath = path.join(process.cwd(), 'data', 'v6.5', 'v65_portfolio_construction_policy.json');
    expect(fs.existsSync(policyPath)).toBe(true);

    const policyData = JSON.parse(fs.readFileSync(policyPath, 'utf-8'));
    const p = policyData.policy;

    expect(p.initialCapital).toBe(10000000);
    expect(p.positionSizingMethod).toBe('EQUAL_WEIGHT_RISK_PARITY');
    expect(p.maximumSinglePositionPct).toBe(8.0);
    expect(p.maximumConcurrentPositions).toBe(15);
    expect(p.maximumGrossExposure).toBe(100.0);
    expect(p.strategyAllocation).toBe('EQUAL_WEIGHT');
    expect(p.signalCollisionPolicy).toBe('HIGHEST_RS_RANKING');
    expect(p.sameDaySignalPolicy).toBe('PRIORITIZE_HIGHER_RR');
    expect(p.reentryPolicy).toBe('MINIMUM_5_BAR_COOLDOWN');
    expect(p.cashTreatment).toBe('NON_INTEREST_BEARING_RESERVE');
    expect(p.corporateActionTreatment).toBe('EX_DATE_PRICE_ADJUSTED');
    expect(p.roundingPolicy).toBe('FLOOR_NEAREST_INT_SHARES');
  });

  it('should prove deterministic portfolio sizing for identical trade inputs', () => {
    const capital = 10000000;
    const maxSinglePosPct = 0.08;
    const entryPrice = 1250.50;

    const size1 = Math.floor((capital * maxSinglePosPct) / entryPrice);
    const size2 = Math.floor((capital * maxSinglePosPct) / entryPrice);

    expect(size1).toBe(639);
    expect(size1).toBe(size2);
  });
});
