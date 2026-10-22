import { S1101R2MasterLedger } from '../S1101R2MasterLedger';
import { AgentStatus, EvidenceRecord, ConflictRecord, DatasetVersion } from '../S1101R2Types';

export class S1101R2MasterCoordinator {
  private baseDir: string;
  private ledger: S1101R2MasterLedger;

  constructor(baseDir = 'reports/v674-s1101r2', ledger?: S1101R2MasterLedger) {
    this.baseDir = baseDir;
    this.ledger = ledger || new S1101R2MasterLedger(baseDir);
  }

  public ingestAgentStatus(status: AgentStatus): void {
    this.ledger.updateAgentStatus(status);
  }

  public ingestEvidence(evidence: EvidenceRecord): void {
    this.ledger.recordEvidence([evidence]);
  }

  public registerConflict(conflict: ConflictRecord): void {
    this.ledger.recordConflicts([conflict]);
  }

  public invalidateDependentAudits(changedDatasetDomains: string[]): void {
    this.ledger.logDecision({
      decisionId: `DEC-INV-${Date.now()}`,
      title: 'Dependency-Aware Audit Invalidation',
      reasoning: `Dataset changed in domains [${changedDatasetDomains.join(', ')}]. Queueing re-audit for dependent strategy and downstream components.`,
      timestamp: new Date().toISOString(),
    });
  }

  public publishProgress(): void {
    this.ledger.rebuildConsolidatedAgentStatus();
  }
}
