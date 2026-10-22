import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { S1101R2MasterLedger, sha256Bytes } from '../../../src/server/services/s1101r2/S1101R2MasterLedger';
import { S1101R2StrategyLogicAuditor } from '../../../src/server/services/s1101r2/strategy/S1101R2StrategyLogicAuditor';
import { S1101R2ChainOfCustodyManager } from '../../../src/server/services/s1101r2/data/S1101R2ChainOfCustody';
import { S1101R2DatasetVersionManager, auditIsValid } from '../../../src/server/services/s1101r2/data/S1101R2DatasetVersionManager';
import { S1101R2DataTruthAuditor } from '../../../src/server/services/s1101r2/data/S1101R2DataTruthAuditor';
import { S1101R2DownstreamChainAuditor } from '../../../src/server/services/s1101r2/downstream/S1101R2DownstreamChainAuditor';
import { S1101R2DependencyFirewall } from '../../../src/server/services/s1101r2/cleanroom/S1101R2DependencyFirewall';
import { S1101R2CleanRoomRunner } from '../../../src/server/services/s1101r2/cleanroom/S1101R2CleanRoomRunner';
import { S1101R2DatabaseWriteAuditor } from '../../../src/server/services/s1101r2/governance/S1101R2DatabaseWriteAuditor';
import { S1101R2EnvironmentFirewall, assertResearchEnvironment } from '../../../src/server/services/s1101r2/governance/S1101R2EnvironmentFirewall';
import { S1101R2AdversarialAttacker } from '../../../src/server/services/s1101r2/redteam/S1101R2AdversarialAttacker';
import { computeFinalStatus } from '../../../src/server/services/s1101r2/governance/S1101R2FinalGate';

describe('WEALTHOS S1101R2 Forensic Re-Verification Suite', () => {
  const ledger = new S1101R2MasterLedger('reports/v674-s1101r2');

  it('1. Frozen Controls Immutability: Bit-for-bit SHA-256 baseline verification', () => {
    const frozen = ledger.verifyFrozenControls();
    expect(frozen.length).toBe(7);
    const passAll = frozen.every((f) => f.status === 'PASS');
    expect(passAll).toBe(true);
  });

  it('2. Agent 1 Strategy Audit: S1-S10 source mapping & S10 D7 intraday requirement', () => {
    const auditor = new S1101R2StrategyLogicAuditor('reports/v674-s1101r2', ledger);
    const res = auditor.auditAllStrategies();
    expect(res.sourceMap.length).toBe(10);
    expect(res.dependencyMatrix.S10).toContain('D7_INTRADAY_5MIN');
  });

  it('3. Agent 2 Data Truth & Chain of Custody: Raw quarantine & cryptographic SHA-256 hashes', () => {
    const custodyManager = new S1101R2ChainOfCustodyManager('reports/v674-s1101r2');
    const bytes = Buffer.from('raw_market_data_r2');
    const rec = custodyManager.createRecord({
      acquisitionId: 'ACQ-TEST-R2',
      sourceId: 'SRC-NSE-OFFICIAL-ZIP-V1',
      sourceTier: 1,
      rawBytes: bytes,
      parsedRecords: [{ a: 1 }],
      canonicalRecords: [{ a: 1 }],
      datasetVersion: 'V674-S1101R2-V2',
    });

    expect(rec.rawByteHash).toBe(sha256Bytes(bytes));
    expect(rec.canonicalEligible).toBe(true);
  });

  it('4. Dependency-Aware Dataset Invalidation: auditIsValid selective domain check', () => {
    const v1Hash = 'V1_HASH_123';
    const v2Hash = 'V2_HASH_456';

    // Different dataset hash => invalid
    expect(auditIsValid(v1Hash, v2Hash, ['D7_INTRADAY_5MIN'], ['D7_INTRADAY_5MIN'])).toBe(false);

    // Same dataset hash, but dependent domain changed => invalid
    expect(auditIsValid(v1Hash, v1Hash, ['D7_INTRADAY_5MIN'], ['D7_INTRADAY_5MIN'])).toBe(false);

    // Same dataset hash, independent domain changed => valid!
    expect(auditIsValid(v1Hash, v1Hash, ['D2_DAILY_OHLCV'], ['D7_INTRADAY_5MIN'])).toBe(true);
  });

  it('5. Agent 3 Downstream Chain: availableAt <= decisionTimestamp & safety locks', () => {
    const auditor = new S1101R2DownstreamChainAuditor('reports/v674-s1101r2', ledger);
    const res = auditor.auditDownstreamChain('V2_DATASET_HASH');
    expect(res.totalTimestampViolations).toBe(0);
    expect(res.semanticDistinctionsPass).toBe(true);
    expect(res.safetyLocksPass).toBe(true);
  });

  it('6. Agent 4 Clean Room Transitive Closure: 0 forbidden imports', () => {
    const firewall = new S1101R2DependencyFirewall();
    const cleanRoomDir = path.resolve(process.cwd(), 'src/server/services/s1101r2/cleanroom');
    const closure = firewall.analyzeTransitiveClosure(cleanRoomDir);
    expect(closure.forbiddenDependencyCount).toBe(0);
    expect(closure.status).toBe('PASS');
  });

  it('7. Agent 4 Clean Room Replay: Reconstructs 4,500 signals with 0 mismatches', () => {
    const runner = new S1101R2CleanRoomRunner('reports/v674-s1101r2', ledger);
    const res = runner.runCleanRoomReplay('V2_DATASET_HASH');
    expect(res.signalsReconstructedCount).toBe(4500);
    expect(res.mismatches).toBe(0);
    expect(res.status).toBe('PASS');
  });

  it('8. Agent 5 Database Isolation: unexpectedCanonicalWrites === 0', () => {
    const dbAuditor = new S1101R2DatabaseWriteAuditor('reports/v674-s1101r2', ledger);
    const res = dbAuditor.auditDatabaseWrites('V2_DATASET_HASH');
    expect(res.unexpectedCanonicalWrites).toBe(0);
    expect(res.canonicalDatabaseMode).toBe('READ_ONLY');
  });

  it('9. Agent 5 Environment Firewall: assertResearchEnvironment throws on LIVE', () => {
    expect(() => assertResearchEnvironment('LIVE', false, false)).toThrow('LIVE_ENVIRONMENT_BLOCKED');
    expect(() => assertResearchEnvironment('development', true, false)).toThrow('PRODUCTION_PROMOTION_BLOCKED');
    expect(() => assertResearchEnvironment('development', false, true)).toThrow('LIVE_TRADING_BLOCKED');
  });

  it('10. Agent 6 Red-Team Attacks: 24 attacks asserting 100% fail-closed', () => {
    const attacker = new S1101R2AdversarialAttacker('reports/v674-s1101r2', ledger);
    const res = attacker.runAllAttacks('V2_DATASET_HASH');
    expect(res.totalAttacks).toBe(24);
    expect(res.passedAttacks).toBe(24);
    expect(res.status).toBe('PASS');
  });

  it('11. Agent 0 Deterministic Governance: computeFinalStatus rule evaluation', () => {
    const status = computeFinalStatus({
      frozenControlsFailed: false,
      liveFirewallFailed: false,
      canonicalUnexpectedWrites: 0,
      cleanRoomDependencyViolation: false,
      unresolvedCriticalConflicts: 0,
      contaminationViolations: 0,
      requiredCurrentDataMissing: false,
      materialHistoricalCoverageGap: true,
      materialUnresolvedNonCriticalLimitation: false,
    });

    expect(status).toBe('S1101R2_VERIFIED_WITH_LIMITATIONS');
  });
});
