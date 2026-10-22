/**
 * src/server/services/phase2fasttrack/CP21EvidenceLoader.ts
 *
 * Physical Evidence Loader for CP21IndependentVerifier.
 * Reads actual bytes from the filesystem, calculates physical SHA-256 hashes,
 * and validates byte-level integrity.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ArtifactReference } from './CP21VerificationEvidence';

export interface LoadedArtifact {
  reference: ArtifactReference;
  exists: boolean;
  actualSha256: string;
  actualBytes: number;
  actualRecords: number;
  content: Buffer;
  error?: string;
}

export class CP21EvidenceLoader {
  constructor(private workspaceRoot = process.cwd()) {}

  public loadArtifact(ref: ArtifactReference): LoadedArtifact {
    const fullPath = path.isAbsolute(ref.path)
      ? ref.path
      : path.join(this.workspaceRoot, ref.path);

    if (!fs.existsSync(fullPath)) {
      return {
        reference: ref,
        exists: false,
        actualSha256: '',
        actualBytes: 0,
        actualRecords: 0,
        content: Buffer.alloc(0),
        error: `Physical artifact missing at ${ref.path}`
      };
    }

    try {
      const content = fs.readFileSync(fullPath);
      const actualBytes = content.length;
      const actualSha256 = crypto.createHash('sha256').update(content).digest('hex');

      let actualRecords = 0;
      if (ref.path.endsWith('.csv') || ref.path.endsWith('.jsonl')) {
        const lines = content.toString('utf8').split('\n').filter(l => l.trim().length > 0);
        actualRecords = ref.path.endsWith('.csv') ? Math.max(0, lines.length - 1) : lines.length;
      } else if (ref.path.endsWith('.json')) {
        try {
          const parsed = JSON.parse(content.toString('utf8'));
          actualRecords = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
        } catch {
          actualRecords = 1;
        }
      }

      return {
        reference: ref,
        exists: true,
        actualSha256,
        actualBytes,
        actualRecords,
        content
      };
    } catch (err: any) {
      return {
        reference: ref,
        exists: false,
        actualSha256: '',
        actualBytes: 0,
        actualRecords: 0,
        content: Buffer.alloc(0),
        error: `Failed to read artifact: ${err.message}`
      };
    }
  }
}
