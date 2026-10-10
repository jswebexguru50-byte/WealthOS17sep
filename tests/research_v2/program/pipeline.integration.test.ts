import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeFereExport } from '../../../src/server/research_v2/ingest/fereBridge.js';
import { buildSixScripBundles, SIX_SCRIP_SYMBOLS } from '../../../src/server/research_v2/program/sixScrip.js';
import { validateClaims } from '../../../src/server/research_v2/agents/claimValidator.js';
import { completenessGate } from '../../../src/server/research_v2/agents/completenessGate.js';
import { allSubQuestions } from '../../../src/server/research_v2/contract/questions.js';

const identities = SIX_SCRIP_SYMBOLS.map((symbol, i) => ({
  identity: { symbol, isin: `INE${String(i + 1).padStart(8, '0')}1`, exchange: 'NSE' as const },
  asOf: '2026-10-10T00:00:00Z',
}));

test('FERE bridge feeds an isolated six-scrip bundle and gates missing evidence safely', () => {
  const bridged = bridgeFereExport([{
    symbol: 'YUKEN', isin: identities[0].identity.isin, metric: 'pat', value: 12.5,
    unit: 'INR_CR', periodEnd: '2025-03-31', scope: 'CONSOLIDATED',
    sourceRef: 'fere-fixture-1', retrievedAt: '2026-10-10T10:00:00Z',
  }]);
  assert.equal(bridged.rejected.length, 0);
  const bundles = buildSixScripBundles(identities.map((item, i) => i === 0 ? { ...item, facts: bridged.facts } : item));
  assert.equal(Object.keys(bundles).length, 6);
  assert.equal(Object.keys(bundles.YUKEN.facts).length, 1);
  assert.equal(Object.keys(bundles.VMART.facts).length, 0);
  assert.equal(bundles.YUKEN.facts[bridged.facts[0].factId].source, 'FERE');
  const answers: never[] = [];
  const validation = validateClaims(bundles.YUKEN, answers);
  const gate = completenessGate(answers, allSubQuestions(), bundles.YUKEN);
  assert.equal(validation.ok, true, 'missing facts must not become fabricated claims');
  assert.equal(gate.ok, false, 'incomplete evidence must remain blocked before persistence');
  assert.ok(gate.defects.some(d => d.code === 'MISSING_ANSWER'));
});
