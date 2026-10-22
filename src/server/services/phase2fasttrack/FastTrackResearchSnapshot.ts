/**
 * src/server/services/phase2fasttrack/FastTrackResearchSnapshot.ts
 *
 * FastTrack Research Snapshot Interface & Manager.
 * Backed by deterministic physical byte evidence from ResearchSnapshotBuilder.
 */

import fs from 'fs';
import path from 'path';
import { ResearchSnapshotBuilder, PhysicalEvidence } from './ResearchSnapshotBuilder';

export interface FastTrackResearchSnapshot {
  runId: string;
  gitSha: string;
  signalLedgerHash: string;
  datasetHash: string;
  components: {
    signalLedgerHash: string;
    pitUniverseHash: string;
    ohlcvHash: string;
    corporateActionsHash: string;
    intradayHash: string;
    financialHash: string;
    dependencyGraphHash: string;
  };
  evidenceArtifacts?: {
    pitUniverse: PhysicalEvidence;
    marketData: PhysicalEvidence;
    corporateActions: PhysicalEvidence;
    intradayData: PhysicalEvidence;
    financialData: PhysicalEvidence;
    dependencyGraph: PhysicalEvidence;
    registry: PhysicalEvidence;
  };
  algorithm: string;
  canonicalization: string;
  frozenControlHashes: Record<string, string>;
  repositoryScopeHash: string;
  registryHash: string;
  createdAt: string;
}

export class ResearchSnapshotManager {
  private workspaceRoot: string;
  private builder: ResearchSnapshotBuilder;

  constructor(workspaceRoot = process.cwd()) {
    this.workspaceRoot = workspaceRoot;
    this.builder = new ResearchSnapshotBuilder();
  }

  public async createSnapshot(
    runId: string,
    gitSha: string,
    signalLedgerHash: string,
    datasetHash: string,
    frozenControlHashes: Record<string, string>,
    repositoryScopeHash: string
  ): Promise<FastTrackResearchSnapshot> {
    const rawSnapshot = await this.builder.buildSnapshot(
      runId,
      gitSha,
      signalLedgerHash,
      frozenControlHashes
    );

    const snapshot: FastTrackResearchSnapshot = {
      ...rawSnapshot,
      signalLedgerHash,
      datasetHash,
      repositoryScopeHash,
      registryHash: rawSnapshot.components.registryHash || '',
      createdAt: rawSnapshot.operationalMetadata.createdAt || new Date().toISOString()
    };

    const outPath = path.join(this.workspaceRoot, 'reports', 'v674-fasttrack', '02_RESEARCH_SNAPSHOT.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));

    return snapshot;
  }
}
