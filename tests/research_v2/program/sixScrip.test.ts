import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSixScripBundle, buildSixScripBundles, SIX_SCRIP_SYMBOLS, IdentityResolutionError } from '../../../src/server/research_v2/program/sixScrip.js';

const isin = (i: number) => `INE${String(i).padStart(8, '0')}1`;
const inventory = SIX_SCRIP_SYMBOLS.map((symbol, i) => ({ identity: { symbol, isin: isin(i + 1), exchange: 'NSE' as const }, asOf: '2026-10-10T00:00:00Z' }));

test('builds six isolated bundles with deterministic hashes and no cross-scrip data', () => {
  const bundles = buildSixScripBundles(inventory);
  assert.deepEqual(Object.keys(bundles), [...SIX_SCRIP_SYMBOLS]);
  const hashes = new Set(Object.values(bundles).map(b => b.bundleHash));
  assert.equal(hashes.size, 6);
  for (const symbol of SIX_SCRIP_SYMBOLS) {
    assert.equal(bundles[symbol].symbol, symbol);
    assert.equal(Object.values(bundles[symbol].facts).length, 0);
    assert.ok(Object.values(bundles[symbol].readiness).some(r => r.state === 'NOT_APPLICABLE'));
  }
});

test('fails closed when an identity is missing or invalid', () => {
  assert.throws(() => buildSixScripBundles(inventory.slice(0, 5)), IdentityResolutionError);
  assert.throws(() => buildSixScripBundle({ identity: { symbol: 'YUKEN', isin: '', exchange: 'NSE' }, asOf: '2026-10-10' }), /valid ISIN/);
  assert.throws(() => buildSixScripBundle({ identity: { symbol: 'OTHER', isin: isin(9), exchange: 'NSE' }, asOf: '2026-10-10' }), /outside six-scrip/);
});

test('does not manufacture facts when inventory is incomplete', () => {
  const b = buildSixScripBundle(inventory[0]);
  const pending = Object.values(b.readiness).filter(r => r.state === 'DATA_INSUFFICIENT');
  assert.ok(pending.length > 0);
  assert.equal(b.calcs && Object.keys(b.calcs).length, 0);
  assert.equal(b.scorecard.length, 0);
});

