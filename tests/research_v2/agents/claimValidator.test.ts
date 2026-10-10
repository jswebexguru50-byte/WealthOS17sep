import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateClaims } from '../../../src/server/research_v2/agents/claimValidator.js';
import type { Claim, SubAnswer } from '../../../src/server/research_v2/domain/index.js';
import { clone, goodAnswers, makeBundle } from './fixtures/fixture.js';

const bundle = makeBundle();

function answerWith(claim: Partial<Claim>, narrative = 'Plain text without figures.'): SubAnswer[] {
  const base: Claim = {
    claimId: 'x1', text: 'EBITDA', value: 852.95, unit: 'INR_CR', period: 'FY26', scope: 'CONSOLIDATED',
    refs: ['F_EBITDA'], kind: 'FACT',
  };
  return [{ subQuestionId: 'Q2.a', state: 'ANSWERED', narrative, claims: [{ ...base, ...claim }] }];
}

const codes = (answers: SubAnswer[]): string[] => validateClaims(bundle, answers).defects.map(d => d.code);

test('a fully valid draft produces no defects', () => {
  const verdict = validateClaims(bundle, goodAnswers());
  assert.deepEqual(verdict.defects, []);
  assert.equal(verdict.ok, true);
});

test('mutated number is rejected as VALUE_MISMATCH', () => {
  assert.ok(codes(answerWith({ value: 925.95 })).includes('VALUE_MISMATCH'));
});

test('values inside the 0.5 percent tolerance pass, just outside fail', () => {
  assert.deepEqual(codes(answerWith({ value: 852.95 * 1.004 })), []);
  assert.ok(codes(answerWith({ value: 852.95 * 1.01 })).includes('VALUE_MISMATCH'));
});

test('tolerance can be tightened through options', () => {
  const verdict = validateClaims(bundle, answerWith({ value: 853.5 }), { relativeTolerance: 0.0001, absoluteTolerance: 0.001 });
  assert.ok(verdict.defects.some(d => d.code === 'VALUE_MISMATCH'));
});

test('missing ref is rejected', () => {
  assert.ok(codes(answerWith({ refs: ['F_NOPE'] })).includes('MISSING_REF'));
});

test('one missing ref among valid refs is still rejected', () => {
  assert.ok(codes(answerWith({ refs: ['F_EBITDA', 'F_NOPE'] })).includes('MISSING_REF'));
});

test('wrong unit is rejected', () => {
  assert.ok(codes(answerWith({ unit: 'PCT' })).includes('UNIT_MISMATCH'));
});

test('unit aliases are accepted', () => {
  for (const unit of ['Cr', 'crore', 'INR_CR', '₹ Cr']) assert.deepEqual(codes(answerWith({ unit })), [], unit);
});

test('wrong period is rejected', () => {
  assert.ok(codes(answerWith({ period: 'FY25' })).includes('PERIOD_MISMATCH'));
  assert.ok(codes(answerWith({ period: 'Q3 FY26' })).includes('PERIOD_MISMATCH'));
});

test('period label forms for an annual and a quarterly fact', () => {
  for (const period of ['FY26', 'FY2026', 'fy 26', '2026-03-31', '31 Mar 2026', 'FY2025-26']) {
    assert.deepEqual(codes(answerWith({ period })), [], period);
  }
  const quarter = answerWith({ value: 1300, refs: ['F_Q3REV'], period: 'Q3 FY26' });
  assert.deepEqual(codes(quarter), []);
  assert.ok(codes(answerWith({ value: 1300, refs: ['F_Q3REV'], period: 'FY26' })).includes('PERIOD_MISMATCH'));
});

test('wrong scope is rejected', () => {
  assert.ok(codes(answerWith({ scope: 'STANDALONE' })).includes('SCOPE_MISMATCH'));
});

