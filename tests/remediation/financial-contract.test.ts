import { test, expect } from 'vitest';
import { canDisplayFinancialResult, COST_BASIS_LABELS, type FinancialResultContract } from '../../src/types/FinancialResultContract.js';

test('missing provenance suppresses financial results', () => {
  const c: FinancialResultContract = {
    portfolioIds: ['cc9'],
    memberScope: 'member:1',
    valuationAsOf: '2026-10-23',
    currency: 'INR',
    costBasis: 'pms_entry_market',
    costBasisLabel: COST_BASIS_LABELS.pms_entry_market,
    ledgerRevision: 'fixture',
    dataQuality: 'CERTIFIED',
    uncertifiedFields: [],
    computedAt: '2026-10-24T00:00:00Z'
  };
  expect(canDisplayFinancialResult(c)).toBe(true);
  expect(canDisplayFinancialResult({ ...c, ledgerRevision: null })).toBe(false);
  expect(canDisplayFinancialResult({ ...c, valuationAsOf: null })).toBe(false);
  expect(COST_BASIS_LABELS.remaining_pms_cost).not.toBe(COST_BASIS_LABELS.remaining_original_cost);
});
