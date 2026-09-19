/**
 * tests/fasttrack_d2/OutcomeSemantics.test.ts
 *
 * Unit tests for Agent B: Outcome / PIT / Entry Semantics.
 * Verifies:
 * 1. Change entry bar -> evidence hash changes
 * 2. Wrong future observation / PIT lookahead -> rejected
 * 3. S10 intraday breakout -> resolves correct 15-minute bar
 * 4. Missing intraday data for S10 -> DATA_INSUFFICIENT
 * 5. Corporate action mutation -> evidence hash changes
 * 6. Identical inputs -> identical output hash (100% deterministic)
 */

import assert from 'assert';
import { EntryResolutionEngine, RawBarObservation, IntradayBreakoutBar } from '../../src/server/services/phase2fasttrack/EntryResolutionEngine';
import { OutcomeEvidenceHasher } from '../../src/server/services/phase2fasttrack/OutcomeEvidenceHasher';
import { PointInTimeDataEngine, PITDataset } from '../../src/server/services/research/PointInTimeDataEngine';

async function runOutcomeSemanticsTests() {
  console.log('\n============================================================');
  console.log('  AGENT B: OUTCOME / PIT / ENTRY SEMANTICS TESTS');
  console.log('============================================================\n');

  // Sample Daily Price Bars
  const dailyBars: RawBarObservation[] = [
    {
      symbol: 'RELIANCE',
      timestamp: '2026-03-02T15:30:00+05:30',
      open: 2500,
      high: 2550,
      low: 2490,
      close: 2540,
      volume: 100000,
      sourceHash: 'bar_hash_1'
    },
    {
      symbol: 'RELIANCE',
      timestamp: '2026-03-03T15:30:00+05:30',
      open: 2545,
      high: 2580,
      low: 2530,
      close: 2575,
      volume: 120000,
      sourceHash: 'bar_hash_2'
    }
  ];

  // Minimal PIT dataset for testing lookahead guard
  const pitDataset: PITDataset = {
    securities: [
      {
        kind: 'SECURITY',
        symbol: 'RELIANCE',
        listingDate: '2000-01-01',
        status: 'ACTIVE',
        availableAt: '2000-01-01T00:00:00+05:30',
        sourceId: 'sec_1',
        sourceType: 'NSE'
      }
    ],
    memberships: [],
    prices: [
      {
        kind: 'PRICE',
        symbol: 'RELIANCE',
        timestamp: '2026-03-02T09:30:00+05:30',
        open: 2500,
        high: 2515,
        low: 2495,
        close: 2510,
        volume: 20000,
        raw: true,
        availableAt: '2026-03-02T09:30:00+05:30',
        sourceId: 'price_0',
        sourceType: 'NSE'
      },
      {
        kind: 'PRICE',
        symbol: 'RELIANCE',
        timestamp: '2026-03-02T09:45:00+05:30',
        open: 2510,
        high: 2520,
        low: 2505,
        close: 2515,
        volume: 25000,
        raw: true,
        availableAt: '2026-03-02T09:45:00+05:30',
        sourceId: 'price_0b',
        sourceType: 'NSE'
      },
      {
        kind: 'PRICE',
        symbol: 'RELIANCE',
        timestamp: '2026-03-02T15:30:00+05:30',
        open: 2500,
        high: 2550,
        low: 2490,
        close: 2540,
        volume: 100000,
        raw: true,
        availableAt: '2026-03-02T15:30:00+05:30',
        sourceId: 'price_1',
        sourceType: 'NSE'
      },
      {
        kind: 'PRICE',
        symbol: 'RELIANCE',
        timestamp: '2026-03-03T15:30:00+05:30',
        open: 2545,
        high: 2580,
        low: 2530,
        close: 2575,
        volume: 120000,
        raw: true,
        availableAt: '2026-03-03T15:30:00+05:30',
        sourceId: 'price_2',
        sourceType: 'NSE'
      }
    ],
    corporateActions: [],
    fundamentals: []
  };

  const pitEngine = new PointInTimeDataEngine(pitDataset);
  const resolver = new EntryResolutionEngine(pitEngine);

  // --- Test 1: Daily Strategy Resolution & Determinism ---
  const res1 = resolver.resolveEntry('S1_MOMENTUM', 'RELIANCE', '2026-03-02T15:30:00+05:30', dailyBars);
  assert.strictEqual(res1.status, 'RESOLVED');
  assert.strictEqual(res1.observation?.price, 2540); // DAILY_CLOSE_BOUND
  assert.strictEqual(res1.observation?.entryRule, 'DAILY_CLOSE_BOUND');

  const res1Again = resolver.resolveEntry('S1_MOMENTUM', 'RELIANCE', '2026-03-02T15:30:00+05:30', dailyBars);
  assert.strictEqual(res1.evidenceHash, res1Again.evidenceHash, 'FAIL: Identical inputs must yield identical hash');
  console.log('[PASS] Test 1: Daily strategy resolution is deterministic (hash:', res1.evidenceHash?.slice(0, 16) + '...)');

  // --- Test 2: Change Entry Bar -> Hash Changes ---
  const res2 = resolver.resolveEntry('S1_NEXT_OPEN', 'RELIANCE', '2026-03-02T15:30:00+05:30', dailyBars);
  assert.strictEqual(res2.status, 'RESOLVED');
  assert.strictEqual(res2.observation?.price, 2545); // NEXT_OPEN price
  assert.strictEqual(res2.observation?.entryRule, 'NEXT_OPEN');
  assert.notStrictEqual(res1.evidenceHash, res2.evidenceHash, 'FAIL: Different entry bar must alter hash');
  console.log('[PASS] Test 2: Changed entry bar altered evidence hash correctly');

  // --- Test 3: S10 Intraday Breakout Resolves Correct 15m Bar ---
  const intradayBars: IntradayBreakoutBar[] = [
    {
      symbol: 'RELIANCE',
      breakoutTimestamp: '2026-03-02T09:45:00+05:30',
      triggerPrice: 2515,
      sourceHash: 'intraday_hash_1'
    }
  ];
  const resS10 = resolver.resolveEntry('S10_BREAKOUT', 'RELIANCE', '2026-03-02T09:45:00+05:30', dailyBars, intradayBars);
  assert.strictEqual(resS10.status, 'RESOLVED');
  assert.strictEqual(resS10.observation?.entryRule, 'INTRADAY_BREAKOUT');
  assert.strictEqual(resS10.observation?.observationTimestamp, '2026-03-02T09:45:00+05:30');
  assert.strictEqual(resS10.observation?.price, 2515);
  console.log('[PASS] Test 3: S10 correctly resolved 15-minute intraday breakout bar without daily fallback');

  // --- Test 4: Missing Intraday Data for S10 -> DATA_INSUFFICIENT ---
  const resS10Missing = resolver.resolveEntry('S10_BREAKOUT', 'RELIANCE', '2026-03-02T09:30:00+05:30', dailyBars, []);
  assert.strictEqual(resS10Missing.status, 'DATA_INSUFFICIENT');
  assert(resS10Missing.reason?.includes('S10 requires 15-minute intraday breakout bar'));
  console.log('[PASS] Test 4: S10 with missing intraday data correctly returned DATA_INSUFFICIENT');

  // --- Test 5: Corporate Action Mutation -> Evidence Hash Changes ---
  const resCaValid = resolver.resolveEntry('S1_MOMENTUM', 'RELIANCE', '2026-03-02T15:30:00+05:30', dailyBars, undefined, true);
  const resCaInvalid = resolver.resolveEntry('S1_MOMENTUM', 'RELIANCE', '2026-03-02T15:30:00+05:30', dailyBars, undefined, false);
  assert.notStrictEqual(resCaValid.evidenceHash, resCaInvalid.evidenceHash);
  console.log('[PASS] Test 5: Corporate action state mutation correctly changed evidence hash');

  // --- Test 6: PIT Lookahead Protection (Reading Future Observation) ---
  // If query is for a future bar not yet available at simulation time
  const resLookahead = resolver.resolveEntry('S1_NEXT_OPEN', 'RELIANCE', '2026-03-02T15:30:00+05:30', [
    {
      symbol: 'RELIANCE',
      timestamp: '2026-03-05T15:30:00+05:30', // Future bar relative to pitDataset
      open: 2600,
      high: 2650,
      low: 2590,
      close: 2640,
      volume: 100000
    }
  ]);
  assert(resLookahead.status === 'PIT_REJECTED' || resLookahead.status === 'DATA_INSUFFICIENT');
  console.log('[PASS] Test 6: Future unverified observation was safely rejected / flagged');

  // --- Test 7: Provenance Source Hash Mutation -> Evidence Hash Changes ---
  const barsProv1: RawBarObservation[] = [{ ...dailyBars[0], sourceHash: 'hash_v1' }];
  const barsProv2: RawBarObservation[] = [{ ...dailyBars[0], sourceHash: 'hash_v2_mutated' }];
  const resProv1 = resolver.resolveEntry('S1_MOMENTUM', 'RELIANCE', '2026-03-02T15:30:00+05:30', barsProv1);
  const resProv2 = resolver.resolveEntry('S1_MOMENTUM', 'RELIANCE', '2026-03-02T15:30:00+05:30', barsProv2);
  assert.notStrictEqual(resProv1.evidenceHash, resProv2.evidenceHash, 'FAIL: Source hash mutation must alter evidence hash');
  console.log('[PASS] Test 7: Provenance source hash mutation correctly altered evidence hash');

  console.log('\n============================================================');
  console.log('  AGENT B: ALL 7 OUTCOME / PIT TESTS PASSED');
  console.log('============================================================\n');
}

runOutcomeSemanticsTests().catch(err => {
  console.error('OUTCOME TEST FAILED:', err);
  process.exit(1);
});

