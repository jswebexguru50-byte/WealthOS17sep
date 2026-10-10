import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as domain from '../../src/server/research_v2/domain/index.js';
import type {
  AnswerState, Bundle, BundleIndexEntry, CalcResult, FactSource, HostResponse, HostTask, LlmProvider,
  QuestionContract, ReadinessResult, ResearchItem, ScorecardRow, ScorecardStatus, SubAnswer, SubQuestion,
} from '../../src/server/research_v2/domain/index.js';

test('contract types are importable and structurally usable', () => {
  const states: AnswerState[] = ['ANSWERED', 'PARTIAL', 'NOT_DISCLOSED', 'NOT_APPLICABLE'];
  const statuses: ScorecardStatus[] = [
    'MEETS_THRESHOLD', 'BELOW_THRESHOLD', 'ABOVE_THRESHOLD', 'UNVERIFIABLE', 'NOT_APPLICABLE',
  ];
  assert.equal(states.length, 4);
  assert.equal(statuses.length, 5);
  const calc: CalcResult = {
    calcId: 'x|FY26', name: 'x', value: null, unit: 'X', period: 'FY26', scope: null,
    inputs: [], formula: '', status: 'INSUFFICIENT_DATA', note: '', missing: ['a'],
  };
  assert.equal(calc.value, null);
  const src: FactSource = { facts: () => [] };
  assert.deepEqual(src.facts({ asOf: '2026-10-10T00:00:00Z' }), []);
  // type-only references to keep every contract imported
  const refs: unknown[] = [];
  refs.push(
    null as unknown as Bundle, null as unknown as BundleIndexEntry, null as unknown as HostResponse,
    null as unknown as HostTask, null as unknown as LlmProvider, null as unknown as QuestionContract,
    null as unknown as ReadinessResult, null as unknown as ResearchItem, null as unknown as ScorecardRow,
    null as unknown as SubAnswer, null as unknown as SubQuestion,
  );
  assert.equal(refs.length, 11);
});

test('DEFAULT_THRESHOLDS carry the owner-set values', () => {
  const t = domain.DEFAULT_THRESHOLDS;
  assert.deepEqual(t.promoterPct, { value: 66.6, comparator: '>' });
  assert.deepEqual(t.profitableQuarters, { value: 8, comparator: '>=' });
  assert.equal(t.roce.value, 35);
  assert.equal(t.roe.value, 25);
  assert.deepEqual(t.promoterPledge, { value: 0, comparator: '<=', tolerance: 0.01 });
  assert.deepEqual(t.institutional, { value: null, comparator: 'info' });
  assert.deepEqual(t.cfoToEbitda, { value: 0.5, comparator: '>=' });
});
