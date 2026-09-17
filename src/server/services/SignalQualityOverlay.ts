/**
 * src/server/services/SignalQualityOverlay.ts
 *
 * Institutional Signal Quality Overlay & Independent Evidence Layer for WealthOS / ITAS.
 * Enforces multi-pillar confirmation across distinct, non-correlated evidence buckets
 * rather than counting raw correlated strategy consensus.
 *
 * Designed to layer non-destructively over existing strategies S1–S20 and new strategies S21–S26.
 * Incorporates senior peer review findings:
 * - Single canonical weight configuration (CANONICAL_SIGNAL_QUALITY_WEIGHTS)
 * - Strategy-specific scoring profiles (Momentum, Structural, Catalyst, Balanced)
 * - Primary bucket allocation preventing S20 duplicate bucket counting
 * - Empirical strategy correlation / redundancy matrix
 * - Tamper-evident SHA-256 audit record hashing with durable append-only hash chaining
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export type EvidenceBucketId =
  | 'BUCKET_A_TREND'
  | 'BUCKET_B_VOLUME_ACCUMULATION'
  | 'BUCKET_C_CATALYST_FUNDAMENTAL'
  | 'BUCKET_D_MEAN_REVERSION'
  | 'BUCKET_E_MACRO_REGIME'
  | 'BUCKET_F_STRUCTURAL';

export interface EvidenceBucketMeta {
  id: EvidenceBucketId;
  name: string;
  description: string;
  associatedStrategies: string[];
}

export const EVIDENCE_BUCKETS: Record<EvidenceBucketId, EvidenceBucketMeta> = {
  BUCKET_A_TREND: {
    id: 'BUCKET_A_TREND',
    name: 'Bucket A: Trend & Momentum',
    description: 'Price structure, moving average alignments, relative strength, and trend persistence.',
    associatedStrategies: ['S3', 'S4', 'S5', 'S6', 'S8', 'S8B']
  },
  BUCKET_B_VOLUME_ACCUMULATION: {
    id: 'BUCKET_B_VOLUME_ACCUMULATION',
    name: 'Bucket B: Volume & Absorption',
    description: 'Volume price analysis, dry-ups, delivery spikes, and abnormal absorption.',
    associatedStrategies: ['S1', 'S9', 'S18', 'S19']
  },
  BUCKET_C_CATALYST_FUNDAMENTAL: {
    id: 'BUCKET_C_CATALYST_FUNDAMENTAL',
    name: 'Bucket C: Catalyst & Fundamental Alpha',
    description: 'Earnings acceleration, episodic pivots, operating leverage, and insider SAST filings.',
    associatedStrategies: ['S12', 'S13', 'S16', 'S17']
  },
  BUCKET_D_MEAN_REVERSION: {
    id: 'BUCKET_D_MEAN_REVERSION',
    name: 'Bucket D: Mean Reversion & Exhaustion',
    description: 'RSI capitulation dips, Wyckoff springs, and structural reversal double bottoms.',
    associatedStrategies: ['S7', 'S11', 'S23']
  },
  BUCKET_E_MACRO_REGIME: {
    id: 'BUCKET_E_MACRO_REGIME',
    name: 'Bucket E: Macro & Regime Risk',
    description: 'Macro liquidity, breadth expansions, Nifty regime gates, and portfolio hedges.',
    associatedStrategies: ['S14', 'MACRO_REGIME']
  },
  BUCKET_F_STRUCTURAL: {
    id: 'BUCKET_F_STRUCTURAL',
    name: 'Bucket F: Structural Geometry',
    description: 'NEoWave impulse/corrective patterns, Cup & Handle, Volatility Squeeze, and Inverse H&S.',
    associatedStrategies: ['S20', 'S21', 'S22', 'S25']
  }
};

/**
 * Primary Strategy Bucket Mapping (Enforces 1 Primary Bucket per Strategy)
 * Eliminates artificial multi-bucket inflation for strategies with contextual overlap (e.g. S20 NEoWave).
 */
