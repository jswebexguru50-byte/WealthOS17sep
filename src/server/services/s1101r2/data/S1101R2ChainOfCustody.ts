import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface S1101R2ChainRecord { acquisitionId: string; sourceId: string; sourceTier: number; rawByteHash: string; parsedByteHash: string; canonicalByteHash: string; datasetVersion: string; canonicalEligible: boolean; artifactPath: string; }
const hash = (value: unknown) => createHash('sha256').update(Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value))).digest('hex').toUpperCase();
export class S1101R2ChainOfCustodyManager {
  constructor(private readonly baseDir = 'reports/v674-s1101r2') { fs.mkdirSync(baseDir, { recursive: true }); }
  createRecord(input: any): S1101R2ChainRecord {
    const rec: S1101R2ChainRecord = { ...input, rawByteHash: hash(input.rawBytes), parsedByteHash: hash(input.parsedRecords ?? []), canonicalByteHash: hash(input.canonicalRecords ?? []), canonicalEligible: Boolean(input.rawBytes && input.canonicalRecords), artifactPath: path.join(this.baseDir, `${input.acquisitionId}.json`) };
    fs.writeFileSync(rec.artifactPath, JSON.stringify(rec, null, 2));
    return rec;
  }
}
