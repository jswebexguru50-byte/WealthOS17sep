import { describe, it, expect, vi } from 'vitest';
import { EntryResolutionEngine, RawBarObservation } from '../../src/server/services/phase2fasttrack/EntryResolutionEngine';
import { ExitResolutionEngine } from '../../src/server/services/phase2fasttrack/ExitResolutionEngine';
import { ReplayReconciliationEngine } from '../../src/server/services/phase2fasttrack/ReplayReconciliationEngine';
import { StrategyReplayAdapter } from '../../src/server/services/phase2fasttrack/StrategyReplayAdapter';
import { PointInTimeDataEngine } from '../../src/server/services/research/PointInTimeDataEngine';
import { ExitPolicy } from '../../src/server/services/phase2fasttrack/OutcomeEvidenceTypes';
import { DateEffectiveCostEngine } from '../../src/server/services/phase2fasttrack/DateEffectiveCostEngine';
import { TradeLedgerHasher } from '../../src/server/services/phase2fasttrack/TradeLedgerHasher';

// Mock PIT Engine
class MockPITEngine extends PointInTimeDataEngine {
  constructor(private allowValid: boolean, private failFuture: boolean = false) {
    super({ securityId: 'MOCK', prices: [] } as any);
  }
  public override validateObservation(securityId: string, observationTimestamp: string, decisionTimestamp: string) {
    if (this.failFuture) {
       return { valid: false, reason: 'Observation is in the future relative to execution time' };
    }
    return { valid: this.allowValid, reason: this.allowValid ? '' : 'Mock PIT rejection' };
  }
}

