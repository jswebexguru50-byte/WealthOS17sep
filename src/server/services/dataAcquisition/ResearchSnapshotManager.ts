import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface ResearchSnapshotMetadata {
  snapshotId: string;
  createdAt: string;
  domain: string;
  recordCount: number;
  universeSize: number;
  coveragePct: number;
  sha256Hash: string;
  isResearchReady: boolean;
}

export class ResearchSnapshotManager {
  private snapshotDir: string;

  constructor(customDir?: string) {
    this.snapshotDir = customDir || path.resolve('reports/data-acquisition/snapshots');
    fs.mkdirSync(this.snapshotDir, { recursive: true });
  }

  public createSnapshot(
    domain: string,
    records: any[],
    universeSize: number,
    coveragePct: number
  ): ResearchSnapshotMetadata {
    if (coveragePct < 90.0) {
      throw new Error(`STOP_THE_LINE: Incomplete data cannot be marked research-ready. Coverage is only ${coveragePct.toFixed(2)}% (minimum 90.0% required).`);
    }

    const createdAt = new Date().toISOString();
    const payloadStr = JSON.stringify(records);
    const sha256Hash = crypto.createHash('sha256').update(payloadStr).digest('hex');
    const snapshotId = `SNAP_${domain}_${Date.now()}`;

    const metadata: ResearchSnapshotMetadata = {
      snapshotId,
      createdAt,
      domain,
      recordCount: records.length,
      universeSize,
      coveragePct,
      sha256Hash,
      isResearchReady: true
    };

    const outPath = path.join(this.snapshotDir, `${snapshotId}.json`);
    fs.writeFileSync(outPath, JSON.stringify({ metadata, data: records }, null, 2));

    return metadata;
  }
}
