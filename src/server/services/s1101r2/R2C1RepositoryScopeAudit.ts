import fs from 'node:fs';
import path from 'node:path';
import { GitIdentityAudit } from './R2C1GitIdentityAudit';

const ALLOWED_GENERATED_PREFIXES = [
  'reports/v674-s1101r2/',
  'artifacts/v674-s1101r2/',
  'audit/v674-s1101r2/',
  'WEALTHOS_S1101R2_COMPLETE_BUNDLE.zip',
  'WEALTHOS_S1101R2_COMPLETE_BUNDLE.sha256',
];

export function classifyRepositoryPath(
  repositoryRoot: string,
  relativePath: string,
): 'ALLOWED_GENERATED' | 'SOURCE_CHANGE' | 'UNKNOWN' {
  const normalized = relativePath
    .replaceAll('\\', '/')
    .replace(/^\.\/+/, '');

  if (
    ALLOWED_GENERATED_PREFIXES.some(prefix =>
      normalized === prefix ||
      normalized.startsWith(prefix),
    )
  ) {
    return 'ALLOWED_GENERATED';
  }

  const absolute = path.join(repositoryRoot, normalized);

  if (fs.existsSync(absolute)) {
    return 'SOURCE_CHANGE';
  }

  return 'UNKNOWN';
}

export function assertForensicGitIdentity(
  audit: GitIdentityAudit,
): void {
  if (!audit.isCommittedIdentity) {
    throw new Error(
      `R2-C1 BLOCKED: repository has no valid committed HEAD SHA: ${audit.headSha}`,
    );
  }
}