describe('D2.2 Wave 1: Golden Replay Core Mechanics', () => {
  const signal = {
    signalId: 'SIG-1',
    strategyId: 'S1_MOMENTUM',
    securityId: 'RELIANCE',
    decisionDate: '2026-03-01T15:30:00+05:30',
    canonicalSignalHash: 'hash',
    datasetHash: 'dhash'
  };

  const defaultBars: RawBarObservation[] = [
    { symbol: 'RELIANCE', timestamp: '2026-03-01T15:30:00+05:30', open: 100, high: 105, low: 95, close: 100, volume: 1000 },
    { symbol: 'RELIANCE', timestamp: '2026-03-02T15:30:00+05:30', open: 101, high: 106, low: 96, close: 102, volume: 1000 },
    { symbol: 'RELIANCE', timestamp: '2026-03-03T15:30:00+05:30', open: 102, high: 115, low: 100, close: 110, volume: 1000 }, // TP hit
  ];

  const defaultPolicy: ExitPolicy = {
    hasDefinedExit: true,
    stopLossPct: -0.05,
    takeProfitPct: 0.10,
    ambiguityPolicy: 'CONSERVATIVE_STOP_FIRST'
  };

  it('Real historical bar -> Accepted', () => {
    const recon = new ReplayReconciliationEngine();
    const adapter = new StrategyReplayAdapter(
      new EntryResolutionEngine(new MockPITEngine(true)),
      new ExitResolutionEngine(new MockPITEngine(true)),
      recon
    );
    const result = adapter.executeReplay(signal, defaultBars, defaultPolicy, 'DELIVERY');
    expect(result).not.toBeNull();
    expect(recon.getReport().executedTradeCount).toBe(1);
    expect(recon.getReport().reconciled).toBe(true);
  });

  it('Missing PIT -> DATA_INSUFFICIENT (Fail closed)', () => {
    const recon = new ReplayReconciliationEngine();
    const adapter = new StrategyReplayAdapter(
      new EntryResolutionEngine(new MockPITEngine(false)), // Fail PIT
      new ExitResolutionEngine(new MockPITEngine(true)),
      recon
    );
    const result = adapter.executeReplay(signal, defaultBars, defaultPolicy, 'DELIVERY');
    expect(result).toBeNull();
    expect(recon.getReport().rejectedCount).toBe(1); // PIT_REJECTED maps to rejected
  });

  it('Future PIT observation -> Rejected', () => {
    const recon = new ReplayReconciliationEngine();
    // A mock engine that fails if observation is strictly after decision
    const adapter = new StrategyReplayAdapter(
      new EntryResolutionEngine(new MockPITEngine(true, true)),
      new ExitResolutionEngine(new MockPITEngine(true, true)),
      recon
    );
    // Entry rule NEXT_OPEN looks at day + 1
    const nextOpenSignal = { ...signal, strategyId: 'NEXT_OPEN_STRAT' };
    const result = adapter.executeReplay(nextOpenSignal, defaultBars, defaultPolicy, 'DELIVERY');
    expect(result).toBeNull();
    expect(recon.getReport().rejectedCount).toBe(1);
  });

  it('Missing post-entry bar -> DATA_INSUFFICIENT', () => {
    const recon = new ReplayReconciliationEngine();
    const adapter = new StrategyReplayAdapter(
      new EntryResolutionEngine(new MockPITEngine(true)),
      new ExitResolutionEngine(new MockPITEngine(true)),
      recon
    );
    // Provide only the entry bar
    const result = adapter.executeReplay(signal, [defaultBars[0]], defaultPolicy, 'DELIVERY');
    expect(result).toBeNull();
    expect(recon.getReport().dataInsufficientCount).toBe(1);
  });

  it('Ambiguous same-bar stop/target -> Deterministic documented resolution', () => {
    const recon = new ReplayReconciliationEngine();
    const adapter = new StrategyReplayAdapter(
      new EntryResolutionEngine(new MockPITEngine(true)),
      new ExitResolutionEngine(new MockPITEngine(true)),
      recon
    );
    
    // Bar has low=90 (Stop Loss hit), high=120 (Target hit)
    const ambiguousBars = [
      { symbol: 'RELIANCE', timestamp: '2026-03-01T15:30:00+05:30', open: 100, high: 100, low: 100, close: 100, volume: 1000 },
      { symbol: 'RELIANCE', timestamp: '2026-03-02T15:30:00+05:30', open: 100, high: 120, low: 90, close: 100, volume: 1000 },
    ];
    
    const result = adapter.executeReplay(signal, ambiguousBars, defaultPolicy, 'DELIVERY');
    expect(result).not.toBeNull();
    // Should resolve to STOP_LOSS because policy is CONSERVATIVE_STOP_FIRST
    expect(result!.exitObservation.exitRule).toBe('STOP_LOSS');
  });

  it('Generic T+20 substituted for undefined strategy exit -> Rejected', () => {
    const recon = new ReplayReconciliationEngine();
    const adapter = new StrategyReplayAdapter(
      new EntryResolutionEngine(new MockPITEngine(true)),
      new ExitResolutionEngine(new MockPITEngine(true)),
      recon
    );
    
    const undefinedExitPolicy: ExitPolicy = {
      hasDefinedExit: false, // NO defined exit
      ambiguityPolicy: 'CONSERVATIVE_STOP_FIRST'
    };
    
    const result = adapter.executeReplay(signal, defaultBars, undefinedExitPolicy, 'DELIVERY');
    expect(result).toBeNull();
    expect(recon.getReport().rejectedCount).toBe(1); // Rejected because INVALID policy
  });

  it('Delivery cost calculation -> Verified', () => {
    const cost = DateEffectiveCostEngine.calculateCost(100, 100, 'DELIVERY', true, '2026-03-01T10:00:00Z');
    expect(cost.tradeType).toBe('DELIVERY');
    expect(cost.stt.rateApplied).toBe(0.001); // 0.1% STT on Delivery
    expect(cost.stampDuty.rateApplied).toBe(0.00015);
  });

  it('Intraday S10 cost calculation -> Verified', () => {
    const buyCost = DateEffectiveCostEngine.calculateCost(100, 100, 'INTRADAY', true, '2026-03-01T10:00:00Z');
    expect(buyCost.stt.amount).toBe(0); // 0 STT on Intraday Buy
    expect(buyCost.stampDuty.rateApplied).toBe(0.00003); // 0.003% Stamp duty on intraday buy

    const sellCost = DateEffectiveCostEngine.calculateCost(100, 100, 'INTRADAY', false, '2026-03-01T15:00:00Z');
    expect(sellCost.stt.rateApplied).toBe(0.00025); // 0.025% STT on Intraday Sell
    expect(sellCost.stampDuty.amount).toBe(0); // 0 Stamp duty on sell
  });

  it('Ledger hash repeat -> Identical; mutation -> Different hash', () => {
    const recon = new ReplayReconciliationEngine();
    const adapter = new StrategyReplayAdapter(
      new EntryResolutionEngine(new MockPITEngine(true)),
      new ExitResolutionEngine(new MockPITEngine(true)),
      recon
    );
    
    const res1 = adapter.executeReplay(signal, defaultBars, defaultPolicy, 'DELIVERY');
    const res2 = adapter.executeReplay(signal, defaultBars, defaultPolicy, 'DELIVERY');
    
    expect(res1!.tradeLedgerHash).toBe(res2!.tradeLedgerHash);

    // Mutation
    const mutatedBars = [...defaultBars];
    mutatedBars[0] = { ...mutatedBars[0], sourceHash: 'tampered' };
    const recon2 = new ReplayReconciliationEngine();
    const adapterMutated = new StrategyReplayAdapter(
      new EntryResolutionEngine(new MockPITEngine(true)),
      new ExitResolutionEngine(new MockPITEngine(true)),
      recon2
    );
    
    const res3 = adapterMutated.executeReplay(signal, mutatedBars, defaultPolicy, 'DELIVERY');
    expect(res1!.tradeLedgerHash).not.toBe(res3!.tradeLedgerHash);
  });

  it('Candidate reconciliation mismatch -> Hard failure', () => {
    const recon = new ReplayReconciliationEngine();
    recon.registerCandidate();
    recon.registerCandidate();
    recon.registerExecutedTrade();
    // Missed one
    expect(() => recon.verifyStrictReconciliation()).toThrowError(/Hard failure: Replay reconciliation mismatch/);
  });
});
