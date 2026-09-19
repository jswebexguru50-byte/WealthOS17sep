import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const repoRoot = process.cwd();
const reportDir = path.join(repoRoot, 'reports', 'v65-delivery-2.2');
const manifestPath = path.join(reportDir, 'FAST_TRACK_BASELINE.json');
const anchorPath = path.join(reportDir, 'FAST_TRACK_BASELINE.sha256');
const resultPath = path.join(reportDir, 'FAST_TRACK_GUARDRAIL_RESULT.json');

function git(command: string): string {
  return execSync(`git ${command}`, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function sha256(relativePath: string): string {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function getBytes(relativePath: string): number {
  return fs.statSync(path.join(repoRoot, relativePath)).size;
}

const failures: any[] = [];
const result = {
  status: 'FAIL',
  repository: { branch: 'UNKNOWN', head: 'UNKNOWN', headValid: false },
  frozenControls: { allValid: false },
  baselineManifest: { valid: false },
  failures: failures
};

function writeResultAndExit(code: number) {
  result.status = code === 0 ? 'PASS' : 'FAIL';
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  if (code !== 0) {
    console.error('FAST-TRACK BASELINE VIOLATION');
    for (const f of failures) console.error(f);
  } else {
    console.log('FAST-TRACK BASELINE VERIFIED: all controls unchanged.');
  }
  process.exit(code);
}

// 1. Verify Manifest Identity Anchor
if (!fs.existsSync(anchorPath)) {
  failures.push({ type: 'MANIFEST_ANCHOR_MISSING' });
  writeResultAndExit(1);
}

if (!fs.existsSync(manifestPath)) {
  failures.push({ type: 'MANIFEST_MISSING' });
  writeResultAndExit(1);
}

const expectedManifestHashParts = fs.readFileSync(anchorPath, 'utf8').trim().split(/\s+/);
const expectedManifestHash = expectedManifestHashParts[0];
const actualManifestHash = crypto.createHash('sha256').update(fs.readFileSync(manifestPath, 'utf8'), 'utf8').digest('hex');

if (actualManifestHash !== expectedManifestHash) {
  failures.push({ type: 'MANIFEST_TAMPERED', expected: expectedManifestHash, actual: actualManifestHash });
  writeResultAndExit(1);
}
result.baselineManifest.valid = true;

// 2. Load Manifest
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// 3. Verify Repository
const currentBranch = git('branch --show-current');
const currentHead = git('rev-parse HEAD');
const currentTree = git('rev-parse HEAD:');

result.repository.branch = currentBranch;
result.repository.head = currentHead;

try {
  git(`merge-base --is-ancestor ${manifest.baseline.baselineCommit} HEAD`);
} catch (e) {
  failures.push({ type: 'ANCESTOR_MISMATCH', expectedAncestor: manifest.baseline.baselineCommit, actualHead: currentHead });
}

result.repository.headValid = failures.length === 0;

// 4. Verify Frozen Controls
let controlsValid = true;
for (const [file, expected] of Object.entries(manifest.frozenControls) as [string, any][]) {
  const absolutePath = path.join(repoRoot, file);
  if (!fs.existsSync(absolutePath)) {
    failures.push({ type: 'MISSING_FROZEN_FILE', path: file });
    controlsValid = false;
    continue;
  }
  const actualBytes = getBytes(file);
  const actualSha256 = sha256(file);
  
  if (actualBytes !== expected.bytes) {
    failures.push({ type: 'FROZEN_FILE_SIZE_MODIFIED', path: file, expected: expected.bytes, actual: actualBytes });
    controlsValid = false;
  }
  if (actualSha256 !== expected.sha256) {
    failures.push({ type: 'FROZEN_FILE_HASH_MODIFIED', path: file, expected: expected.sha256, actual: actualSha256 });
    controlsValid = false;
  }
}
result.frozenControls.allValid = controlsValid;

if (failures.length > 0) {
  writeResultAndExit(1);
} else {
  writeResultAndExit(0);
}