export const STRATEGY_PRIMARY_BUCKET: Record<string, EvidenceBucketId> = {
  S1: 'BUCKET_B_VOLUME_ACCUMULATION',
  S2: 'BUCKET_A_TREND',
  S3: 'BUCKET_A_TREND',
  S4: 'BUCKET_A_TREND',
  S5: 'BUCKET_A_TREND',
  S6: 'BUCKET_A_TREND',
  S7: 'BUCKET_D_MEAN_REVERSION',
  S8: 'BUCKET_A_TREND',
  S8B: 'BUCKET_A_TREND',
  S9: 'BUCKET_B_VOLUME_ACCUMULATION',
  S10: 'BUCKET_A_TREND',
  S11: 'BUCKET_D_MEAN_REVERSION',
  S12: 'BUCKET_C_CATALYST_FUNDAMENTAL',
  S13: 'BUCKET_C_CATALYST_FUNDAMENTAL',
  S14: 'BUCKET_E_MACRO_REGIME',
  S15: 'BUCKET_E_MACRO_REGIME',
  S16: 'BUCKET_C_CATALYST_FUNDAMENTAL',
  S17: 'BUCKET_C_CATALYST_FUNDAMENTAL',
  S18: 'BUCKET_B_VOLUME_ACCUMULATION',
  S19: 'BUCKET_B_VOLUME_ACCUMULATION',
  S20: 'BUCKET_F_STRUCTURAL', // Strictly Structural geometry
  S21: 'BUCKET_F_STRUCTURAL', // Cup & Handle
  S22: 'BUCKET_F_STRUCTURAL', // TTM Squeeze
  S23: 'BUCKET_D_MEAN_REVERSION', // Double Bottom
  S24: 'BUCKET_F_STRUCTURAL', // Double Top Distribution (Exit)
  S25: 'BUCKET_F_STRUCTURAL', // Inverse H&S
  S26: 'BUCKET_F_STRUCTURAL'  // H&S Distribution Exit
};

/**
 * Empirical Strategy Dependency & Signal Correlation Matrix
 * Discounts consensus credit if two strategies exhibit high empirical signal coincidence (> 0.65).
 */
export interface StrategyDependencyProfile {
  strategyPair: [string, string];
  signalCorrelation: number; // 0.0 - 1.0 (co-occurrence rate)
  returnCorrelation60D: number;
}

export const EMPIRICAL_STRATEGY_CORRELATIONS: StrategyDependencyProfile[] = [
  { strategyPair: ['S1', 'S9'], signalCorrelation: 0.74, returnCorrelation60D: 0.81 }, // Both volume breakout
  { strategyPair: ['S3', 'S4'], signalCorrelation: 0.68, returnCorrelation60D: 0.77 }, // Both HH/HL structural
  { strategyPair: ['S6', 'S8'], signalCorrelation: 0.62, returnCorrelation60D: 0.69 },
  { strategyPair: ['S6', 'S18'], signalCorrelation: 0.31, returnCorrelation60D: 0.42 }, // High independence
  { strategyPair: ['S6', 'S13'], signalCorrelation: 0.22, returnCorrelation60D: 0.35 }  // High independence
];

/**
 * Calculates empirical redundancy discount across active strategies.
 */
export function calculateEmpiricalRedundancyDiscount(strategyIds: string[]): number {
  if (strategyIds.length < 2) return 1.0;
  let maxCorr = 0;
  const cleanIds = strategyIds.map(s => s.toUpperCase().trim());

  for (let i = 0; i < cleanIds.length; i++) {
    for (let j = i + 1; j < cleanIds.length; j++) {
      const match = EMPIRICAL_STRATEGY_CORRELATIONS.find(
        p => (p.strategyPair[0] === cleanIds[i] && p.strategyPair[1] === cleanIds[j]) ||
             (p.strategyPair[0] === cleanIds[j] && p.strategyPair[1] === cleanIds[i])
      );
      if (match && match.signalCorrelation > maxCorr) {
        maxCorr = match.signalCorrelation;
      }
    }
  }

  // If two active strategies are > 0.65 correlated, discount effective consensus by up to 25%
  return maxCorr > 0.65 ? Math.max(0.75, 1.0 - (maxCorr - 0.65)) : 1.0;
}

/**
 * Maps active strategy triggers to their independent primary evidence buckets.
 */
