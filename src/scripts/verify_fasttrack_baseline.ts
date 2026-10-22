import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const repoRoot = process.cwd();

const reportDir = path.join(
  repoRoot,
  'reports',
  'v65-delivery-2.2',
);

const manifestPath = path.join(
  reportDir,
  'FAST_TRACK_BASELINE.json',
);

const anchorPath = path.join(
  reportDir,
  'FAST_TRACK_BASELINE.sha256',
);

const resultPath = path.join(
  reportDir,
  'FAST_TRACK_GUARDRAIL_RESULT.json',
);

/*
 * This tag is the Lane-A immutable root.
 *
 * Protect this tag in GitHub so it cannot be moved/deleted.
 */
const CONTROL_PLANE_TAG = 'd22-control-plane-v1';

function git(command: string): string {
  return execSync(`git ${command}`, {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
}

function sha256File(relativePath: string): string {
  return crypto
    .createHash('sha256')
    .update(
      fs.readFileSync(
        path.join(repoRoot, relativePath),
      ),
    )
    .digest('hex');
}

function sha256Bytes(bytes: Buffer): string {
  return crypto
    .createHash('sha256')
    .update(bytes)
    .digest('hex');
}

function exists(relativePath: string): boolean {
  return fs.existsSync(
    path.join(repoRoot, relativePath),
  );
}

const failures: Array<Record<string, unknown>> = [];

const result = {
  schemaVersion: 'D22_FAST_TRACK_GUARDRAIL_RESULT_V3',
  status: 'FAIL',
  repository: {
    branch: 'UNKNOWN',
    head: 'UNKNOWN',
    cp21AncestorValid: false,
    controlPlaneTagValid: false,
  },
  baselineManifest: {
    present: false,
    anchorValid: false,
    matchesControlPlaneTag: false,
  },
  constitution: {
    valid: false,
  },
  frozenControls: {
    allValid: false,
  },
  additiveAncestry: {
    permitted: false,
  },
  failures,
};

function finish(code: number): never {
  result.status = code === 0 ? 'PASS' : 'FAIL';

  fs.writeFileSync(
    resultPath,
    JSON.stringify(result, null, 2) + '\n',
    'utf8',
  );

  if (code === 0) {
    console.log(
      'D2.2 FAST-TRACK CONTROL PLANE VERIFIED.',
    );
  } else {
    console.error(
      'D2.2 FAST-TRACK CONTROL PLANE VERIFICATION FAILED.',
    );

    for (const failure of failures) {
      console.error(JSON.stringify(failure));
    }
  }

  process.exit(code);
}

/* ---------------------------------------------------------
 * 1. Required artifacts
 * ------------------------------------------------------- */

if (!exists('reports/v65-delivery-2.2/FAST_TRACK_BASELINE.json')) {
  failures.push({
    type: 'MANIFEST_MISSING',
  });

  finish(1);
}

if (!exists('reports/v65-delivery-2.2/FAST_TRACK_BASELINE.sha256')) {
  failures.push({
    type: 'MANIFEST_ANCHOR_MISSING',
  });

  finish(1);
}

result.baselineManifest.present = true;

/* ---------------------------------------------------------
 * 2. Load manifest
 * ------------------------------------------------------- */

let manifest: any;

try {
  manifest = JSON.parse(
    fs.readFileSync(manifestPath, 'utf8'),
  );
} catch (error) {
  failures.push({
    type: 'MANIFEST_PARSE_FAILURE',
    error: String(error),
  });

  finish(1);
}

/* ---------------------------------------------------------
 * 3. Verify manifest working-tree hash
 * ------------------------------------------------------- */

const manifestBytes = fs.readFileSync(manifestPath);

const actualManifestHash =
  sha256Bytes(manifestBytes);

const anchorParts = fs
  .readFileSync(anchorPath, 'utf8')
  .trim()
  .split(/\s+/);

const expectedManifestHash = anchorParts[0];

if (actualManifestHash !== expectedManifestHash) {
  failures.push({
    type: 'MANIFEST_TAMPERED',
    expected: expectedManifestHash,
    actual: actualManifestHash,
  });
} else {
  result.baselineManifest.anchorValid = true;
}

/* ---------------------------------------------------------
 * 4. Repository identity
 * ------------------------------------------------------- */

const currentBranch =
  git('branch --show-current');

const currentHead =
  git('rev-parse HEAD');

result.repository.branch = currentBranch;
result.repository.head = currentHead;

const baselineCommit =
  manifest.baseline.baselineCommit;

try {
  git(
    `cat-file -e "${baselineCommit}^{commit}"`,
  );

  git(
    `merge-base --is-ancestor ${baselineCommit} HEAD`,
  );

  result.repository.cp21AncestorValid = true;
} catch {
  failures.push({
    type: 'CP21_ANCESTRY_FAILURE',
    baselineCommit,
    currentHead,
  });
}

/* ---------------------------------------------------------
 * 5. Verify immutable control-plane tag
 * ------------------------------------------------------- */

let tagCommit = '';

try {
  tagCommit = git(
    `rev-parse "${CONTROL_PLANE_TAG}^{commit}"`,
  );

  result.repository.controlPlaneTagValid = true;
} catch {
  failures.push({
    type: 'CONTROL_PLANE_TAG_MISSING',
    tag: CONTROL_PLANE_TAG,
  });
}

/*
 * The control-plane tag must itself descend from CP2.1.
 */
if (tagCommit) {
  try {
    git(
      `merge-base --is-ancestor ${baselineCommit} ${tagCommit}`,
    );
  } catch {
    failures.push({
      type: 'CONTROL_PLANE_TAG_NOT_DESCENDED_FROM_CP21',
      tag: CONTROL_PLANE_TAG,
      tagCommit,
      baselineCommit,
    });
  }
}

/* ---------------------------------------------------------
 * 6. Verify baseline manifest against immutable tag
 * ------------------------------------------------------- */

if (tagCommit) {
  try {
    const taggedManifest =
      git(
        `show ${CONTROL_PLANE_TAG}:reports/v65-delivery-2.2/FAST_TRACK_BASELINE.json`,
      );

    const taggedManifestHash =
      sha256Bytes(
        Buffer.from(
          taggedManifest.endsWith('\n')
            ? taggedManifest
            : taggedManifest + '\n',
          'utf8',
        ),
      );

    if (
      taggedManifestHash !==
      actualManifestHash
    ) {
      failures.push({
        type: 'MANIFEST_DIFFERS_FROM_CONTROL_PLANE_TAG',
        tag: CONTROL_PLANE_TAG,
        taggedManifestHash,
        currentManifestHash: actualManifestHash,
      });
    } else {
      result.baselineManifest.matchesControlPlaneTag =
        true;
    }
  } catch (error) {
    failures.push({
      type: 'TAGGED_MANIFEST_UNREADABLE',
      error: String(error),
    });
  }
}

/* ---------------------------------------------------------
 * 7. Verify constitution
 * ------------------------------------------------------- */

const constitutionPath =
  manifest.constitution?.path;

const expectedConstitutionHash =
  manifest.constitution?.sha256;

if (
  !constitutionPath ||
  !expectedConstitutionHash
) {
  failures.push({
    type: 'CONSTITUTION_MANIFEST_INVALID',
  });
} else if (!exists(constitutionPath)) {
  failures.push({
    type: 'CONSTITUTION_MISSING',
    path: constitutionPath,
  });
} else {
  const actualConstitutionHash =
    sha256File(constitutionPath);

  if (
    actualConstitutionHash !==
    expectedConstitutionHash
  ) {
    failures.push({
      type: 'CONSTITUTION_HASH_MISMATCH',
      path: constitutionPath,
      expected: expectedConstitutionHash,
      actual: actualConstitutionHash,
    });
  } else {
    result.constitution.valid = true;
  }
}

/* ---------------------------------------------------------
 * 8. Verify frozen controls
 * ------------------------------------------------------- */

let frozenValid = true;

for (
  const [file, expected]
  of Object.entries(
    manifest.frozenControls,
  ) as [
    string,
    {
      exists: boolean;
      sha256: string;
      bytes: number;
    },
  ][]
) {
  if (!exists(file)) {
    failures.push({
      type: 'FROZEN_FILE_MISSING',
      path: file,
    });

    frozenValid = false;
    continue;
  }

  const actualHash =
    sha256File(file);

  const actualBytes =
    fs.statSync(
      path.join(repoRoot, file),
    ).size;

  if (actualHash !== expected.sha256) {
    failures.push({
      type: 'FROZEN_FILE_HASH_MODIFIED',
      path: file,
      expected: expected.sha256,
      actual: actualHash,
    });

    frozenValid = false;
  }

  if (actualBytes !== expected.bytes) {
    failures.push({
      type: 'FROZEN_FILE_SIZE_MODIFIED',
      path: file,
      expected: expected.bytes,
      actual: actualBytes,
    });

    frozenValid = false;
  }
}

result.frozenControls.allValid = frozenValid;

/* ---------------------------------------------------------
 * 9. Additive ancestry
 *
 * Current HEAD is allowed to contain additional commits.
 * It must remain a descendant of the CP2.1 baseline.
 * ------------------------------------------------------- */

if (
  result.repository.cp21AncestorValid &&
  result.repository.controlPlaneTagValid
) {
  try {
    git(
      `merge-base --is-ancestor ${tagCommit} HEAD`,
    );

    result.additiveAncestry.permitted = true;
  } catch {
    failures.push({
      type: 'CURRENT_HEAD_NOT_DESCENDED_FROM_CONTROL_PLANE',
      controlPlaneCommit: tagCommit,
      currentHead,
    });
  }
}

/* ---------------------------------------------------------
 * 10. Final decision
 * ------------------------------------------------------- */

if (
  result.repository.cp21AncestorValid &&
  result.repository.controlPlaneTagValid &&
  result.baselineManifest.anchorValid &&
  result.baselineManifest.matchesControlPlaneTag &&
  result.constitution.valid &&
  result.frozenControls.allValid &&
  result.additiveAncestry.permitted &&
  failures.length === 0
) {
  finish(0);
}

finish(1);
