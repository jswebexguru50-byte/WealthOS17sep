import {
  evaluateSignalQualityOverlay,
  CandidateSignal,
  EntryDecision
} from "../SignalQualityOverlay.js";
import type { ResearchSignal } from "./types.js";

export interface FieldProvenance {
  field: string;
  value: any;
  sourceTable: string;
  sourceRecordIds: string[];
  availableAt: string;
  decisionTimestamp: string;
}

export interface HistoricalOverlayContext {
  rsScore90D: number | null;
  volumeSurgeRatio: number | null;
  deliveryRatioPct: number | null;
  macroRegime: string | null;
  averageDailyVolumeCr: number | null;
  hasBinaryEventWithin48h: boolean | null;
  fereForensicFlag: string | null;
  piotroskiScore: number | null;
  altmanZScore: number | null;
  marginOfSafetyPct: number | null;
  atrPercent: number | null;
  availableAt: string;
  decisionTimestamp?: string;
  concurrentStrategyIds?: string[];
  provenance?: Record<string, FieldProvenance>;
}

export function assertContextPIT(context: HistoricalOverlayContext) {
  const decisionTs = context.decisionTimestamp || context.availableAt;
  if (context.availableAt > decisionTs) {
    throw new Error(
      `PIT_VIOLATION: Overlay context availableAt (${context.availableAt}) > decisionTimestamp (${decisionTs})`
    );
  }

  if (context.provenance) {
    for (const [field, prov] of Object.entries(context.provenance)) {
      if (prov.availableAt > prov.decisionTimestamp) {
        throw new Error(
          `PIT_VIOLATION: Field ${field} availableAt (${prov.availableAt}) > decisionTimestamp (${prov.decisionTimestamp})`
        );
      }
    }
  }
}

export function evaluateHistoricalOverlay(
  signal: ResearchSignal,
  context: HistoricalOverlayContext
): { approved: boolean; rejectionReasons: string[]; qualityScore?: number; decision?: EntryDecision } {
  // 1. Hard Point-in-Time Assertion
  assertContextPIT(context);

  // 2. Strict Completeness Assertion: Fail Closed on ANY Missing Field
  const missing = Object.entries(context).filter(
    ([key, value]) =>
      key !== "availableAt" &&
      key !== "decisionTimestamp" &&
      key !== "concurrentStrategyIds" &&
      key !== "provenance" &&
      (value === null || value === undefined)
  );

  if (missing.length) {
    return {
      approved: false,
      rejectionReasons: [
        "DATA_INSUFFICIENT",
        ...missing.map(([key]) => `MISSING_${key}`)
      ]
    };
  }

  const activeStrategyIds =
    context.concurrentStrategyIds && context.concurrentStrategyIds.length > 0
      ? context.concurrentStrategyIds
      : [signal.strategyId];

  const rr =
    signal.target && signal.stop
      ? (signal.target - signal.entry) / Math.max(0.01, signal.entry - signal.stop)
      : 2.5;

  const candidate: CandidateSignal = {
    symbol: signal.symbol,
    companyName: signal.symbol,
    strategyIds: activeStrategyIds,
    strategyTriggered: true,
    regimeAllowed: context.macroRegime !== "BEARISH_PANIC",
    forensicClean: context.fereForensicFlag === "CLEAN",
    liquidityPass: (context.averageDailyVolumeCr ?? 0) >= 5,
    eventRiskPass: context.hasBinaryEventWithin48h === false,
    riskReward: rr,
    gapRiskTooHigh: false,
    portfolioConcentrationTooHigh: false,
    positionRiskTooHigh: false,
    qualityInput: {
      strategyCount: activeStrategyIds.length,
      independentBuckets: activeStrategyIds.length >= 2 ? 2 : 1,
      relativeStrengthPercentile: context.rsScore90D!,
      volumeRatio: context.volumeSurgeRatio!,
      deliveryQualityScore: context.deliveryRatioPct!,
      regimeScore: context.macroRegime === "BULLISH_EXPANSION" ? 1.0 : 0.6,
      liquidityScore: Math.min(1.0, (context.averageDailyVolumeCr ?? 0) / 25),
      eventRiskScore: context.hasBinaryEventWithin48h ? 0.0 : 1.0,
      forensicScore: context.fereForensicFlag === "CLEAN" ? 1.0 : 0.0,
      valuationScore: Math.min(1.0, Math.max(0, (context.marginOfSafetyPct ?? 0) / 20)),
      riskReward: rr,
      gapRiskScore: 0.9
    }
  };

  const decision = evaluateSignalQualityOverlay(candidate);
  return {
    approved: decision.approved,
    rejectionReasons: decision.rejectionReasons,
    qualityScore: decision.qualityScore,
    decision
  };
}

export function evaluateFrozenOverlayOnSignal(
  signal: ResearchSignal,
  context?: HistoricalOverlayContext
): { approved: boolean; rejectionReasons: string[]; qualityScore?: number } {
  if (!context) {
    return {
      approved: false,
      rejectionReasons: ["DATA_INSUFFICIENT: NO_HISTORICAL_OVERLAY_CONTEXT_PROVIDED"]
    };
  }
  return evaluateHistoricalOverlay(signal, context);
}
