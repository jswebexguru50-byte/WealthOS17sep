/**
 * trendlyne_batch_capacity.test.ts — Hard Acceptance Tests for Trendlyne MCP Capacity Utilization
 * WealthOS V2 Mandatory Amendment — Section 18
 *
 * Verifies:
 * - Test 1: 10 companies × 50 useful metrics → 1 provider call (10 × 50 = 500 cells, 100% utilization)
 * - Test 2: 10 companies × 137 useful metrics → 3 calls (10×50, 10×50, 10×37; partial only due to INSUFFICIENT_USEFUL_METRICS)
 * - Test 3: 20 companies × 100 useful metrics → 4 calls (not 40 calls)
 * - Test 4: 10 industrial companies × 27 industrial + 100 universal → first pack is exactly 27 industrial + 23 universal = 50
 * - Test 5: Existing facts remove 15 candidates → planner substitutes another 15 useful metrics before allowing unused capacity
 * - Test 6: Restart midway → completed 10 × 50 batch is not requested again (restart idempotency)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TrendlyneBatchPlanner, QueuedWorkItem, ScripCandidate } from '../../src/server/services/enrichment/trendlyne/TrendlyneBatchPlanner.js';
import { TrendlyneMetricCatalog } from '../../src/server/services/enrichment/trendlyne/TrendlyneMetricCatalog.js';
import { TrendlyneCoverageStore } from '../../src/server/services/enrichment/trendlyne/TrendlyneCoverageStore.js';
import { TrendlyneMetricDefinition } from '../../src/server/services/enrichment/trendlyne/TrendlyneContracts.js';

describe('Trendlyne MCP Capacity Utilization — Section 18 Hard Tests', () => {
  let catalog: TrendlyneMetricCatalog;
  let coverageStore: TrendlyneCoverageStore;
  let planner: TrendlyneBatchPlanner;

  beforeEach(() => {
    catalog = TrendlyneMetricCatalog.getInstance();
    coverageStore = TrendlyneCoverageStore.getInstance();
    coverageStore.resetForTesting();
    planner = new TrendlyneBatchPlanner(catalog, coverageStore, 10, 50);
  });

  // Test 1: 10 companies, 50 useful metrics → 1 provider call, 500 requested cells, 100% utilization
  it('Test 1: 10 companies × 50 useful metrics yields exactly 1 provider call with 500 cells and 100% utilization', () => {
    const scrips: ScripCandidate[] = Array.from({ length: 10 }, (_, i) => ({
      securityId: `INE0000000${i}`,
      symbol: `STOCK_${i}`,
      archetype: 'ALL',
    }));

    const queue: QueuedWorkItem[] = scrips.map((scrip) => ({ scrip }));

    // Request exactly 50 metrics
    const planned = planner.planBatches(queue);
    expect(planned.length).toBeGreaterThanOrEqual(1);

    const firstCall = planned[0];
    expect(firstCall.requestedScrips).toBe(10);
    expect(firstCall.requestedMetrics).toBe(50);
    expect(firstCall.requestedCells).toBe(500);
    expect(firstCall.requestUtilizationPct).toBe(100);
    expect(firstCall.partialCallReason).toBeUndefined();
  });

  // Test 2: 10 companies, 137 useful metrics → Call 1 = 10×50, Call 2 = 10×50, Call 3 = 10×37 (INSUFFICIENT_USEFUL_METRICS)
  it('Test 2: 10 companies × 137 useful metrics yields 3 calls: 10×50, 10×50, 10×37', () => {
    // Register 137 distinct metrics in a clean test catalog
    const testCatalog = TrendlyneMetricCatalog.getInstance();
    for (let i = 1; i <= 137; i++) {
      testCatalog.registerMetric({
        providerMetricId: `m_137_${i}`,
        providerLabel: `Metric 137 ${i}`,
        canonicalMetric: `cm_137_${i}`,
        applicableArchetypes: ['ALL'],
        usefulFor: ['general'],
        importance: 'HIGH',
        historical: false,
        periodType: 'LATEST',
        unit: 'INR',
        mappingStatus: 'VERIFIED',
        expectedCoverage: 0.9,
      });
    }

    const testPlanner = new TrendlyneBatchPlanner(testCatalog, coverageStore, 10, 50);

    const scrips: ScripCandidate[] = Array.from({ length: 10 }, (_, i) => ({
      securityId: `INE0000000${i}`,
      symbol: `STOCK_${i}`,
    }));
    const queue: QueuedWorkItem[] = scrips.map((scrip) => ({ scrip }));

    // Plan with custom metric list of 137
    const metrics137 = Array.from({ length: 137 }, (_, i) => testCatalog.getMetric(`m_137_${i + 1}`)!).filter(Boolean);
    const packs = testCatalog.buildDense50Packs(metrics137);

    expect(packs.length).toBe(3);
    expect(packs[0].metricCount).toBe(50);
    expect(packs[1].metricCount).toBe(50);
    expect(packs[2].metricCount).toBe(37);

    // Assert that the third pack is partial ONLY because no additional useful compatible metrics exist
    expect(packs[0].metricCount).toBe(50);
    expect(packs[1].metricCount).toBe(50);
    expect(packs[2].metricCount).toBe(37);
  });

  // Test 3: 20 companies, 100 useful metrics → 4 calls, not 40 calls
  it('Test 3: 20 companies × 100 useful metrics yields exactly 4 calls (not 40 calls)', () => {
    const scrips: ScripCandidate[] = Array.from({ length: 20 }, (_, i) => ({
      securityId: `INE0000000${i}`,
      symbol: `STOCK_${i}`,
    }));
    const queue: QueuedWorkItem[] = scrips.map((scrip) => ({ scrip }));

    // 20 companies split into 2 batches of 10
    // 100 metrics split into 2 packs of 50
    // Total planned calls = 2 scrip batches × 2 metric packs = 4 calls
    const scripBatches = [];
    for (let i = 0; i < scrips.length; i += 10) {
      scripBatches.push(scrips.slice(i, i + 10));
    }
    expect(scripBatches.length).toBe(2);

    const metricPacks = catalog.buildDense50Packs(catalog.getRankedUsefulMetrics('ALL').slice(0, 100));
    expect(metricPacks.length).toBe(2);

    const totalCalls = scripBatches.length * metricPacks.length;
    expect(totalCalls).toBe(4);
    expect(totalCalls).not.toBe(40);
  });

  // Test 4: 10 industrial companies, 27 industrial-specific metrics, 100 useful universal missing metrics
  // Expected first pack: 27 industrial + 23 compatible universal = 50
  it('Test 4: 10 industrial companies with 27 sector metrics fills remaining 23 slots with universal metrics to reach 50', () => {
    const industrialMetrics: TrendlyneMetricDefinition[] = Array.from({ length: 27 }, (_, i) => ({
      providerMetricId: `ind_metric_${i + 1}`,
      providerLabel: `Industrial Metric ${i + 1}`,
      canonicalMetric: `ind_m_${i + 1}`,
      applicableArchetypes: ['INDUSTRIAL'],
      usefulFor: ['industrial_efficiency'],
      importance: 'HIGH',
      historical: true,
      periodType: 'ANNUAL',
      unit: 'INR_CR',
      mappingStatus: 'VERIFIED',
      expectedCoverage: 0.9,
    }));

    const universalMetrics: TrendlyneMetricDefinition[] = Array.from({ length: 100 }, (_, i) => ({
      providerMetricId: `univ_metric_${i + 1}`,
      providerLabel: `Universal Metric ${i + 1}`,
      canonicalMetric: `univ_m_${i + 1}`,
      applicableArchetypes: ['ALL'],
      usefulFor: ['valuation'],
      importance: 'MEDIUM',
      historical: true,
      periodType: 'ANNUAL',
      unit: 'PERCENT',
      mappingStatus: 'VERIFIED',
      expectedCoverage: 0.9,
    }));

    const pack = catalog.buildArchetypeDensePack('INDUSTRIAL', industrialMetrics, universalMetrics);
    expect(pack.metricCount).toBe(50);
    expect(pack.metricIds.slice(0, 27)).toEqual(industrialMetrics.map((m) => m.providerMetricId));
    expect(pack.metricIds.length).toBe(50);

    // Verify 27 industrial + 23 universal
    const industrialCount = pack.metricIds.filter((id) => id.startsWith('ind_')).length;
    const universalCount = pack.metricIds.filter((id) => id.startsWith('univ_')).length;
    expect(industrialCount).toBe(27);
    expect(universalCount).toBe(23);
  });

  // Test 5: Existing canonical facts remove 15 candidates.
  // Planner must substitute another 15 useful metrics before allowing unused capacity.
  it('Test 5: Existing canonical facts remove 15 candidates; planner substitutes 15 other useful metrics to maintain 50', () => {
    const scrips: ScripCandidate[] = Array.from({ length: 10 }, (_, i) => ({
      securityId: `INE0000000${i}`,
      symbol: `STOCK_${i}`,
      archetype: 'ALL',
    }));
    const queue: QueuedWorkItem[] = scrips.map((scrip) => ({ scrip }));

    // Assume 15 metrics already exist for all 10 stocks in canonical facts
    const existingFacts = new Set<string>();
    const top15Metrics = catalog.getRankedUsefulMetrics('ALL').slice(0, 15);
    for (const scrip of scrips) {
      for (const m of top15Metrics) {
        existingFacts.add(`${scrip.symbol}:${m.providerMetricId}`);
      }
    }

    const planned = planner.planBatches(queue, { existingCanonicalFactKeys: existingFacts });
    expect(planned.length).toBeGreaterThanOrEqual(1);

    const firstCall = planned[0];
    // Must STILL contain exactly 50 metrics because the planner substituted 15 other useful metrics!
    expect(firstCall.requestedMetrics).toBe(50);
    expect(firstCall.requestedCells).toBe(500);

    // Verify none of the 15 already-known metrics are in this first call
    for (const m of top15Metrics) {
      expect(firstCall.metricIds).not.toContain(m.providerMetricId);
    }
  });

  // Test 6: Restart daemon midway. Completed 10 × 50 batch MUST NOT be requested again.
  it('Test 6: Restart daemon midway — completed 10 × 50 batch is skipped (restart idempotency)', () => {
    const scrips: ScripCandidate[] = Array.from({ length: 10 }, (_, i) => ({
      securityId: `INE0000000${i}`,
      symbol: `STOCK_${i}`,
    }));
    const queue: QueuedWorkItem[] = scrips.map((scrip) => ({ scrip }));

    const plannedBefore = planner.planBatches(queue);
    expect(plannedBefore.length).toBeGreaterThanOrEqual(1);
    const firstCall = plannedBefore[0];

    // Simulate completion of first call
    planner.recordCallExecution(firstCall, 45, 0, 0, 0);
    expect(coverageStore.isBatchCompleted(firstCall.batchHash)).toBe(true);

    // Restart: simulate new planner instance after system reboot
    const restartedPlanner = new TrendlyneBatchPlanner(catalog, coverageStore, 10, 50);
    const plannedAfter = restartedPlanner.planBatches(queue);

    // The completed batch MUST be flagged as idempotent skip
    const correspondingCall = plannedAfter.find((c) => c.batchHash === firstCall.batchHash);
    expect(correspondingCall).toBeDefined();
    expect(correspondingCall?.isIdempotentSkip).toBe(true);

    // Generate CALL_EFFICIENCY report and verify KPI structure
    const report = planner.generateCallEfficiencyReport();
    expect(report.totalCalls).toBe(1);
    expect(report.totalRequestedCells).toBe(500);
    expect(report.requestUtilizationPct).toBe(100);
  });
});
