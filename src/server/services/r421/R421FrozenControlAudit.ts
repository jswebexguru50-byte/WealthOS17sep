import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface FrozenFileAuditResult {
  path: string;
  expectedSha256: string;
  currentSha256: string;
  fileSizeBytes: number;
  match: boolean;
}

export interface FrozenControlAuditSummary {
  timestamp: string;
  status: 'VERIFIED' | 'MISMATCH_DETECTED';
  totalControls: number;
  matchedControls: number;
  results: FrozenFileAuditResult[];
}

export class R421FrozenControlAudit {
  public static auditFrozenControls(manifestPath: string = 'config/v67/FROZEN_V63_CONTROL_MANIFEST.json'): FrozenControlAuditSummary {
    const manifestContent = fs.readFileSync(path.resolve(manifestPath), 'utf-8');
    const manifest = JSON.parse(manifestContent);
    const results: FrozenFileAuditResult[] = [];
    let matchedCount = 0;

    for (const art of manifest.artifacts) {
      const fullPath = path.resolve(art.path);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`STOP_THE_LINE: Frozen file missing at ${art.path}`);
      }
      const fileContent = fs.readFileSync(fullPath);
      const currentSha = crypto.createHash('sha256').update(fileContent).digest('hex');
      const match = currentSha === art.sha256;
      if (match) matchedCount++;

      results.push({
        path: art.path,
        expectedSha256: art.sha256,
        currentSha256: currentSha,
        fileSizeBytes: fs.statSync(fullPath).size,
        match
      });
    }

    const allMatched = matchedCount === manifest.artifacts.length;
    if (!allMatched) {
      throw new Error(`STOP_THE_LINE: Frozen control mismatch detected! ${matchedCount}/${manifest.artifacts.length} matched.`);
    }

    return {
      timestamp: new Date().toISOString(),
      status: allMatched ? 'VERIFIED' : 'MISMATCH_DETECTED',
      totalControls: manifest.artifacts.length,
      matchedControls: matchedCount,
      results
    };
  }
}
