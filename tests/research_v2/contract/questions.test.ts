import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  QUESTIONS,
  OUT_OF_SCOPE_REASON,
  allSubQuestions,
  getQuestion,
  outOfScopeSubQuestionIds,
} from '../../../src/server/research_v2/contract/questions.js';
import { METRIC_DEFINITIONS } from '../../../src/server/research_v2/facts/metricDefinitions.js';

const CONTRACT_REF = 'origin/ai-review:scripts/fundamental/institutional29/contract.mjs';

test('every topic is a non-empty unique string (hermetic)', () => {
  const topics = QUESTIONS.map(q => q.topic);
  assert.ok(topics.every(t => t.length > 3));
  assert.equal(new Set(topics).size, 29);
});

test('29 questions with sequential ids', () => {
  assert.equal(QUESTIONS.length, 29);
  QUESTIONS.forEach((q, i) => assert.equal(q.id, i + 1));
});

test('sub-question ids are unique and well formed', () => {
  const ids = allSubQuestions().map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const q of QUESTIONS) {
    assert.ok(q.subQuestions.length >= 3, `Q${q.id} needs sub-questions`);
    q.subQuestions.forEach((s, i) => {
      assert.equal(s.id, `Q${q.id}.${String.fromCharCode(97 + i)}`);
      assert.equal(s.question, q.id);
    });
  }
});

test('every required metric exists in metricDefinitions', () => {
  const known = new Set(METRIC_DEFINITIONS.map(d => d.metric));
  for (const s of allSubQuestions()) {
    for (const m of s.requiredMetrics) assert.ok(known.has(m), `${s.id} unknown metric ${m}`);
  }
});

test('out-of-scope set is exactly Q1, Q28, Q29 with the reason', () => {
  const scopes = QUESTIONS.filter(q => q.appliesIn === 'OUT_OF_SCOPE').map(q => q.id);
  assert.deepEqual(scopes, [1, 28, 29]);
  const ids = outOfScopeSubQuestionIds();
  assert.ok(ids.length > 0);
  assert.ok(ids.every(id => /^Q(1|28|29)\./.test(id)));
  for (const s of allSubQuestions()) {
    const out = [1, 28, 29].includes(s.question);
    assert.equal(s.appliesIn, out ? 'OUT_OF_SCOPE' : 'FUNDAMENTAL');
    assert.equal(s.outOfScopeReason, out ? OUT_OF_SCOPE_REASON : undefined);
  }
  assert.equal(OUT_OF_SCOPE_REASON, 'Out of scope: fundamental analysis only (deferred)');
});

test('premise checks exist for Q1, Q2, Q4, Q24 only', () => {
  const withPremise = QUESTIONS.filter(q => q.premise).map(q => q.id);
  assert.deepEqual(withPremise, [1, 2, 4, 24]);
  assert.equal(getQuestion(2)?.premise?.test, 'has_order_book');
  assert.equal(getQuestion(4)?.premise?.test, 'has_order_book');
  assert.equal(getQuestion(24)?.premise?.test, 'floating_rate_debt_disclosed');
});

test('Q23 watchlist is fundamental and has no technical or price source needs', () => {
  const q = getQuestion(23);
  assert.ok(q);
  assert.equal(q.appliesIn, 'FUNDAMENTAL');
  assert.ok(!/price|technical|volume/i.test(q.question));
  for (const s of q.subQuestions) assert.ok(!/price|technical|volume/i.test(s.text));
});

test('calculators named in the brief are referenced', () => {
  const calcs = new Set(allSubQuestions().flatMap(s => s.calcIds));
  const wanted = [
    'cfo_to_pat', 'fcf', 'ebitda_margin', 'dso', 'dio', 'dpo', 'ccc',
    'interest_coverage', 'net_debt_to_ebitda', 'rate_sensitivity_25bp', 'revenue_cagr_3y',
  ];
  for (const c of wanted) assert.ok(calcs.has(c), c);
});

test('in-scope questions need at least one source and metric ids are not duplicated', () => {
  for (const s of allSubQuestions()) {
    assert.ok(s.sourceNeeds.length > 0, `${s.id} has no source need`);
    assert.equal(new Set(s.requiredMetrics).size, s.requiredMetrics.length, s.id);
  }
});

test('lookup helpers handle missing ids', () => {
  assert.equal(getQuestion(0), undefined);
  assert.equal(getQuestion(30), undefined);
  assert.equal(getQuestion(7)?.topic, 'Reinvestment Runway');
});

test('topics match contract.mjs (skipped when the reference ref is not fetched)', t => {
  let src: string;
  try {
    src = execFileSync('git', ['show', CONTRACT_REF], { encoding: 'utf8', maxBuffer: 1 << 24, stdio: 'pipe' });
  } catch {
    t.skip(`${CONTRACT_REF} not available in this clone`);
    return;
  }
  const rows = [...src.matchAll(/^\s*q\((\d+),\s*'[^']*',\s*'([^']*)'/gm)];
  assert.equal(rows.length, 29);
  for (const m of rows) assert.equal(getQuestion(Number(m[1]))?.topic, m[2]);
});
