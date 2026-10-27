import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface S1101RChainRecord {
  acquisitionId: string; sourceRegistryId: string; sourceTier: number; sourceName: string;
  sourceEndpoint: string; rawByteHash: string; parsedByteHash: string; canonicalByteHash: string;
  securityCount: number; dateMin: string; dateMax: string; parentDatasetHash: string;
  status: 'CANONICAL_ELIGIBLE' | 'REJECTED'; artifactPath: string;
}
const hash = (value: unknown) => createHash('sha256').update(Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value))).digest('hex').toUpperCase();

export class S1101RChainOfCustodyManager {
  constructor(private readonly baseDir = 'reports/v674-s1101r') { fs.mkdirSync(baseDir, { recursive: true }); }
  createRecord(input: any): S1101RChainRecord {
    const rawByteHash = hash(input.rawBytes);
    const parsedByteHash = hash(input.parsedRecords ?? []);
    const canonicalByteHash = hash(input.canonicalRecords ?? []);
    const record: S1101RChainRecord = { ...input, rawByteHash, parsedByteHash, canonicalByteHash, status: input.rawBytes && input.canonicalRecords ? 'CANONICAL_ELIGIBLE' : 'REJECTED', artifactPath: path.join(this.baseDir, `${input.acquisitionId}.json`) };
    fs.writeFileSync(record.artifactPath, JSON.stringify(record, null, 2));
    return record;
  }
}
