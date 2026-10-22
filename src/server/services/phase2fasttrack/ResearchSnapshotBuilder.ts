/**
 * src/server/services/phase2fasttrack/ResearchSnapshotBuilder.ts
 *
 * Deterministic Provenance and Research Snapshot Builder.
 * Consumes physical evidence artifacts and computes canonical SHA-256 byte hashes.
 *
 * Strict separation:
 * 1. canonicalEvidenceHash: Derived strictly from physical data source bytes
 *    (signalLedger, marketData, corporateActions, pitUniverse, intraday, financials, dependencyGraph, registry).
 *    Independent of gitSha, filesystem mtime, or timestamps.
 * 2. implementationHash: Captures gitSha and frozen control code state.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EvidenceArtifact, computeEvidenceArtifact } from './EvidenceArtifact';

export type PhysicalEvidence = EvidenceArtifact;

export interface ProvenanceEvidenceProvider {
  getSignalLedger(runContext?: Record<string, unknown>): Promise<EvidenceArtifact>;
  getMarketData(runContext?: Record<string, unknown>): Promise<EvidenceArtifact>;
  getCorporateActions(runContext?: Record<string, unknown>): Promise<EvidenceArtifact>;
  getPitUniverse(runContext?: Record<string, unknown>): Promise<EvidenceArtifact>;
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

  public async getSignalLedger(): Promise<EvidenceArtifact> {
    const primary = 'reports/v674-phase2/02_CORRECTED_SIGNALS.csv';
    return computeEvidenceArtifact(primary, this.workspaceRoot, { sourceSystem: 'WealthOS.SignalLedgerStore' });
  }

  public async getMarketData(): Promise<EvidenceArtifact> {
    const primary = 'data/v6.3_DATA_CONTRACT.json';
    const fallback = 'data/real_repository_data_manifest.json';
    const chosen = fs.existsSync(path.join(this.workspaceRoot, primary)) ? primary : fallback;
    return computeEvidenceArtifact(chosen, this.workspaceRoot, { sourceSystem: 'WealthOS.MarketDataStore' });
  }

  public async getCorporateActions(): Promise<EvidenceArtifact> {
    const primary = 'data/v6.3_CORPORATE_ACTION_REPORT.json';
    return computeEvidenceArtifact(primary, this.workspaceRoot, { sourceSystem: 'WealthOS.CorporateActionService' });
  }

  public async getPitUniverse(): Promise<EvidenceArtifact> {
    const primary = 'data/v6.3_UNIVERSE_INTEGRITY_REPORT.json';
    const fallback = 'reports/v674-phase2/01B_COMMON_UNIVERSE_INTERSECTION_AUDIT.json';
    const chosen = fs.existsSync(path.join(this.workspaceRoot, primary)) ? primary : fallback;
    return computeEvidenceArtifact(chosen, this.workspaceRoot, { sourceSystem: 'WealthOS.PITUniverseEngine' });
  }

  public async getIntradayData(): Promise<EvidenceArtifact> {
    const primary = 'data/v6.3_DATA_PROVENANCE_REPORT.json';
    return computeEvidenceArtifact(primary, this.workspaceRoot, { sourceSystem: 'WealthOS.IntradayIngestor' });
  }

  public async getFinancialData(): Promise<EvidenceArtifact> {
    const primary = 'data/v6.3_PILOT_COVERAGE_AUDIT.json';
    const fallback = 'data/v6.3_ablation_results.json';
    const chosen = fs.existsSync(path.join(this.workspaceRoot, primary)) ? primary : fallback;
    return computeEvidenceArtifact(chosen, this.workspaceRoot, { sourceSystem: 'WealthOS.FinancialDataEngine' });
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
  implementationHash: string;
  components: {
    signalLedgerHash: string;
    ohlcvHash: string;
    corporateActionsHash: string;
    pitUniverseHash: string;
    intradayHash: string;
    financialHash: string;
    dependencyGraphHash: string;
    registryHash: string;
  };
  evidenceArtifacts: {
    signalLedger: EvidenceArtifact;
    marketData: EvidenceArtifact;
    corporateActions: EvidenceArtifact;
    pitUniverse: EvidenceArtifact;
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
    signalLedgerHashOverride?: string,
    frozenControlHashes: Record<string, string> = {}
  ): Promise<ResearchSnapshot> {
    const startTime = Date.now();
    const [
      signalLedger,
      marketData,
      corporateActions,
      pitUniverse,
      intradayData,
      financialData,
      dependencyGraph,
      registry
    ] = await Promise.all([
      this.provider.getSignalLedger(),
      this.provider.getMarketData(),
      this.provider.getCorporateActions(),
      this.provider.getPitUniverse(),
      this.provider.getIntradayData(),
      this.provider.getFinancialData(),
      this.provider.getDependencyGraph(),
      this.provider.getRegistry()
    ]);

    if (
      signalLedgerHashOverride !== undefined &&
      signalLedgerHashOverride !== signalLedger.byteHash
    ) {
      throw new Error(
        'FATAL: signalLedgerHashOverride does not match physical signal ledger SHA-256'
      );
    }

    const signalLedgerHash = signalLedger.byteHash;

    // Independent cryptographic verification: Signal ledger, market data, and corporate actions must NOT alias
    if (signalLedgerHash === marketData.byteHash) {
      throw new Error('FATAL: Signal ledger hash cannot alias market data hash.');
    }
    if (marketData.byteHash === corporateActions.byteHash) {
      throw new Error('FATAL: Market data hash cannot alias corporate action dataset hash.');
    }

    // 1. canonicalEvidenceHash: Pure physical evidence observed (NO gitSha, NO mtime, NO timestamps)
    const canonicalEvidencePreimage = [
      `signalLedger:${signalLedger.canonicalHash}`,
      `marketData:${marketData.canonicalHash}`,
      `corporateActions:${corporateActions.canonicalHash}`,
      `pitUniverse:${pitUniverse.canonicalHash}`,
      `intradayData:${intradayData.canonicalHash}`,
      `financialData:${financialData.canonicalHash}`,
      `dependencyGraph:${dependencyGraph.canonicalHash}`,
      `registry:${registry.canonicalHash}`
    ].join('|');

    const canonicalEvidenceHash = crypto
      .createHash('sha256')
      .update(canonicalEvidencePreimage)
      .digest('hex');

    // 2. implementationHash: Captures repository SHA and frozen controls
    const sortedFrozen = Object.keys(frozenControlHashes)
      .sort()
      .map(k => `${k}:${frozenControlHashes[k]}`)
      .join(';');

    const implementationPreimage = `gitSha:${gitSha}|frozenControls:${sortedFrozen}`;
    const implementationHash = crypto
      .createHash('sha256')
      .update(implementationPreimage)
      .digest('hex');

    return {
      runId,
      gitSha,
      canonicalEvidenceHash,
      implementationHash,
      components: {
        signalLedgerHash,
        ohlcvHash: marketData.byteHash,
        corporateActionsHash: corporateActions.byteHash,
        pitUniverseHash: pitUniverse.byteHash,
        intradayHash: intradayData.byteHash,
        financialHash: financialData.byteHash,
        dependencyGraphHash: dependencyGraph.byteHash,
        registryHash: registry.byteHash
      },
      evidenceArtifacts: {
        signalLedger,
        marketData,
        corporateActions,
        pitUniverse,
        intradayData,
        financialData,
        dependencyGraph,
        registry
      },
      algorithm: 'SHA-256',
      canonicalization: 'CANONICAL_PHYSICAL_BYTES_V3',
      frozenControlHashes,
      operationalMetadata: {
        createdAt: new Date().toISOString(),
        durationMs: Date.now() - startTime
      }
    };
  }
}


