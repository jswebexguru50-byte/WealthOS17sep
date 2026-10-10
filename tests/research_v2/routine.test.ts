import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadRoutine } from '../../src/server/research_v2/routine/loadRoutine.js';

test('loads and hashes the signed-in-repo routine definition', () => {
  const routine = loadRoutine(path.resolve('src/server/research_v2/routine/ROUTINE_V2.json'));
  assert.equal(routine.definition.scope, 'FUNDAMENTAL_ONLY');
  assert.equal(routine.definition.questionIds.length, 29);
  assert.match(routine.sha256, /^[a-f0-9]{64}$/);
});

test('rejects a routine with the wrong question count', () => {
  const file = path.join(process.cwd(), 'routine-invalid-test.json');
  fs.writeFileSync(file, JSON.stringify({ routineVersion: 'x', scope: 'FUNDAMENTAL_ONLY', questionIds: ['Q1'], promptHashes: {} }));
  try { assert.throws(() => loadRoutine(file), /exactly 29/); } finally { fs.rmSync(file, { force: true }); }
});
