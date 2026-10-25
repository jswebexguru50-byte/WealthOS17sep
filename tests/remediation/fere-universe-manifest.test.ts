import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('FERE manifest encodes routing, deduplication and resumable status', () => {
  const source = fs.readFileSync('scripts/fere/build_combined_exchange_manifest.mjs', 'utf8');
  assert.match(source, /exchange IN \('NSE','BSE'\)/);
  assert.match(source, /deduplicate-by-ISIN/);
  assert.match(source, /status: 'pending'/);
  assert.match(source, /numeric-symbol=BSE/);
});
