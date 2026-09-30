/**
 * trendlyne_mcp_enrichment.test.ts — End-to-End Integration Suite for Trendlyne MCP Max Enrichment
 * WealthOS V2 Mandatory Amendment
 *
 * Verifies:
 * - MCP Capability Probe and file generation
 * - Quota management and daily reserve compliance
 * - Priority-driven queue scheduling (P0 -> P1 -> P2 Acceptance -> P3 -> P4)
 * - Daemon batch execution, raw response storage, normalization and canonical mapping
 * - Data coverage audit generation
 * - Health and readiness endpoint data structure
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TrendlyneMcpClient } from '../../src/server/services/enrichment/trendlyne/TrendlyneMcpClient.js';
import { TrendlyneQuotaManager } from '../../src/server/services/enrichment/trendlyne/TrendlyneQuotaManager.js';
import { TrendlyneEnrichmentQueue } from '../../src/server/services/enrichment/trendlyne/TrendlyneEnrichmentQueue.js';
import { TrendlyneEnrichmentDaemon } from '../../src/server/services/enrichment/trendlyne/TrendlyneEnrichmentDaemon.js';
import { TrendlyneCoverageService } from '../../src/server/services/enrichment/trendlyne/TrendlyneCoverageService.js';
import { TrendlyneHealthService } from '../../src/server/services/enrichment/trendlyne/TrendlyneHealthService.js';

describe('Trendlyne MCP Max Enrichment Integration Suite', () => {
  beforeAll(async () => {
    await TrendlyneQuotaManager.getInstance().initialize();
  });

  it('1. probes MCP capabilities and writes reports/data/trendlyne/MCP_CAPABILITY_PROBE.json', () => {
    const client = TrendlyneMcpClient.getInstance();
    const probe = client.probeCapabilities();

    expect(probe).toBeDefined();
    expect(probe.maxScripsPerCall).toBe(10);
    expect(probe.maxMetricsPerCall).toBe(50);
    expect(probe.maxCellsPerCall).toBe(500);
    expect(probe.discoveredTools.length).toBeGreaterThan(0);

    const probeFile = path.resolve('reports', 'data', 'trendlyne', 'MCP_CAPABILITY_PROBE.json');
    expect(fs.existsSync(probeFile)).toBe(true);
  });

  it('2. enforces quota limits and reserves for interactive requests', async () => {
    const quotaMgr = TrendlyneQuotaManager.getInstance();
    quotaMgr.resetForTesting();

    const state = quotaMgr.getQuotaState();
    expect(state.dailyLimit).toBe(1000);
    expect(state.dailyReserve).toBe(100);
    expect(quotaMgr.hasAvailableBackgroundQuota(1)).toBe(true);

    // Consume up to safe limit
    await quotaMgr.consumeQuota(5);
    const updated = quotaMgr.getQuotaState();
    expect(updated.dailyUsed).toBe(5);
    expect(quotaMgr.hasAvailableBackgroundQuota(1)).toBe(true);
  });

  it('3. enqueues jobs according to priority policy and processes them with daemon', async () => {
    const queue = TrendlyneEnrichmentQueue.getInstance();
    const daemon = TrendlyneEnrichmentDaemon.getInstance();

    // Enqueue 10 acceptance universe companies at Priority 3 (Acceptance)
    const acceptanceSymbols = ['DYCL', 'TCS', 'HDFCBANK', 'RELIANCE', 'TATAMOTORS', 'TATASTEEL', 'INFY', 'ICICIBANK', 'SUNPHARMA', 'TITAN'];
    for (const sym of acceptanceSymbols) {
      await queue.enqueueJob({
        securityId: sym,
        symbol: sym,
        jobType: 'STRUCTURED_DATA',
        packId: 'TL_DENSE_001',
        priority: 3,
      });
    }

    const pending = await queue.getPendingJobs(20);
    expect(pending.length).toBeGreaterThanOrEqual(10);

    // Run daemon batch processing
    await daemon.start();
    const result = await daemon.processNextBatch({ force: true });
    expect(result.callsExecuted).toBeGreaterThanOrEqual(1);
    expect(result.cellsRequested).toBe(result.callsExecuted * 500); // exactly 500 cells per call (100% utilization)

    await daemon.stop();
  });

  it('4. generates comprehensive data coverage audit', async () => {
    const coverageService = TrendlyneCoverageService.getInstance();
    const audit = await coverageService.generateDataCoverageAudit();

    expect(audit).toBeDefined();
    expect(audit.totalCompaniesTargeted).toBe(11);
    expect(audit.datasets.length).toBeGreaterThanOrEqual(5);

    const auditFile = path.resolve('reports', 'data', 'DATA_COVERAGE_AUDIT.json');
    expect(fs.existsSync(auditFile)).toBe(true);
  });

  it('5. provides health and readiness status for /api/v2/enrichment/status', async () => {
    const healthService = TrendlyneHealthService.getInstance();
    const status = await healthService.getEnrichmentStatus();

    expect(status).toBeDefined();
    expect(status.mcpClient.maxCellsPerCall).toBe(500);
    expect(status.quota.dailyLimit).toBe(1000);
    expect(status.queue).toBeDefined();
  });
});
