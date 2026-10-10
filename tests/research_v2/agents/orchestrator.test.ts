import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  HostAgentProvider, HostTaskPendingError, MockProvider, writeBundleFile,
} from '../../../src/server/research_v2/agents/adapters/index.js';
import { MAX_REVISION_LOOPS, ReviewerSeparationError, runReport, type RunInput } from '../../../src/server/research_v2/agents/orchestrator.js';
import type { LlmProvider, LlmRequest, LlmResponse } from '../../../src/server/research_v2/domain/index.js';
import { MemoryRunStore } from '../../../src/server/research_v2/agents/runStore.js';
import { clone, goodAnswers, makeBundle, SUBS } from './fixtures/fixture.js';

const PASS = { verdict: 'PASS', findings: [] };
const blockingFinding = {
  subQuestionId: 'Q2.a', severity: 'BLOCKING', defect: 'Conversion statement not supported',
  evidence: 'claim c3', requiredFix: 'Explain the formula',
};
const REVISE = { verdict: 'REVISE', findings: [blockingFinding] };

function mutated(): unknown {
  const draft = clone(goodAnswers());
  draft[1].claims[0].value = 925.95;
  return { answers: draft };
}

function setup(drafter: LlmProvider, reviewer: LlmProvider, over: Partial<RunInput> = {}): RunInput & { store: MemoryRunStore } {
  const store = new MemoryRunStore();
  return {
    runId: 'run-1', bundle: makeBundle(), subQuestions: SUBS, contractVersion: 'c1', drafter, reviewer, store,
    otherScrips: [{ symbol: 'BETA', isin: 'INE111B01011', names: ['Beta Industries'] }],
    now: () => new Date('2026-10-10T10:00:00Z'), ...over,
  } as RunInput & { store: MemoryRunStore };
}

const ok = (): { answers: unknown } => ({ answers: goodAnswers() });

test('clean draft and PASS review finish in the first loop', async () => {
  const drafter = new MockProvider('d', [{ json: ok() }]);
  const reviewer = new MockProvider('r', [{ json: PASS }]);
  const input = setup(drafter, reviewer);
  const result = await runReport(input);
  assert.equal(result.status, 'READY_FOR_PUBLICATION');
  assert.equal(result.loops, 0);
  assert.equal(result.validator.ok && result.gate.ok && result.leakage.ok, true);
  assert.equal(input.store.runs.get('run-1')?.status, 'READY_FOR_PUBLICATION');
  assert.equal(input.store.iterations.length, 1);
  assert.equal(input.store.iterations[0].reviewStatus, 'PASS');
});

test('the reviewer is a separate call with its own prompt and never sees the drafter system prompt', async () => {
  const drafter = new MockProvider('d', [{ json: ok() }]);
  const reviewer = new MockProvider('r', [{ json: PASS }]);
  await runReport(setup(drafter, reviewer));
  assert.notEqual(drafter.calls[0].system, reviewer.calls[0].system);
  assert.match(reviewer.calls[0].system, /independent reviewer/);
  assert.match(reviewer.calls[0].messages[0].content, /Draft under review/);
  assert.doesNotMatch(reviewer.calls[0].system, /Hard rules/);
});

test('the same provider instance cannot draft and review', async () => {
  const both = new MockProvider('x', []);
  await assert.rejects(() => runReport(setup(both, both)), ReviewerSeparationError);
});

test('a blocking reviewer finding triggers a revision that receives the finding', async () => {
  const drafter = new MockProvider('d', [{ json: ok() }, { json: ok() }]);
  const reviewer = new MockProvider('r', [{ json: REVISE }, { json: PASS }]);
  const input = setup(drafter, reviewer);
  const result = await runReport(input);
  assert.equal(result.status, 'READY_FOR_PUBLICATION');
  assert.equal(result.loops, 1);
  assert.match(drafter.calls[1].messages[0].content, /REVISION/);
  assert.match(drafter.calls[1].messages[0].content, /Conversion statement not supported/);
  assert.equal(input.store.iterations.length, 2);
  assert.deepEqual(input.store.resolutions.map(r => r.resolution), ['SENT_FOR_REVISION', 'ACKNOWLEDGED']);
});

test('deterministic defects skip the reviewer and are fed back to the drafter', async () => {
  const drafter = new MockProvider('d', [{ json: mutated() }, { json: ok() }]);
  const reviewer = new MockProvider('r', [{ json: PASS }]);
  const input = setup(drafter, reviewer);
  const result = await runReport(input);
  assert.equal(result.status, 'READY_FOR_PUBLICATION');
  assert.equal(reviewer.calls.length, 1, 'reviewer only sees the clean second draft');
  assert.match(drafter.calls[1].messages[0].content, /VALUE_MISMATCH/);
  assert.equal(input.store.iterations[0].reviewStatus, 'NOT_REVIEWED');
  assert.ok(input.store.iterations[0].defects.some(d => d.code === 'VALUE_MISMATCH'));
});