test('standalone value cited with consolidated scope fails on value or scope', () => {
  const result = codes(answerWith({ value: 4100, refs: ['F_STANDALONE_REV'], scope: 'CONSOLIDATED' }));
  assert.ok(result.includes('SCOPE_MISMATCH'));
});

test('missing unit, period and scope labels are rejected', () => {
  const found = codes(answerWith({ unit: undefined, period: undefined, scope: undefined }));
  assert.equal(found.filter(c => c === 'MISSING_LABEL').length, 3);
});

test('numeric claim without refs is rejected', () => {
  assert.ok(codes(answerWith({ refs: [] })).includes('CLAIM_WITHOUT_REFS'));
});

test('reference with a null value cannot support a numeric claim', () => {
  assert.ok(codes(answerWith({ value: 5, refs: ['F_NULL'] })).includes('NULL_VALUE_REF'));
});

test('claim kind must match the reference kind', () => {
  assert.ok(codes(answerWith({ kind: 'FACT', refs: ['cfo_to_ebitda|FY26|CONSOLIDATED'], value: 0.909, unit: 'x' }))
    .includes('REF_KIND_MISMATCH'));
});

test('unclaimed number in the narrative is flagged', () => {
  const found = codes(answerWith({}, 'EBITDA was 852.95 Cr but capex was ₹410 Cr.'));
  assert.ok(found.includes('UNCLAIMED_NUMBER'));
});

test('injected wrong number in a narrative of a good draft yields UNCLAIMED_NUMBER', () => {
  const draft = clone(goodAnswers());
  draft[1].narrative = draft[1].narrative.replace('852.95', '925.95');
  assert.ok(validateClaims(bundle, draft).defects.some(d => d.code === 'UNCLAIMED_NUMBER'));
});

test('number forms: percent, multiple, comma rupees and lakh are scanned', () => {
  for (const text of ['margin of 18.5%', 'trades at 27.4x earnings', 'revenue of ₹1,234.5 Cr', 'a loss of 85 lakh',
    'a figure of 1,250', 'cash of Rs. 320 crore']) {
    assert.ok(codes(answerWith({}, text)).includes('UNCLAIMED_NUMBER'), text);
  }
});

test('labels, ids, years and small counts are not mistaken for figures', () => {
  const text = 'See Q2.a and Q3 FY26 versus FY25 on 31 March 2026 (2026-03-31); in 2026 there were 3 segments, the 2nd of 5.';
  const found = codes(answerWith({}, text)).filter(c => c !== 'PERIOD_LABEL_UNSUPPORTED');
  assert.deepEqual(found, []);
});

test('rounded and percent-as-fraction narrative numbers are covered by claims', () => {
  const draft = answerWith({ value: 0.909, unit: 'x', refs: ['cfo_to_ebitda|FY26|CONSOLIDATED'], kind: 'CALC' },
    'Cash conversion was 0.91x, i.e. 90.9% of EBITDA, or about ₹853 Cr elsewhere.');
  const found = validateClaims(bundle, draft).defects.filter(d => d.code === 'UNCLAIMED_NUMBER');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /853/);
});

test('numbers inside a claim text must also be claimed', () => {
  assert.ok(codes(answerWith({ text: 'EBITDA 852.95 Cr, up from 700 Cr' })).includes('UNCLAIMED_NUMBER'));
});

test('quarantined evidence is rejected', () => {
  assert.ok(codes(answerWith({ value: 10, refs: ['F_QUARANTINED'] })).includes('QUARANTINED_EVIDENCE'));
});

test('SIMULATED evidence is rejected, even as inference', () => {
  assert.ok(codes(answerWith({ value: 11, refs: ['F_SIM'] })).includes('SIMULATED_EVIDENCE'));
  assert.ok(codes(answerWith({ value: 11, refs: ['F_SIM'], kind: 'INFERENCE' })).includes('SIMULATED_EVIDENCE'));
});

