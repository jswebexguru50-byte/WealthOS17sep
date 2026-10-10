import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THRESHOLDS } from '../../../src/server/research_v2/domain/scorecard.js';
import type {
  Bundle, CalcResult, FactSource, HostResponse, HostTask, LlmProvider, QuestionContract, ReadinessResult,
  ResearchItem, ScorecardRow, SubAnswer,
} from '../../../src/server/research_v2/domain/index.js';

test('default thresholds match the owner-approved scorecard', () => {
  assert.deepEqual(DEFAULT_THRESHOLDS.promoterPct, { value: 66.6, comparator: '>' });
  assert.deepEqual(DEFAULT_THRESHOLDS.profitableQuarters, { value: 8, comparator: '>=' });
  assert.deepEqual(DEFAULT_THRESHOLDS.roce, { value: 35, comparator: '>=' });
  assert.deepEqual(DEFAULT_THRESHOLDS.roe, { value: 25, comparator: '>=' });
  assert.deepEqual(DEFAULT_THRESHOLDS.promoterPledge, { value: 0, comparator: '<=', tolerance: 0.01 });
  assert.deepEqual(DEFAULT_THRESHOLDS.institutional, { value: null, comparator: 'info' });
  assert.deepEqual(DEFAULT_THRESHOLDS.cfoToEbitda, { value: 0.5, comparator: '>=' });
});

test('contract types compose into a bundle (compile-time check, exercised at runtime)', () => {
  const calc: CalcResult = {
    calcId: 'x|FY26', name: 'x', value: null, unit: 'X', period: 'FY26', scope: null,
    inputs: [], formula: 'n/a', status: 'INSUFFICIENT_DATA', note: 'no data', missing: ['cfo'],
  };
  const readiness: ReadinessResult = { subQuestionId: 'Q7.b', state: 'DATA_INSUFFICIENT', satisfiedBy: [], gaps: [] };
  const item: ResearchItem = {
    id: 'r1', symbol: 'YUKEN', tier: 'SECONDARY', url: 'u', title: 't', publisher: 'p', publishedAt: null,
    retrievedAt: '2026-10-10T00:00:00Z', excerpt: 'e', subQuestionIds: ['Q7.b'], status: 'UNVERIFIED_LEAD',
  };
  const row: ScorecardRow = {
    filterId: 1, label: 'Promoter holding', observed: null, unit: 'PCT', threshold: 66.6, comparator: '>',
    gap: null, status: 'UNVERIFIABLE', basis: 'OFFICIAL', asOf: null, period: null, scope: null, sources: [],
    formula: 'n/a', reasonIfUnverifiable: 'no shareholding snapshot',
  };
  const answer: SubAnswer = { subQuestionId: 'Q7.b', state: 'NOT_DISCLOSED', claims: [], narrative: '', sourcesSearched: [] };
  const bundle: Bundle = {
    symbol: 'YUKEN', isin: 'INE000000000', asOf: '2026-10-10T00:00:00Z', facts: {}, calcs: { [calc.calcId]: calc },
    scorecard: [row], researchItems: [item], readiness: { 'Q7.b': readiness }, gaps: [], routineVersion: 'v2', bundleHash: 'h',
  };
  const contract: QuestionContract = {
    id: 29, topic: 't', question: 'q', premise: null, appliesIn: 'OUT_OF_SCOPE',
    subQuestions: [{
      id: 'Q29.a', question: 29, text: 't', requiredMetrics: [], calcIds: [], sourceNeeds: [], premise: null,
      appliesIn: 'OUT_OF_SCOPE', outOfScopeReason: 'Out of scope: fundamental analysis only (deferred)',
    }],
  };
  const task: HostTask = {
    taskId: 't', role: 'DRAFTER', symbol: 'YUKEN', bundlePath: 'b', system: 's', prompt: 'p', jsonSchema: {},
    responsePath: 'r', createdAt: '2026-10-10T00:00:00Z',
  };
  const response: HostResponse = { taskId: 't', json: [answer] };
  const provider: LlmProvider = { id: 'mock', complete: async () => ({ text: '', usage: { inTok: 0, outTok: 0 } }) };
  const source: FactSource = { facts: () => [] };
  assert.equal(Object.keys(bundle.calcs).length, 1);
  assert.equal(contract.subQuestions[0].appliesIn, 'OUT_OF_SCOPE');
  assert.equal(task.role, 'DRAFTER');
  assert.equal(response.taskId, 't');
  assert.equal(provider.id, 'mock');
  assert.deepEqual(source.facts({ asOf: '2026-10-10T00:00:00Z' }), []);
});
