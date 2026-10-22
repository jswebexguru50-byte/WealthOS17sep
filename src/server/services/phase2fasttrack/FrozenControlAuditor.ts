import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { execSync } from 'child_process';

const FROZEN_FILES = [
  'src/server/services/PureTechnicalStrategiesEngine.ts',
  'src/server/services/StrategyParameterConfig.ts',
  'src/server/services/SignalQualityOverlay.ts',
  'src/server/services/CapitalProtectionEngine.ts',
  'src/server/services/NewTechnicalStrategiesEngine.ts',
  'src/server/services/UpstoxIntradayIngestor.ts',
  'data/v6.3_REAL_trade_identity_ledger.jsonl'
];

export class FrozenControlAuditor {
  private workspaceRoot: string;

  constructor() {
    this.workspaceRoot = process.cwd();
  }

  private hashFile(filePath: string): string | null {
    const fullPath = path.join(this.workspaceRoot, filePath);
    if (!fs.existsSync(fullPath)) return null;
    const content = fs.readFileSync(fullPath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  public async auditControls(): Promise<boolean> {
    const gitSha = execSync('git rev-parse HEAD').toString().trim();
    
    // We do not have expected SHAs hardcoded, so we will just hash them as they are
    // in the HEAD commit and compare to working tree.
    // However, the instructions say "Before doing anything else, hash these seven files".
    // We will consider "expectedSha256" to be what's in git, and "sha256" what's on disk.
    
    const auditResults = FROZEN_FILES.map(file => {
      let expectedSha256 = null;
      try {
        const gitContent = execSync(`git show HEAD:${file}`).toString();
        expectedSha256 = crypto.createHash('sha256').update(gitContent).digest('hex');
      } catch (e) {
        // File might not exist in git
      }

      const actualSha256 = this.hashFile(file);
      
      return {
        path: file,
        sha256: actualSha256 || 'MISSING',
        expectedSha256: expectedSha256 || 'MISSING',
        unchanged: actualSha256 === expectedSha256
      };
    });

    const allFrozenUnchanged = auditResults.every(r => r.unchanged);

    const report = {
      gitSha,
      files: auditResults,
      allFrozenUnchanged
    };

    const outPath = path.join(this.workspaceRoot, 'reports', 'v674-fasttrack', '00_FROZEN_CONTROL_AUDIT.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

    return allFrozenUnchanged;
  }
}
