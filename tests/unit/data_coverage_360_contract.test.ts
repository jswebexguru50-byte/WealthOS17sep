import { describe, expect, it } from 'vitest';
import { DataCoverageEngine } from '../../src/server/services/intelligence/coverage/DataCoverageEngine.js';

describe('DataCoverageEngine 360-degree contract', () => {
  it('always exposes all six analytical domains and fails closed for absent dimensions', () => {
    const coverage = DataCoverageEngine.getInstance().evaluateCoverage(
      'TEST',
      'INE000A00000',
      {
        fundamental: { result: { historicalSeries: { revenue: [{ value: 10 }] } } },
        valuation: { result: { pe: { value: 20 } } },
        technical: { result: { indicators: { ema20: 100 } } },
        fere: { evidence: [{ id: 'x' }] },
      },
      '2026-10-27',
    );

    expect(Object.keys(coverage.domains).sort()).toEqual([
      'BUSINESS_DRIVERS', 'FERE_FILINGS', 'FUNDAMENTALS', 'MANAGEMENT', 'TECHNICAL', 'VALUATION',
    ]);
    expect(coverage.domains.VALUATION.overallStatus).toBe('PARTIAL');
    expect(coverage.domains.TECHNICAL.overallStatus).toBe('PARTIAL');
    expect(coverage.domains.BUSINESS_DRIVERS.overallStatus).toBe('INSUFFICIENT');
    expect(coverage.domains.MANAGEMENT.overallStatus).toBe('PARTIAL');
    expect(coverage.domains.FERE_FILINGS.overallStatus).toBe('PARTIAL');
    expect(coverage.domains.BUSINESS_DRIVERS.unobservableDimensions.length).toBeGreaterThan(0);
  });

  it('marks every domain unavailable when no module payload exists', () => {
    const coverage = DataCoverageEngine.getInstance().evaluateCoverage('EMPTY', null, {}, '2026-10-27');
    for (const domain of Object.values(coverage.domains)) {
      expect(domain.overallStatus).toBe('SOURCE_UNAVAILABLE');
    }
    expect(coverage.overallSuitability).toBe('DATA_INSUFFICIENT');
  });
});