test('persistent defects escalate to a human after the maximum revision loops', async () => {
  assert.equal(MAX_REVISION_LOOPS, 2);
  const drafter = new MockProvider('d', () => ({ json: mutated() }));
  const reviewer = new MockProvider('r', []);
  const input = setup(drafter, reviewer);
  const result = await runReport(input);
  assert.equal(result.status, 'ESCALATED_HUMAN');
  assert.equal(drafter.calls.length, 3, 'first draft plus two revisions');
  assert.equal(reviewer.calls.length, 0);
  assert.equal(result.loops, 2);
  assert.ok(result.escalation?.openDefects.some(d => d.code === 'VALUE_MISMATCH'));
  assert.equal(input.store.iterations.length, 3);
  assert.equal(input.store.runs.get('run-1')?.status, 'ESCALATED_HUMAN');
});

test('persistent blocking reviewer findings escalate after three reviews', async () => {
  const drafter = new MockProvider('d', () => ({ json: ok() }));
  const reviewer = new MockProvider('r', () => ({ json: REVISE }));
  const result = await runReport(setup(drafter, reviewer));
  assert.equal(result.status, 'ESCALATED_HUMAN');
  assert.equal(reviewer.calls.length, 3);
  assert.deepEqual(result.escalation?.openFindings.map(f => f.defect), ['Conversion statement not supported']);
});

test('a PASS verdict with a blocking finding is overridden to REVISE', async () => {
  const drafter = new MockProvider('d', () => ({ json: ok() }));
  const reviewer = new MockProvider('r', () => ({ json: { verdict: 'PASS', findings: [blockingFinding] } }));
  const result = await runReport(setup(drafter, reviewer));
  assert.equal(result.status, 'ESCALATED_HUMAN');
});

test('warnings and info findings do not block publication', async () => {
  const drafter = new MockProvider('d', [{ json: ok() }]);
  const reviewer = new MockProvider('r', [{ json: { verdict: 'PASS', findings: [{ ...blockingFinding, severity: 'WARNING' }] } }]);
  const result = await runReport(setup(drafter, reviewer));
  assert.equal(result.status, 'READY_FOR_PUBLICATION');
});

test('a reviewer that tries to add facts is rejected and the run escalates', async () => {
  const drafter = new MockProvider('d', [{ json: ok() }]);
  const reviewer = new MockProvider('r', [{ json: { verdict: 'PASS', findings: [], facts: [{ factId: 'NEW', valueCr: 1 }] } }]);
  const result = await runReport(setup(drafter, reviewer));
  assert.equal(result.status, 'ESCALATED_HUMAN');
  assert.match(result.escalation?.reason ?? '', /review schema/);
  assert.equal(result.answers.length, 4, 'draft is untouched by reviewer output');
});

test('a schema-invalid draft is reported as SCHEMA_INVALID and revised', async () => {
  const drafter = new MockProvider('d', [{ json: { answers: [{ subQuestionId: 'Q1.a' }] } }, { json: ok() }]);
  const reviewer = new MockProvider('r', [{ json: PASS }]);
  const input = setup(drafter, reviewer);
  const result = await runReport(input);
  assert.equal(result.status, 'READY_FOR_PUBLICATION');
  assert.ok(input.store.iterations[0].defects.some(d => d.code === 'SCHEMA_INVALID'));
  assert.match(drafter.calls[1].messages[0].content, /SCHEMA_INVALID/);
});

test('a bare array is accepted as the draft', async () => {
  const drafter = new MockProvider('d', [{ json: goodAnswers() }]);
  const reviewer = new MockProvider('r', [{ json: PASS }]);
  assert.equal((await runReport(setup(drafter, reviewer))).status, 'READY_FOR_PUBLICATION');
});

test('leakage of another scrip blocks publication and is fed back', async () => {
  const leaky = clone(goodAnswers());
  leaky[1].narrative = leaky[1].narrative + ' Beta Industries did better.';
  const drafter = new MockProvider('d', [{ json: { answers: leaky } }, { json: ok() }]);
  const reviewer = new MockProvider('r', [{ json: PASS }]);
  const input = setup(drafter, reviewer);
  await runReport(input);
  assert.ok(input.store.iterations[0].defects.some(d => d.code === 'CROSS_SCRIP_LEAKAGE'));
  assert.equal(reviewer.calls.length, 1);
});

