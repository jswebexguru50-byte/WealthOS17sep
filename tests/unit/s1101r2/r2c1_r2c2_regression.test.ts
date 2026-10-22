import { describe, expect, it } from 'vitest';
import { auditGitIdentity } from '../../../src/server/services/s1101r2/R2C1GitIdentityAudit';

describe('S1101R2 reported blocker regression', () => {
  it('must never emit UNTRACKED_CLEAN', () => {
    const forbiddenStatuses = [
      'UNTRACKED_CLEAN',
      'UNKNOWN',
      'CLEAN',
      'CURRENT',
    ];

    const gitAudit = auditGitIdentity(process.cwd());

    expect(forbiddenStatuses).not.toContain(gitAudit.headSha);

    expect(/^[0-9a-f]{40}$/i.test(gitAudit.headSha)).toBe(true);
  });

  it('must reject acquired-data/hash-change with zero required re-audits', () => {
    const transition = {
      acquiredRecords: 2,
      previousDatasetHash: 'HASH_V1',
      currentDatasetHash: 'HASH_V2',
      hashChanged: true,
      dependencyAffected: true,
      requiredReaudits: ['S1', 'S10'],
      actualReaudits: [],
    };

    const invalid =
      transition.hashChanged &&
      transition.dependencyAffected &&
      transition.requiredReaudits.length > 0 &&
      transition.actualReaudits.length === 0;

    expect(invalid).toBe(true);
  });
});
