import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DossierRunService } from '../../src/server/services/DossierRunService.js';
import { TrendlyneIntelligenceService } from '../../src/server/services/TrendlyneIntelligenceService.js';
import { XbrlIngestionService } from '../../src/server/services/XbrlIngestionService.js';
import { ZerodhaSyncService } from '../../src/server/services/ZerodhaSyncService.js';

describe('Historical Zero-Refetch Real Integration Test (DR-20261001-7D-B0A8466C)', () => {
  const runId = 'DR-20261001-7D-B0A8466C';

  // Spies / Call counters
  let trendlyneInvocationCount = 0;
  let fereNetworkInvocationCount = 0;
  let xbrlNetworkInvocationCount = 0;
  let kiteNetworkInvocationCount = 0;
  let globalFetchCount = 0;

  beforeEach(() => {
    trendlyneInvocationCount = 0;
    fereNetworkInvocationCount = 0;
    xbrlNetworkInvocationCount = 0;
    kiteNetworkInvocationCount = 0;
    globalFetchCount = 0;

    // Spy global fetch (catches all HTTP/HTTPS outbound network calls)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      globalFetchCount++;
      const urlStr = String(url);
      if (urlStr.includes('kite') || urlStr.includes('zerodha')) {
        kiteNetworkInvocationCount++;
      } else if (urlStr.includes('xbrl') || urlStr.includes('bseindia') || urlStr.includes('nseindia')) {
        xbrlNetworkInvocationCount++;
      } else if (urlStr.includes('fere')) {
        fereNetworkInvocationCount++;
      } else if (urlStr.includes('trendlyne')) {
        trendlyneInvocationCount++;
      }
      throw new Error(`ILLEGAL_NETWORK_CALL: Network request forbidden during historical dossier retrieval: ${urlStr}`);
    });

    // Spy Trendlyne acquisition
    vi.spyOn(TrendlyneIntelligenceService.prototype, 'getScripIntelligence').mockImplementation(async () => {
      trendlyneInvocationCount++;
      throw new Error('ILLEGAL_PROVIDER_CALL: Trendlyne acquisition invoked during historical dossier retrieval');
    });

    // Spy XBRL network ingestion
    vi.spyOn(XbrlIngestionService.prototype, 'fetchAndParseXbrlFromUrl').mockImplementation(async () => {
      xbrlNetworkInvocationCount++;
      throw new Error('ILLEGAL_PROVIDER_CALL: XBRL network fetch invoked during historical dossier retrieval');
    });

    vi.spyOn(XbrlIngestionService.prototype, 'getOfficialShareholding').mockImplementation(async () => {
      xbrlNetworkInvocationCount++;
      throw new Error('ILLEGAL_PROVIDER_CALL: XBRL shareholding network fetch invoked during historical dossier retrieval');
    });

    // Spy Zerodha / Kite acquisition
    vi.spyOn(ZerodhaSyncService.prototype, 'syncHoldings').mockImplementation(async () => {
      kiteNetworkInvocationCount++;
      throw new Error('ILLEGAL_PROVIDER_CALL: Kite sync invoked during historical dossier retrieval');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retrieves historical dossier run, candidates, signals, snapshots, and artifacts with ZERO provider or network calls', async () => {
    // 1. Retrieve the historical dossier run
    const dossierRun = await DossierRunService.getDossierRun(runId);
    expect(dossierRun).not.toBeNull();
    expect(dossierRun!.dossierRunId).toBe(runId);
    expect(dossierRun!.status).toBe('COMPLETED');

    // 2. Retrieve candidates
    const candidates = await DossierRunService.getCandidatesForRun(runId);
    expect(candidates.length).toBe(19);

    // 3. Retrieve signals
    const signals = await DossierRunService.getSignalsForRun(runId);
    expect(signals.length).toBe(25);

    // 4. Retrieve snapshots for all 19 candidates
    let totalSnapshots = 0;
    for (const c of candidates) {
      const snapshots = await DossierRunService.getAllSnapshotsForCandidate(c.candidateId);
      const snapshotKeys = Object.keys(snapshots);
      expect(snapshotKeys.length).toBeGreaterThan(0);
      totalSnapshots += snapshotKeys.length;

      // Check required snapshot types
      expect(snapshotKeys).toContain('ONE_PAGE_COMPANY_SUMMARY');
      expect(snapshotKeys).toContain('FUNDAMENTAL');
      expect(snapshotKeys).toContain('TECHNICAL');
      expect(snapshotKeys).toContain('RISK');
    }
    expect(totalSnapshots).toBeGreaterThanOrEqual(19 * 4);

    // 5. Retrieve artifacts
    const artifacts = await DossierRunService.getArtifactsForRun(runId);
    expect(artifacts.length).toBeGreaterThan(0);

    const excelArtifacts = artifacts.filter(a => a.artifactType === 'EXCEL_DOSSIER');
    expect(excelArtifacts.length).toBeGreaterThan(0);
    // Sort descending to get the latest registered artifact
    excelArtifacts.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
    const excelArtifact = excelArtifacts[0];

    expect(excelArtifact).toBeDefined();
    expect(excelArtifact.status).toBe('AVAILABLE');
    expect(fs.existsSync(excelArtifact.storageLocation)).toBe(true);

    // Verify SHA256 integrity of the stored artifact
    const fileBytes = fs.readFileSync(excelArtifact.storageLocation);
    const calculatedHash = crypto.createHash('sha256').update(fileBytes).digest('hex');
    expect(excelArtifact.contentHash).toBe(calculatedHash);
    expect(excelArtifact.fileSize).toBe(fileBytes.length);

    // 6. Directive 7 Invariant Assertions: Absolute Zero Network/Provider Invocations
    expect(trendlyneInvocationCount).toBe(0);
    expect(fereNetworkInvocationCount).toBe(0);
    expect(xbrlNetworkInvocationCount).toBe(0);
    expect(kiteNetworkInvocationCount).toBe(0);
    expect(globalFetchCount).toBe(0);
  });

  it('guarantees that any accidental provider invocation immediately triggers test failure', async () => {
    // Prove that the spies actively intercept and flag illegal calls
    await expect(async () => {
      await globalThis.fetch('https://api.kite.trade/portfolio/holdings');
    }).rejects.toThrow('ILLEGAL_NETWORK_CALL');

    expect(kiteNetworkInvocationCount).toBe(1);
    expect(globalFetchCount).toBe(1);
  });
});
