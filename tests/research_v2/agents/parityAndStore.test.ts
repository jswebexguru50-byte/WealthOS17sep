import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { MockProvider } from '../../../src/server/research_v2/agents/adapters/index.js';
import { runReport, type RunInput, type RunResult } from '../../../src/server/research_v2/agents/orchestrator.js';
import { MemoryRunStore, SqliteRunStore, type SqlDatabase } from '../../../src/server/research_v2/agents/runStore.js';
import { DbGuardError } from '../../../src/server/research_v2/db/dbGuard.js';
import { makeBundle, SUBS } from './fixtures/fixture.js';

const recorded = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

const SCHEMA_SQL = readFileSync(new URL('../../../src/server/db/migrations/research_v2_schema.sql', import.meta.url), 'utf8');

function memoryDb(): SqlDatabase & { prepare: Database.Database['prepare'] } {
  const db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  return db as unknown as SqlDatabase & { prepare: Database.Database['prepare'] };
}

function input(draftFile: string, store = new MemoryRunStore(), over: Partial<RunInput> = {}): RunInput {
  return {
    runId: `run-${draftFile}`, bundle: makeBundle(), subQuestions: SUBS, contractVersion: 'c1',
    drafter: MockProvider.fromRecording(`rec-${draftFile}`, [recorded(draftFile)]),
    reviewer: MockProvider.fromRecording('rec-review', [recorded('recorded_review_pass.json')]),
    store, otherScrips: [{ symbol: 'BETA', isin: 'INE111B01011', names: ['Beta Industries'] }],
    now: () => new Date('2026-10-10T10:00:00Z'), ...over,
  };
}

const defectCodes = (r: RunResult): string[] => r.iterations[0].defects.map(d => d.code).sort();

const claimValues = (r: RunResult): Array<[string, number | undefined]> =>
  r.answers.flatMap(a => a.claims.map(c => [c.claimId, c.value] as [string, number | undefined]));

test('parity: two providers with recorded outputs get the same verdicts and key claims', async () => {
  const a = await runReport(input('recorded_provider_a.json'));
  const b = await runReport(input('recorded_provider_b.json'));
  assert.equal(a.status, b.status);
  assert.equal(a.status, 'READY_FOR_PUBLICATION');
  assert.deepEqual(a.validator.defects.map(d => d.code), b.validator.defects.map(d => d.code));
  assert.deepEqual(a.gate.defects.map(d => d.code), b.gate.defects.map(d => d.code));
  assert.deepEqual(claimValues(a), claimValues(b));
  assert.notEqual(a.answers[1].narrative, b.answers[1].narrative, 'wording differs, evidence does not');
});

test('parity: a provider that injects a wrong number is caught identically on any provider path', async () => {
  const c = await runReport(input('recorded_provider_c_wrong_number.json', undefined, { maxLoops: 0 }));
  assert.equal(c.status, 'ESCALATED_HUMAN');
  assert.deepEqual(defectCodes(c).filter(code => code === 'VALUE_MISMATCH' || code === 'UNCLAIMED_NUMBER'),
    ['UNCLAIMED_NUMBER', 'VALUE_MISMATCH']);
  const a = await runReport(input('recorded_provider_a.json'));
  assert.notDeepEqual(claimValues(a), claimValues(c), 'parity comparison exposes the divergent claim');
});

test('sqlite store persists runs, answers and findings for every iteration', async () => {
  const db = memoryDb();
  const store = new SqliteRunStore(db, { dbPath: ':memory:' });
  const drafter = MockProvider.fromRecording('d', [
    recorded('recorded_provider_c_wrong_number.json'), recorded('recorded_provider_a.json'),
  ]);
  const result = await runReport(input('recorded_provider_a.json', store, { drafter, runId: 'sq-1' }));
  assert.equal(result.status, 'READY_FOR_PUBLICATION');

  const run = db.prepare('SELECT * FROM research_report_runs WHERE run_id = ?').get('sq-1') as Record<string, unknown>;
  assert.equal(run.status, 'READY_FOR_PUBLICATION');
  assert.equal(run.loops, 1);
  assert.equal(run.drafter_provider, 'd');
  assert.equal(run.reviewer_provider, 'rec-review');
  assert.equal(run.bundle_hash, makeBundle().bundleHash);
  assert.equal(JSON.parse(run.gate_verdict_json as string).ok, true);
  assert.ok(run.finished_at);

  const answers = db.prepare('SELECT * FROM research_answer_store WHERE run_id = ? ORDER BY sub_question_id').all('sq-1') as Array<Record<string, unknown>>;
  assert.deepEqual(answers.map(a => a.sub_question_id), ['Q1.a', 'Q2.a', 'Q3.a', 'Q5.a']);
  assert.ok(answers.every(a => a.review_status === 'PASS'));
  assert.equal(JSON.parse(answers[1].claims_json as string).length, 3);
  assert.deepEqual(JSON.parse(answers[3].premise_check_json as string).holds, false);

  const findings = db.prepare('SELECT * FROM research_review_findings WHERE run_id = ?').all('sq-1') as Array<Record<string, unknown>>;
  assert.ok(findings.some(f => String(f.defect).startsWith('VALUE_MISMATCH') && f.loop_no === 0));
  assert.ok(findings.filter(f => f.loop_no === 0).every(f => f.resolution === 'SENT_FOR_REVISION'));
});

