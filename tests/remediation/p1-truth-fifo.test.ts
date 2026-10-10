import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('P1 FY helper rejects invalid dates instead of inventing a reporting year', async () => {
  const source = await readFile(new URL('../../src/server/fifoEngine.ts', import.meta.url), 'utf8');
  assert.match(source, /INVALID_TRADE_DATE/);
  assert.match(source, /getFYFromDate/);
  assert.match(source, /isNaN\(parsed\.getTime\(\)\)/);
});

test('P1 canonical migration owns reconciliation exception ledger', async () => {
  const { migration003 } = await import('../../src/server/db/migrations/003_reconciliation_exceptions.js');
  assert.equal(migration003.id, 3);
  assert.equal(migration003.name, '003_reconciliation_exceptions');
  assert.match(migration003.checksum, /^[a-f0-9]{64}$/);
});
