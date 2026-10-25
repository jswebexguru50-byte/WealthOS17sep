import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('FERE batch runner is bounded, resumable and dry-run by default', () => {
  const source = fs.readFileSync('scripts/fere/run_combined_exchange_batch.mjs', 'utf8');
  assert.match(source, /const dryRun = !process\.argv\.includes\('--apply'\)/);
  assert.match(source, /Math\.min\(8/);
  assert.match(source, /status === 'retryable'/);
  assert.match(source, /\.tmp/);
  assert.match(source, /route === 'BSE'.*--bse-code/s);
  assert.match(source, /route === 'BSE'.*else args\.push\('--nse-code'/s);
  assert.match(source, /entry\.status = 'promoted'/);
  assert.match(source, /PROMOTION_READINESS_MISSING/);
  assert.match(source, /report\.factsAvailable/);
});
