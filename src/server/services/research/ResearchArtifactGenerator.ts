import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ResearchValidationStatus } from './EligibilityEngine';
import { StopTheLineError } from './StopTheLineRegistry';

export class ResearchArtifactGenerator {
  private readonly reportsDir: string;

  constructor(workspaceRoot: string) {
    this.reportsDir = path.join(workspaceRoot, 'reports', 'v672-r2');
  }

  public serializeResult(status: ResearchValidationStatus): void {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }

    // Pure serialization. NO performance constants are calculated here.
    const masterStatusPath = path.join(this.reportsDir, 'MASTER_STATUS.json');
    const content = JSON.stringify(status, null, 2);
    
    fs.writeFileSync(masterStatusPath, content, 'utf-8');

    // Generate hash
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    
    const manifestPath = path.join(this.reportsDir, 'SOURCE_HASH_MANIFEST.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      "MASTER_STATUS.json": hash
    }, null, 2), 'utf-8');
  }

  public generateStandaloneZip(): void {
    // In reality, this will use an archiving library like archiver
    // to bundle the `reports/v672-r2` directory along with the canonical ledger.
    // Must include the ledger per Execution Contract Rule 3.
  }

  public verifySelfConsistency(): void {
    const manifestPath = path.join(this.reportsDir, 'SOURCE_HASH_MANIFEST.json');
    if (!fs.existsSync(manifestPath)) {
      throw new StopTheLineError('NONDETERMINISTIC_ARTIFACT', 'Manifest missing for verification.');
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const [filename, expectedHash] of Object.entries(manifest)) {
      const filepath = path.join(this.reportsDir, filename);
      if (!fs.existsSync(filepath)) {
        throw new StopTheLineError('NONDETERMINISTIC_ARTIFACT', `File ${filename} missing from package.`);
      }

      const content = fs.readFileSync(filepath, 'utf8');
      const actualHash = crypto.createHash('sha256').update(content).digest('hex');

      if (actualHash !== expectedHash) {
        throw new StopTheLineError('NONDETERMINISTIC_ARTIFACT', `Artifact hash mismatch for ${filename}. Expected ${expectedHash}, got ${actualHash}`);
      }
    }
  }
}
