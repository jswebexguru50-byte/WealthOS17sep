/**
 * tests/fasttrack_d2/ProvenanceEvidence.test.ts
 *
 * Unit and mutation tests for Agent C: Provenance & EvidenceArtifact determinism.
 * Verifies that:
 * 1. Changing filesystem mtime does NOT change canonicalHash
 * 2. Mutating one byte DOES change canonicalHash
 * 3. Copying identical content produces identical canonicalHash
 * 4. OHLCV and Corporate Actions datasets are non-aliased
 * 5. Snapshot canonicalEvidenceHash is completely deterministic
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';
import { computeEvidenceArtifact } from '../../src/server/services/phase2fasttrack/EvidenceArtifact';
import { ResearchSnapshotBuilder } from '../../src/server/services/phase2fasttrack/ResearchSnapshotBuilder';

async function runProvenanceTests() {
  console.log('\n============================================================');
  console.log('  AGENT C: PROVENANCE & EVIDENCE ARTIFACT DETERMINISM TESTS');
  console.log('============================================================\n');

  const tmpDir = path.join(process.cwd(), 'reports', 'v674-fasttrack', '02_delivery2_1', 'scratch_prov');
  fs.mkdirSync(tmpDir, { recursive: true });

  const testFile1 = path.join(tmpDir, 'sample_artifact.txt');
  fs.writeFileSync(testFile1, 'CANONICAL_TEST_BYTES_ABC_123');

  // 1. Compute baseline evidence artifact
  const art1 = computeEvidenceArtifact(testFile1);
  console.log('[PASS] Baseline artifact computed:', art1.canonicalHash);

  // 2. Test: Change mtime -> canonicalHash must NOT change
  const pastDate = new Date('2020-01-01T00:00:00.000Z');
  fs.utimesSync(testFile1, pastDate, pastDate);
  const art2 = computeEvidenceArtifact(testFile1);
  assert.strictEqual(
    art1.canonicalHash,
    art2.canonicalHash,
    'FAIL: Canonical hash changed when filesystem mtime was altered!'
  );
  assert.notStrictEqual(
    art1.metadata?.filesystemMtime,
    art2.metadata?.filesystemMtime,
    'Metadata mtime should reflect modified mtime'
  );
  console.log('[PASS] Test 1: Modified mtime did NOT alter canonicalHash');

  // 3. Test: One byte changed -> canonicalHash MUST change
  const testFile2 = path.join(tmpDir, 'sample_artifact_mutated.txt');
  fs.writeFileSync(testFile2, 'CANONICAL_TEST_BYTES_ABC_124'); // 3 -> 4
  const art3 = computeEvidenceArtifact(testFile2);
  assert.notStrictEqual(
    art1.canonicalHash,
    art3.canonicalHash,
    'FAIL: Mutated content produced the same canonical hash!'
  );
  console.log('[PASS] Test 2: Byte mutation correctly altered canonicalHash');

  // 4. Test: Same content at different path -> identical byteHash and canonicalHash
  const testFile3 = path.join(tmpDir, 'sample_artifact_copy.txt');
  fs.writeFileSync(testFile3, 'CANONICAL_TEST_BYTES_ABC_123');
  const art4 = computeEvidenceArtifact(testFile3);
  assert.strictEqual(
    art1.canonicalHash,
    art4.canonicalHash,
    'FAIL: Same content at different location produced different canonical hash!'
  );
  console.log('[PASS] Test 3: Relocated copy produced identical canonicalHash');

  // 5. Test: Full ResearchSnapshotBuilder determinism
  const builder = new ResearchSnapshotBuilder();
  const frozenBaseline = {
    'PureTechnicalStrategiesEngine.ts': 'mock_sha_1',
    'StrategyParameterConfig.ts': 'mock_sha_2'
  };

  const snap1 = await builder.buildSnapshot('run_1', '7871a0b', 'signal_ledger_mock', frozenBaseline);
  const snap2 = await builder.buildSnapshot('run_2', '7871a0b', 'signal_ledger_mock', frozenBaseline);

  assert.strictEqual(
    snap1.canonicalEvidenceHash,
    snap2.canonicalEvidenceHash,
    'FAIL: Snapshot canonicalEvidenceHash must be deterministic across runs!'
  );
  assert.notStrictEqual(
    snap1.operationalMetadata.createdAt,
    snap2.operationalMetadata.createdAt,
    'Operational metadata timestamps may differ'
  );
  console.log('[PASS] Test 4: ResearchSnapshotBuilder canonicalEvidenceHash is 100% reproducible');

  // 6. Test: Non-aliasing of OHLCV and Corporate Actions
  assert.notStrictEqual(
    snap1.evidenceArtifacts.marketData.byteHash,
    snap1.evidenceArtifacts.corporateActions.byteHash,
    'FAIL: Market data and corporate actions are aliased!'
  );
  console.log('[PASS] Test 5: Market data and corporate actions are verified distinct & non-aliased');

  // Cleanup scratch
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}

  console.log('\n============================================================');
  console.log('  AGENT C: ALL 5 PROVENANCE TESTS PASSED');
  console.log('============================================================\n');
}

runProvenanceTests().catch(err => {
  console.error('PROVENANCE TEST FAILED:', err);
  process.exit(1);
});
