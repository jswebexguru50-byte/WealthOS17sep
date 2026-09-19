import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const repoRoot = process.cwd();
const frozenFiles = [
  'src/server/services/PureTechnicalStrategiesEngine.ts',
  'src/server/services/StrategyParameterConfig.ts',
  'src/server/services/SignalQualityOverlay.ts',
  'src/server/services/CapitalProtectionEngine.ts',
  'src/server/services/NewTechnicalStrategiesEngine.ts',
  'src/server/services/UpstoxIntradayIngestor.ts',
  'data/v6.3_REAL_trade_identity_ledger.jsonl',
];

function sha256(filePath: string): string {
  const bytes = fs.readFileSync(path.join(repoRoot, filePath));
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function getBytes(filePath: string): number {
  return fs.statSync(path.join(repoRoot, filePath)).size;
}

function git(command: string): string {
  return execSync(`git ${command}`, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(path.join(repoRoot, filePath));
}

// Ensure working tree is clean
const statusOutput = git('status --porcelain -uno');
const workingTreeClean = statusOutput.length === 0;

if (!workingTreeClean) {
  console.error("STOP: Working tree is dirty. Baseline creation requires a clean tree.");
  console.error(statusOutput);
  process.exit(1);
}

// Verify repository identity
const branch = git('branch --show-current');
const head = git('rev-parse HEAD');
if (branch !== 'ai-review' && branch !== 'main') {
  console.warn(`WARNING: Current branch is ${branch}, expected ai-review or main.`);
}

const baseline = {
  schemaVersion: "D22_FAST_TRACK_BASELINE_V2",
  operationalMetadata: {
    createdAt: new Date().toISOString(),
  },
  baseline: {
    repository: "WealthOS",
    branch: branch,
    head: head,
    baselineCommit: "6d0e78f5b394e882212d67c76edfd21df7705981",
    baselineTree: git('rev-parse 6d0e78f5b394e882212d67c76edfd21df7705981:'),
    constitutionHash: crypto.createHash('sha256').update('D2.2 Fast-Track Constitution').digest('hex'),
    workingTreeClean: workingTreeClean
  },
  frozenControls: Object.fromEntries(
    frozenFiles.map(file => [
      file,
      {
        exists: fileExists(file),
        sha256: fileExists(file) ? sha256(file) : null,
        bytes: fileExists(file) ? getBytes(file) : 0
      },
    ])
  ),
  policy: {
    frozenControlsImmutable: true,
    strategiesImmutable: true,
    syntheticDataForbidden: true,
    futureDataForbidden: true,
    missingDataFailsClosed: true,
    forcePushForbidden: true,
  },
};

const reportDir = path.join(repoRoot, 'reports', 'v65-delivery-2.2');
if (!fs.existsSync(reportDir)) {
  fs.mkdirSync(reportDir, { recursive: true });
}

const manifestPath = path.join(reportDir, 'FAST_TRACK_BASELINE.json');
const manifestContent = JSON.stringify(baseline, null, 2);
fs.writeFileSync(manifestPath, manifestContent);

// Primary anchor: calculate manifest SHA-256 and save
const manifestHash = crypto.createHash('sha256').update(manifestContent, 'utf8').digest('hex');
const anchorContent = `${manifestHash}  FAST_TRACK_BASELINE.json\n`;
fs.writeFileSync(path.join(reportDir, 'FAST_TRACK_BASELINE.sha256'), anchorContent);

console.log('Baseline manifest created successfully.');
console.log(manifestContent);
