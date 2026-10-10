import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SYNTHESIS_GUARDRAILS,
  buildFactIndex,
  buildTechnicalDiagnostics,
  detectFactConflicts,
  metricEvidence,
} from './evidence_policy.mjs';
import { buildSynthesisInstructions } from './synthesis_contract.mjs';

const fact = overrides => ({
  factId: 'F-1', metric: 'revenue', value: 100, unit: 'INR_CR', periodType: 'ANNUAL',
  periodEnd: '2026-03-31', scope: 'CONSOLIDATED', provider: 'FERE', sourceType: 'PRIMARY_FILING',
  verificationStatus: 'VERIFIED', availableAt: '2026-05-30T00:00:00.000Z', ...overrides,
});

test('primary verified consolidated fact outranks a newer secondary fact', () => {
  const primary = fact({ factId: 'PRIMARY', value: 100 });
  const secondary = fact({ factId: 'SECONDARY', value: 120, provider: 'AGGREGATOR', sourceType: 'SECONDARY', verificationStatus: 'SECONDARY_VERIFIED', availableAt: '2026-06-30T00:00:00.000Z' });
  const index = buildFactIndex([secondary, primary], { asOf: '2026-10-08' });
  assert.equal(metricEvidence(index, ['revenue'])[0].factId, 'PRIMARY');
});

test('point-in-time selection excludes facts unavailable at the requested as-of date', () => {
  const later = fact({ factId: 'LATER', availableAt: '2026-11-01T00:00:00.000Z' });
  const index = buildFactIndex([later], { asOf: '2026-10-08' });
  assert.equal(metricEvidence(index, ['revenue']).length, 0);
});

test('standalone and consolidated values are not falsely grouped as the same conflict', () => {
  const rows = [fact({ factId: 'C', scope: 'CONSOLIDATED', value: 100 }), fact({ factId: 'S', scope: 'STANDALONE', value: 80 })];
  assert.equal(detectFactConflicts(rows).length, 0);
});

test('material same-scope provider disagreement is retained as a conflict', () => {
  const rows = [fact({ factId: 'P', value: 100 }), fact({ factId: 'A', value: 120, provider: 'AGGREGATOR', sourceType: 'SECONDARY' })];
  const conflicts = detectFactConflicts(rows);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].resolution, 'PREFER_PRIMARY_VERIFIED_FACT_AND_DISCLOSE_CONFLICT');
});

test('mixed SMA order after a rebound is a market state, not a data integrity failure', () => {
  const closes = [...Array(150).fill(100), ...Array(30).fill(200), ...Array(19).fill(100), 250];
  const bars = closes.map((close, index) => ({ trade_date: `2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String(index % 28 + 1).padStart(2, '0')}`, close_adjusted: close, data_source: 'TEST_ADJUSTED' }));
  const result = buildTechnicalDiagnostics(bars);
  assert.equal(result.status, 'PASS');
  assert.equal(result.maAlignment, 'RECENT_RECOVERY_MIXED_ALIGNMENT');
  assert.match(result.interpretationRule, /not evidence of bad data/i);
});

test('synthesis contract forbids unsupported absence and concentration claims', () => {
  const text = buildSynthesisInstructions({ symbol: 'TEST', asOf: '2026-10-08', questions: [{ id: 4, topic: 'Customer concentration', evidenceRules: ['Require exact disclosure.'] }] });
  assert.match(text, /not located in the current evidence bundle/i);
  assert.match(text, /Never silently combine standalone and consolidated/i);
  assert.match(SYNTHESIS_GUARDRAILS.exceptionalItems, /annual and quarterly/i);
});
