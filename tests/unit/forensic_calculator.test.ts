import { describe, expect, it } from 'vitest';
import { ForensicCalculator } from '../../src/server/quant/forensicCalculator.js';

describe('ForensicCalculator deterministic calculation slice', () => {
  it('computes discrete growth and CAGR without treating zero as missing', () => {
    expect(ForensicCalculator.calculateYoYGrowth(100, 80).value).toBe(25);
    expect(ForensicCalculator.calculateSequentialGrowth(0, -10).value).toBe(-100);
    expect(ForensicCalculator.calculateCagr(100, 121, 2).value).toBeCloseTo(10, 10);
  });

  it('keeps missing growth inputs null and identifies the missing field', () => {
    const result = ForensicCalculator.calculateYoYGrowth(null, 80);
    expect(result).toMatchObject({ value: null, status: 'INSUFFICIENT_DATA' });
    expect(result.note).toContain('current');
  });

  it('computes margins, cash conversion, accruals, FCF, and reinvestment', () => {
    expect(ForensicCalculator.calculateMargin(50.52, 462.17).value?.marginPct).toBeCloseTo(10.93, 2);
    expect(ForensicCalculator.calculateCfoPatRatio(41.2888, 14.3904).value).toBeCloseTo(2.87, 2);
    expect(ForensicCalculator.calculateAccrualRatio(20, 12, 100).value).toBeCloseTo(0.08, 10);
    expect(ForensicCalculator.calculateFcf(41.2888, 83.0337).value).toBeCloseTo(-41.7449, 10);
    expect(ForensicCalculator.calculateReinvestmentRate(83.0337, 41.2888).value).toBeCloseTo(2.011, 3);
  });

  it('uses average working-capital balances when both periods are available', () => {
    const result = ForensicCalculator.calculateWorkingCapital({
      revenue: 365,
      cogs: 730,
      receivables: 40,
      inventory: 80,
      payables: 50,
      openingReceivables: 20,
      openingInventory: 40,
      openingPayables: 30,
    });

    expect(result.status).toBe('OK');
    expect(result.value).toEqual({ dso: 30, dio: 30, dpo: 20, ccc: 40, balanceBasis: 'AVERAGE_BALANCE' });
  });

  it('falls back to closing balances with an explicit note', () => {
    const result = ForensicCalculator.calculateWorkingCapital({
      revenue: 365,
      cogs: 730,
      receivables: 30,
      inventory: 60,
      payables: 40,
    });

    expect(result.value?.balanceBasis).toBe('CLOSING_BALANCE');
    expect(result.note).toContain('CLOSING_BALANCE');
  });

  it('computes capital returns and preserves denominator failures as insufficient data', () => {
    expect(ForensicCalculator.calculateRoic(15, 100).value).toBe(15);
    expect(ForensicCalculator.calculateIncrementalRoic(12, 80).value).toBe(15);
    expect(ForensicCalculator.calculateRoce(20, 100).value).toBe(20);
    expect(ForensicCalculator.calculateRoe(12, 80).value).toBe(15);

    const missing = ForensicCalculator.calculateRoic(15, 0);
    expect(missing).toMatchObject({ value: null, status: 'INSUFFICIENT_DATA' });
  });

  it('reports leverage variants and does not substitute total debt for floating debt', () => {
    const leverage = ForensicCalculator.calculateLeverage({
      borrowings: 100,
      leases: 20,
      cash: 30,
      ebitda: 50,
      ebit: 40,
      financeCost: 10,
      otherIncome: 5,
    });
    expect(leverage.value).toEqual({
      netDebt: 90,
      netDebtToEbitda: 1.8,
      interestCoverage: 4,
      interestCoverageExcludingOtherIncome: 3.5,
    });

    const sensitivity = ForensicCalculator.calculateRateSensitivity(1000, null);
    expect(sensitivity.value).toEqual({ pretaxDelta: 2.5, afterTaxDelta: null, effectiveTaxRate: null });
    expect(ForensicCalculator.calculateRateSensitivity(null, 0.25).status).toBe('INSUFFICIENT_DATA');
  });

  it('computes valuation multiples and own-history percentile without defaults', () => {
    const multiples = ForensicCalculator.calculateValuationMultiples({
      marketPrice: 100,
      eps: 5,
      bookValuePerShare: 25,
      enterpriseValue: 900,
      ebitda: 100,
      fcf: 40,
      marketCap: 1000,
    });
    expect(multiples.value).toEqual({ pe: 20, pb: 4, evToEbitda: 9, fcfYieldPct: 4 });
    expect(ForensicCalculator.calculateOwnHistoryPercentile(20, [10, 20, 30, null]).value).toBe(66.66666666666666);

    const unavailable = ForensicCalculator.calculateValuationMultiples({
      marketPrice: 100,
      eps: 0,
      bookValuePerShare: 25,
      enterpriseValue: 900,
      ebitda: 100,
      fcf: 40,
      marketCap: 1000,
    });
    expect(unavailable.value?.pe).toBeNull();
    expect(unavailable.status).toBe('INSUFFICIENT_DATA');
  });

  it('returns nulls for an under-specified reverse DCF instead of defaults', () => {
    const result = ForensicCalculator.solveReverseDcf({ currentMarketPrice: 100, shares: 10 });
    expect(result).toMatchObject({
      currentMarketPrice: 100,
      shares: 10,
      marketCap: null,
      ownerEarningsBaseINR: null,
      waccPct: null,
      terminalGrowthPct: null,
      conservativeHistoricalGrowthRatePct: null,
      intrinsicValuePerShare: null,
      freeCashFlowPerShare: null,
      marginOfSafetyPct: null,
      convergenceStatus: 'UNSOLVABLE_MISSING_INPUTS',
      isSolvable: false,
    });
  });
});
