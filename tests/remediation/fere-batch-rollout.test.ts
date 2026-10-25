import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync('scripts/fere/run_combined_exchange_batch.mjs', 'utf8');
test('FERE rollout defaults to bounded dry-run and supports 50-symbol checkpoints', () => {
  assert.match(source, /const dryRun = !process\.argv\.includes\('--apply'\)/);
  assert.match(source, /checkpointEvery = Math\.max\(1, Number\(arg\('--checkpoint-every', '50'\)\)\)/);
  assert.match(source, /Math\.min\(8, Number\(arg\('--concurrency', '3'\)\)\)/);
});
test('FERE rollout requires promotion and records source exhaustion', () => {
  assert.match(source, /await promote\(listing\.symbol\)/);
  assert.match(source, /entry\.status = 'promoted'/);
  assert.match(source, /entry\.status = message\.startsWith\('PROMOTION_2:'\) \? 'source_exhausted'/);
  assert.match(source, /e\.status === 'pending' \|\| e\.status === 'retryable'/);
});
test('FERE rollout tracks attempts and atomically checkpoints manifest', () => {
  assert.match(source, /entry\.attempts = \(entry\.attempts \|\| 0\) \+ 1/);
  assert.match(source, /const tmp = `\$\{manifestPath\}\.tmp`/);
  assert.match(source, /fs\.renameSync\(tmp, manifestPath\)/);
});
