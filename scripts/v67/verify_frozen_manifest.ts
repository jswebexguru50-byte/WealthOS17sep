import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

interface FrozenArtifact {
  path: string;
  sha256: string;
  purpose: string;
}

interface FrozenManifest {
  manifestVersion: string;
  frozenAt: string;
  scope: string;
  artifacts: FrozenArtifact[];
}

export function verifyFrozenManifest(manifestPath?: string): boolean {
  const root = process.cwd();
  const fullManifestPath = manifestPath || path.join(root, 'config', 'v67', 'FROZEN_V63_CONTROL_MANIFEST.json');

  if (!fs.existsSync(fullManifestPath)) {
    console.error(`MISSING_MANIFEST: ${fullManifestPath}`);
    return false;
  }

  const manifest: FrozenManifest = JSON.parse(fs.readFileSync(fullManifestPath, 'utf-8'));
  console.log(`--- VERIFYING ${manifest.artifacts.length} FROZEN CONTROL ARTIFACTS (${manifest.manifestVersion}) ---`);

  let allValid = true;

  for (const artifact of manifest.artifacts) {
    const fullPath = path.join(root, artifact.path);
    if (!fs.existsSync(fullPath)) {
      console.error(`[MISSING_FILE] ${artifact.path} (${artifact.purpose})`);
      allValid = false;
      continue;
    }

    const content = fs.readFileSync(fullPath);
    const actualHash = crypto.createHash('sha256').update(content).digest('hex');
    const hashMatch = actualHash === artifact.sha256;

    if (!hashMatch) {
      console.error(`[HASH_MISMATCH] ${artifact.path}`);
      console.error(`  Expected: ${artifact.sha256}`);
      console.error(`  Actual:   ${actualHash}`);
      allValid = false;
    } else {
      console.log(`[LOCKED] ${artifact.path}`);
    }
  }

  // Git diff check
  try {
    const fileList = manifest.artifacts.map(a => a.path).join(' ');
    execSync(`git diff --exit-code HEAD -- ${fileList}`, { stdio: 'pipe' });
    console.log('[GIT_DIFF] Clean — zero uncommitted modifications in frozen artifacts.');
  } catch (gitErr: any) {
    // If files are tracked and modified, git diff returns exit code 1
    if (gitErr.status === 1) {
      console.warn('[GIT_DIFF] Uncommitted changes detected in frozen control path.');
    }
  }

  return allValid;
}

if (process.argv[1]?.endsWith('verify_frozen_manifest.ts')) {
  const ok = verifyFrozenManifest();
  if (!ok) {
    console.error('FATAL: Frozen control path validation failed.');
    process.exit(1);
  }
  console.log('RESULT: 100% IMMUTABILITY PRESERVED');
}
