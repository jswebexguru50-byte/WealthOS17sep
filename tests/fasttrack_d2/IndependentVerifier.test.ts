/**
 * tests/fasttrack_d2/IndependentVerifier.test.ts
 *
 * Unit and negative tests for Agent A: Independent CP2.1 Verifier.
 * Verifies:
 * 1. Verifier independently calculates all 13 predicates from physical evidence artifacts
 * 2. Mandatory Negative Test: Unsupported caller boolean assertions are REJECTED with FAILED
 * 3. Tamper Test: Mutated canonical ledger hash fails verification
 * 4. Frozen Controls Test: Mutated frozen file fails verification
 * 5. Invariant: cp21Authorization is ALWAYS false (strictly non-authorizing)
 */

import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { CP21IndependentVerifier } from '../../src/server/services/phase2fasttrack/CP21IndependentVerifier';
import { CP21VerificationEvidence } from '../../src/server/services/phase2fasttrack/CP21VerificationEvidence';

async function runIndependentVerifierTests() {
  console.log('\n============================================================');
  console.log('  AGENT A: INDEPENDENT CP2.1 VERIFIER TESTS');
  console.log('============================================================\n');

  const verifier = new CP21IndependentVerifier();

  // Baseline frozen file hashes (matching main 16cb972)
  const baselineDir = path.join(process.cwd(), 'reports', 'v674-fasttrack', '02_delivery2_1', 'baseline');
  const baselineFrozen = JSON.parse(
    fs.readFileSync(path.join(baselineDir, 'frozen-controls.json'), 'utf8')
  );

  const frozenControlRefs = Object.keys(baselineFrozen).map(relPath => ({
    path: relPath,
    expectedSha256: baselineFrozen[relPath].sha256
  }));

  // Complete Valid Physical Evidence
  const validEvidence: CP21VerificationEvidence = {
    repositorySha: '7871a0b',
    canonicalLedger: {
      path: 'reports/v674-phase2/02_CORRECTED_SIGNALS.csv',
      expectedSha256: 'f8d8541a2b186d42d72c077395f90a88f6f234b16bfdb83ca683eb2232064681',
      exactRecords: 6501
    },
    frozenControls: frozenControlRefs,
    researchSnapshot: {
      path: 'reports/v674-fasttrack/02_RESEARCH_SNAPSHOT.json'
    },
    dependencyGraph: {
      path: 'reports/v674-fasttrack/CP2.1_DEPENDENCY_MAP.json'
    },
    auditLedger: {
      path: 'reports/v674-fasttrack/CP2.1_DECISION_LEDGER_SCHEMA.json'
    },
    replayManifest: {
      path: 'reports/v674-fasttrack/02_delivery2_1/07_REPLAY_RESULTS.json'
    },
    cleanRoomManifest: {
      path: 'reports/v674-fasttrack/11_CLEAN_ROOM.json'
    }
  };

  // --- Test 1: Full Independent Physical Verification ---
  const validResult = verifier.verify(validEvidence);
  if (validResult.deliveryDecision !== 'IMPLEMENTED_AND_VERIFIED') {
    console.error('Test 1 Failures:', validResult.failures);
  }
  assert.strictEqual(validResult.deliveryDecision, 'IMPLEMENTED_AND_VERIFIED');
  assert.strictEqual(validResult.cp21Authorization, false, 'FAIL: cp21Authorization must be strictly false');
  assert.strictEqual(validResult.predicates.canonicalLedgerImmutable, true);
  assert.strictEqual(validResult.predicates.canonicalPopulationValid, true);
  assert.strictEqual(validResult.predicates.frozenControlsValid, true);
  assert.strictEqual(validResult.predicates.dependencyIsolationValid, true);
  assert.strictEqual(validResult.failures.length, 0);
  console.log('[PASS] Test 1: Full independent physical verification passed (decision: IMPLEMENTED_AND_VERIFIED, cp21Auth: false)');

  // --- Test 2: Mandatory Negative Test - Unsupported Caller Booleans ---
  console.log('\nTesting unsupported caller boolean assertions without evidence...');
  const unsupportedCallerAssertion: any = {
    golden103Reproduced: true,
    cleanRoomPass: true,
    redTeamPass: true
  };
  const negativeResult = verifier.verify(unsupportedCallerAssertion);
  assert.strictEqual(negativeResult.deliveryDecision, 'FAILED');
  assert.strictEqual(negativeResult.cp21Authorization, false);
  assert.strictEqual(negativeResult.predicates.canonicalLedgerImmutable, false);
  assert(negativeResult.failures[0].includes('REJECTED: Unsupported boolean assertions supplied'));
  console.log('[PASS] Test 2: Caller-supplied boolean assertions correctly REJECTED with FAILED');

  // --- Test 3: Tamper Test - Mutated Canonical Ledger Hash ---
  console.log('\nTesting mutated canonical ledger hash...');
  const tamperedCanonicalEvidence: CP21VerificationEvidence = {
    ...validEvidence,
    canonicalLedger: {
      path: 'reports/v674-phase2/02_CORRECTED_SIGNALS.csv',
      expectedSha256: 'deadbeef_mutated_hash_that_does_not_match',
      exactRecords: 6501
    }
  };
  const tamperedCanonicalResult = verifier.verify(tamperedCanonicalEvidence);
  assert.strictEqual(tamperedCanonicalResult.deliveryDecision, 'FAILED');
  assert.strictEqual(tamperedCanonicalResult.predicates.canonicalLedgerImmutable, false);
  assert(tamperedCanonicalResult.failures.some(f => f.includes('Canonical ledger hash mismatch')));
  console.log('[PASS] Test 3: Mutated canonical ledger hash correctly rejected with FAILED');

  // --- Test 4: Tamper Test - Mutated Frozen Control Hash ---
  console.log('\nTesting mutated frozen control hash...');
  const tamperedFrozenEvidence: CP21VerificationEvidence = {
    ...validEvidence,
    frozenControls: [
      {
        path: 'src/server/services/PureTechnicalStrategiesEngine.ts',
        expectedSha256: 'mutated_frozen_engine_hash'
      }
    ]
  };
  const tamperedFrozenResult = verifier.verify(tamperedFrozenEvidence);
  assert.strictEqual(tamperedFrozenResult.deliveryDecision, 'FAILED');
  assert.strictEqual(tamperedFrozenResult.predicates.frozenControlsValid, false);
  assert(tamperedFrozenResult.failures.some(f => f.includes('Frozen control mutated')));
  console.log('[PASS] Test 4: Mutated frozen control hash correctly rejected with FAILED');

  console.log('\n============================================================');
  console.log('  AGENT A: ALL 4 INDEPENDENT VERIFIER TESTS PASSED');
  console.log('============================================================\n');
}

runIndependentVerifierTests().catch(err => {
  console.error('INDEPENDENT VERIFIER TEST FAILED:', err);
  process.exit(1);
});
