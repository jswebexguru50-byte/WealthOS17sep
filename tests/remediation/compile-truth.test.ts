import test from 'node:test';
import assert from 'node:assert/strict';
import { DownstreamAuthorizationBoundary, DownstreamAuthorizationError } from '../../src/server/services/dataenrichment/verifiers/DownstreamAuthorizationBoundary.js';
test('missing authoritative promotion persistence cannot authorize a dataset', async () => {
  const result = await DownstreamAuthorizationBoundary.authorizeVerifiedDataset('fixture');
  assert.deepEqual(result, { authorized: false, reason: DownstreamAuthorizationError.DOWNSTREAM_BLOCKED_MISSING_VERIFICATION });
});
