import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCalculable, normalizeXbrlFacts, reconcileDiscreteFacts, validateSourceTier,
} from '../../../src/server/research_v2/facts/xbrlPeriods.js';
import { convertUnit } from '../../../src/server/research_v2/facts/units.js';
import { RAW_METRICS_ABSENT, metricDefinition } from '../../../src/server/research_v2/facts/metricDefinitions.js';
import { crore, raw } from './helpers.js';

test('a OneD row spanning six months is rejected, never accepted as a discrete quarter', () => {
  const half = raw('OneD', '2025-09-30', crore(10), 'cfo', { periodStart: '2025-04-01' });
  const result = normalizeXbrlFacts([half]);
  assert.equal(result.facts.length, 0);
  assert.deepEqual(result.rejected, [{ rawMetric: 'cfo', reason: 'CONTEXT_DURATION_MISMATCH:OneD', count: 1 }]);
});

test('a genuine three-month OneD row passes the duration guard', () => {
  const quarter = raw('OneD', '2025-09-30', crore(10), 'sales', { periodStart: '2025-07-01' });
  assert.equal(normalizeXbrlFacts([quarter]).facts.length, 1);
});

test('FourD rows keep their classification even when the raw span looks like one quarter', () => {
  const row = raw('FourD', '2025-09-30', crore(10), 'sales', { periodStart: '2025-07-01' });
  assert.equal(normalizeXbrlFacts([row]).facts[0].periodType, 'YTD_6M');
});

test('lakh converts to crore by dividing by 100', () => {
  assert.equal(convertUnit(250, 'LAKH').value, 2.5);
  assert.equal(convertUnit(250, 'INR_LAKH').flag, 'UNIT_CONVERTED');
});

test('a same-period restatement jump of 1000x is flagged RESTATEMENT_MAGNITUDE_JUMP, not UNIT_SUSPECT', () => {
  const rows = [
    raw('OneD', '2025-03-31', crore(1000), 'sales', { availableAt: '2025-05-01T00:00:00Z' }),
    raw('OneD', '2025-03-31', crore(1), 'sales', { availableAt: '2025-06-01T00:00:00Z' }),
  ];
  const facts = normalizeXbrlFacts(rows).facts;
  assert.equal(facts.length, 2);
  assert.ok(facts[1].qualityFlags.includes('RESTATEMENT_MAGNITUDE_JUMP'));
  assert.ok(facts.every(f => !f.qualityFlags.includes('UNIT_SUSPECT')));
});

test('a superseded vintage is not magnitude-flagged against its neighbour', () => {
  const rows = [
    raw('OneD', '2025-06-30', crore(5000), 'sales', { availableAt: '2025-08-01T00:00:00Z' }),
    raw('OneD', '2025-06-30', crore(5), 'sales', { availableAt: '2025-09-01T00:00:00Z' }),
    raw('OneD', '2025-09-30', crore(6), 'sales'),
  ];
  const facts = normalizeXbrlFacts(rows).facts;
  assert.ok(facts.every(f => !f.qualityFlags.includes('UNIT_SUSPECT')));
});

test('discrete-versus-YTD is not applied to profit metrics that can legitimately fall', () => {
  const rows = [
    raw('OneD', '2025-06-30', crore(-10), 'pat'), raw('OneD', '2025-09-30', crore(20), 'pat'),
    raw('FourD', '2025-06-30', crore(-10), 'pat'), raw('FourD', '2025-09-30', crore(10), 'pat'),
  ];
  const facts = reconcileDiscreteFacts(normalizeXbrlFacts(rows).facts);
  assert.ok(facts.every(f => !f.qualityFlags.includes('PERIOD_RECON_FAIL')));
});

test('discrete-versus-YTD is enforced for never-negative metrics', () => {
  const rows = [raw('OneD', '2025-09-30', crore(200), 'sales'), raw('FourD', '2025-09-30', crore(150), 'sales')];
  const facts = reconcileDiscreteFacts(normalizeXbrlFacts(rows).facts);
  assert.ok(facts.every(f => f.qualityFlags.includes('PERIOD_RECON_FAIL')));
});

test('reconciliation is idempotent and does not mutate its input', () => {
  const input = normalizeXbrlFacts([raw('OneD', '2025-06-30', crore(10))]).facts;
  const once = reconcileDiscreteFacts(input);
  const twice = reconcileDiscreteFacts(once);
  assert.deepEqual(input[0].qualityFlags.filter(f => f.startsWith('RECON')), []);
  assert.equal(twice[0].qualityFlags.filter(f => f === 'RECON_UNVERIFIED').length, 1);
});

test('isCalculable excludes reconciliation failures and suspected unit errors', () => {
  const clean = normalizeXbrlFacts([raw('OneD', '2025-06-30', crore(10))]).facts[0];
  assert.equal(isCalculable(clean), true);
  assert.equal(isCalculable({ ...clean, qualityFlags: ['PERIOD_RECON_FAIL'] }), false);
  assert.equal(isCalculable({ ...clean, qualityFlags: ['UNIT_SUSPECT'] }), false);
  assert.equal(isCalculable({ ...clean, quarantined: true }), false);
});

test('validateSourceTier returns null for a valid statutory filing', () => {
  assert.equal(validateSourceTier(raw('OneD', '2025-06-30', 1)), null);
});

test('metrics absent from the raw table are documented and still defined canonically', () => {
  for (const metric of RAW_METRICS_ABSENT) assert.ok(metricDefinition(metric), metric);
});

test('a raw balance-sheet-style name that is not mapped is rejected, not guessed', () => {
  const result = normalizeXbrlFacts([raw('FourD', '2025-03-31', 1, 'xbrl_total_assets_guess')]);
  assert.equal(result.facts.length, 0);
  assert.equal(result.rejected[0].reason, 'METRIC_UNMAPPED:xbrl_total_assets_guess');
});

test('an unsupported context_ref is rejected for flow metrics but ignored for point-in-time metrics', () => {
  const flow = normalizeXbrlFacts([raw('Instant', '2025-03-31', 1, 'sales')]);
  assert.equal(flow.rejected[0].reason, 'XBRL_CONTEXT_UNSUPPORTED:Instant');
  const balance = normalizeXbrlFacts([raw('Instant', '2025-03-31', crore(5), 'equity_capital')]);
  assert.equal(balance.facts[0].periodType, 'POINT_IN_TIME');
});