export function getIndependentEvidenceBuckets(strategyIds: string[]): {
  activeBuckets: EvidenceBucketId[];
  bucketCount: number;
  bucketDistribution: Record<EvidenceBucketId, string[]>;
  empiricalIndependenceFactor: number;
} {
  const normalizedIds = strategyIds.map(s => s.trim().toUpperCase());
  const bucketDistribution: Record<EvidenceBucketId, string[]> = {
    BUCKET_A_TREND: [],
    BUCKET_B_VOLUME_ACCUMULATION: [],
    BUCKET_C_CATALYST_FUNDAMENTAL: [],
    BUCKET_D_MEAN_REVERSION: [],
    BUCKET_E_MACRO_REGIME: [],
    BUCKET_F_STRUCTURAL: []
  };

  for (const stratId of normalizedIds) {
    const baseId = stratId.split('_')[0].split('-')[0];
    const primaryBucket = STRATEGY_PRIMARY_BUCKET[baseId] || STRATEGY_PRIMARY_BUCKET[stratId];
    if (primaryBucket) {
      if (!bucketDistribution[primaryBucket].includes(stratId)) {
        bucketDistribution[primaryBucket].push(stratId);
      }
    } else {
      // Fallback lookup through general associated strategies
      for (const [bId, meta] of Object.entries(EVIDENCE_BUCKETS)) {
        if (meta.associatedStrategies.some(assoc => stratId === assoc || stratId.startsWith(assoc + '_') || stratId.startsWith(assoc + '-'))) {
          if (!bucketDistribution[bId as EvidenceBucketId].includes(stratId)) {
            bucketDistribution[bId as EvidenceBucketId].push(stratId);
          }
          break; // Assign strictly to first matching bucket to prevent multi-bucket inflation
        }
      }
    }
  }

  const activeBuckets = (Object.keys(bucketDistribution) as EvidenceBucketId[]).filter(
    bId => bucketDistribution[bId].length > 0
  );

  const empiricalIndependenceFactor = calculateEmpiricalRedundancyDiscount(strategyIds);

  return {
    activeBuckets,
    bucketCount: activeBuckets.length,
    bucketDistribution,
    empiricalIndependenceFactor
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL SCORING CONFIGURATION & STRATEGY PROFILES
// ─────────────────────────────────────────────────────────────────────────────

export interface SignalQualityWeights {
  independentBuckets: number; // Max pts
  relativeStrength: number;
  volumeRatio: number;
  deliveryQuality: number;
  regime: number;
  liquidity: number;
  eventRisk: number;
  forensic: number;
  valuation: number;
  riskReward: number;
}

/**
 * Single Canonical Scoring Configuration
 * Sum of all maximum points equals exactly 100.
 */
export const CANONICAL_SIGNAL_QUALITY_WEIGHTS: SignalQualityWeights = {
  independentBuckets: 15,
  relativeStrength: 15,
  volumeRatio: 10,
  deliveryQuality: 10,
  regime: 10,
  liquidity: 10,
  eventRisk: 5,
  forensic: 10,
  valuation: 5,
  riskReward: 10
};

export type StrategyProfileType = 'BALANCED' | 'MOMENTUM' | 'STRUCTURAL' | 'CATALYST_FUNDAMENTAL';

export const STRATEGY_QUALITY_PROFILES: Record<StrategyProfileType, SignalQualityWeights> = {
  BALANCED: CANONICAL_SIGNAL_QUALITY_WEIGHTS,
  MOMENTUM: {
    independentBuckets: 20,
    relativeStrength: 20,
    volumeRatio: 15,
    deliveryQuality: 10,
    regime: 10,
    liquidity: 10,
    eventRisk: 5,
    forensic: 5,
    valuation: 0, // Pure momentum trades are not penalized for 0 margin of safety
    riskReward: 5
  },
  STRUCTURAL: {
    independentBuckets: 20,
    relativeStrength: 15,
    volumeRatio: 15,
    deliveryQuality: 10,
    regime: 10,
    liquidity: 10,
    eventRisk: 5,
    forensic: 5,
    valuation: 5,
    riskReward: 5
  },
  CATALYST_FUNDAMENTAL: {
    independentBuckets: 15,
    relativeStrength: 10,
    volumeRatio: 10,
    deliveryQuality: 5,
    regime: 10,
    liquidity: 5,
    eventRisk: 5,
    forensic: 20, // Heavily weighted on FERE integrity
    valuation: 15, // Heavily weighted on DCF/EPV margin of safety
    riskReward: 5
  }
};

export interface SignalQualityInput {
  strategyCount: number;
  independentBuckets: number;
  /** Empirical redundancy factor applied to the independent-evidence pillar. */
  empiricalIndependenceFactor?: number;
  relativeStrengthPercentile: number; // 0 - 100
  volumeRatio: number; // e.g. 1.5 = 150% of 20D average
  deliveryQualityScore?: number; // 0 - 100 based on delivery z-score
  regimeScore: number; // 0.0 - 1.0 (from Macro Regime)
  liquidityScore: number; // 0.0 - 1.0 (based on position size vs ADV)
  eventRiskScore: number; // 0.0 - 1.0 (1.0 = zero upcoming event risk)
  forensicScore: number; // 0.0 - 1.0 (from FERE engine composite health)
  valuationScore: number; // 0.0 - 1.0 (from EPV/DCF margin of safety)
  riskReward: number; // e.g. 2.5 or 3.0
  gapRiskScore?: number; // 0.0 - 1.0 (1.0 = low historical overnight gap risk)
  profileType?: StrategyProfileType;
}

/**
 * Computes Composite Signal Quality Score (0 to 100) using canonical weights.
 */
export interface EvidenceAdjustment {
  rawBucketPoints: number;
  redundancyFactor: number;
  adjustedBucketPoints: number;
  correlatedPairs: StrategyDependencyProfile[];
}

export function calculateEvidenceAdjustment(
  strategyIds: string[],
  rawBucketPoints: number
): EvidenceAdjustment {
  const normalized = strategyIds.map(s => s.toUpperCase().trim());
  const correlatedPairs = EMPIRICAL_STRATEGY_CORRELATIONS.filter(p =>
    normalized.includes(p.strategyPair[0]) && normalized.includes(p.strategyPair[1])
  );
  const redundancyFactor = calculateEmpiricalRedundancyDiscount(normalized);
  return {
    rawBucketPoints,
    redundancyFactor,
    adjustedBucketPoints: rawBucketPoints * redundancyFactor,
    correlatedPairs
  };
}

export function calculateSignalQuality(
  input: SignalQualityInput,
  customWeights?: SignalQualityWeights,
  empiricalIndependenceFactor = input.empiricalIndependenceFactor ?? 1.0
): number {
  const weights = customWeights || STRATEGY_QUALITY_PROFILES[input.profileType || 'BALANCED'] || CANONICAL_SIGNAL_QUALITY_WEIGHTS;
  let totalScore = 0;

  // 1. Independent Buckets — raw evidence is discounted for empirically correlated strategies.
  const rawBucketPts = Math.min(weights.independentBuckets, (input.independentBuckets / 3) * weights.independentBuckets);
  const redundancyFactor = Math.max(0.75, Math.min(1.0, empiricalIndependenceFactor));
  const bucketPts = rawBucketPts * redundancyFactor;
  totalScore += bucketPts;

  // 2. Relative Strength
  const rsPts = Math.min(weights.relativeStrength, (input.relativeStrengthPercentile / 100) * weights.relativeStrength);
  totalScore += rsPts;

  // 3. Volume Ratio
  const volPts = Math.min(weights.volumeRatio, (input.volumeRatio / 2.0) * weights.volumeRatio);
  totalScore += volPts;

  // 4. Delivery Quality
  const delvPts = Math.min(weights.deliveryQuality, ((input.deliveryQualityScore ?? 60) / 100) * weights.deliveryQuality);
  totalScore += delvPts;

  // 5. Macro Regime Alignment
  const regimePts = Math.min(weights.regime, Math.max(0, input.regimeScore * weights.regime));
  totalScore += regimePts;

  // 6. Adaptive Liquidity
  const liqPts = Math.min(weights.liquidity, Math.max(0, input.liquidityScore * weights.liquidity));
  totalScore += liqPts;

  // 7. Event Risk
  const eventPts = Math.min(weights.eventRisk, Math.max(0, input.eventRiskScore * weights.eventRisk));
  totalScore += eventPts;

  // 8. FERE Forensic Clearance
  const forensicPts = Math.min(weights.forensic, Math.max(0, input.forensicScore * weights.forensic));
  totalScore += forensicPts;

  // 9. Margin of Safety / Valuation
  const valPts = Math.min(weights.valuation, Math.max(0, input.valuationScore * weights.valuation));
  totalScore += valPts;

  // 10. Risk / Reward Ratio (Floor 2.5, full points at 3.5+)
  const rrRatio = Math.max(0, (input.riskReward - 2.0) / 1.5);
  const rrPts = Math.min(weights.riskReward, rrRatio * weights.riskReward);
  totalScore += rrPts;

  return Number(Math.max(0, Math.min(100, totalScore)).toFixed(1));
}

export interface CandidateSignal {
  symbol: string;
  companyName?: string;
  strategyIds: string[];
  strategyTriggered: boolean;
  regimeAllowed: boolean;
  forensicClean: boolean;
  liquidityPass: boolean;
  eventRiskPass: boolean;
  riskReward: number;
  gapRiskTooHigh: boolean;
  portfolioConcentrationTooHigh: boolean;
  positionRiskTooHigh: boolean;
  qualityInput: SignalQualityInput;
}

export interface EntryDecision {
  approved: boolean;
  status: 'APPROVED' | 'REJECT' | 'WATCH';
  qualityScore: number;
  independentBucketsCount: number;
  activeBuckets: EvidenceBucketId[];
  empiricalIndependenceFactor: number;
  rejectionReasons: string[];
  summary: string;
}

/**
 * Gatekeeper function enforcing strict capital protection and independent evidence.
 */
export function evaluateSignalQualityOverlay(signal: CandidateSignal): EntryDecision {
  const rejectionReasons: string[] = [];

  // 1. Raw Strategy Trigger requirement
  if (!signal.strategyTriggered || signal.strategyIds.length === 0) {
    rejectionReasons.push('NO_STRATEGY_TRIGGER');
  }

  // 2. Macro Regime restriction
  if (!signal.regimeAllowed) {
    rejectionReasons.push('REGIME_BLOCK: Current market regime restricts new long momentum entries');
  }

  // 3. FERE Forensic audit failure
  if (!signal.forensicClean) {
    rejectionReasons.push('FORENSIC_BLOCK: FERE flagged manipulation risk, solvency distress, or high accruals');
  }

  // 4. Adaptive Liquidity check
  if (!signal.liquidityPass) {
    rejectionReasons.push('LIQUIDITY_BLOCK: Planned position exceeds 5% of 30-day average daily traded value');
  }

  // 5. Event risk (immediate concall / board meeting / dividend record date)
  if (!signal.eventRiskPass) {
    rejectionReasons.push('EVENT_RISK: Imminent binary event within 48h creates gap vulnerability');
  }

  // 6. Independent Evidence Buckets check
  const evidenceAnalysis = getIndependentEvidenceBuckets(signal.strategyIds);
  if (evidenceAnalysis.bucketCount < 2) {
    rejectionReasons.push(
      `INSUFFICIENT_INDEPENDENT_CONFIRMATION: Strategy triggers (${signal.strategyIds.join(', ')}) reside in only ${evidenceAnalysis.bucketCount} independent evidence bucket (${evidenceAnalysis.activeBuckets.join(', ')}). Minimum 2 required.`
    );
  }

  // 7. Risk / Reward Floor (Minimum 2.5:1)
  if (signal.riskReward < 2.5) {
    rejectionReasons.push(`INSUFFICIENT_RR: Reward-to-risk ratio (${signal.riskReward.toFixed(2)}) is below the institutional 2.5:1 floor`);
  }

  // 8. Gap Risk Guardrail
  if (signal.gapRiskTooHigh) {
    rejectionReasons.push('GAP_RISK: Historical 95th percentile overnight gap exceeds planned stop loss distance');
  }

  // 9. Portfolio Concentration limits
  if (signal.portfolioConcentrationTooHigh) {
    rejectionReasons.push('CONCENTRATION_LIMIT: Exceeds single-scrip (8%) or sector (25%) exposure limit');
  }

  // 10. Position Risk cap
  if (signal.positionRiskTooHigh) {
    rejectionReasons.push('POSITION_RISK_LIMIT: Capital risk exceeds 2.0% hard equity ceiling');
  }

  // Compute composite score, applying the empirical redundancy discount to the evidence pillar.
  const qualityScore = calculateSignalQuality(
    signal.qualityInput,
    undefined,
    evidenceAnalysis.empiricalIndependenceFactor
  );
  const MIN_QUALITY_EXECUTION_FLOOR = 65.0;

  if (qualityScore < MIN_QUALITY_EXECUTION_FLOOR && rejectionReasons.length === 0) {
    rejectionReasons.push(`SIGNAL_QUALITY_LOW: Composite score (${qualityScore}/100) below execution threshold (${MIN_QUALITY_EXECUTION_FLOOR})`);
  }

  const approved = rejectionReasons.length === 0;
  const status: 'APPROVED' | 'REJECT' | 'WATCH' = approved
    ? 'APPROVED'
    : (rejectionReasons.length === 1 && rejectionReasons[0].startsWith('INSUFFICIENT_INDEPENDENT') ? 'WATCH' : 'REJECT');

  return {
    approved,
    status,
    qualityScore,
    independentBucketsCount: evidenceAnalysis.bucketCount,
    activeBuckets: evidenceAnalysis.activeBuckets,
    empiricalIndependenceFactor: evidenceAnalysis.empiricalIndependenceFactor,
    rejectionReasons,
    summary: approved
      ? `Signal APPROVED: Quality Score ${qualityScore}/100 across ${evidenceAnalysis.bucketCount} independent buckets.`
      : `Signal ${status}: ${rejectionReasons.join(' | ')}`
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DELIVERY QUALITY NORMALIZATION (DELIVERY Z-SCORE)
// ─────────────────────────────────────────────────────────────────────────────
export interface DeliveryZScoreResult {
  currentDelivery: number;
  meanDelivery90: number;
  stdDelivery90: number;
  zScore: number;
  classification: 'WEAK' | 'NORMAL' | 'STRONG' | 'EXCEPTIONAL';
  normalizedScore: number; // 0 to 100
}

export function calculateDeliveryZScore(
  currentDelivery: number,
  historicalDeliverySeries: number[]
): DeliveryZScoreResult {
  if (!historicalDeliverySeries || historicalDeliverySeries.length < 10) {
    return {
      currentDelivery,
      meanDelivery90: currentDelivery,
      stdDelivery90: 1,
      zScore: 1.0,
      classification: 'NORMAL',
      normalizedScore: 50
    };
  }

  const series = historicalDeliverySeries.slice(-90);
  const sum = series.reduce((a, b) => a + b, 0);
  const mean = sum / series.length;
  const variance = series.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / series.length;
  const std = Math.max(0.0001, Math.sqrt(variance));
  const zScore = Number(((currentDelivery - mean) / std).toFixed(2));

  let classification: 'WEAK' | 'NORMAL' | 'STRONG' | 'EXCEPTIONAL' = 'NORMAL';
  let normalizedScore = 50;

  if (zScore < 0.5) {
    classification = 'WEAK';
    normalizedScore = Math.max(0, Math.min(49, 25 + zScore * 40));
  } else if (zScore <= 1.5) {
    classification = 'NORMAL';
    normalizedScore = 50 + (zScore - 0.5) * 20;
  } else if (zScore <= 2.5) {
    classification = 'STRONG';
    normalizedScore = 70 + (zScore - 1.5) * 15;
  } else {
    classification = 'EXCEPTIONAL';
    normalizedScore = Math.min(100, 85 + (zScore - 2.5) * 10);
  }

  return {
    currentDelivery,
    meanDelivery90: Number(mean.toFixed(2)),
    stdDelivery90: Number(std.toFixed(2)),
    zScore,
    classification,
    normalizedScore: Number(normalizedScore.toFixed(1))
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TAMPER-EVIDENT SIGNAL AUDIT RECORD WITH DURABLE APPEND-ONLY CHAIN
// ─────────────────────────────────────────────────────────────────────────────
export type ResearchStatus =
  | 'RESEARCH'
  | 'CHALLENGER'
  | 'SHADOW'
  | 'PRODUCTION'
  | 'DEGRADED'
  | 'QUARANTINED';

export interface StrategyValidationProfile {
  strategyId: string;
  status: ResearchStatus;
  minOutOfSampleTrades: number;
  requiresWalkForward: boolean;
  requiresCostSensitivity: boolean;
  requiresRegimeSplit: boolean;
}

export interface ImmutableSignalAuditRecord {
  auditId: string;
  timestamp: string;
  symbol: string;
  companyName?: string;
  strategyIds: string[];
  regime: string;
  independentEvidenceBuckets: number;
  activeBuckets: EvidenceBucketId[];
  signalQualityScore: number;
  relativeStrengthPercentile: number;
  volumeRatio: number;
  riskReward: number;
  gapRiskStatus: 'LOW' | 'MODERATE' | 'HIGH';
  sectorExposurePct: number;
  portfolioExposurePct: number;
  decision: 'APPROVED' | 'REJECT' | 'WATCH';
  rejectionReasons: string[];
  executionTicketAllowed: boolean;
  rawSignalHash: string;
  inputSnapshotHash: string;
  previousRecordHash: string;
  recordHash: string;
}

const AUDIT_ZERO_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
const AUDIT_LEDGER_PATH = path.resolve(process.cwd(), 'data', 'signal_audit_ledger.jsonl');
let lastAuditHash = AUDIT_ZERO_HASH;

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashCanonical(value: unknown): string {
  return crypto.createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}

function loadLastAuditHash(): void {
  try {
    if (!fs.existsSync(AUDIT_LEDGER_PATH)) return;
    const lines = fs.readFileSync(AUDIT_LEDGER_PATH, 'utf8').split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return;
    const last = JSON.parse(lines[lines.length - 1]) as ImmutableSignalAuditRecord;
    if (verifySignalAuditRecord(last) && typeof last.recordHash === 'string') {
      lastAuditHash = last.recordHash;
    }
  } catch {
    // Fail closed for chaining: retain zero hash rather than inventing continuity.
  }
}

function persistAuditRecord(record: ImmutableSignalAuditRecord): void {
  fs.mkdirSync(path.dirname(AUDIT_LEDGER_PATH), { recursive: true });
  const fd = fs.openSync(AUDIT_LEDGER_PATH, 'a', 0o600);
  try {
    fs.writeSync(fd, `${JSON.stringify(record)}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function auditPayload(record: ImmutableSignalAuditRecord): Omit<ImmutableSignalAuditRecord, 'recordHash'> & { recordHash: '' } {
  const { recordHash: _ignored, ...withoutHash } = record;
  return { ...withoutHash, recordHash: '' };
}

export function verifySignalAuditRecord(record: ImmutableSignalAuditRecord): boolean {
  if (!record || typeof record.recordHash !== 'string' || record.recordHash.length !== 64) return false;
  return hashCanonical(auditPayload(record)) === record.recordHash;
}

loadLastAuditHash();

/**
 * Generates a tamper-evident audit record using canonical full-record hashing and
 * durable append-only JSONL persistence. The recordHash covers every auditable field;
 * recordHash itself is represented as an empty placeholder to avoid circular hashing.
 */
export function generateSignalAuditRecord(params: {
  symbol: string;
  companyName?: string;
  strategyIds: string[];
  regime: string;
  relativeStrengthPercentile: number;
  volumeRatio: number;
  riskReward: number;
  gapRiskTooHigh: boolean;
  sectorExposurePct: number;
  portfolioExposurePct: number;
  overlayDecision: EntryDecision;
  previousRecordHash?: string;
}): ImmutableSignalAuditRecord {
  const timestamp = new Date().toISOString();
  const auditId = `AUDIT-${params.symbol}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  const rawSignalData = {
    symbol: params.symbol,
    strategyIds: params.strategyIds,
    regime: params.regime
  };
  const rawSignalHash = hashCanonical(rawSignalData);

  const inputSnapshotData = {
    relativeStrength: params.relativeStrengthPercentile,
    volumeRatio: params.volumeRatio,
    riskReward: params.riskReward,
    gapRiskTooHigh: params.gapRiskTooHigh,
    sectorExposure: params.sectorExposurePct,
    portfolioExposure: params.portfolioExposurePct
  };
  const inputSnapshotHash = hashCanonical(inputSnapshotData);
  const prevHash = params.previousRecordHash || lastAuditHash;

  const record: ImmutableSignalAuditRecord = {
    auditId,
    timestamp,
    symbol: params.symbol,
    companyName: params.companyName,
    strategyIds: [...params.strategyIds],
    regime: params.regime,
    independentEvidenceBuckets: params.overlayDecision.independentBucketsCount,
    activeBuckets: [...params.overlayDecision.activeBuckets],
    signalQualityScore: params.overlayDecision.qualityScore,
    relativeStrengthPercentile: params.relativeStrengthPercentile,
    volumeRatio: params.volumeRatio,
    riskReward: params.riskReward,
    gapRiskStatus: params.gapRiskTooHigh ? 'HIGH' : 'LOW',
    sectorExposurePct: params.sectorExposurePct,
    portfolioExposurePct: params.portfolioExposurePct,
    decision: params.overlayDecision.status,
    rejectionReasons: [...params.overlayDecision.rejectionReasons],
    executionTicketAllowed: params.overlayDecision.approved,
    rawSignalHash,
    inputSnapshotHash,
    previousRecordHash: prevHash,
    recordHash: ''
  };

  record.recordHash = hashCanonical(auditPayload(record));
  persistAuditRecord(record);
  lastAuditHash = record.recordHash;
  return record;
}
