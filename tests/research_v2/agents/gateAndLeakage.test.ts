import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completenessGate } from '../../../src/server/research_v2/agents/completenessGate.js';
import { leakageCheck, type OtherScrip } from '../../../src/server/research_v2/agents/leakageCheck.js';
import type { SubAnswer } from '../../../src/server/research_v2/domain/index.js';
import { clone, goodAnswers, makeBundle, SUBS } from './fixtures/fixture.js';

const gateCodes = (answers: SubAnswer[], bundle = makeBundle()): string[] =>
  completenessGate(answers, SUBS, bundle).defects.map(d => d.code);

test('a complete draft passes the gate', () => {
  assert.deepEqual(completenessGate(goodAnswers(), SUBS, makeBundle()).defects, []);
});

test('missing, duplicate and unknown sub-questions are reported', () => {
  const draft = clone(goodAnswers());
  draft.splice(1, 1);
  draft.push(clone(draft[0]));
  draft.push({ ...clone(draft[0]), subQuestionId: 'Q99.z' });
  const codes = gateCodes(draft);
  assert.ok(codes.includes('MISSING_ANSWER'));
  assert.ok(codes.includes('DUPLICATE_ANSWER'));
  assert.ok(codes.includes('UNKNOWN_SUBQUESTION'));
});

test('non-terminal state is rejected', () => {
  const draft = clone(goodAnswers());
  (draft[1] as { state: string }).state = 'IN_PROGRESS';
  assert.ok(gateCodes(draft).includes('NON_TERMINAL_STATE'));
});

test('ANSWERED needs at least one claim with refs', () => {
  const draft = clone(goodAnswers());
  draft[1].claims = [];
  assert.ok(gateCodes(draft).includes('ANSWERED_WITHOUT_CLAIMS'));
  const noRefs = clone(goodAnswers());
  noRefs[1].claims.forEach(c => { c.refs = []; });
  assert.ok(gateCodes(noRefs).includes('ANSWERED_WITHOUT_CLAIMS'));
});

test('claims without refs are flagged against their claim id', () => {
  const draft = clone(goodAnswers());
  draft[1].claims[0].refs = [];
  const hit = completenessGate(draft, SUBS).defects.find(d => d.code === 'CLAIM_WITHOUT_REFS');
  assert.equal(hit?.claimId, 'c1');
});

test('PARTIAL needs both gap and nextAction', () => {
  const draft = clone(goodAnswers());
  delete draft[2].nextAction;
  assert.ok(gateCodes(draft).includes('PARTIAL_WITHOUT_GAP'));
  const blank = clone(goodAnswers());
  blank[2].gap = '  ';
  assert.ok(gateCodes(blank).includes('PARTIAL_WITHOUT_GAP'));
});

test('NOT_DISCLOSED needs sourcesSearched', () => {
  const draft = clone(goodAnswers());
  draft[2] = { subQuestionId: 'Q3.a', state: 'NOT_DISCLOSED', claims: [], narrative: 'Not disclosed anywhere searched.' };
  assert.ok(gateCodes(draft).includes('NOT_DISCLOSED_WITHOUT_SOURCES'));
  draft[2].sourcesSearched = ['annual report FY26', 'concall Q3 FY26'];
  assert.ok(!gateCodes(draft).includes('NOT_DISCLOSED_WITHOUT_SOURCES'));
});

test('NOT_APPLICABLE needs a failed premise check for in-scope questions', () => {
  const draft = clone(goodAnswers());
  delete draft[3].premiseCheck;
  assert.ok(gateCodes(draft).includes('NA_WITHOUT_PREMISE_CHECK'));
  const holds = clone(goodAnswers());
  holds[3].premiseCheck = { holds: true, note: 'There is an order book' };
  assert.ok(gateCodes(holds).includes('NA_PREMISE_HOLDS'));
});

test('out-of-scope sub-questions must be NOT_APPLICABLE and cite the reason or a premise check', () => {
  const answered = clone(goodAnswers());
  answered[0] = { ...answered[1], subQuestionId: 'Q1.a' };
  assert.ok(gateCodes(answered).includes('OUT_OF_SCOPE_MUST_BE_NA'));
  const bare = clone(goodAnswers());
  bare[0] = { subQuestionId: 'Q1.a', state: 'NOT_APPLICABLE', claims: [], narrative: 'Skipped.' };
  assert.ok(gateCodes(bare).includes('NA_WITHOUT_PREMISE_CHECK'));
  const reasoned = clone(goodAnswers());
  reasoned[0] = { subQuestionId: 'Q1.a', state: 'NOT_APPLICABLE', claims: [],
    narrative: 'Out of scope: fundamental analysis only (deferred).' };
  assert.deepEqual(gateCodes(reasoned), []);
});

