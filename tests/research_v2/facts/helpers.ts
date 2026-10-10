import type { RawXbrlFact } from '../../../src/server/research_v2/domain/types.js';

/** Build a raw XBRL row (rupees, statutory tier) for tests; any field can be overridden. */
export function raw(
  contextRef: string, periodEnd: string, value: number, metric = 'sales', overrides: Partial<RawXbrlFact> = {},
): RawXbrlFact {
  return {
    factId: `${contextRef}-${periodEnd}-${value}-${metric}`,
    isin: 'INE000000000',
    symbol: 'YUKEN',
    scope: 'CONSOLIDATED',
    metric,
    value,
    unit: 'INR',
    contextRef,
    periodStart: periodEnd,
    periodEnd,
    source: 'XBRL',
    sourceRef: 'fixture',
    sourceTier: 'STATUTORY',
    availableAt: '2026-10-10T00:00:00Z',
    ...overrides,
  };
}

/** Rupee value of a crore amount (avoids float noise in fixtures). */
export const crore = (value: number): number => Math.round(value * 1e7);
