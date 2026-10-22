import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AgentStatus,
  EvidenceRecord,
  ConflictRecord,
  DatasetVersion,
  ArtifactManifestEntry,
} from './S1101R2Types';

export type { ConflictRecord };

export interface FrozenControlEntry {
  path: string;
  expectedHash: string;
  actualHash: string;
  status: 'PASS' | 'FAIL';
}

export const FROZEN_FILES_EXPECTED_S1101R2: Record<string, string> = {
  'src/server/services/PureTechnicalStrategiesEngine.ts': '825FA6C067CF26AB28E15451ABEA80E1015EA15A8F24145102F7FC054977A2A3',
  'src/server/services/StrategyParameterConfig.ts': '901CA7A27B2EB4E09183426C9E0DFD7B812AEEBF84472B49B9F829661FE7194B',
  'src/server/services/SignalQualityOverlay.ts': 'C41CDDB152C150BEA932A8B9BD8FCC6EA01A03A2BA030A723789AAADA5C17452',
  'src/server/services/CapitalProtectionEngine.ts': '63B8317889F5A60E9462F883E89ACB57FE99E819935EC8F7B30036ECFE4ED753',
  'src/server/services/NewTechnicalStrategiesEngine.ts': '78415BA3C74CA6A9CC2FCC96D2E54BA871E9BCA73FC6E078570C412781B1D354',
  'src/server/services/UpstoxIntradayIngestor.ts': '0F1C96D0E0C704672517F378990E17FACDCED7BFBF359DAF9C6F37333BE1B151',
  'data/v6.3_REAL_trade_identity_ledger.jsonl': '035D8867F1F8DBC65F9FE35EA45263F20F9FEE00A48D3D7F48807C24A2AFD485',
};

export function sha256Bytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

export function sha256File(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    return 'FILE_NOT_FOUND';
  }
  const bytes = fs.readFileSync(filePath);
  return sha256Bytes(bytes);
}

export function sha256Canonical(value: unknown): string {
  const canonical = JSON.stringify(value, Object.keys(value as object).sort());
  return createHash('sha256').update(Buffer.from(canonical, 'utf8')).digest('hex').toUpperCase();
}

export class S1101R2MasterLedger {
  private baseDir: string;
  private agentsDir: string;

  constructor(baseDir = 'reports/v674-s1101r2') {
    this.baseDir = baseDir;
    this.agentsDir = path.join(baseDir, 'agents');
    this.ensureDirs();
  }

  public ensureDirs(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    if (!fs.existsSync(this.agentsDir)) {
      fs.mkdirSync(this.agentsDir, { recursive: true });
    }
  }

  public verifyFrozenControls(): FrozenControlEntry[] {
    const results: FrozenControlEntry[] = [];
    for (const [relPath, expectedHash] of Object.entries(FROZEN_FILES_EXPECTED_S1101R2)) {
      const fullPath = path.resolve(process.cwd(), relPath);
      const actualHash = sha256File(fullPath);
      const pass = actualHash.toUpperCase() === expectedHash.toUpperCase();
      results.push({
        path: relPath,
        expectedHash,
        actualHash,
        status: pass ? 'PASS' : 'FAIL',
      });
    }

    const manifestPath = path.join(this.baseDir, 'S1101R2_FROZEN_CONTROL_AUDIT.json');
    fs.writeFileSync(manifestPath, JSON.stringify(results, null, 2));
    return results;
  }

  public updateAgentStatus(status: AgentStatus): void {
    this.ensureDirs();
    const filePath = path.join(this.agentsDir, `${status.agentId.toLowerCase()}_status.json`);
    fs.writeFileSync(filePath, JSON.stringify(status, null, 2));
    this.rebuildConsolidatedAgentStatus();
  }

  public rebuildConsolidatedAgentStatus(): void {
    const files = fs.readdirSync(this.agentsDir).filter((f) => f.endsWith('_status.json'));
    const allAgents: Record<string, AgentStatus> = {};
    for (const f of files) {
      const p = path.join(this.agentsDir, f);
      try {
        const content = JSON.parse(fs.readFileSync(p, 'utf8')) as AgentStatus;
        allAgents[content.agentId] = content;
      } catch {
        // Skip partial write read races
      }
    }
    fs.writeFileSync(
      path.join(this.baseDir, '02_S1101R2_AGENT_STATUS.json'),
      JSON.stringify(allAgents, null, 2)
    );
  }

