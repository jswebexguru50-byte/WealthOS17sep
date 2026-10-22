import fs from 'node:fs';
import path from 'node:path';
import {
  execSync,
} from 'node:child_process';

const repoRoot = process.cwd();

function git(
  command: string,
): string {
  return execSync(
    `git ${command}`,
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: [
        'ignore',
        'pipe',
        'pipe',
      ],
    },
  ).trim();
}

function run(
  command: string,
): void {
  console.log(`> ${command}`);

  execSync(
    command,
    {
      cwd: repoRoot,
      stdio: 'inherit',
    },
  );
}

const branch =
  git('branch --show-current');

if (branch !== 'ai-review') {
  throw new Error(
    `STOP: expected ai-review, got ${branch}`,
  );
}

const originalHead =
  git('rev-parse HEAD');

const tempPath =
  path.join(
    repoRoot,
    'reports/v65-delivery-2.2/.additive-ancestry-test.tmp',
  );

try {
  fs.writeFileSync(
    tempPath,
    'D2.2 additive ancestry verification\n',
    'utf8',
  );

  run(
    'git add reports/v65-delivery-2.2/.additive-ancestry-test.tmp',
  );

  run(
    'git commit -m "test(integrity): verify additive ancestry"',
  );

  const additiveHead =
    git('rev-parse HEAD');

  console.log(
    `Original HEAD : ${originalHead}`,
  );

  console.log(
    `Additive HEAD : ${additiveHead}`,
  );

  run(
    'npx tsx src/scripts/verify_fasttrack_baseline.ts',
  );

  console.log('');
  console.log(
    'PASS: additive commit remains permitted while CP2.1 and frozen controls remain protected.',
  );
} finally {
  /*
   * Restore repository state.
   *
   * This script intentionally does not push the temporary commit.
   */
  try {
    git(
      `reset --hard ${originalHead}`,
    );
  } catch (error) {
    console.error(
      'WARNING: Could not automatically restore original HEAD.',
      error,
    );
    process.exit(1);
  }
}
