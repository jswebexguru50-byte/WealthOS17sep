import fs from 'fs';
import path from 'path';

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
  algorithm: string;
  canonicalization: string;
  frozenControlHashes: Record<string, string>;
  repositoryScopeHash: string;
  registryHash: string;
  createdAt: string;
}

export class ResearchSnapshotManager {
  private workspaceRoot: string;

  constructor() {
    this.workspaceRoot = process.cwd();
  }

  public createSnapshot(
    runId: string, 
    gitSha: string, 
    signalLedgerHash: string, 
    datasetHash: string,
    frozenControlHashes: Record<string, string>,
    repositoryScopeHash: string
  ): FastTrackResearchSnapshot {
    const snapshot: FastTrackResearchSnapshot = {
      runId,
      gitSha,
      signalLedgerHash,
      datasetHash,
      components: {
        signalLedgerHash,
        pitUniverseHash: 'HASH_PLACEHOLDER_UNIVERSE',
        ohlcvHash: datasetHash,
        corporateActionsHash: datasetHash,
        intradayHash: 'HASH_PLACEHOLDER_INTRADAY',
        financialHash: 'HASH_PLACEHOLDER_FINANCIAL',
        dependencyGraphHash: 'HASH_PLACEHOLDER_DEPENDENCY'
      },
      algorithm: 'SHA-256',
      canonicalization: 'DEFAULT',
      frozenControlHashes,
      repositoryScopeHash,
      registryHash: 'HASH_PLACEHOLDER_REGISTRY',
      createdAt: new Date().toISOString()
    };

    const outPath = path.join(this.workspaceRoot, 'reports', 'v674-fasttrack', '02_RESEARCH_SNAPSHOT.json');
    fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));

    return snapshot;
  }
}