test('sqlite store records escalation and the reviewer findings', async () => {
  const db = memoryDb();
  const store = new SqliteRunStore(db, { dbPath: ':memory:' });
  const finding = { subQuestionId: 'Q2.a', severity: 'BLOCKING', defect: 'Unsupported inference', evidence: 'c3', requiredFix: 'Label it' };
  const drafter = new MockProvider('d', () => ({ json: recorded('recorded_provider_a.json') }));
  const reviewer = new MockProvider('r', () => ({ json: { verdict: 'REVISE', findings: [finding] } }));
  const result = await runReport(input('recorded_provider_a.json', store, { drafter, reviewer, runId: 'sq-2' }));
  assert.equal(result.status, 'ESCALATED_HUMAN');
  const run = db.prepare('SELECT status, loops FROM research_report_runs WHERE run_id = ?').get('sq-2') as Record<string, unknown>;
  assert.deepEqual({ ...run }, { status: 'ESCALATED_HUMAN', loops: 2 });
  const rows = db.prepare("SELECT * FROM research_review_findings WHERE run_id = 'sq-2' AND loop_no = 2").all() as Array<Record<string, unknown>>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].resolution, 'ESCALATED');
  assert.equal(rows[0].defect, 'Unsupported inference');
});

test('sqlite store is idempotent when a run is resumed', async () => {
  const db = memoryDb();
  const store = new SqliteRunStore(db, { dbPath: ':memory:' });
  await runReport(input('recorded_provider_a.json', store, { runId: 'sq-3' }));
  await runReport(input('recorded_provider_a.json', store, { runId: 'sq-3' }));
  const count = db.prepare('SELECT COUNT(*) AS n FROM research_report_runs').get() as { n: number };
  assert.equal(count.n, 1);
  const answers = db.prepare('SELECT COUNT(*) AS n FROM research_answer_store').get() as { n: number };
  assert.equal(answers.n, 4);
});

test('sqlite store refuses production writes without --allow-production and a backup', () => {
  const db = memoryDb();
  const store = new SqliteRunStore(db, { dbPath: path.join(os.tmpdir(), 'nowhere', 'portfolio.db') });
  assert.throws(() => store.startRun({
    runId: 'x', symbol: 'ALPHA', asOf: 'a', routineVersion: 'r', contractVersion: 'c', bundleHash: 'h',
    drafterProvider: 'd', reviewerProvider: 'r', startedAt: 's',
  }), (err: unknown) => err instanceof DbGuardError && err.code === 'PRODUCTION_WRITE_NOT_ALLOWED');
  const withFlagOnly = new SqliteRunStore(db, {
    dbPath: path.join(os.tmpdir(), 'nowhere', 'portfolio.db'), allowProduction: true,
  });
  assert.throws(() => withFlagOnly.finishRun({
    runId: 'x', status: 'ERROR', validator: null, gate: null, spendUsd: 0, loops: 0, finishedAt: null,
  }), (err: unknown) => err instanceof DbGuardError && err.code === 'BACKUP_REQUIRED');
  const none = db.prepare('SELECT COUNT(*) AS n FROM research_report_runs').get() as { n: number };
  assert.equal(none.n, 0);
});

test('sqlite store refuses a guard that approved a different database than the handle', () => {
  const db = memoryDb();
  const other = path.join(mkdtempSync(path.join(os.tmpdir(), 'wq29-db-')), 'copy.db');
  const store = new SqliteRunStore(db, { dbPath: other });
  assert.throws(() => store.resolveFindings('x', 0, 'OPEN'), /guard mismatch/);
});

test('sqlite store writes to a temp-file database copy once the guard approves it', () => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'wq29-db-')), 'copy.db');
  const db = new Database(file);
  db.exec(SCHEMA_SQL);
  const store = new SqliteRunStore(db as unknown as SqlDatabase, { dbPath: file });
  store.startRun({
    runId: 'f1', symbol: 'ALPHA', asOf: 'a', routineVersion: 'r', contractVersion: 'c', bundleHash: 'h',
    drafterProvider: 'd', reviewerProvider: 'r', startedAt: 's',
  });
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM research_report_runs').get() as { n: number }).n, 1);
  db.close();
});

test('a custom guard function is honoured and can veto writes', () => {
  const db = memoryDb();
  const store = new SqliteRunStore(db, () => { throw new Error('vetoed'); });
  assert.throws(() => store.resolveFindings('x', 0, 'OPEN'), /vetoed/);
});
