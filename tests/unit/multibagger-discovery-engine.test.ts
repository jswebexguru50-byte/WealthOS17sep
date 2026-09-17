import { describe, it, expect, beforeAll } from 'vitest';
import { MultibaggerDiscoveryEngine, MultibaggerRadarReport } from '../../src/server/services/MultibaggerDiscoveryEngine.js';

describe('Quantitative Multibagger Discovery Engine (Mayer / Phelps / QGLP / Thorndike / Fisher)', () => {
  let engine: MultibaggerDiscoveryEngine;
  let report: MultibaggerRadarReport;

  beforeAll(async () => {
    engine = MultibaggerDiscoveryEngine.getInstance();
    report = await engine.scanMultibaggerUniverse();
  });

  it('retrieves singleton instance of MultibaggerDiscoveryEngine', () => {
    expect(engine).toBeDefined();
    const instance2 = MultibaggerDiscoveryEngine.getInstance();
    expect(instance2).toBe(engine);
  });

  it('scans the universe and produces a complete 4-phase radar report', () => {
    expect(report).toBeDefined();
    expect(report.generatedAt).toBeDefined();
    expect(report.totalEvaluated).toBeGreaterThanOrEqual(6);
    expect(report.passedPhase1Count).toBeGreaterThan(0);
    expect(report.passedPhase2QglpCount).toBeGreaterThan(0);
    expect(report.topRunnersCount).toBeGreaterThan(0);
    expect(report.universe.length).toBe(report.totalEvaluated);
  });

  it('enforces Phase 1 Small-Base & Governance Exclusion Gate strictly', () => {
    const sharda = report.universe.find(s => s.symbol === 'SHARDAMOTR');
    expect(sharda).toBeDefined();
    expect(sharda?.phase1Exclusion.passed).toBe(true);
    expect(sharda?.phase1Exclusion.marketCapValid).toBe(true);
    expect(sharda?.phase1Exclusion.promoterHoldingValid).toBe(true);
    expect(sharda?.phase1Exclusion.pledgeValid).toBe(true);
    expect(sharda?.phase1Exclusion.dsoValid).toBe(true);
    expect(sharda?.phase1Exclusion.contingentValid).toBe(true);

    // Verify that a leveraged contractor with high pledge and bloated DSO fails Phase 1
    const oriana = report.universe.find(s => s.symbol === 'ORIANA');
    expect(oriana).toBeDefined();
    expect(oriana?.phase1Exclusion.passed).toBe(false);
    expect(oriana?.phase1Exclusion.pledgeValid).toBe(false); // 8.4% pledge > 2%
    expect(oriana?.phase1Exclusion.dsoValid).toBe(false); // 48% DSO increase > 20%
    expect(oriana?.phase1Exclusion.contingentValid).toBe(false); // 24.5% > 15%
    expect(oriana?.phase1Exclusion.reasons.length).toBeGreaterThan(0);
  });

  it('enforces Phase 2 QGLP Fundamental Compounder Gate strictly', () => {
    const mps = report.universe.find(s => s.symbol === 'MPSLTD');
    expect(mps).toBeDefined();
    expect(mps?.phase2Qglp.passed).toBe(true);
    expect(mps?.phase2Qglp.salesValid).toBe(true); // >= 15%
    expect(mps?.phase2Qglp.patValid).toBe(true); // >= 18%
    expect(mps?.phase2Qglp.roceValid).toBe(true); // >= 20%
    expect(mps?.phase2Qglp.debtValid).toBe(true); // <= 0.40x
    expect(mps?.phase2Qglp.cfoValid).toBe(true); // >= 0.75
    expect(mps?.phase2Qglp.marginStabilityValid).toBe(true); // <= 3.5%
    expect(mps?.phase2Qglp.trendFilterValid).toBe(true); // CMP > SMA200

    // Verify that a negative CFO and high-debt company fails Phase 2
    const oriana = report.universe.find(s => s.symbol === 'ORIANA');
    expect(oriana?.phase2Qglp.passed).toBe(false);
    expect(oriana?.phase2Qglp.cfoValid).toBe(false); // Negative CFO/PAT
    expect(oriana?.phase2Qglp.debtValid).toBe(false); // 1.15x > 0.40x
    expect(oriana?.phase2Qglp.roceValid).toBe(false); // 14.8% < 20%
  });

  it('computes Phase 3 Multi-Factor Scores including Reinvestment Rate and Twin-Engine Expansion', () => {
    const jyoti = report.universe.find(s => s.symbol === 'JYOTIRES');
    expect(jyoti).toBeDefined();

    const scores = jyoti?.phase3Scores!;
    expect(scores.allocationScore).toBeGreaterThanOrEqual(15);
    expect(scores.reinvestmentRatePct).toBeGreaterThan(20);
    expect(scores.intrinsicGrowthPct).toBeGreaterThan(10);

    expect(scores.moatScore).toBeGreaterThanOrEqual(15);
    expect(scores.moatSpreadPct).toBeGreaterThan(8); // Target > 8% over WACC

    expect(scores.twinEngineScore).toBeGreaterThanOrEqual(15);
    expect(scores.multipleHeadroomRatio).toBeGreaterThan(1.0); // Sector PE > Trailing PE
    expect(scores.pegRatio).toBeLessThanOrEqual(1.25);

    expect(scores.accumulationScore).toBeGreaterThanOrEqual(10);
    expect(scores.totalMultibaggerScore).toBeGreaterThanOrEqual(75);
  });

  it('classifies top micro/small cap compounders into 10X or 5X tiers', () => {
    const sharda = report.universe.find(s => s.symbol === 'SHARDAMOTR');
    const jyoti = report.universe.find(s => s.symbol === 'JYOTIRES');
    const oriana = report.universe.find(s => s.symbol === 'ORIANA');

    expect(['10X_PHELPS_MAYER_RUNNER', '5X_QGLP_COMPOUNDER']).toContain(sharda?.tier);
    expect(['10X_PHELPS_MAYER_RUNNER', '5X_QGLP_COMPOUNDER']).toContain(jyoti?.tier);
    expect(oriana?.tier).toBe('FAILED_GATE');
  });

  it('validates Phase 4 Coffee Can "Sit Tight" protocol parameters', () => {
    report.universe.forEach(candidate => {
      expect(candidate.phase4Protocol.recommendedPositionSizePct).toBeGreaterThanOrEqual(4.0);
      expect(candidate.phase4Protocol.recommendedPositionSizePct).toBeLessThanOrEqual(6.0);
      expect(candidate.phase4Protocol.trailingDrawdownTolerancePct).toBe(40.0);
      expect(candidate.phase4Protocol.sittingPolicyRule).toContain('Never sell a position simply because it has gained');
    });
  });

  it('generates copy-pasteable Screener.in query string', () => {
    const query = engine.getScreenerInQuery();
    expect(query).toContain('Market Capitalization < 7500');
    expect(query).toContain('Return on capital employed > 20');
    expect(query).toContain('Debt to equity < 0.4');
    expect(query).toContain('Promoter holding > 50');
    expect(query).toContain('Pledged percentage < 2');
    expect(query).toContain('PEG Ratio < 1.25');
  });

  it('generates Python VectorBT backtest code blueprint', () => {
    const code = engine.getPythonBacktestCode();
    expect(code).toContain('def screen_qglp_universe');
    expect(code).toContain('def calculate_multibagger_rank');
    expect(code).toContain('reinvestment_rate');
    expect(code).toContain('intrinsic_growth');
    expect(code).toContain('multibagger_score');
  });
});