test('provider LATEST values are not statutory proof', () => {
  assert.ok(codes(answerWith({ value: 12, refs: ['F_LATEST'] })).includes('LATEST_AS_STATUTORY'));
});

test('secondary lead facts are rejected as proof but allowed as labelled inference', () => {
  assert.ok(codes(answerWith({ value: 13, refs: ['F_LEAD'] })).includes('SECONDARY_AS_STATUTORY'));
  assert.ok(!codes(answerWith({ value: 13, refs: ['F_LEAD'], kind: 'INFERENCE' })).includes('SECONDARY_AS_STATUTORY'));
});

test('facts that failed period reconciliation are excluded', () => {
  assert.ok(codes(answerWith({ value: 14, refs: ['F_RECON'] })).includes('RECON_FAILED_EVIDENCE'));
});

test('secondary research items can be cited only as inference; rejected items never', () => {
  const lead = answerWith({ value: undefined, refs: ['R_LEAD'], kind: 'RESEARCH', text: 'A blog says margins rise' });
  assert.ok(codes(lead).includes('SECONDARY_AS_STATUTORY'));
  const asInference = answerWith({ value: undefined, refs: ['R_LEAD'], kind: 'INFERENCE', text: 'Lead only' });
  assert.deepEqual(codes(asInference), []);
  const rejected = answerWith({ value: undefined, refs: ['R_REJECTED'], kind: 'INFERENCE', text: 'Rejected' });
  assert.ok(codes(rejected).includes('REJECTED_EVIDENCE'));
});

test('a number stated by a primary research item is verified against its excerpt', () => {
  const ok = answerWith({ value: 1200, unit: 'INR_CR', period: undefined, scope: undefined, refs: ['R_PRIMARY'],
    kind: 'RESEARCH', text: 'Order book per management' });
  assert.deepEqual(codes(ok), []);
  const wrong = answerWith({ value: 1900, refs: ['R_PRIMARY'], kind: 'RESEARCH', text: 'Order book per management' });
  assert.ok(codes(wrong).includes('VALUE_MISMATCH'));
});

test('unsupported calculation references are rejected', () => {
  const asCalc = (id: string, value: number): SubAnswer[] =>
    answerWith({ value, unit: 'x', refs: [id], kind: 'CALC' });
  assert.ok(codes(asCalc('bad_calc', 1)).includes('UNSUPPORTED_CALC'));
  assert.ok(codes(asCalc('orphan_calc', 1.5)).includes('UNSUPPORTED_CALC'));
});

test('a calculation built on quarantined inputs, directly or nested, is rejected', () => {
  const direct = answerWith({ value: 2, unit: 'x', refs: ['tainted_calc'], kind: 'CALC' });
  assert.ok(codes(direct).includes('QUARANTINED_EVIDENCE'));
  const nested = answerWith({ value: 3, unit: 'x', refs: ['nested_calc'], kind: 'CALC' });
  assert.ok(codes(nested).includes('QUARANTINED_EVIDENCE'));
});

test('duplicate claim ids are rejected', () => {
  const draft = clone(goodAnswers());
  draft[1].claims[1].claimId = 'c1';
  assert.ok(validateClaims(bundle, draft).defects.some(d => d.code === 'DUPLICATE_CLAIM_ID'));
});

test('narrative fiscal label that no claim supports is a warning, not a blocker', () => {
  const draft = answerWith({}, 'Compared with FY22 the position is different.');
  const verdict = validateClaims(bundle, draft);
  const hit = verdict.defects.find(d => d.code === 'PERIOD_LABEL_UNSUPPORTED');
  assert.equal(hit?.severity, 'WARNING');
  assert.equal(verdict.ok, true);
});

test('a non-numeric claim must still resolve its refs', () => {
  const draft = answerWith({ value: undefined, refs: ['F_NOPE'], text: 'Qualitative' });
  assert.ok(codes(draft).includes('MISSING_REF'));
});
