import { describe, it, expect } from 'vitest';
import { WorkspaceService } from '../../src/server/services/stockscans/WorkspaceService.js';
import { MarketDataQueryService } from '../../src/server/services/stockscans/MarketDataQueryService.js';

describe('StockScans Workspace UI State Invariants (Unit)', () => {
  it('UI Empty State: Scan with zero matches produces structured empty result with full metadata', async () => {
    // Run custom scan with impossible price threshold to test empty state contract
    const result = await MarketDataQueryService.runScan('CUSTOM', {
      universe: ['RELIANCE', 'TCS'],
      minPrice: 9999999
    });

    expect(result.matches).toHaveLength(0);
    expect(result.coverage.eligible).toBe(2);
    expect(result.asOf).toBeDefined();
    expect(result.parameterHash).toBeDefined();
    expect(result.dataSource).toBe('DUCKDB_ADJUSTED');
    expect(result.formulaVersion).toBe('1.0.0');
  });

  it('UI Error State Handling: Invalid scan ID throws explicit error and never manufactures data', async () => {
    await expect(
      MarketDataQueryService.runScan('INVALID_NON_EXISTENT_SCAN', {})
    ).rejects.toThrow(/Unsupported scan ID/);
  });

  it('UI Data State: Reverse DCF sensitivity matrix properly calculates 5x4 grid', () => {
    const res = WorkspaceService.calculateReverseDcf({
      cmp: 2500,
      currentEps: 80,
      discountRate: 0.12,
      terminalMultiple: 25,
      projectionYears: 10
    });

    expect(res.impliedGrowthRatePct).toBeTypeOf('number');
    expect(res.sensitivityMatrix.discountRates).toEqual([0.10, 0.11, 0.12, 0.13, 0.14]);
    expect(res.sensitivityMatrix.terminalMultiples).toEqual([15, 20, 25, 30]);
    expect(res.sensitivityMatrix.matrix).toHaveLength(5);

    // Each row must have 4 columns with implied growth numbers
    res.sensitivityMatrix.matrix.forEach(row => {
      expect(row).toHaveLength(4);
      row.forEach(cell => {
        expect(cell.impliedGrowthPct).toBeTypeOf('number');
      });
    });
  });

  it('UI Data State: Scan Match calculates exact intersection count and overlap frequency', async () => {
    const run1 = {
      runId: 'RUN-TEST-A',
      scanId: 'MOVERS_4PCT',
      scanName: '4% Movers',
      category: 'TECHNICAL' as const,
      asOf: '2026-09-24',
      parameterHash: 'hash-a',
      parameters: {},
      coverage: { eligible: 3, matched: 3, unavailable: 0, gaps: [] },
      matches: [
        { symbol: 'RELIANCE', close: 1220.9, changePct: 4.1, volume: 1000, matchReason: 'thrust', metrics: {} },
        { symbol: 'TCS', close: 2073.6, changePct: 4.5, volume: 2000, matchReason: 'thrust', metrics: {} }
      ],
      executedAt: new Date().toISOString()
    };

    const run2 = {
      runId: 'RUN-TEST-B',
      scanId: '52W_HIGH_BREAKOUT',
      scanName: '52W High Breakout',
      category: 'TECHNICAL' as const,
      asOf: '2026-09-24',
      parameterHash: 'hash-b',
      parameters: {},
      coverage: { eligible: 3, matched: 3, unavailable: 0, gaps: [] },
      matches: [
        { symbol: 'RELIANCE', close: 1220.9, changePct: 4.1, volume: 1000, matchReason: 'near 52w high', metrics: {} },
        { symbol: 'INFY', close: 1012.5, changePct: 1.2, volume: 1500, matchReason: 'near 52w high', metrics: {} }
      ],
      executedAt: new Date().toISOString()
    };

    await WorkspaceService.recordScanRun(run1);
    await WorkspaceService.recordScanRun(run2);

    const match = await WorkspaceService.matchScans(['RUN-TEST-A', 'RUN-TEST-B']);
    expect(match.selectedScans).toHaveLength(2);
    expect(match.hasMixedDatesWarning).toBe(false);
    expect(match.intersectionCount).toBe(1); // Only RELIANCE is in both
    expect(match.intersectionMatches[0].symbol).toBe('RELIANCE');
    expect(match.intersectionMatches[0].matchCount).toBe(2);
    expect(match.intersectionMatches[0].matchedScans).toContain('4% Movers');
    expect(match.intersectionMatches[0].matchedScans).toContain('52W High Breakout');
  });
});
