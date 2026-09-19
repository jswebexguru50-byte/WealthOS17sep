import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface RawProvenanceRecord {
  recordId: string;
  sourceId: string;
  retrievedAt: string;
  sourceTimestamp: string;
  requestHash: string;
  responseHash: string;
  rawPayloadHash: string;
  securityId: string;
  domain: string;
  dateRange: { start: string | null; end: string | null };
  recordCount: number;
}

export class DataProvenanceLedger {
  private ledgerPath: string;
  private writeStream: fs.WriteStream | null = null;
  private memoryIndex: Map<string, RawProvenanceRecord> = new Map();

  constructor(customPath?: string) {
    this.ledgerPath = customPath || path.resolve('reports/data-acquisition/raw_ledger/provenance_ledger.jsonl');
    fs.mkdirSync(path.dirname(this.ledgerPath), { recursive: true });
    this.loadExistingRecords();
  }

  public appendRawRecord(
    sourceId: string,
    securityId: string,
    domain: string,
    dateRange: { start: string | null; end: string | null },
    rawPayload: any,
    sourceTimestamp?: string
  ): RawProvenanceRecord {
    const payloadStr = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
    const rawPayloadHash = crypto.createHash('sha256').update(payloadStr).digest('hex');
    const requestHash = crypto.createHash('sha256').update(`${sourceId}:${securityId}:${domain}:${dateRange.start}:${dateRange.end}`).digest('hex');
    const retrievedAt = new Date().toISOString();
    const sourceTs = sourceTimestamp || retrievedAt;

    const recordId = `PRV_${crypto.createHash('md5').update(`${requestHash}:${retrievedAt}`).digest('hex')}`;
    const recordCount = Array.isArray(rawPayload) ? rawPayload.length : 1;

    const record: RawProvenanceRecord = {
      recordId,
      sourceId,
      retrievedAt,
      sourceTimestamp: sourceTs,
      requestHash,
      responseHash: rawPayloadHash,
      rawPayloadHash,
      securityId,
      domain,
      dateRange,
      recordCount
    };

    // Append to JSONL ledger
    const line = JSON.stringify(record) + '\n';
    fs.appendFileSync(this.ledgerPath, line, 'utf-8');
    this.memoryIndex.set(record.recordId, record);

    return record;
  }

  public getRecord(recordId: string): RawProvenanceRecord | undefined {
    return this.memoryIndex.get(recordId);
  }

  public getTotalRecordsCount(): number {
    return this.memoryIndex.size;
  }

  public getAllRecords(): RawProvenanceRecord[] {
    return Array.from(this.memoryIndex.values());
  }

  private loadExistingRecords(): void {
    if (!fs.existsSync(this.ledgerPath)) return;
    const content = fs.readFileSync(this.ledgerPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    for (const l of lines) {
      try {
        const rec = JSON.parse(l);
        this.memoryIndex.set(rec.recordId, rec);
      } catch {
        // Ignore partial/corrupt lines
      }
    }
  }
}
