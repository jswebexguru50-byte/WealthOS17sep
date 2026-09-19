import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { StopTheLineError } from './StopTheLineRegistry';

export interface FrozenVerificationResult {
  status: 'PASS' | 'FAIL';
  failures: string[];
}

export class FrozenControlValidator {
  public static verifyFrozenControlManifest(workspaceRoot: string): FrozenVerificationResult {
    const manifestPath = path.join(workspaceRoot, 'config/v67/FROZEN_V63_CONTROL_MANIFEST.json');
    if (!fs.existsSync(manifestPath)) {
      throw new StopTheLineError('FROZEN_CONTROL_HASH_MISMATCH', 'Frozen manifest not found.');
    }

    const manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const artifacts = manifestData.artifacts || manifestData.files || [];
    const failures: string[] = [];

    for (const artifact of artifacts) {
      const artifactPath = path.join(workspaceRoot, artifact.path);
      if (!fs.existsSync(artifactPath)) {
        failures.push(`Missing frozen artifact: ${artifact.path}`);
        continue;
      }

      const content = fs.readFileSync(artifactPath);
      const actualHash = crypto.createHash('sha256').update(content).digest('hex');

      if (actualHash !== artifact.sha256) {
        failures.push(`Hash mismatch for ${artifact.path}. Expected: ${artifact.sha256}, Actual: ${actualHash}`);
      }
    }

    if (failures.length > 0) {
      throw new StopTheLineError('FROZEN_CONTROL_HASH_MISMATCH', failures.join('; '));
    }

    return { status: 'PASS', failures: [] };
  }
}
