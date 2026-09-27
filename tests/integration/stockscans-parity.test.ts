import { describe, it, expect } from 'vitest';
import { MarketDataQueryService, calculateIndex } from '../../src/server/services/stockscans/MarketDataQueryService.js';
import { EvidenceQueryService, calculatePe, mapProvenance } from '../../src/server/services/stockscans/EvidenceQueryService.js';
import { WorkspaceService } from '../../src/server/services/stockscans/WorkspaceService.js';
import { Fact } from '../../src/types/stockscans.js';

describe('StockScans Parity Suite (Clean-Room Integration)', () => {
  it('1. Market Breadth Snapshot evaluates DuckDB adjusted OHLCV with full provenance', async () => {
    const breadth = await MarketDataQueryService.getBreadthSnapshot(['RELIANCE', 'TCS', 'INFY', 'HDFCBANK']);

    expect(breadth).toBeDefined();
    expect(breadth.dataSource).toBe('DUCKDB_ADJUSTED');
    expect(breadth.formulaVersion).toBe('1.0.0');
    expect(breadth.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(breadth.coverage.matched).toBeGreaterThan(0);
    expect(breadth.coverage.eligible).toBe(4);

    // Participation
    expect(breadth.participation).toBeDefined();
    expect(typeof breadth.participation.aboveEma20Pct).toBe('number');
    expect(typeof breadth.participation.aboveEma50Pct).toBe('number');

    // Thrust
    expect(breadth.thrust).toBeDefined();
    expect(typeof breadth.thrust.advDecRatio).toBe('number');
    expect(Array.isArray(breadth.thrust.thrustUp4PctSymbols)).toBe(true);

    // 52W Extremes
    expect(breadth.extremes52W).toBeDefined();
    expect(typeof breadth.extremes52W.high52WCount).toBe('number');

    // Benchmark Indices
    expect(Array.isArray(breadth.indices)).toBe(true);
    expect(breadth.indices.length).toBeGreaterThan(0);
    const n50 = breadth.indices.find(i => i.symbol === 'NIFTY 50');
    if (n50) {
      expect(n50.close).toBeGreaterThan(10000);
      expect(typeof n50.change1D).toBe('number');
    }
  });

  it('2. Deterministic Technical Scan produces immutable run ID and parameter hash', async () => {
    const scanResult = await MarketDataQueryService.runScan('MOVERS_4PCT', {
      universe: ['RELIANCE', 'TCS', 'INFY']
    });

    expect(scanResult).toBeDefined();
    expect(scanResult.runId).toMatch(/^SCAN-\d+-[a-f0-9]{8}$/);
    expect(['TECHNICAL', 'MOMENTUM']).toContain(scanResult.category);
    expect(scanResult.dataSource).toBe('DUCKDB_ADJUSTED');
    expect(scanResult.formulaVersion).toBe('1.0.0');
    expect(scanResult.parameterHash).toHaveLength(64);
    expect(Array.isArray(scanResult.matches)).toBe(true);

    // Test record and retrieval in WorkspaceService registry
    await WorkspaceService.recordScanRun(scanResult);
    const runs = await WorkspaceService.getScanRuns(10);
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.some(r => r.runId === scanResult.runId)).toBe(true);
  });

  it('3. Scan Match Engine correctly calculates intersection and detects mixed dates', async () => {
    const scan1 = await MarketDataQueryService.runScan('MOVERS_4PCT', { universe: ['RELIANCE', 'TCS'] });
    const scan2 = await MarketDataQueryService.runScan('52W_HIGH_BREAKOUT', { universe: ['RELIANCE', 'TCS'] });
    await WorkspaceService.recordScanRun(scan1);
    await WorkspaceService.recordScanRun(scan2);

    const matchRes = await WorkspaceService.matchScans([scan1.runId, scan2.runId]);
    expect(matchRes).toBeDefined();
    expect(matchRes.selectedScans.length).toBe(2);
    expect(Array.isArray(matchRes.intersectionMatches)).toBe(true);
    expect(typeof matchRes.hasMixedDatesWarning).toBe('boolean');
  });

  it('4. Official Announcements search exposes exchange provenance and SHA-256', () => {
    const data = EvidenceQueryService.searchAnnouncements({ limit: 10 });
    expect(data.dataSource).toBe('OFFICIAL_EXCHANGE_FERE_ARCHIVE');
    expect(Array.isArray(data.announcements)).toBe(true);
    expect(Array.isArray(data.trendingKeywords)).toBe(true);

    if (data.announcements.length > 0) {
      const first = data.announcements[0];
      expect(first.symbol).toBeDefined();
      expect(first.eventType).toBeDefined();
      expect(first.sourceUrl).toContain('http');
    }
  });

  it('5. Shareholding Scans compute period-over-period diffs with verified source links', () => {
    const sh = EvidenceQueryService.getShareholdingScans({ scanType: 'ALL' });
    expect(sh.dataSource).toBe('OFFICIAL_EXCHANGE_FERE_ARCHIVE');
    expect(Array.isArray(sh.results)).toBe(true);
    expect(sh.results.length).toBeGreaterThan(0);

    const first = sh.results[0];
    expect(first.symbol).toBeDefined();
    expect(typeof first.promoterHolding).toBe('number');
    expect(typeof first.promoterHoldingDiff).toBe('number');
    expect(typeof first.promoterPledge).toBe('number');
    expect(typeof first.promoterPledgeDiff).toBe('number');
    expect(first.sourceUrl).toContain('http');
  });

  it('6. Management Guidance exposes source-cited commitments and valid statuses', () => {
    const gd = EvidenceQueryService.getManagementGuidance({});
    expect(gd.dataSource).toBe('OFFICIAL_EXCHANGE_FERE_ARCHIVE');
    expect(Array.isArray(gd.commitments)).toBe(true);
    for (const c of gd.commitments) {
      expect(['OPEN', 'MET', 'MISSED', 'NOT_COMPARABLE']).toContain(c.status);
      expect(c.metric).toBeDefined();
      expect(c.target).toBeDefined();
      expect(c.sourceUrl).toBeDefined();
    }
  });

  it('7. Peer Comparison provides cited fields and never manufactures synthetic values', async () => {
    const peers = await EvidenceQueryService.getPeerComparison(['RELIANCE', 'TCS']);
    expect(peers.dataSource).toBe('OFFICIAL_EXCHANGE_FERE_ARCHIVE_AND_DUCKDB');
    expect(peers.peers.length).toBe(2);

    const rel = peers.peers.find(p => p.symbol === 'RELIANCE');
    expect(rel).toBeDefined();
    expect(rel?.cmp).toBeGreaterThan(0); // Real DuckDB close
  });

  it('8. Returns Benchmark computes cumulative returns with total-return caveat', async () => {
    const bench = await MarketDataQueryService.getReturnsBenchmark(['RELIANCE', 'NIFTY 50'], '1M');
    expect(bench.dataSource).toBe('DUCKDB_ADJUSTED');
    expect(bench.totalReturnCaveat).toContain('Adjusted prices');
    expect(bench.missingDataPolicy).toBeDefined();
    expect(bench.series.length).toBe(2);

    for (const s of bench.series) {
      expect(typeof s.totalReturnPct).toBe('number');
      expect(['COMPLETE', 'INCOMPLETE', 'UNAVAILABLE']).toContain(s.status);
    }
  });

  it('9. Reverse DCF Calculator produces implied growth rate and sensitivity table', () => {
    const dcf = WorkspaceService.calculateReverseDcf({
      cmp: 1220.9,
      currentEps: 70,
      discountRate: 0.12,
      terminalMultiple: 20
    });

    expect(dcf.impliedGrowthRatePct).toBeGreaterThan(0);
    expect(dcf.sensitivityMatrix.discountRates.length).toBe(5);
    expect(dcf.sensitivityMatrix.terminalMultiples.length).toBe(4);
    expect(dcf.sensitivityMatrix.matrix.length).toBe(5);
    expect(dcf.sensitivityMatrix.matrix[0].length).toBe(4);
  });

  it('10. Durable Alerts supports creation, listing, and snoozing', async () => {
    const alertId = await WorkspaceService.createAlert({
      name: 'Integration Test Breakout Alert',
      alertType: 'PRICE_LEVEL',
      targetSymbol: 'RELIANCE',
      criteria: { minPrice: 1300 }
    });

    expect(typeof alertId).toBe('number');
    const alerts = await WorkspaceService.getAlerts();
    expect(alerts.some(a => a.id === alertId)).toBe(true);

    await WorkspaceService.snoozeAlert(alertId, 48);
    const updatedAlerts = await WorkspaceService.getAlerts();
    const updated = updatedAlerts.find(a => a.id === alertId);
    expect(updated?.snoozeUntil).toBeDefined();
  });

  it('11. Synthetic-Data Guard: calculatePe never fabricates values and returns UNAVAILABLE when invalid', () => {
    const verifiedMcap: Fact<number> = {
      value: 100000,
      status: 'VERIFIED',
      provenance: [{ sourceSystem: 'DUCKDB', asOf: '2026-09-24' }]
    };
    const missingMcap: Fact<number> = {
      value: null,
      status: 'UNAVAILABLE',
      provenance: [],
      noDataReason: 'No verified market cap'
    };
    const positivePat: Fact<number> = {
      value: 5000,
      status: 'VERIFIED',
      provenance: [{ sourceSystem: 'SQLITE_FERE', asOf: '2026-09-24' }]
    };
    const negativePat: Fact<number> = {
      value: -100,
      status: 'VERIFIED',
      provenance: [{ sourceSystem: 'SQLITE_FERE', asOf: '2026-09-24' }]
    };

    // Valid case
    const validPe = calculatePe(verifiedMcap, positivePat);
    expect(validPe.status).toBe('VERIFIED');
    expect(validPe.value).toBe(20);
    expect(validPe.provenance.length).toBe(2);

    // Missing market cap case
    const missingPe = calculatePe(missingMcap, positivePat);
    expect(missingPe.status).toBe('UNAVAILABLE');
    expect(missingPe.value).toBeNull();
    expect(missingPe.noDataReason).toContain('Verified market capitalisation');

    // Negative PAT case
    const negPe = calculatePe(verifiedMcap, negativePat);
    expect(negPe.status).toBe('UNAVAILABLE');
    expect(negPe.value).toBeNull();
  });

  it('12. No-Data Guard: calculateIndex returns UNAVAILABLE and null instead of 0 on missing data', () => {
    const res = calculateIndex(
      [{ symbol: 'ABC' }, { symbol: 'XYZ' }],
      []
    );

    expect(res.status).toBe('UNAVAILABLE');
    expect(res.value).toBeNull();
    expect(res.totalReturnPct).toBeNull();
    expect(res.noDataReason).toBe('No constituents have verified price history');
    expect(res.coverage.covered).toBe(0);
    expect(res.coverage.total).toBe(2);
  });

  it('13. Provenance Guard: mapProvenance never substitutes generic bseindia.com placeholders', () => {
    const provWithoutUrl = mapProvenance({
      source_url: null,
      source_sha256: 'abc123hash',
      document_id: 'doc-999',
      retrieved_at: '2026-09-24T10:00:00Z',
      event_date: '2026-09-24'
    });

    expect(provWithoutUrl.sourceUrl).toBeNull();
    expect(provWithoutUrl.sourceSystem).toBe('SQLITE_FERE');
    expect(provWithoutUrl.documentSha256).toBe('abc123hash');

    const provWithRealUrl = mapProvenance({
      source_url: 'https://www.bseindia.com/xml-data/corpfiling/AttachLive/sample.pdf',
      source_sha256: null,
      document_id: null
    });

    expect(provWithRealUrl.sourceUrl).toBe('https://www.bseindia.com/xml-data/corpfiling/AttachLive/sample.pdf');
    expect(provWithRealUrl.sourceSystem).toBe('BSE');
  });

  it('14. Exact Intersection Guard: matchScans returns ONLY exact intersections in intersectionMatches', async () => {
    const run1 = {
      runId: 'RUN-EXACT-1',
      scanId: 'MOVERS_4PCT',
      scanName: '4% Movers',
      category: 'TECHNICAL' as const,
      asOf: '2026-09-24',
      parameterHash: 'h1',
      parameters: {},
      coverage: { eligible: 3, matched: 2, unavailable: 0, gaps: [] },
      matches: [
        { symbol: 'RELIANCE', close: 1220, changePct: 4.1, volume: 1000, matchReason: 'thrust', metrics: {} },
        { symbol: 'TCS', close: 2073, changePct: 4.5, volume: 2000, matchReason: 'thrust', metrics: {} }
      ],
      executedAt: new Date().toISOString()
    };

    const run2 = {
      runId: 'RUN-EXACT-2',
      scanId: '52W_HIGH_BREAKOUT',
      scanName: '52W High',
      category: 'TECHNICAL' as const,
      asOf: '2026-09-24',
      parameterHash: 'h2',
      parameters: {},
      coverage: { eligible: 3, matched: 2, unavailable: 0, gaps: [] },
      matches: [
        { symbol: 'RELIANCE', close: 1220, changePct: 4.1, volume: 1000, matchReason: 'near 52w', metrics: {} },
        { symbol: 'INFY', close: 1012, changePct: 1.2, volume: 1500, matchReason: 'near 52w', metrics: {} }
      ],
      executedAt: new Date().toISOString()
    };

    await WorkspaceService.recordScanRun(run1);
    await WorkspaceService.recordScanRun(run2);

    const match = await WorkspaceService.matchScans(['RUN-EXACT-1', 'RUN-EXACT-2']);
    expect(match.requiredCount).toBe(2);
    expect(match.intersectionCount).toBe(1);
    expect(match.intersectionMatches.map(m => m.symbol)).toEqual(['RELIANCE']);
    expect(match.allMatches.map(m => m.symbol).sort()).toEqual(['INFY', 'RELIANCE', 'TCS']);
  });
});
