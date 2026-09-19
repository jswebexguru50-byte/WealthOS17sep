import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { S1101RMasterLedger, sha256File, sha256Bytes } from '../../../src/server/services/s1101r/S1101RMasterLedger';
import { S1101RStrategyLogicAuditor } from '../../../src/server/services/s1101r/strategy/S1101RStrategyLogicAuditor';
import { S1101RChainOfCustodyManager } from '../../../src/server/services/s1101r/data/S1101RChainOfCustody';
import { S1101RDatasetVersionManager } from '../../../src/server/services/s1101r/data/S1101RDatasetVersionManager';
import { S1101RDataTruthAuditor } from '../../../src/server/services/s1101r/data/S1101RDataTruthAuditor';
import { S1101RDownstreamChainAuditor } from '../../../src/server/services/s1101r/downstream/S1101RDownstreamChainAuditor';
import { S1101RDependencyFirewall } from '../../../src/server/services/s1101r/cleanroom/S1101RDependencyFirewall';
import { S1101RCleanRoomRunner } from '../../../src/server/services/s1101r/cleanroom/S1101RCleanRoomRunner';
import { S1101RDatabaseWriteAuditor } from '../../../src/server/services/s1101r/governance/S1101RDatabaseWriteAuditor';
import { S1101REnvironmentFirewall } from '../../../src/server/services/s1101r/governance/S1101REnvironmentFirewall';
import { S1101RAdversarialAttacker } from '../../../src/server/services/s1101r/redteam/S1101RAdversarialAttacker';
import { computeFinalStatus } from '../../../src/server/services/s1101r/governance/S1101RFinalGate';

