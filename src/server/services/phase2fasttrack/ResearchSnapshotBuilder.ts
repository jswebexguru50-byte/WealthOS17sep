/**
 * src/server/services/phase2fasttrack/ResearchSnapshotBuilder.ts
 *
 * Deterministic Provenance and Research Snapshot Builder.
 * Consumes physical evidence artifacts and computes canonical SHA-256 byte hashes.
 * Invariant: mtime, file acquisition timestamps, and operational metadata
 * NEVER influence canonical evidence hashes.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EvidenceArtifact, computeEvidenceArtifact } from './EvidenceArtifact';

export interface ProvenanceEvidenceProvider {
  getPitUniverse(runContext?: Record<string, unknown>): Promise<EvidenceArtifact>;
  getMarketData(runContext?: Record<string, unknown>): Promise<EvidenceArtifact>;
  getCorporateActions(runContext?: Record<string, unknown>): Promise<EvidenceArtifact>;
  getIntradayData(runContext?: Record<string, unknown>): Promise<EvidenceArtifact>;
  getFinancialData(runContext?: Record<string, unknown>): Promise<EvidenceArtifact>;
  getDependencyGraph(runContext?: Record<string, unknown>): Promise<EvidenceArtifact>;
  getRegistry(runContext?: Record<string, unknown>): Promise<EvidenceArtifact>;
}

export class DefaultPhysicalEvidenceProvider implements ProvenanceEvidenceProvider {
  private workspaceRoot: string;

  constructor(workspaceRoot = process.cwd()) {
    this.workspaceRoot = workspaceRoot;
  }

  public async getPitUniverse(): Promise<EvidenceArtifact> {
    const primary = 'data/v6.3_UNIVERSE_INTEGRITY_REPORT.json';
    const fallback = 'reports/v674-phase2/01B_COMMON_UNIVERSE_INTERSECTION_AUDIT.json';
    const chosen = fs.existsSync(path.join(this.workspaceRoot, primary)) ? primary : fallback;
    return computeEvidenceArtifact(chosen, this.workspaceRoot, { sourceSystem: 'WealthOS.PITUniverseEngine' });
  }

  public async getMarketData(): Promise<EvidenceArtifact> {
    const primary = 'reports/v674-phase2/02_CORRECTED_SIGNALS.csv';
    return computeEvidenceArtifact(primary, this.workspaceRoot, { sourceSystem: 'WealthOS.MarketDataStore' });
  }

  public async getCorporateActions(): Promise<EvidenceArtifact> {
    const primary = 'data/v6.3_CORPORATE_ACTION_REPORT.json';
    return computeEvidenceArtifact(primary, this.workspaceRoot, { sourceSystem: 'WealthOS.CorporateActionService' });
  }

  public async getIntradayData(): Promise<EvidenceArtifact> {
    const primary = 'data/v6.3_DATA_CONTRACT.json';
    return computeEvidenceArtifact(primary, this.workspaceRoot, { sourceSystem: 'WealthOS.IntradayIngestor' });
  }

  public async getFinancialData(): Promise<EvidenceArtifact> {
    const primary = 'data/v6.3_DATA_PROVENANCE_REPORT.json';
    return computeEvidenceArtifact(primary, this.workspaceRoot, { sourceSystem: 'WealthOS.FinancialDataEngine' });
  }

  public async getDependencyGraph(): Promise<EvidenceArtifact> {
    const primary = 'reports/v674-fasttrack/CP2.1_DEPENDENCY_MAP.json';
    return computeEvidenceArtifact(primary, this.workspaceRoot, { sourceSystem: 'WealthOS.DependencyAnalyzer' });
  }

  public async getRegistry(): Promise<EvidenceArtifact> {
    const primary = 'data/real_repository_data_manifest.json';
    const fallback = 'data/v6.2.0_frozen_manifest.json';
    const chosen = fs.existsSync(path.join(this.workspaceRoot, primary)) ? primary : fallback;
    return computeEvidenceArtifact(chosen, this.workspaceRoot, { sourceSystem: 'WealthOS.DataRegistry' });
  }
}

export interface ResearchSnapshot {
  runId: string;
  gitSha: string;
  canonicalEvidenceHash: string;
  components: {
    signalLedgerHash: string;
    pitUniverseHash: string;
    ohlcvHash: string;
    corporateActionsHash: string;
    intradayHash: string;
    financialHash: string;
    dependencyGraphHash: string;
    registryHash: string;
  };
  evidenceArtifacts: {
    pitUniverse: EvidenceArtifact;
    marketData: EvidenceArtifact;
    corporateActions: EvidenceArtifact;
    intradayData: EvidenceArtifact;
    financialData: EvidenceArtifact;
    dependencyGraph: EvidenceArtifact;
    registry: EvidenceArtifact;
  };
  algorithm: string;
  canonicalization: string;
  frozenControlHashes: Record<string, string>;
  operationalMetadata: {
    createdAt: string;
    durationMs?: number;
  };
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
    repositoryScopeHash?: string
  ): Promise<ResearchSnapshot> {
    const startTime = Date.now();
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

    // Compute canonical snapshot evidence hash from immutable components only (NO mtime, NO timestamps)
    const sortedFrozen = Object.keys(frozenControlHashes)
      .sort()
      .map(k => `${k}:${frozenControlHashes[k]}`)
      .join(';');

    const canonicalPreimage = [
      `gitSha:${gitSha}`,
      `signalLedger:${signalLedgerHash}`,
      `pitUniverse:${pitUniverse.canonicalHash}`,
      `marketData:${marketData.canonicalHash}`,
      `corporateActions:${corporateActions.canonicalHash}`,
      `intradayData:${intradayData.canonicalHash}`,
      `financialData:${financialData.canonicalHash}`,
      `dependencyGraph:${dependencyGraph.canonicalHash}`,
      `registry:${registry.canonicalHash}`,
      `frozenControls:${sortedFrozen}`
    ].join('|');

    const canonicalEvidenceHash = crypto
      .createHash('sha256')
      .update(canonicalPreimage)
      .digest('hex');

    return {
      runId,
      gitSha,
      canonicalEvidenceHash,
      components: {
        signalLedgerHash,
        pitUniverseHash: pitUniverse.byteHash,
        ohlcvHash: marketData.byteHash,
        corporateActionsHash: corporateActions.byteHash,
        intradayHash: intradayData.byteHash,
        financialHash: financialData.byteHash,
        dependencyGraphHash: dependencyGraph.byteHash,
        registryHash: registry.byteHash
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
      canonicalization: 'CANONICAL_PHYSICAL_BYTES_V2',
      frozenControlHashes,
      operationalMetadata: {
        createdAt: new Date().toISOString(),
        durationMs: Date.now() - startTime
      }
    };
  }
}