  public recordEvidence(records: EvidenceRecord[]): void {
    this.ensureDirs();
    const ledgerFile = path.join(this.baseDir, '01_S1101R2_MASTER_EVIDENCE_LEDGER.json');
    let existing: EvidenceRecord[] = [];
    if (fs.existsSync(ledgerFile)) {
      try {
        existing = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
      } catch {
        existing = [];
      }
    }
    const map = new Map<string, EvidenceRecord>();
    for (const item of existing) map.set(item.evidenceId, item);
    for (const item of records) map.set(item.evidenceId, item);

    const updated = Array.from(map.values());
    fs.writeFileSync(ledgerFile, JSON.stringify(updated, null, 2));
  }

  public recordConflicts(conflicts: ConflictRecord[]): void {
    this.ensureDirs();
    const confFile = path.join(this.baseDir, '03_S1101R2_CONFLICT_REGISTER.json');
    let existing: ConflictRecord[] = [];
    if (fs.existsSync(confFile)) {
      try {
        existing = JSON.parse(fs.readFileSync(confFile, 'utf8'));
      } catch {
        existing = [];
      }
    }
    const map = new Map<string, ConflictRecord>();
    for (const item of existing) map.set(item.conflictId, item);
    for (const item of conflicts) map.set(item.conflictId, item);

    const updated = Array.from(map.values());
    fs.writeFileSync(confFile, JSON.stringify(updated, null, 2));
  }

  public updateDatasetVersion(version: DatasetVersion): void {
    this.ensureDirs();
    fs.writeFileSync(
      path.join(this.baseDir, '04_S1101R2_DATASET_VERSION.json'),
      JSON.stringify(version, null, 2)
    );
  }

  public registerArtifact(entry: ArtifactManifestEntry): void {
    this.ensureDirs();
    const manifestFile = path.join(this.baseDir, '05_S1101R2_ARTIFACT_MANIFEST.json');
    let existing: ArtifactManifestEntry[] = [];
    if (fs.existsSync(manifestFile)) {
      try {
        existing = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      } catch {
        existing = [];
      }
    }
    const filtered = existing.filter((e) => e.path !== entry.path);
    filtered.push(entry);
    fs.writeFileSync(manifestFile, JSON.stringify(filtered, null, 2));
  }

  public logDecision(entry: { decisionId: string; title: string; reasoning: string; timestamp: string }): void {
    this.ensureDirs();
    const logPath = path.join(this.baseDir, '06_S1101R2_DECISION_LOG.json');
    let existing: unknown[] = [];
    if (fs.existsSync(logPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      } catch {
        existing = [];
      }
    }
    existing.push(entry);
    fs.writeFileSync(logPath, JSON.stringify(existing, null, 2));
  }

  public updateMasterProgressBoard(params: {
    phase: string;
    overallPercent: number;
    agentsActive: number;
    criticalFindings: number;
    highFindings: number;
    openConflicts: number;
    dataGaps: number;
    acquisitions: number;
    reAudits: number;
    datasetVersion: string;
    datasetHash: string;
    computedStatus: string;
  }): void {
    this.ensureDirs();
    const boardPath = path.join(this.baseDir, '00_S1101R2_MASTER_PROGRESS.md');
    const md = `====================================================
WEALTHOS S1101R2 — LIVE GOVERNANCE CONTROL BOARD
====================================================

Dataset:
  version: ${params.datasetVersion}
  hash: ${params.datasetHash}

PHASE: ${params.phase}
OVERALL: ${params.overallPercent}%

AGENTS ACTIVE: ${params.agentsActive}
DATA GAPS: ${params.dataGaps}
ACQUISITIONS COMPLETED: ${params.acquisitions}
RE-AUDITS QUEUED: ${params.reAudits}

CRITICAL FINDINGS: ${params.criticalFindings}
HIGH FINDINGS: ${params.highFindings}
OPEN CONFLICTS: ${params.openConflicts}

CURRENT GOVERNANCE STATUS: ${params.computedStatus}

CAPITAL ELIGIBLE: FALSE
PRODUCTION: FALSE
LIVE: FALSE

LAST UPDATE: ${new Date().toISOString()}
====================================================
`;
    fs.writeFileSync(boardPath, md);
  }
}
