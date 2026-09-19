/**
 * tests/fasttrack_d2/AuthorizationSafety.test.ts
 *
 * Unit and negative tests for Agent E: Authorization Safety Barriers.
 * Verifies that:
 * 1. All 6 authorization flags are strictly FALSE
 * 2. Authorization state is frozen and immutable
 * 3. Calling runGate() throws D2_1_NON_AUTHORIZING_BARRIER (B1 remains CLOSED)
 * 4. Calling authorizeB1() throws D2_1_NON_AUTHORIZING_BARRIER
 * 5. Calling authorizeB2() throws D2_1_NON_AUTHORIZING_BARRIER
 * 6. Calling open(), authorize(), enable() all throw D2_1_NON_AUTHORIZING_BARRIER
 */

import assert from 'assert';
import { TrackBGate, D21_STRICT_AUTHORIZATION_STATE } from '../../src/server/services/phase2fasttrack/TrackBGate';

async function runAuthorizationSafetyTests() {
  console.log('\n============================================================');
  console.log('  AGENT E: AUTHORIZATION SAFETY BARRIER TESTS');
  console.log('============================================================\n');

  const gate = new TrackBGate();
  const state = gate.getAuthorizationState();

  // --- Test 1: All 6 Flags Strictly False ---
  assert.strictEqual(state.cp21Authorization, false);
  assert.strictEqual(state.b1Authorization, false);
  assert.strictEqual(state.b2Authorization, false);
  assert.strictEqual(state.trackBAuthorization, false);
  assert.strictEqual(state.productionAuthorization, false);
  assert.strictEqual(state.liveTradingAuthorization, false);
  console.log('[PASS] Test 1: All 6 authorization flags are strictly FALSE:');
  console.log('       CP2.1: false | B1: false | B2: false | TrackB: false | Production: false | Live: false');

  // --- Test 2: State Object is Immutable (Frozen) ---
  assert.strictEqual(Object.isFrozen(state), true);
  try {
    (state as any).cp21Authorization = true;
  } catch {}
  assert.strictEqual(state.cp21Authorization, false, 'FAIL: Authorization state must not be mutable!');
  console.log('[PASS] Test 2: Authorization state is frozen and immutable by construction');

  // --- Test 3: runGate() Throws and Keeps B1 CLOSED ---
  assert.throws(
    () => gate.runGate(),
    /D2_1_NON_AUTHORIZING_BARRIER/,
    'FAIL: runGate() must throw non-authorizing barrier error'
  );
  console.log('[PASS] Test 3: Direct runGate() blocked with D2_1_NON_AUTHORIZING_BARRIER');

  // --- Test 4: authorizeB1() Throws ---
  assert.throws(
    () => gate.authorizeB1(),
    /D2_1_NON_AUTHORIZING_BARRIER/,
    'FAIL: authorizeB1() must throw'
  );
  console.log('[PASS] Test 4: Direct authorizeB1() blocked with D2_1_NON_AUTHORIZING_BARRIER');

  // --- Test 5: authorizeB2() Throws ---
  assert.throws(
    () => gate.authorizeB2(),
    /D2_1_NON_AUTHORIZING_BARRIER/,
    'FAIL: authorizeB2() must throw'
  );
  console.log('[PASS] Test 5: Direct authorizeB2() blocked with D2_1_NON_AUTHORIZING_BARRIER');

  // --- Test 6: open(), authorize(), enable() All Throw ---
  assert.throws(() => gate.open(), /D2_1_NON_AUTHORIZING_BARRIER/);
  assert.throws(() => gate.authorize(), /D2_1_NON_AUTHORIZING_BARRIER/);
  assert.throws(() => gate.enable(), /D2_1_NON_AUTHORIZING_BARRIER/);
  console.log('[PASS] Test 6: open(), authorize(), enable() methods all throw non-authorizing barrier errors');

  console.log('\n============================================================');
  console.log('  AGENT E: ALL 6 AUTHORIZATION SAFETY TESTS PASSED');
  console.log('============================================================\n');
}

runAuthorizationSafetyTests().catch(err => {
  console.error('AUTHORIZATION SAFETY TEST FAILED:', err);
  process.exit(1);
});
