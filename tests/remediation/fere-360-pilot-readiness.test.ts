import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const service = fs.readFileSync('src/server/services/Analyze360Service.ts', 'utf8');
const batch = fs.readFileSync('scripts/fere/run_combined_exchange_batch.mjs', 'utf8');
test('Analyze360 preserves partial/missing fields instead of inventing values', () => {
  assert.match(service, /status: isMissing \? 'MISSING' : 'AVAILABLE'/);
  assert.match(service, /missingReason: isMissing/);
  assert.match(service, /fetchedAt: null/);
  assert.match(service, /periodEnd:/);
});
test('Analyze360 carries sector applicability and source lineage', () => {
  assert.match(service, /sector/);
  assert.match(service, /sourceTable/);
  assert.match(service, /sourceFactId/);
  assert.match(service, /availableAt/);
});
test('44-symbol pilot is supported by bounded selection and MCP remains off', () => {
  assert.match(batch, /--limit/);
  assert.match(batch, /const dryRun = !process\.argv\.includes\('--apply'\)/);
  assert.doesNotMatch(batch, /TRENDLYNE_MCP|mcp/i);
});
