/**
 * src/server/services/phase2fasttrack/EvidenceArtifact.ts
 *
 * Separates physical content identity from filesystem metadata.
 * Filesystem mtime and acquisition timestamps NEVER enter the canonical evidence hash.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface EvidenceMetadata {
  filesystemMtime?: string;
  acquisitionTimestamp?: string;
  sourceSystem?: string;
  recordCount?: number;
}

export interface EvidenceArtifact {
  path: string;
  byteHash: string;
  sizeBytes: number;

  declaredAsOfDate?: string;
  acquisitionTimestamp?: string;

  /**
   * Canonical hash derived strictly from physical content bytes.
   * Invariant: Independent of filesystem mtime, local path variations, or timestamps.
   */
  canonicalHash: string;

  /**
   * Operational metadata kept outside canonical identity
   */
  metadata?: EvidenceMetadata;
}

export function computeEvidenceArtifact(
  relPath: string,
  workspaceRoot: string = process.cwd(),
  options?: {
    sourceSystem?: string;
    declaredAsOfDate?: string;
    recordCountEstimator?: (content: Buffer) => number;
  }
): EvidenceArtifact {
  const fullPath = path.isAbsolute(relPath) ? relPath : path.join(workspaceRoot, relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Evidence artifact does not exist: ${relPath}`);
  }

  const stat = fs.statSync(fullPath);
  const content = fs.readFileSync(fullPath);

  // Pure physical byte hash
  const byteHash = crypto.createHash('sha256').update(content).digest('hex');

  // Canonical hash is strictly derived from physical content
  const canonicalHash = crypto
    .createHash('sha256')
    .update(`CANONICAL_BYTE_EVIDENCE:v1:${stat.size}:${byteHash}`)
    .digest('hex');

  let recordCount = 0;
  if (options?.recordCountEstimator) {
    recordCount = options.recordCountEstimator(content);
  } else if (relPath.endsWith('.json')) {
    try {
      const parsed = JSON.parse(content.toString('utf8'));
      recordCount = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
    } catch {
      recordCount = 1;
    }
  } else if (relPath.endsWith('.csv') || relPath.endsWith('.jsonl')) {
    recordCount = content.toString('utf8').split('\n').filter(l => l.trim().length > 0).length;
    if (relPath.endsWith('.csv') && recordCount > 0) recordCount--;
  }

  return {
    path: relPath.replace(/\\/g, '/'),
    byteHash,
    sizeBytes: stat.size,
    declaredAsOfDate: options?.declaredAsOfDate || '2026-09-19',
    acquisitionTimestamp: stat.mtime.toISOString(),
    canonicalHash,
    metadata: {
      filesystemMtime: stat.mtime.toISOString(),
      acquisitionTimestamp: new Date().toISOString(),
      sourceSystem: options?.sourceSystem || 'WealthOS.EvidenceStore',
      recordCount
    }
  };
}
