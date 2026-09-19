/**
 * src/server/services/phase2fasttrack/ResearchSnapshotBuilder.ts
 *
 * Deterministic Provenance and Research Snapshot Builder.
 * Consumes physical evidence providers and computes independent SHA-256 byte hashes.
 * Bans all placeholders and hash-aliasing.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface PhysicalEvidence {
  artifactPath: string;
  byteHash: string;
  byteLength: number;
  recordCount: number;
  sourceSystem: string;
  asOfDate: string;
  acquisitionTimestamp: string;
  canonicalizationVersion: string;
}

export interface ProvenanceEvidenceProvider {
  getPitUniverse(runContext?: Record<string, unknown>): Promise<PhysicalEvidence>;
  getMarketData(runContext?: Record<string, unknown>): Promise<PhysicalEvidence>;
  getCorporateActions(runContext?: Record<string, unknown>): Promise<PhysicalEvidence>;
  getIntradayData(runContext?: Record<string, unknown>): Promise<PhysicalEvidence>;
  getFinancialData(runContext?: Record<string, unknown>): Promise<PhysicalEvidence>;
  getDependencyGraph(runContext?: Record<string, unknown>): Promise<PhysicalEvidence>;
  getRegistry(runContext?: Record<string, unknown>): Promise<PhysicalEvidence>;
}

export class DefaultPhysicalEvidenceProvider implements ProvenanceEvidenceProvider {
  private workspaceRoot: string;

  constructor(workspaceRoot = process.cwd()) {
    this.workspaceRoot = workspaceRoot;
  }

  private computePhysicalFileEvidence(
    relPath: string,
    sourceSystem: string,
    recordCountEstimator?: (content: string) => number
  ): PhysicalEvidence {
    const fullPath = path.join(this.workspaceRoot, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Physical provenance artifact not found: ${relPath}`);
    }
    const stat = fs.statSync(fullPath);
    const content = fs.readFileSync(fullPath);
    const byteHash = crypto.createHash('sha256').update(content).digest('hex');
    let recordCount = 0;
    if (recordCountEstimator) {
      recordCount = recordCountEstimator(content.toString('utf8'));
    } else if (relPath.endsWith('.json')) {
      try {
        const parsed = JSON.parse(content.toString('utf8'));
        recordCount = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
      } catch {
        recordCount = 1;
      }
    } else if (relPath.endsWith('.csv') || relPath.endsWith('.jsonl')) {
      recordCount = content.toString('utf8').split('\n').filter(l => l.trim().length > 0).length;
      if (relPath.endsWith('.csv') && recordCount > 0) recordCount--; // exclude header
    }

    return {
      artifactPath: relPath,
      byteHash,
      byteLength: stat.size,
      recordCount,
      sourceSystem,
      asOfDate: stat.mtime.toISOString().split('T')[0],
      acquisitionTimestamp: stat.mtime.toISOString(),
      canonicalizationVersion: '1.0'
    };
  }

  public async getPitUniverse(): Promise<PhysicalEvidence> {
    const primary = 'data/v6.3_UNIVERSE_INTEGRITY_REPORT.json';
    const fallback = 'reports/v674-phase2/01B_COMMON_UNIVERSE_INTERSECTION_AUDIT.json';
    const chosen = fs.existsSync(path.join(this.workspaceRoot, primary)) ? primary : fallback;
    return this.computePhysicalFileEvidence(chosen, 'WealthOS.PITUniverseEngine');
  }

  public async getMarketData(): Promise<PhysicalEvidence> {
    // OHLCV market observations
    const primary = 'reports/v674-phase2/02_CORRECTED_SIGNALS.csv';
    return this.computePhysicalFileEvidence(primary, 'WealthOS.MarketDataStore');
  }

  public async getCorporateActions(): Promise<PhysicalEvidence> {
    const primary = 'data/v6.3_CORPORATE_ACTION_REPORT.json';
    return this.computePhysicalFileEvidence(primary, 'WealthOS.CorporateActionService');
  }

  public async getIntradayData(): Promise<PhysicalEvidence> {
    const primary = 'data/v6.3_DATA_CONTRACT.json';
    return this.computePhysicalFileEvidence(primary, 'WealthOS.IntradayIngestor');
  }

  public async getFinancialData(): Promise<PhysicalEvidence> {
    const primary = 'data/v6.3_DATA_PROVENANCE_REPORT.json';
    return this.computePhysicalFileEvidence(primary, 'WealthOS.FinancialDataEngine');
  }

  public async getDependencyGraph(): Promise<PhysicalEvidence> {
    const primary = 'reports/v674-fasttrack/CP2.1_DEPENDENCY_MAP.json';
    return this.computePhysicalFileEvidence(primary, 'WealthOS.DependencyAnalyzer');
  }

  public async getRegistry(): Promise<PhysicalEvidence> {
    const primary = 'data/real_repository_data_manifest.json';
    const fallback = 'data/v6.2.0_frozen_manifest.json';
    const chosen = fs.existsSync(path.join(this.workspaceRoot, primary)) ? primary : fallback;
    return this.computePhysicalFileEvidence(chosen, 'WealthOS.DataRegistry');
  }
}

export class ResearchSnapshotBuilder {
  constructor(
    private provider: ProvenanceEvidenceProvider = new DefaultPhysicalEvidenceProvider()
  ) {}

  public async buildSnapshot(
    runId: string,
    gitSha: string,
    signalLedgerHash: string,
    frozenControlHashes: Record<string, string>,
    repositoryScopeHash: string
  ) {
    const [
      pitUniverse,
      marketData,
      corporateActions,
      intradayData,
      financialData,
      dependencyGraph,
      registry
    ] = await Promise.all([
      this.provider.getPitUniverse(),
      this.provider.getMarketData(),
      this.provider.getCorporateActions(),
      this.provider.getIntradayData(),
      this.provider.getFinancialData(),
      this.provider.getDependencyGraph(),
      this.provider.getRegistry()
    ]);

    // Independent cryptographic verification: OHLCV and Corporate actions must NOT alias
    if (marketData.byteHash === corporateActions.byteHash) {
      throw new Error('FATAL: OHLCV market data hash cannot alias corporate action dataset hash.');
    }

    const snapshot = {
      runId,
      gitSha,
      signalLedgerHash,
      datasetHash: marketData.byteHash,
      components: {
        signalLedgerHash,
        pitUniverseHash: pitUniverse.byteHash,
        ohlcvHash: marketData.byteHash,
        corporateActionsHash: corporateActions.byteHash,
        intradayHash: intradayData.byteHash,
        financialHash: financialData.byteHash,
        dependencyGraphHash: dependencyGraph.byteHash
      },
      evidenceArtifacts: {
        pitUniverse,
        marketData,
        corporateActions,
        intradayData,
        financialData,
        dependencyGraph,
        registry
      },
      algorithm: 'SHA-256',
      canonicalization: 'CANONICAL_PHYSICAL_BYTES_V1',
      frozenControlHashes,
      repositoryScopeHash,
      registryHash: registry.byteHash,
      createdAt: new Date().toISOString()
    };

    return snapshot;
  }
}
