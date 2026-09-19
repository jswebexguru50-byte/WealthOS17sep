import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { S1ToS10ForensicReplayEngine } from '../../../src/server/services/phase2forensics/S1ToS10ForensicReplayEngine';
import { ParameterMatrixGenerator } from '../../../src/server/services/phase2forensics/ParameterMatrixGenerator';
import { NearMissAnalyzer } from '../../../src/server/services/phase2forensics/NearMissAnalyzer';
import { DownstreamWaterfallEnricher } from '../../../src/server/services/phase2forensics/DownstreamWaterfallEnricher';
import { PostSignalOutcomeTracker } from '../../../src/server/services/phase2forensics/PostSignalOutcomeTracker';
import { Phase2MasterOrchestrator } from '../../../src/server/services/phase2forensics/Phase2MasterOrchestrator';

describe('Phase 2.1 — S1–S10 Historical Signal Forensic Replay Test Suite (Calendar Corrected)', () => {
  const outputDir = 'reports/v674-phase2';

  beforeAll(() => {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  });

  it('1. Pre-flight check validates Git SHA, Dataset Hash, and Governance Flags', () => {
    const replayEngine = new S1ToS10ForensicReplayEngine(outputDir);
    const preFlight = replayEngine.runPreFlightCheck();

    expect(preFlight.gitSha).toBe(S1ToS10ForensicReplayEngine.REQUIRED_GIT_SHA);
    expect(preFlight.datasetHash).toBe(S1ToS10ForensicReplayEngine.REQUIRED_DATASET_HASH);
    expect(preFlight.capitalEligible).toBe(false);
    expect(preFlight.productionPromotion).toBe(false);
    expect(preFlight.liveTrading).toBe(false);
    expect(preFlight.preFlightPassed).toBe(true);
  });

  it('2. Trading Calendar resolves exactly 7 trading sessions, 4 exchange holidays, and 6 weekend days', () => {
    const replayEngine = new S1ToS10ForensicReplayEngine(outputDir);
    const calendar = replayEngine.getTradingCalendar();

    const tradingDays = calendar.filter((c) => c.classification === 'TRADING_DAY');
    const holidays = calendar.filter((c) => c.classification === 'EXCHANGE_HOLIDAY');
    const weekends = calendar.filter((c) => c.classification === 'SATURDAY' || c.classification === 'SUNDAY');

    expect(tradingDays.length).toBe(7);
    expect(holidays.length).toBe(4);
    expect(weekends.length).toBe(6);

    expect(calendar.find((c) => c.date === '2026-03-26')?.holidayName).toBe('Ram Navami');
    expect(calendar.find((c) => c.date === '2026-03-31')?.holidayName).toBe('Mahavir Jayanti');
    expect(calendar.find((c) => c.date === '2026-04-01')?.holidayName).toBe('Annual Bank Closing');
    expect(calendar.find((c) => c.date === '2026-04-03')?.holidayName).toBe('Good Friday');
  });

  it('3. Evaluated Security-Days is exactly 3,500 (500 PIT x 7 Trading Sessions)', () => {
    const replayEngine = new S1ToS10ForensicReplayEngine(outputDir);
    const { evaluations, dailySummaries } = replayEngine.executeHistoricalReplay();

    expect(evaluations.length / 10).toBe(3500);
    expect(evaluations.length).toBe(35000);

    const april01Summary = dailySummaries.find((d) => d.date === '2026-04-01');
    const march31Summary = dailySummaries.find((d) => d.date === '2026-03-31');

    expect(april01Summary?.securitiesEvaluated).toBe(0);
    expect(march31Summary?.securitiesEvaluated).toBe(0);
  });

  it('4. Hard Invariant: Selection Immutability — Downstream filters NEVER alter Sx Signal', () => {
    const replayEngine = new S1ToS10ForensicReplayEngine(outputDir);
    const { evaluations } = replayEngine.executeHistoricalReplay();

    const downstreamEnricher = new DownstreamWaterfallEnricher();
    const downstream = downstreamEnricher.enrichEvaluations(evaluations);

    for (let i = 0; i < evaluations.length; i++) {
      const ev = evaluations[i];
      const ds = downstream[i];

      // Downstream originalStrategySignal MUST exactly equal actual evaluation signal
      expect(ds.originalStrategySignal).toBe(ev.strategySignal);

      // Even if FERE or QGLP fails, ev.strategySignal must remain unchanged!
      if (ds.fereStatus === 'FAIL' || ds.qglpStatus === 'FAIL') {
        expect(ds.originalStrategySignal).toBe(ev.strategySignal);
      }
    }
  });

  it('5. Parameter decision matrix generates deterministic business explanations from numerical values', () => {
    const replayEngine = new S1ToS10ForensicReplayEngine(outputDir);
    const { evaluations } = replayEngine.executeHistoricalReplay();

    const matrixGen = new ParameterMatrixGenerator();
    const signalsOnly = evaluations.filter((e) => e.strategySignal);

    expect(signalsOnly.length).toBeGreaterThan(0);

    const firstSig = signalsOnly[0];
    const mat = matrixGen.generateMatrixAndExplanation(firstSig);

    expect(mat.decisionTable.length).toBe(firstSig.parameters.length);
    expect(mat.businessExplanation.whyQualifiedOrFailed).toContain(firstSig.symbol);
    expect(mat.businessExplanation.whyQualifiedOrFailed).toContain(firstSig.strategyId);
    expect(mat.businessExplanation.finalDecisionSummary).toContain('SIGNAL = TRUE');
  });

  it('6. Near-miss analyzer identifies stocks failing by exactly 1 condition', () => {
    const replayEngine = new S1ToS10ForensicReplayEngine(outputDir);
    const { evaluations } = replayEngine.executeHistoricalReplay();

    const nearMissAnalyzer = new NearMissAnalyzer();
    const { nearMisses, auditCounts } = nearMissAnalyzer.analyzeNearMisses(evaluations);

    expect(auditCounts.length).toBeGreaterThan(0);
    expect(nearMisses.length).toBeGreaterThan(0);

    const firstNearMiss = nearMisses[0];
    expect(firstNearMiss.failedParameterName).toBeDefined();
    expect(firstNearMiss.observedValueStr).toBeDefined();
    expect(firstNearMiss.differenceFromThreshold).toContain('Delta:');
  });

  it('7. Post-signal outcome tracker computes MFE/MAE/1D..60D returns labelled POST_SIGNAL_OUTCOME', () => {
    const replayEngine = new S1ToS10ForensicReplayEngine(outputDir);
    const { evaluations } = replayEngine.executeHistoricalReplay();

    const outcomeTracker = new PostSignalOutcomeTracker();
    const outcomes = outcomeTracker.computeOutcomes(evaluations);

    expect(outcomes.length).toBe(evaluations.length);

    const firstOutcome = outcomes[0];
    expect(firstOutcome.provenanceLabel).toBe('POST_SIGNAL_OUTCOME');
    expect(typeof firstOutcome.return20DPct).toBe('number');
    expect(typeof firstOutcome.maxFavorableExcursionPct).toBe('number');
    expect(typeof firstOutcome.maxAdverseExcursionPct).toBe('number');
  });

  it('9. Hard Calendar Contamination Invariant: Positive trading dates evaluate 500 PIT stocks; Holidays and Weekends evaluate 0', () => {
    const replayEngine = new S1ToS10ForensicReplayEngine(outputDir);
    const { evaluations, dailySummaries } = replayEngine.executeHistoricalReplay();

    const tradingDates = ['2026-03-20', '2026-03-23', '2026-03-24', '2026-03-25', '2026-03-27', '2026-03-30', '2026-04-02'];
    const holidayDates = ['2026-03-26', '2026-03-31', '2026-04-01', '2026-04-03'];
    const weekendDates = ['2026-03-21', '2026-03-22', '2026-03-28', '2026-03-29', '2026-04-04', '2026-04-05'];

    for (const d of tradingDates) {
      const summary = dailySummaries.find((s) => s.date === d);
      expect(summary?.classification).toBe('TRADING_DAY');
      expect(summary?.securitiesEvaluated).toBe(500);
    }

    for (const h of holidayDates) {
      const summary = dailySummaries.find((s) => s.date === h);
      expect(summary?.classification).toBe('EXCHANGE_HOLIDAY');
      expect(summary?.securitiesEvaluated).toBe(0);
    }

    for (const w of weekendDates) {
      const summary = dailySummaries.find((s) => s.date === w);
      expect(summary?.securitiesEvaluated).toBe(0);
    }

    // Assert decisionDate invariant for all evaluations: decisionDate MUST be in tradingDates
    for (const ev of evaluations) {
      expect(tradingDates).toContain(ev.date);
    }
  });

  it('10. Master Orchestrator outputs 01_PHASE2_TRANSITION_AUDIT.json with correct old->new reconciliation metrics', async () => {
    const orchestrator = new Phase2MasterOrchestrator(outputDir);
    const certificate = await orchestrator.executeFullPhase2Orchestration();

    const transitionFile = path.join(outputDir, '01_PHASE2_TRANSITION_AUDIT.json');
    expect(fs.existsSync(transitionFile)).toBe(true);

    const auditData = JSON.parse(fs.readFileSync(transitionFile, 'utf8'));
    expect(auditData.OLD_SESSION_COUNT).toBe(8);
    expect(auditData.NEW_SESSION_COUNT).toBe(7);
    expect(auditData.OLD_SECURITY_DAYS).toBe(4000);
    expect(auditData.NEW_SECURITY_DAYS).toBe(3500);
    expect(auditData.REMOVED_SESSION).toBe('2026-04-01');
    expect(auditData.signals_on_2026_04_01_old_run).toBeGreaterThan(0);
    expect(auditData.signals_on_2026_04_01_corrected_run).toBe(0);

    expect(certificate.signalHashMatch).toBe(true);
    expect(certificate.parameterHashMatch).toBe(true);
    expect(certificate.outcomeHashMatch).toBe(true);
  }, 120000);
});

