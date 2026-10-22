import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const repoRoot = process.cwd();

const CP21_BASELINE_COMMIT =
  '6d0e78f5b394e882212d67c76edfd21df7705981';

const CONSTITUTION_PATH =
  'reports/v65-delivery-2.2/D22_FAST_TRACK_CONSTITUTION.md';

const frozenFiles = [
  'src/server/services/PureTechnicalStrategiesEngine.ts',
  'src/server/services/StrategyParameterConfig.ts',
  'src/server/services/SignalQualityOverlay.ts',
  'src/server/services/CapitalProtectionEngine.ts',
  'src/server/services/NewTechnicalStrategiesEngine.ts',
  'src/server/services/UpstoxIntradayIngestor.ts',
  'data/v6.3_REAL_trade_identity_ledger.jsonl',
] as const;

function git(command: string): string {
  return execSync(`git ${command}`, {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
}

function sha256Bytes(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256File(relativePath: string): string {
  return sha256Bytes(
    fs.readFileSync(path.join(repoRoot, relativePath)),
  );
}

function fileBytes(relativePath: string): number {
  return fs.statSync(path.join(repoRoot, relativePath)).size;
}

function exists(relativePath: string): boolean {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function fail(message: string): never {
  console.error(`STOP: ${message}`);
  process.exit(1);
}

/*
 * Baseline creation itself must begin from a genuinely clean tree.
 * Do not use -uno: untracked files are relevant to an integrity baseline.
 */
const status = git('status --porcelain');

if (status.length > 0) {
  fail(
    `Working tree is not clean. Resolve all modified/untracked files first.\n${status}`,
  );
}

const branch = git('branch --show-current');
const head = git('rev-parse HEAD');

if (branch !== 'ai-review' && branch !== 'main') {
  fail(`Unexpected branch "${branch}". Expected ai-review or main.`);
}

/*
 * The CP2.1 forensic baseline must exist in this repository.
 */
try {
  git(`cat-file -e "${CP21_BASELINE_COMMIT}^{commit}"`);
} catch {
  fail(`CP2.1 baseline commit is unavailable: ${CP21_BASELINE_COMMIT}`);
}

/*
 * Current HEAD must descend from CP2.1.
 */
try {
  git(`merge-base --is-ancestor ${CP21_BASELINE_COMMIT} HEAD`);
} catch {
  fail(
    `Current HEAD ${head} is not descended from CP2.1 baseline ${CP21_BASELINE_COMMIT}.`,
  );
}

if (!exists(CONSTITUTION_PATH)) {
  fail(`Missing D2.2 constitution: ${CONSTITUTION_PATH}`);
}

/*
 * Verify all frozen controls exist before creating the baseline.
 */
for (const file of frozenFiles) {
  if (!exists(file)) {
    fail(`Missing frozen control: ${file}`);
  }
}

const constitutionSha256 = sha256File(CONSTITUTION_PATH);

const frozenControls = Object.fromEntries(
  frozenFiles.map((file) => [
    file,
    {
      exists: true,
      sha256: sha256File(file),
      bytes: fileBytes(file),
    },
  ]),
);

const baseline = {
  schemaVersion: 'D22_FAST_TRACK_BASELINE_V3',

  /*
   * Operational metadata is explicitly outside evidence identity.
   */
  operationalMetadata: {
    createdAt: new Date().toISOString(),
  },

  baseline: {
    repository: 'WealthOS',
    branch,
    baselineCommit: CP21_BASELINE_COMMIT,
    baselineTree: git(`rev-parse "${CP21_BASELINE_COMMIT}^{tree}"`),
    baselineHeadAtCreation: head,
  },

  constitution: {
    path: CONSTITUTION_PATH,
    sha256: constitutionSha256,
  },

  frozenControls,

  policy: {
    frozenControlsImmutable: true,
    strategiesImmutable: true,
    syntheticDataForbidden: true,
    futureDataForbidden: true,
    missingDataFailsClosed: true,
    forcePushForbidden: true,
    currentConstituentsForHistoricalAnalysisForbidden: true,
    currentSectorMappingForHistoricalAnalysisForbidden: true,
    fabricatedTimestampsForbidden: true,
    fabricatedMarketDataForbidden: true,
    unlockedLedgerMetricsForbidden: true,
  },
};

const reportDir = path.join(
  repoRoot,
  'reports',
  'v65-delivery-2.2',
);

fs.mkdirSync(reportDir, { recursive: true });

const manifestPath = path.join(
  reportDir,
  'FAST_TRACK_BASELINE.json',
);

const manifestContent =
  JSON.stringify(baseline, null, 2) + '\n';

fs.writeFileSync(
  manifestPath,
  manifestContent,
  'utf8',
);

const manifestHash = sha256Bytes(
  Buffer.from(manifestContent, 'utf8'),
);

const anchorContent =
  `${manifestHash}  FAST_TRACK_BASELINE.json\n`;

fs.writeFileSync(
  path.join(reportDir, 'FAST_TRACK_BASELINE.sha256'),
  anchorContent,
  'utf8',
);

console.log(
  'D2.2 Fast-Track baseline created successfully.',
);
console.log(`CP2.1 baseline : ${CP21_BASELINE_COMMIT}`);
console.log(`Current HEAD   : ${head}`);
console.log(`Branch         : ${branch}`);
console.log(`Constitution  : ${constitutionSha256}`);
console.log(`Manifest       : ${manifestHash}`);
console.log('');
console.log(
  'NEXT STEP: commit the baseline + constitution, then create the immutable Git tag:',
);
console.log(
  '  git tag -a d22-control-plane-v1 -m "D2.2 Control Plane v1"',
);