test('incomplete answers are caught by the gate and never reach the reviewer', async () => {
  const partial = clone(goodAnswers());
  partial.pop();
  const drafter = new MockProvider('d', () => ({ json: { answers: partial } }));
  const reviewer = new MockProvider('r', []);
  const result = await runReport(setup(drafter, reviewer));
  assert.equal(result.status, 'ESCALATED_HUMAN');
  assert.ok(result.iterations[0].defects.some(d => d.code === 'MISSING_ANSWER'));
});

test('inline bundle can be switched off for host mode', async () => {
  const drafter = new MockProvider('d', [{ json: ok() }]);
  const reviewer = new MockProvider('r', [{ json: PASS }]);
  await runReport(setup(drafter, reviewer, { inlineBundle: false }));
  assert.doesNotMatch(drafter.calls[0].messages[0].content, /"facts"/);
  const inlined = new MockProvider('d2', [{ json: ok() }]);
  await runReport(setup(inlined, new MockProvider('r2', [{ json: PASS }])));
  assert.match(inlined.calls[0].messages[0].content, /"facts"/);
});

class Metered implements LlmProvider {
  readonly meteredByApi = true;
  calls = 0;
  constructor(readonly id: string, private readonly json: unknown, private readonly cost: number) {}
  async complete(_request: LlmRequest): Promise<LlmResponse> {
    this.calls += 1;
    return { text: '', json: this.json, usage: { inTok: 10, outTok: 10, costUsd: this.cost } };
  }
}

test('run spend cap stops a metered provider and escalates', async () => {
  const drafter = new Metered('api-d', ok(), 0.6);
  const reviewer = new MockProvider('r', () => ({ json: REVISE }));
  const input = setup(drafter, reviewer, { spendCapRunUsd: 1 });
  const result = await runReport(input);
  assert.equal(result.status, 'ESCALATED_HUMAN');
  assert.match(result.escalation?.reason ?? '', /Spend cap/);
  assert.equal(drafter.calls, 2);
  assert.ok(result.spendUsd >= 1.2 - 1e-9);
});

test('daily spend cap counts earlier spend', async () => {
  const drafter = new Metered('api-d', ok(), 0.1);
  const reviewer = new MockProvider('r', [{ json: PASS }]);
  const result = await runReport(setup(drafter, reviewer, { spendCapDayUsd: 5, spentTodayUsd: 5 }));
  assert.equal(result.status, 'ESCALATED_HUMAN');
  assert.equal(drafter.calls, 0);
});

test('spend caps do not apply to host-style providers; reported usage is recorded', async () => {
  const drafter = new MockProvider('host-d', () => ({ json: ok(), usage: { inTok: 1000, outTok: 200, costUsd: 99 } }));
  const reviewer = new MockProvider('host-r', [{ json: PASS, usage: { inTok: 500, outTok: 50 } }]);
  const result = await runReport(setup(drafter, reviewer, { spendCapRunUsd: 0.01 }));
  assert.equal(result.status, 'READY_FOR_PUBLICATION');
  assert.deepEqual(result.usage, { inTok: 1500, outTok: 250 });
  assert.equal(result.spendUsd, 99);
});

test('host agent run: pending task marks the run AWAITING_HOST and resumes after the response is written', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'wq29-orch-'));
  const bundle = makeBundle();
  const bundlePath = writeBundleFile(dir, bundle);
  const drafter = new HostAgentProvider({ role: 'DRAFTER', symbol: 'ALPHA', workDir: dir, bundlePath });
  const reviewer = new MockProvider('review', [{ json: PASS }]);
  const input = setup(drafter, reviewer, { inlineBundle: false });
  await assert.rejects(() => runReport(input), HostTaskPendingError);
  assert.equal(input.store.runs.get('run-1')?.status, 'AWAITING_HOST');
  assert.equal(input.store.runs.get('run-1')?.finishedAt, null);

  const { writeFileSync, readdirSync, readFileSync } = await import('node:fs');
  const taskFile = readdirSync(dir).find(f => f.endsWith('.task.json')) as string;
  const task = JSON.parse(readFileSync(path.join(dir, taskFile), 'utf8')) as { outputPath: string; promptPath: string };
  assert.match(readFileSync(task.promptPath, 'utf8'), /Sub-questions to answer/);
  writeFileSync(task.outputPath, JSON.stringify(ok()));
  const resumed = await runReport(input);
  assert.equal(resumed.status, 'READY_FOR_PUBLICATION');
});

test('unexpected provider errors mark the run ERROR and propagate', async () => {
  const drafter = new MockProvider('d', [{ error: 'network down' }]);
  const input = setup(drafter, new MockProvider('r', []));
  await assert.rejects(() => runReport(input), /network down/);
  assert.equal(input.store.runs.get('run-1')?.status, 'ERROR');
});