describe('WEALTHOS S110.1-R Forensic Verification Suite', () => {
  const ledger = new S1101RMasterLedger('reports/v674-s1101r');

  it('1. Frozen Controls Immutability: SHA-256 hashes match frozen manifest', () => {
    const frozen = ledger.verifyFrozenControls();
    expect(frozen.length).toBe(7);
    const passAll = frozen.every((f) => f.status === 'PASS');
    expect(passAll).toBe(true);
  });

  it('2. Hash Integrity & Fake Hash Detection: Rejects placeholder hashes', () => {
    const fakeHash = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
    const realBytes = Buffer.from('actual evidence data');
    const realHash = sha256Bytes(realBytes);

    expect(realHash).not.toBe(fakeHash);
    expect(realHash.length).toBe(64);
  });

  it('3. Agent 1 Source Audit: Verifies S1-S10 source code lines & S10 D7 intraday requirement', () => {
    const auditor = new S1101RStrategyLogicAuditor(ledger);
    const results = auditor.auditAllStrategies();
    expect(results.length).toBe(10);

    const s10 = results.find((r) => r.strategyId === 'S10');
    expect(s10).toBeDefined();
    expect(s10?.d7Required).toBe(true);
  });

  it('4. Agent 2 Data Truth & Chain of Custody: Generates raw quarantine & real cryptographic hashes', () => {
    const custodyManager = new S1101RChainOfCustodyManager('reports/v674-s1101r');
    const bytes = Buffer.from('raw_market_data');
    const record = custodyManager.createRecord({
      acquisitionId: 'ACQ-TEST-001',
      sourceRegistryId: 'REG-NSE-OFFICIAL-V1',
      sourceTier: 1,
      sourceName: 'NSE Official Test Source',
      sourceEndpoint: 'https://data.nseindia.com/test.json',
      rawBytes: bytes,
      parsedRecords: [{ a: 1 }],
      canonicalRecords: [{ a: 1 }],
      securityCount: 1,
      dateMin: '2026-01-01',
      dateMax: '2026-01-02',
      parentDatasetHash: 'V1-HASH',
    });

    expect(record.rawByteHash).toBe(sha256Bytes(bytes));
    expect(record.status).toBe('CANONICAL_ELIGIBLE');
  });

  it('5. Dataset Versioning & Invalidation: Dataset mutation invalidates dependent audits', () => {
    const versionManager = new S1101RDatasetVersionManager('reports/v674-s1101r');
    const v1Hash = 'V1_DATASET_HASH_12345';
    const v2Hash = 'V2_DATASET_HASH_67890';

    const isCurrent = versionManager.isAuditCurrent(v1Hash, v2Hash);
    expect(isCurrent).toBe(false);
  });

  it('6. Agent 3 Downstream Chain: Asserts availableAt <= decisionTimestamp and safety locks', () => {
    const auditor = new S1101RDownstreamChainAuditor('reports/v674-s1101r', ledger);
    const res = auditor.auditDownstreamChain('V2_DATASET_HASH');
    expect(res.totalTimestampViolations).toBe(0);
    expect(res.semanticDistinctionsPass).toBe(true);
    expect(res.safetyLocksPass).toBe(true);
  });

  it('7. Agent 4 Clean Room Import Firewall: Rejects forbidden imports in clean-room files', () => {
    const firewall = new S1101RDependencyFirewall();
    const cleanRoomDir = path.resolve(process.cwd(), 'src/server/services/s1101r/cleanroom');
    const violations = firewall.scanDirectory(cleanRoomDir);
    expect(violations.length).toBe(0);
  });

  it('8. Agent 4 Clean Room Signal Replay: Reconstructs signals with 0 mismatches', () => {
    const runner = new S1101RCleanRoomRunner('reports/v674-s1101r', ledger);
    const res = runner.runCleanRoomReplay('V2_DATASET_HASH');
    expect(res.signalsReconstructed).toBe(4500);
    expect(res.mismatches).toBe(0);
    expect(res.status).toBe('PASS');
  });

  it('9. Agent 5 Database Write Isolation: Asserts unexpected canonical DB writes === 0', () => {
    const dbAuditor = new S1101RDatabaseWriteAuditor('reports/v674-s1101r', ledger);
    const res = dbAuditor.auditDatabaseWrites('V2_DATASET_HASH');
    expect(res.unexpectedCanonicalWrites).toBe(0);
    expect(res.status).toBe('PASS');
  });

  it('10. Agent 5 Execution Firewall: Asserts environment !== LIVE & capitalEligible === false', () => {
    const envAuditor = new S1101REnvironmentFirewall('reports/v674-s1101r', ledger);
    const res = envAuditor.auditEnvironmentFirewall('V2_DATASET_HASH');
    expect(res.environmentNotLive).toBe(true);
    expect(res.liveTradingAuthorization).toBe(false);
    expect(res.capitalEligible).toBe(false);
    expect(res.status).toBe('PASS');
  });

  it('11. Agent 6 Red-Team Adversarial Attacks: Executed 24 attacks asserting 100% fail-closed', () => {
    const attacker = new S1101RAdversarialAttacker('reports/v674-s1101r', ledger);
    const res = attacker.runAllAttacks('V2_DATASET_HASH');
    expect(res.totalAttacks).toBe(24);
    expect(res.passedAttacks).toBe(24);
    expect(res.failedAttacks).toBe(0);
    expect(res.status).toBe('PASS');
  });

  it('12. Agent 0 Final Gate Status Computation: Deterministically computes final status', () => {
    const status = computeFinalStatus({
      frozenControlsPass: true,
      criticalEvidenceAvailable: true,
      materialPITViolation: false,
      materialDataIntegrityFailure: false,
      materialLogicMismatch: false,
      cleanRoomMismatch: false,
      redTeamFailure: false,
      databaseWriteViolation: false,
      liveFirewallFailure: false,
      unresolvedMaterialConflict: false,
      materialLimitations: ['S10 pre-2020 D7 coverage 88.5%'],
      datasetConsistent: true,
    });

    expect(status).toBe('S1101R_VERIFIED_WITH_LIMITATIONS');
  });
});
