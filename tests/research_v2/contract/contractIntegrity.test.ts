import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUESTIONS, allSubQuestions, getQuestion } from '../../../src/server/research_v2/contract/questions.js';

/** Minimal input metrics each calculator needs (standard formulas and the spec). */
const CALC_INPUTS: Record<string, string[]> = {
  cfo_to_pat: ['cfo', 'pat_total'],
  roe: ['pat_total', 'equity_total'],
  roce: ['pbt_before_exceptional', 'finance_cost'],
  ebitda_margin: ['ebitda_derived', 'revenue_from_operations'],
  net_debt_to_ebitda: ['borrowings_total', 'cash_and_equivalents', 'ebitda_derived'],
  interest_coverage: ['ebitda_derived', 'finance_cost'],
  fcf: ['cfo', 'capex_cash_outflow'],
  dso: ['trade_receivables', 'revenue_from_operations'],
  dio: ['inventory', 'materials_cost'],
  dpo: ['trade_payables', 'materials_cost'],
  ccc: ['trade_receivables', 'inventory', 'trade_payables', 'revenue_from_operations', 'materials_cost'],
  gross_margin: ['revenue_from_operations', 'materials_cost'],
  pat_margin: ['pat_total', 'revenue_from_operations'],
};

const SOURCE_FILE = 'src/server/research_v2/contract/questions.ts';

test('requiredMetrics cover the inputs of every calculator the sub-question names', () => {
  const bad: string[] = [];
  for (const s of allSubQuestions()) {
    if (s.appliesIn !== 'FUNDAMENTAL') continue;
    for (const c of s.calcIds) {
      for (const m of CALC_INPUTS[c] ?? []) {
        if (!s.requiredMetrics.includes(m)) bad.push(`${s.id}: calc ${c} needs ${m}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('DIO/DPO/CCC/gross_margin sub-questions declare a cost-of-goods input metric', () => {
  const bad = allSubQuestions()
    .filter(s => s.appliesIn === 'FUNDAMENTAL')
    .filter(s => s.calcIds.some(c => ['dio', 'dpo', 'ccc', 'gross_margin'].includes(c)))
    .filter(s => !s.requiredMetrics.includes('materials_cost'))
    .map(s => s.id);
  assert.deepEqual(bad, []);
});

test('rate sensitivity never accepts total borrowings as its debt input', () => {
  const rate = allSubQuestions().filter(s => s.calcIds.includes('rate_sensitivity_25bp'));
  assert.deepEqual(rate.map(s => s.id), ['Q24.c', 'Q24.d']);
  for (const s of rate) assert.ok(!s.requiredMetrics.includes('borrowings_total'), s.id);
  assert.ok(!getQuestion(24)!.subQuestions[0].requiredMetrics.includes('borrowings_total'));
});

test('exported contract is deeply immutable', () => {
  const q = getQuestion(2)!;
  const sub = q.subQuestions[0];
  assert.ok(Object.isFrozen(QUESTIONS) && Object.isFrozen(q) && Object.isFrozen(q.subQuestions));
  assert.ok(Object.isFrozen(sub) && Object.isFrozen(sub.requiredMetrics) && Object.isFrozen(sub.sourceNeeds));
  assert.throws(() => { (q as { appliesIn: string }).appliesIn = 'OUT_OF_SCOPE'; }, TypeError);
  assert.throws(() => { (sub.requiredMetrics as string[]).push('x'); }, TypeError);
  assert.throws(() => { (QUESTIONS as unknown[]).pop(); }, TypeError);
  assert.equal(getQuestion(2)!.appliesIn, 'FUNDAMENTAL');
});

test('source lines stay within 120 characters', () => {
  const lines = readFileSync(SOURCE_FILE, 'utf8').split('\n');
  const long = lines.map((l, i) => [i + 1, l.length]).filter(([, n]) => (n as number) > 120);
  assert.deepEqual(long, []);
});

test('sub-question counts per question match spec section 4', () => {
  const expected = [5, 5, 4, 4, 4, 4, 4, 4, 5, 5, 4, 4, 3, 4, 5, 4, 5, 4, 5, 5, 4, 6, 3, 5, 3, 3, 4, 4, 5];
  assert.deepEqual(QUESTIONS.map(q => q.subQuestions.length), expected);
});

test('legal, regulatory and enforcement sub-questions request WEB_PRIMARY', () => {
  for (const id of ['Q18.b', 'Q18.c', 'Q18.d', 'Q19.b']) {
    const s = allSubQuestions().find(x => x.id === id)!;
    assert.ok(s.sourceNeeds.includes('WEB_PRIMARY'), id);
  }
});

test('WEB_PRIMARY is requested only by legal and regulatory sub-questions', () => {
  const ids = allSubQuestions().filter(s => s.sourceNeeds.includes('WEB_PRIMARY')).map(s => s.id);
  assert.deepEqual(ids, ['Q18.b', 'Q18.c', 'Q18.d', 'Q19.b']);
});

test('weak premises are reworded: Q1 not bullish, Q2 not presupposing an order book', () => {
  assert.ok(!/bullish/i.test(getQuestion(1)!.question));
  assert.match(getQuestion(2)!.question, /where one is reported/);
});

test('out-of-scope questions still keep their scope after the freeze', () => {
  for (const id of [1, 28, 29]) assert.equal(getQuestion(id)!.appliesIn, 'OUT_OF_SCOPE');
});
