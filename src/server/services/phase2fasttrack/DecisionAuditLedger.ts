import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface DecisionAuditRecord {
  auditRecordId: string;
  runId: string;
  checkpoint: string;
  decisionType: string;
  subjectId: string;
  parentArtifactHash?: string;
  inputHash: string;
  outputHash: string;
  predicateResults: Record<string, boolean>;
  status: "PASS" | "FAIL" | "BLOCKED" | "LIMITATION";
  reasonCodes: string[];
  createdAt: string;
  previousRecordHash?: string;
  recordHash: string;
}

export class DecisionAuditLedger {
  private records: DecisionAuditRecord[] = [];
  private ledgerPath: string;

  constructor(runId: string) {
    this.ledgerPath = path.join(process.cwd(), 'reports', 'v674-fasttrack', `DecisionAuditLedger_${runId}.jsonl`);
    this.initLedger();
  }

  private initLedger() {
    if (fs.existsSync(this.ledgerPath)) {
      const lines = fs.readFileSync(this.ledgerPath, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        this.records.push(JSON.parse(line));
      }
    }
  }

  public appendRecord(
    runId: string,
    checkpoint: string,
    decisionType: string,
    subjectId: string,
    inputHash: string,
    outputHash: string,
    predicateResults: Record<string, boolean>,
    status: "PASS" | "FAIL" | "BLOCKED" | "LIMITATION",
    reasonCodes: string[],
    parentArtifactHash?: string
  ): DecisionAuditRecord {
    const previousRecordHash = this.records.length > 0 ? this.records[this.records.length - 1].recordHash : undefined;
    const auditRecordId = `REC-${runId}-${String(this.records.length + 1).padStart(6, '0')}`;
    const createdAt = new Date().toISOString();

    const payload = JSON.stringify({
      auditRecordId,
      runId,
      checkpoint,
      decisionType,
      subjectId,
      parentArtifactHash,
      inputHash,
      outputHash,
      predicateResults,
      status,
      reasonCodes,
      createdAt,
      previousRecordHash
    });

    const recordHash = crypto.createHash('sha256').update(payload).digest('hex');

    const record: DecisionAuditRecord = {
      auditRecordId,
      runId,
      checkpoint,
      decisionType,
      subjectId,
      parentArtifactHash,
      inputHash,
      outputHash,
      predicateResults,
      status,
      reasonCodes,
      createdAt,
      previousRecordHash,
      recordHash
    };

    this.records.push(record);
    
    // Append to file
    fs.mkdirSync(path.dirname(this.ledgerPath), { recursive: true });
    fs.appendFileSync(this.ledgerPath, JSON.stringify(record) + '\n', 'utf8');

    return record;
  }

  public verifyChain(): boolean {
    for (let i = 0; i < this.records.length; i++) {
      const current = this.records[i];
      
      if (i > 0) {
          const prev = this.records[i - 1];
          if (current.previousRecordHash !== prev.recordHash) {
            return false;
          }
      }

      const payload = JSON.stringify({
        auditRecordId: current.auditRecordId,
        runId: current.runId,
        checkpoint: current.checkpoint,
        decisionType: current.decisionType,
        subjectId: current.subjectId,
        parentArtifactHash: current.parentArtifactHash,
        inputHash: current.inputHash,
        outputHash: current.outputHash,
        predicateResults: current.predicateResults,
        status: current.status,
        reasonCodes: current.reasonCodes,
        createdAt: current.createdAt,
        previousRecordHash: current.previousRecordHash
      });
      const computedHash = crypto.createHash('sha256').update(payload).digest('hex');

      if (computedHash !== current.recordHash) {
        return false;
      }
    }
    return true;
  }

  public finalizeLedger(snapshotHash: string): string {
    const records = this.getRecords();
    const expectedRecordCount = records.length;
    const expectedFinalRecordHash = expectedRecordCount > 0 ? records[expectedRecordCount - 1].recordHash : null;
    const ledgerFileHash = crypto.createHash('sha256').update(fs.readFileSync(this.ledgerPath)).digest('hex');
    
    const manifest = {
      ledgerRunId: records.length > 0 ? records[0].runId : null,
      firstRecordHash: records.length > 0 ? records[0].recordHash : null,
      expectedRecordCount,
      expectedFinalRecordHash,
      ledgerFileHash,
      previousLedgerHeadHash: records.length > 1 ? records[expectedRecordCount - 2].recordHash : null,
      snapshotHash,
      finalizedAt: new Date().toISOString()
    };
    
    const manifestPath = this.ledgerPath.replace('.jsonl', '_MANIFEST.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    return manifestPath;
  }

  public static verifyAnchoredLedger(manifestPath: string, ledgerPath: string): boolean {
    if (!fs.existsSync(manifestPath) || !fs.existsSync(ledgerPath)) return false;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    // Check file hash
    const currentFileHash = crypto.createHash('sha256').update(fs.readFileSync(ledgerPath)).digest('hex');
    if (currentFileHash !== manifest.ledgerFileHash) return false;
    
    // Check records
    const lines = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean);
    if (lines.length !== manifest.expectedRecordCount) return false;
    if (lines.length === 0) return true;
    
    const firstRecord = JSON.parse(lines[0]);
    if (firstRecord.recordHash !== manifest.firstRecordHash) return false;
    if (firstRecord.runId !== manifest.ledgerRunId) return false;
    
    const finalRecord = JSON.parse(lines[lines.length - 1]);
    if (finalRecord.recordHash !== manifest.expectedFinalRecordHash) return false;
    
    // Let instance verify chain
    const runId = firstRecord.runId;
    const ledger = new DecisionAuditLedger(runId);
    // Note: DecisionAuditLedger constructor automatically reads the file path
    // Let's explicitly set the path and init to be sure
    ledger.ledgerPath = ledgerPath;
    ledger.records = [];
    for (const line of lines) {
      ledger.records.push(JSON.parse(line));
    }
    return ledger.verifyChain();
  }

  public getRecords(): DecisionAuditRecord[] {
    return [...this.records];
  }
}
