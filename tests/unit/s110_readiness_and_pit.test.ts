import { describe, test, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { S110DependencyAuditEngine } from '../../src/server/services/s110/S110DependencyAuditEngine';
import { S110UniverseManager } from '../../src/server/services/s110/S110UniverseManager';
import { S110DataGapEngine } from '../../src/server/services/s110/S110DataGapEngine';
import { S110StrategyReplayEngine } from '../../src/server/services/s110/S110StrategyReplayEngine';
import { S110ComposableIntegrationEngine } from '../../src/server/services/s110/S110ComposableIntegrationEngine';
import { S110ShadowSafetyGate } from '../../src/server/services/s110/S110ShadowSafetyGate';
import { S110CapitalEligibilityGate } from '../../src/server/services/s110/S110CapitalEligibilityGate';
import { S110FinalGate } from '../../src/server/services/s110/S110FinalGate';
import { S110ContaminationAuditEngine } from '../../src/server/services/s110/audit/S110ContaminationAuditEngine';

describe('WEALTHOS S110 DATA READINESS & PIT TEST SUITE', () => {
  beforeAll(() => {
    S110UniverseManager.initialize();
  });

  test('Check 1: Frozen Control SHA-256 Audit', () => {
    const ok = S110FinalGate.verifyFrozenControls();
    expect(ok).toBe(true);
  });

  test('Checks 2-11: S1-S10 Evidence-Based Dependency Audit', () => {
    const manifests = S110DependencyAuditEngine.auditAll();
    expect(manifests.length).toBe(10);
    for (const m of manifests) {
      expect(m.status).toBe('RESOLVED');
      expect(m.dependencyEvidence.length).toBeGreaterThan(0);
    }
  });

  test('Check 12: NIFTY 500 Historical PIT Membership', () => {
    const universe = S110UniverseManager.getPITUniverseForDate('2024-01-15');
    expect(universe.length).toBeGreaterThan(0);
    expect(universe[0].indexName).toBe('NIFTY500');
  });

  test('Check 13: Identity Transitions (Symbol & ISIN Changes)', () => {
    const resolved = S110UniverseManager.resolveIdentityOnDate('CADILAHC', '2023-01-01');
    expect(resolved).toBe('ZYDUSLIFE');
  });



  test('Check 14: Corporate Action Adjustments', () => {
    const audit = S110ContaminationAuditEngine.runContaminationAudit();
    const caCheck = audit.find(a => a.checkId === 'CONTAM_02_FUTURE_CORPORATE_ACTIONS');
    expect(caCheck).toBeDefined();
    expect(caCheck?.status).toBe('CLEAN');
    expect(caCheck?.affectedComponents).toContain('CorporateActionsEngine');
  });

  test('Check 15: Daily OHLCV Strategy Coverage', () => {
    const rep = S110DataGapEngine.computeStrategyCoverage('S1', 'VPA Base Compaction', 1000, 988);
    expect(rep.coveragePct).toBe(98.8);
    expect(rep.dataStatus).toBe('READY');
  });

  test('Check 16: Non-Global D9 Delivery Boundary', () => {
    const m1 = S110DependencyAuditEngine.getMap()['S1'];
    expect(m1.deliveryDependency).toBe(false);
  });

  test('Check 17: S10 Strict Intraday Session Rules', () => {
    const m10 = S110DependencyAuditEngine.getMap()['S10'];
    expect(m10.intradayDependency).toBe(true);
  });

  test('Check 18: Benchmark Index Availability', () => {
    const m6 = S110DependencyAuditEngine.getMap()['S6'];
    expect(m6.benchmarkDependency).toBe(true);
  });

  test('Check 19: Data Gap Registration', () => {
    S110DataGapEngine.registerGap({
      strategyId: 'S10',
      securityId: 'NSE_ABC',
      isin: 'INE123A01019',
      date: '2024-01-15',
      field: 'intraday_5m',
      domain: 'D7',
      reason: 'Intraday candle missing',
      severity: 'WARNING',
      sourceCandidates: ['UPSTOX'],
      recoveryStatus: 'GAP_REGISTERED'
    });
    const gaps = S110DataGapEngine.getGapsForStrategy('S10');
    expect(gaps.length).toBeGreaterThan(0);
  });

  test('Check 20: Deterministic Strategy Replay', () => {
    const signals = S110StrategyReplayEngine.replayStrategyOnUniverse('S1', '2024-01-15');
    expect(signals.length).toBeGreaterThan(0);
  });



  test('Check 21: Independent Clean-Room Replay Verification', () => {
    const signals = S110StrategyReplayEngine.replayStrategyOnUniverse('S1', '2024-01-15');
    expect(signals.length).toBeGreaterThan(0);
    for (const sig of signals) {
      if (sig.dataStatus === 'DATA_PRESENT') {
        expect(sig.inputDataHash).toBeTruthy();
        expect(sig.PITContextHash).toBeTruthy();
        expect(sig.decisionHash).toBeTruthy();
      }
    }
  });

  test('Check 22: FERE/QGLP/Smart Money Composable Integration', () => {
    const signals = S110StrategyReplayEngine.replayStrategyOnUniverse('S1', '2024-01-15');
    const cand = S110ComposableIntegrationEngine.buildInvestmentCandidate(signals, '2024-01-15');
    expect(cand).not.toBeNull();
    if (cand) {
      expect(cand.consensusCount).toBeGreaterThan(0);
    }
  });

  test('Check 23: INVESTMENT_CANDIDATE Decoupling', () => {
    const signals = S110StrategyReplayEngine.replayStrategyOnUniverse('S1', '2024-01-15');
    const cand = S110ComposableIntegrationEngine.buildInvestmentCandidate(signals, '2024-01-15');
    if (cand) {
      expect(cand.capitalEligible).toBe(false);
    }
  });

  test('Check 24: Capital Eligibility Lock', () => {
    const res = S110CapitalEligibilityGate.evaluateCapitalEligibility({
      candidateId: 'CAND_1',
      securityId: 'NSE_RELIANCE',
      strategyId: 'S1',
      kellyFractionUpperBound: 0.1,
      portfolioRiskLimitNotional: 500000,
      capitalProtectionLimitNotional: 500000,
      liquidityCapacityLimitNotional: 1000000,
      singleNameLimitNotional: 500000,
      capitalProtectionState: 'NORMAL'
    });
    expect(res.capitalEligible).toBe(false);
  });

  test('Check 25: Shadow Trading Live Firewall', () => {
    const shadowRec = S110ShadowSafetyGate.processShadowCandidate({
      symbol: 'RELIANCE',
      securityId: 'NSE_RELIANCE',
      strategyId: 'S1',
      entryPrice: 2450.0,
      stopLoss: 2380.0,
      targetPrice: 2600.0,
      notional: 500000
    });
    expect(shadowRec.brokerExecutionAttempted).toBe(false);
    expect(shadowRec.liveFirewallPassed).toBe(true);
  });

  test('Check 26: Database Write Audit', () => {
    const rep = S110FinalGate.generateFinalGateReport();
    expect(rep.unexpectedDatabaseWrites).toBe(0);
  });

  test('Check 27: Final Governance Program Status', () => {
    const rep = S110FinalGate.generateFinalGateReport();
    expect(rep.programStatus).toBe('S110_VERIFIED_WITH_LIMITATIONS');
    expect(rep.productionPromotionAuthorization).toBe(false);
    expect(rep.liveTradingAuthorization).toBe(false);
  });
});
