import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeXbrlFacts, reconcileDiscreteFacts, isCalculable } from '../../../../src/server/research_v2/facts/xbrlPeriods.js';
import { convertUnit } from '../../../../src/server/research_v2/facts/units.js';
import { metricDefinition } from '../../../../src/server/research_v2/facts/metricDefinitions.js';
import { raw, crore } from '../../facts/helpers.js';

test('P1 point-in-time row with fake period end (LATEST) must be rejected', () => {
  const r = normalizeXbrlFacts([raw('FourD', 'LATEST', crore(10), 'equity_capital')]);
  assert.equal(r.facts.length, 0);
});

test('P2 unknown scope must be rejected at runtime (H4)', () => {
  const r = normalizeXbrlFacts([raw('OneD', '2025-06-30', crore(10), 'sales', { scope: 'UNKNOWN' as never })]);
  assert.equal(r.facts.length, 0);
});

test('P3 annual must be emitted as ANNUAL (spec 5.1 step 4)', () => {
  const r = normalizeXbrlFacts([raw('FourD', '2026-03-31', crore(457.3563), 'sales')]);
  assert.ok(r.facts.some(f => f.periodType === 'ANNUAL'));
});

test('P4 later PROVIDER value must not silently supersede STATUTORY value (conflicts retained, statutory wins)', () => {
  const stat = raw('OneD', '2025-06-30', crore(100), 'sales', { availableAt: '2026-01-01T00:00:00Z' });
  const prov = raw('OneD', '2025-06-30', crore(110), 'revenue', {
    source: 'TRENDLYNE', unit: 'INR_CR', value: 110, sourceTier: 'PROVIDER_VERIFIED', availableAt: '2026-02-01T00:00:00Z',
  });
  const facts = normalizeXbrlFacts([stat, prov]).facts;
  assert.ok(!facts.some(f => f.qualityFlags.includes('RESTATED') && f.sourceTier === 'PROVIDER_VERIFIED'));
});

test('P5 same value from statutory after provider must record the statutory tier', () => {
  const prov = raw('OneD', '2025-06-30', 100, 'revenue', {
    source: 'TRENDLYNE', unit: 'INR_CR', sourceTier: 'PROVIDER_VERIFIED', availableAt: '2026-01-01T00:00:00Z',
  });
  const stat = raw('OneD', '2025-06-30', crore(100), 'sales', { availableAt: '2026-02-01T00:00:00Z' });
  const facts = normalizeXbrlFacts([prov, stat]).facts;
  assert.ok(facts.some(f => f.sourceTier === 'STATUTORY'));
});

test('P6 availableAt with offsets must be ordered as instants, not strings', () => {
  // 2026-10-10T02:00+05:30 = 2026-10-09T20:30Z, i.e. EARLIER than 2026-10-10T00:00Z
  const older = raw('OneD', '2025-06-30', crore(100), 'sales', { availableAt: '2026-10-10T02:00:00+05:30' });
  const newer = raw('OneD', '2025-06-30', crore(120), 'sales', { availableAt: '2026-10-10T00:00:00Z' });
  const facts = normalizeXbrlFacts([newer, older]).facts;
  const v2 = facts.find(f => f.vintage === 2)!;
  assert.equal(v2.valueCr, 120);
});

test('P7 derived quarter must not be calculable when its YTD input failed reconciliation', () => {
  const rows = [
    raw('OneD', '2025-06-30', crore(100)), raw('OneD', '2025-09-30', crore(100)),
    raw('FourD', '2025-09-30', crore(500)), raw('FourD', '2025-12-31', crore(600)),
  ];
  const out = reconcileDiscreteFacts(normalizeXbrlFacts(rows).facts);
  const ytd6 = out.find(f => f.periodType === 'YTD_6M')!;
  assert.ok(ytd6.qualityFlags.includes('PERIOD_RECON_FAIL'));
  const q3 = out.find(f => f.periodType === 'DISCRETE_Q' && f.periodEnd === '2025-12-31')!;
  assert.ok(q3, 'Q3 derived');
  assert.equal(isCalculable(q3), false);
});

test('P8 Trendlyne INR scaling must come from the catalogue, not from a source-name regex', () => {
  // A statutory-looking provider row from a source string without the word TRENDLYNE is divided by 1e7;
  // conversely any source containing TRENDLYNE is assumed crore for every money metric. Only the first
  // half is checkable here: an unlisted token must not be silently assumed crore by source name.
  const r = normalizeXbrlFacts([raw('OneD', '2025-06-30', 5000, 'revenue', {
    source: 'trendlyne_mirror_F03_statement_dump_in_rupees', sourceTier: 'PROVIDER_VERIFIED',
  })]);
  assert.ok(!r.facts.some(f => f.valueCr === 5000 && f.qualityFlags.includes('UNIT_ASSUMED_CRORE')));
});

test('P9 percent metric outside 0..100 must be flagged or rejected', () => {
  const r = normalizeXbrlFacts([raw('FourD', '2026-03-31', 5804, 'promoter_pct', { unit: 'PERCENT' })]);
  assert.ok(r.facts.length === 0 || r.facts[0].qualityFlags.length > 0);
});

test('P10 legacy aliases roe_pct / roce_pct from spec 5.3 must resolve to a defined metric', () => {
  assert.ok(metricDefinition('roe_pct') && metricDefinition('roce_pct'));
});

test('P11 invalid availableAt must be rejected', () => {
  const r = normalizeXbrlFacts([raw('OneD', '2025-06-30', crore(1), 'sales', { availableAt: 'not-a-date' })]);
  assert.equal(r.facts.length, 0);
});

test('P12 invalid scope-less/empty isin must be rejected', () => {
  const r = normalizeXbrlFacts([raw('OneD', '2025-06-30', crore(1), 'sales', { isin: '' })]);
  assert.equal(r.facts.length, 0);
});

test('P13 lakh label from Trendlyne-like source is never confused with crore (control)', () => {
  assert.equal(convertUnit(500, 'LAKH').value, 5);
});