test('empty narrative is rejected', () => {
  const draft = clone(goodAnswers());
  draft[2].narrative = '   ';
  assert.ok(gateCodes(draft).includes('EMPTY_NARRATIVE'));
});

test('recommendation and overall-verdict wording is rejected, buyback is not', () => {
  for (const text of ['We rate it a strong buy.', 'A price target of the stock is unclear.', 'Overall pass on all filters.',
    'We recommend to accumulate.', 'Sell rating applies.']) {
    const draft = clone(goodAnswers());
    draft[2].narrative = text;
    assert.ok(gateCodes(draft).includes('FORBIDDEN_LANGUAGE'), text);
  }
  const fine = clone(goodAnswers());
  fine[2].narrative = 'The company announced a share buyback; sellers of stock are not discussed here.';
  assert.ok(!gateCodes(fine).includes('FORBIDDEN_LANGUAGE'));
});

test('readiness contradictions: ANSWERED on DATA_INSUFFICIENT blocks, PARTIAL on READY warns', () => {
  const bundle = makeBundle();
  bundle.readiness['Q2.a'] = { subQuestionId: 'Q2.a', state: 'DATA_INSUFFICIENT', satisfiedBy: [], gaps: [] };
  bundle.readiness['Q3.a'] = { subQuestionId: 'Q3.a', state: 'READY', satisfiedBy: [], gaps: [] };
  const verdict = completenessGate(goodAnswers(), SUBS, bundle);
  const hits = verdict.defects.filter(d => d.code === 'ANSWER_CONTRADICTS_READINESS');
  assert.equal(hits.length, 2);
  assert.deepEqual(hits.map(h => h.severity).sort(), ['BLOCKING', 'WARNING']);
  assert.equal(verdict.ok, false);
});

test('identical narratives across sub-questions warn about boilerplate', () => {
  const draft = clone(goodAnswers());
  const text = 'This long sentence is reused verbatim for two different sub-questions in the draft.';
  draft[2].narrative = text;
  draft[3].narrative = text;
  const hit = completenessGate(draft, SUBS).defects.find(d => d.code === 'DUPLICATE_NARRATIVE');
  assert.equal(hit?.severity, 'WARNING');
});

const OTHERS: OtherScrip[] = [
  { symbol: 'BETA', isin: 'INE111B01011', names: ['Beta Industries', 'BETA IND'] },
  { symbol: 'GAMMA', isin: 'INE222C01022', names: ['Gamma Ltd'] },
];

test('leakage: peer names are allowed in Q3 and Q17 only', () => {
  const draft = clone(goodAnswers());
  assert.equal(leakageCheck(draft, OTHERS).ok, true, 'Q3.a names Beta Industries and is exempt');
  draft[1].narrative = 'Compared with Beta Industries the cash conversion is high.';
  const verdict = leakageCheck(draft, OTHERS);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.defects[0].code, 'CROSS_SCRIP_LEAKAGE');
  assert.equal(verdict.defects[0].subQuestionId, 'Q2.a');
});

test('leakage: ISINs, symbols and aliases are caught in claims, gaps and notes, case-insensitively', () => {
  const byIsin = clone(goodAnswers());
  byIsin[1].claims[0].text = 'Peer INE222C01022 reports similar EBITDA';
  assert.equal(leakageCheck(byIsin, OTHERS).ok, false);
  const byGap = clone(goodAnswers());
  byGap[3].premiseCheck = { holds: false, note: 'gamma ltd has an order book but this company does not' };
  assert.equal(leakageCheck(byGap, OTHERS).ok, false);
  const bySymbol = clone(goodAnswers());
  bySymbol[1].narrative = 'The BETA stock is discussed.';
  assert.equal(leakageCheck(bySymbol, OTHERS).ok, false);
});

test('leakage: names inside longer words do not match', () => {
  const draft = clone(goodAnswers());
  draft[1].narrative = 'Alphabetical betas and gammas are not company names.';
  assert.equal(leakageCheck(draft, OTHERS).ok, true);
});

test('leakage: an empty peer list never fails', () => {
  assert.equal(leakageCheck(goodAnswers(), []).ok, true);
});
