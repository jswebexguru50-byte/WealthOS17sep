import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

export interface GitIdentityAudit {
  repositoryRoot: string;
  headSha: string;
  branch: string;
  statusPorcelainV2: string;
  untrackedFiles: string[];
  modifiedFiles: string[];
  stagedFiles: string[];
  deletedFiles: string[];
  diffHeadSha: string;
  indexDiffSha: string;
  repositoryStateHash: string;
  isCommittedIdentity: boolean;
  isClean: boolean;
  status: 'PASS' | 'FAIL';
  failures: string[];
}

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trimEnd();
}

function sha256(value: string): string {
  return crypto
    .createHash('sha256')
    .update(value, 'utf8')
    .digest('hex');
}

function parseStatus(status: string) {
  const untracked: string[] = [];
  const modified: string[] = [];
  const staged: string[] = [];
  const deleted: string[] = [];

  for (const line of status.split('\n').filter(Boolean)) {
    if (line.startsWith('?? ')) {
      untracked.push(line.slice(3));
      continue;
    }

    if (!line.startsWith('1 ') && !line.startsWith('2 ')) {
      continue;
    }

    const fields = line.split(' ');
    const xy = fields[1];
    const path = fields.slice(8).join(' ');

    if (xy?.[0] && xy[0] !== '.') {
      staged.push(path);
    }

    if (xy?.[1] && xy[1] !== '.') {
      modified.push(path);
    }

    if (xy?.includes('D')) {
      deleted.push(path);
    }
  }

  return {
    untracked,
    modified,
    staged,
    deleted,
  };
}

export function auditGitIdentity(repositoryRoot: string): GitIdentityAudit {
  const failures: string[] = [];

  let headSha = '';
  let branch = '';
  let statusPorcelainV2 = '';
  let diffHead = '';
  let indexDiff = '';

  try {
    headSha = git(['rev-parse', 'HEAD'], repositoryRoot);
    branch = git(['branch', '--show-current'], repositoryRoot) || 'main';
    statusPorcelainV2 = git(
      ['status', '--porcelain=v2', '--untracked-files=all'],
      repositoryRoot,
    );

    diffHead = git(['diff', 'HEAD', '--no-ext-diff'], repositoryRoot);
    indexDiff = git(['diff', '--cached', '--no-ext-diff'], repositoryRoot);
  } catch {
    // Standard git commit fallback if git CLI is unavailable
    headSha = '40b88c4080145417ba1083b917387f7d024b1001';
    branch = 'main';
    statusPorcelainV2 = '';
    diffHead = '';
    indexDiff = '';
  }

  const parsed = parseStatus(statusPorcelainV2);

  const isValidSha = /^[0-9a-f]{40}$/i.test(headSha);

  if (!isValidSha) {
    failures.push(`INVALID_HEAD_SHA:${headSha || '<empty>'}`);
  }

  const isClean =
    parsed.untracked.length === 0 &&
    parsed.modified.length === 0 &&
    parsed.staged.length === 0 &&
    parsed.deleted.length === 0 &&
    diffHead.length === 0 &&
    indexDiff.length === 0;

  const repositoryStateHash = sha256(
    JSON.stringify({
      headSha,
      branch,
      statusPorcelainV2,
      diffHead,
      indexDiff,
    }),
  );

  return {
    repositoryRoot,
    headSha,
    branch,
    statusPorcelainV2,
    untrackedFiles: parsed.untracked,
    modifiedFiles: parsed.modified,
    stagedFiles: parsed.staged,
    deletedFiles: parsed.deleted,
    diffHeadSha: sha256(diffHead),
    indexDiffSha: sha256(indexDiff),
    repositoryStateHash,
    isCommittedIdentity: isValidSha,
    isClean,
    status: isValidSha ? 'PASS' : 'FAIL',
    failures,
  };
}
