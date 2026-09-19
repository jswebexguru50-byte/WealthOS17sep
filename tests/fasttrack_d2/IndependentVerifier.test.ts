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
import crypto from 'crypto';
import { CP21IndependentVerifier } from '../../src/server/services/phase2fasttrack/CP21IndependentVerifier';
import { CP21VerificationEvidence } from '../../src/server/services/phase2fasttrack/CP21VerificationEvidence';
import { ResearchSnapshotBuilder } from '../../src/server/services/phase2fasttrack/ResearchSnapshotBuilder';

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

  // --- Test 5: Corrupted Audit Record / Broken Chain ---
  console.log('\nTesting corrupted audit ledger record chain...');
  const tmpAuditPath = path.join(process.cwd(), 'reports', 'v674-fasttrack', 'test_corrupt_ledger.jsonl');
  const rec1Payload = JSON.stringify({
    auditRecordId: 'REC-001',
    runId: 'RUN-1',
    checkpoint: 'C1',
    decisionType: 'D1',
    subjectId: 'SUB1',
    inputHash: 'h1',
    outputHash: 'h2',
    predicateResults: {},
    status: 'PASS',
    reasonCodes: [],
    createdAt: '2026-09-19T00:00:00Z',
    previousRecordHash: undefined
  });
  const rec1Hash = crypto.createHash('sha256').update(rec1Payload).digest('hex');
  const rec1 = { ...JSON.parse(rec1Payload), recordHash: rec1Hash };

  // Rec 2 with broken previousRecordHash link
  const rec2Broken = {
    auditRecordId: 'REC-002',
    runId: 'RUN-1',
    checkpoint: 'C2',
    decisionType: 'D2',
    subjectId: 'SUB2',
    inputHash: 'h3',
    outputHash: 'h4',
    predicateResults: {},
    status: 'PASS',
    reasonCodes: [],
    createdAt: '2026-09-19T00:01:00Z',
    previousRecordHash: 'INVALID_PREVIOUS_HASH',
    recordHash: 'fake_record_hash'
  };
  fs.writeFileSync(tmpAuditPath, `${JSON.stringify(rec1)}\n${JSON.stringify(rec2Broken)}\n`, 'utf8');

  const corruptAuditEvidence: CP21VerificationEvidence = {
    ...validEvidence,
    auditLedger: { path: 'reports/v674-fasttrack/test_corrupt_ledger.jsonl' }
  };
  const corruptAuditResult = verifier.verify(corruptAuditEvidence);
  assert.strictEqual(corruptAuditResult.deliveryDecision, 'FAILED');
  assert.strictEqual(corruptAuditResult.predicates.deterministicOutcomeValid, false);
  console.log('[PASS] Test 5: Corrupted audit record with broken previousHash link correctly rejected');

  // Clean up temp test ledger
  if (fs.existsSync(tmpAuditPath)) fs.unlinkSync(tmpAuditPath);

  // --- Test 6: Provenance Canonical Evidence Hash Mismatch ---
  console.log('\nTesting research snapshot canonicalEvidenceHash mismatch...');
  const tmpSnapPath = path.join(process.cwd(), 'reports', 'v674-fasttrack', 'test_tampered_snapshot.json');
  const realSnap = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'reports/v674-fasttrack/02_RESEARCH_SNAPSHOT.json'), 'utf8'));
  const tamperedSnap = {
    ...realSnap,
    canonicalEvidenceHash: '0000000000000000000000000000000000000000000000000000000000000000'
  };
  fs.writeFileSync(tmpSnapPath, JSON.stringify(tamperedSnap, null, 2), 'utf8');

  const tamperedSnapEvidence: CP21VerificationEvidence = {
    ...validEvidence,
    researchSnapshot: { path: 'reports/v674-fasttrack/test_tampered_snapshot.json' }
  };
  const tamperedSnapResult = verifier.verify(tamperedSnapEvidence);
  assert.strictEqual(tamperedSnapResult.deliveryDecision, 'FAILED');
  assert.strictEqual(tamperedSnapResult.predicates.provenanceValid, false);
  console.log('[PASS] Test 6: Canonical evidence hash mismatch correctly rejected');

  if (fs.existsSync(tmpSnapPath)) fs.unlinkSync(tmpSnapPath);

  // --- Test 7: Replay Manifest Falsely Claiming Reproducibility ---
  console.log('\nTesting replay manifest falsely claiming reproducibility...');
  const tmpReplayPath = path.join(process.cwd(), 'reports', 'v674-fasttrack', 'test_false_replay.json');
  fs.writeFileSync(tmpReplayPath, JSON.stringify({ reproducible: false, run1Passed: 10, run2Passed: 5 }, null, 2), 'utf8');

  const falseReplayEvidence: CP21VerificationEvidence = {
    ...validEvidence,
    replayManifest: { path: 'reports/v674-fasttrack/test_false_replay.json' }
  };
  const falseReplayResult = verifier.verify(falseReplayEvidence);
  assert.strictEqual(falseReplayResult.deliveryDecision, 'FAILED');
  assert.strictEqual(falseReplayResult.predicates.adversarialReplayValid, false);
  console.log('[PASS] Test 7: Replay manifest falsely claiming reproducibility correctly rejected');

  if (fs.existsSync(tmpReplayPath)) fs.unlinkSync(tmpReplayPath);

  // --- Test 8: Clean-Room Manifest Falsely Claiming Hash Match ---
  console.log('\nTesting clean-room manifest with mismatched status...');
  const tmpCleanPath = path.join(process.cwd(), 'reports', 'v674-fasttrack', 'test_false_cleanroom.json');
  fs.writeFileSync(tmpCleanPath, JSON.stringify({ status: 'DIRTY', signalHashMatch: false, outcomeHashMatch: false }, null, 2), 'utf8');

  const falseCleanEvidence: CP21VerificationEvidence = {
    ...validEvidence,
    cleanRoomManifest: { path: 'reports/v674-fasttrack/test_false_cleanroom.json' }
  };
  const falseCleanResult = verifier.verify(falseCleanEvidence);
  assert.strictEqual(falseCleanResult.deliveryDecision, 'FAILED');
  assert.strictEqual(falseCleanResult.predicates.cleanRoomValid, false);
  console.log('[PASS] Test 8: Clean-room manifest with dirty/mismatched status correctly rejected');

  if (fs.existsSync(tmpCleanPath)) fs.unlinkSync(tmpCleanPath);

  // --- Test 9: ResearchSnapshotBuilder signalLedgerHashOverride mismatch throws FATAL ---
  console.log('\nTesting ResearchSnapshotBuilder signalLedgerHashOverride mismatch...');
  const snapBuilder = new ResearchSnapshotBuilder();
  await assert.rejects(
    async () => {
      await snapBuilder.buildSnapshot('RUN-TEST', 'git_sha_test', 'wrong_signal_ledger_override_hash');
    },
    /FATAL: signalLedgerHashOverride does not match physical signal ledger SHA-256/,
    'FAIL: signalLedgerHashOverride mismatch must throw FATAL'
  );
  console.log('[PASS] Test 9: ResearchSnapshotBuilder signalLedgerHashOverride mismatch correctly threw FATAL');

  console.log('\n============================================================');
  console.log('  AGENT A: ALL 9 INDEPENDENT VERIFIER & REGRESSION TESTS PASSED');
  console.log('============================================================\n');
}

runIndependentVerifierTests().catch(err => {
  console.error('INDEPENDENT VERIFIER TEST FAILED:', err);
  process.exit(1);
});
