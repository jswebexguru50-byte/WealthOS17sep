/**
 * Deterministic QGLP scoring.
 *
 * QGLP is intentionally fail-closed: a pillar is scored only when all of its
 * required, point-in-time inputs are present. Missing evidence never becomes
 * zero, pass, or a synthetic score.
 */

export type QglpStatus =
  | 'PASS'
  | 'FAIL'
  | 'PARTIAL'
  | 'DATA_INSUFFICIENT'
  | 'SOURCE_UNAVAILABLE';

export interface QglpConfig {
  minRoePct: number;
  minRocePct: number;
  minCfoToPatPct: number;
  minCfoToOperatingProfitPct: number;
  maxDebtToEquity: number;
  maxPromoterPledgePct: number;
  minProfitableQuarters: number;
  minProfitableYears: number;
  qualityWeight: number;
  growthWeight: number;
  longevityWeight: number;
  priceWeight: number;
  passScore: number;
}

export const DEFAULT_QGLP_CONFIG: QglpConfig = {
  minRoePct: 25,
  minRocePct: 35,
  minCfoToPatPct: 80,
  minCfoToOperatingProfitPct: 50,
  maxDebtToEquity: 1,
  maxPromoterPledgePct: 0,
  minProfitableQuarters: 8,
  minProfitableYears: 3,
  qualityWeight: 0.30,
  growthWeight: 0.30,
  longevityWeight: 0.20,
  priceWeight: 0.20,
  passScore: 70,
};

export interface QglpInput {
  roePct: number | null;
  rocePct: number | null;
  cfoToPatPct: number | null;
  cfoToOperatingProfitPct: number | null;
  debtToEquity: number | null;
  promoterPledgePct: number | null;
  profitableQuarterCount: number | null;
  salesCagr3yPct: number | null;
  profitCagr3yPct: number | null;
  profitableYears: number | null;
  positiveCfoYears: number | null;
  roceConsistencyPct: number | null;
  marginStabilityPct: number | null;
  peVsHistoryPct: number | null;
  peVsSectorPct: number | null;
  peg: number | null;
  fcfYieldPct: number | null;
  evidenceIds?: string[];
}

export interface QglpPillar {
  score: number | null;
  status: QglpStatus;
  missingFields: string[];
  evidenceIds: string[];
}

export interface QglpResult {
  status: QglpStatus;
  score: number | null;
  quality: QglpPillar;
  growth: QglpPillar;
  longevity: QglpPillar;
  price: QglpPillar;
  evidenceCompletenessPct: number;
  reason: string;
}

const finite = (v: number | null): v is number => v != null && Number.isFinite(v);
const clamp = (v: number): number => Math.max(0, Math.min(100, v));
const rangeScore = (value: number | null, min: number, max: number): number | null =>
  finite(value) ? clamp(((value - min) / (max - min)) * 100) : null;
const inverseScore = (value: number | null, good: number, bad: number): number | null =>
  finite(value) ? clamp(((bad - value) / (bad - good)) * 100) : null;

function pillar(missingFields: string[], score: number | null, evidenceIds: string[]): QglpPillar {
  if (missingFields.length) return { score: null, status: 'DATA_INSUFFICIENT', missingFields, evidenceIds };
  return { score, status: score == null ? 'DATA_INSUFFICIENT' : score >= 50 ? 'PASS' : 'FAIL', missingFields: [], evidenceIds };
}

export function calculateQglp(input: QglpInput, config: QglpConfig = DEFAULT_QGLP_CONFIG): QglpResult {
  const evidenceIds = input.evidenceIds || [];
  const qualityMissing = [
    ['roePct', input.roePct], ['rocePct', input.rocePct], ['cfoToPatPct', input.cfoToPatPct],
    ['cfoToOperatingProfitPct', input.cfoToOperatingProfitPct], ['debtToEquity', input.debtToEquity],
    ['promoterPledgePct', input.promoterPledgePct],
  ].filter(([, v]) => !finite(v as number | null)).map(([k]) => k as string);
  const qualityScore = qualityMissing.length ? null : (
    (rangeScore(input.roePct, config.minRoePct, 40)! * 0.20) +
    (rangeScore(input.rocePct, config.minRocePct, 50)! * 0.20) +
    (rangeScore(input.cfoToPatPct, config.minCfoToPatPct, 120)! * 0.20) +
    (rangeScore(input.cfoToOperatingProfitPct, config.minCfoToOperatingProfitPct, 100)! * 0.20) +
    (inverseScore(input.debtToEquity, 0, 2)! * 0.10) +
    (inverseScore(input.promoterPledgePct, config.maxPromoterPledgePct, 10)! * 0.10)
  );

  const growthMissing = [
    ['profitableQuarterCount', input.profitableQuarterCount], ['salesCagr3yPct', input.salesCagr3yPct],
    ['profitCagr3yPct', input.profitCagr3yPct],
  ].filter(([, v]) => !finite(v as number | null)).map(([k]) => k as string);
  const growthScore = growthMissing.length ? null : (
    (input.profitableQuarterCount! >= config.minProfitableQuarters ? 100 : 0) * 0.30 +
    rangeScore(input.salesCagr3yPct, 0, 25)! * 0.35 +
    rangeScore(input.profitCagr3yPct, 0, 30)! * 0.35
  );

  const longevityMissing = [
    ['profitableYears', input.profitableYears], ['positiveCfoYears', input.positiveCfoYears],
    ['roceConsistencyPct', input.roceConsistencyPct], ['marginStabilityPct', input.marginStabilityPct],
  ].filter(([, v]) => !finite(v as number | null)).map(([k]) => k as string);
  const longevityScore = longevityMissing.length ? null : (
    rangeScore(input.profitableYears, config.minProfitableYears, 10)! * 0.30 +
    rangeScore(input.positiveCfoYears, config.minProfitableYears, 10)! * 0.30 +
    rangeScore(input.roceConsistencyPct, 50, 100)! * 0.20 +
    rangeScore(input.marginStabilityPct, 50, 100)! * 0.20
  );

  const priceMissing = [
    ['peVsHistoryPct', input.peVsHistoryPct], ['peVsSectorPct', input.peVsSectorPct],
    ['peg', input.peg], ['fcfYieldPct', input.fcfYieldPct],
  ].filter(([, v]) => !finite(v as number | null)).map(([k]) => k as string);
  const priceScore = priceMissing.length ? null : (
    inverseScore(input.peVsHistoryPct, 0, 100)! * 0.35 +
    inverseScore(input.peVsSectorPct, 0, 100)! * 0.25 +
    inverseScore(input.peg, 0.5, 3)! * 0.20 +
    rangeScore(input.fcfYieldPct, 0, 10)! * 0.20
  );

  const quality = pillar(qualityMissing, qualityScore, evidenceIds);
  const growth = pillar(growthMissing, growthScore, evidenceIds);
  const longevity = pillar(longevityMissing, longevityScore, evidenceIds);
  const price = pillar(priceMissing, priceScore, evidenceIds);
  const pillars = [quality, growth, longevity, price];
  const available = pillars.filter(p => p.score != null);
  const completeness = (available.length / pillars.length) * 100;
  if (available.length < pillars.length) {
    return { status: available.length === 0 ? 'DATA_INSUFFICIENT' : 'PARTIAL', score: null, quality, growth, longevity, price, evidenceCompletenessPct: completeness, reason: 'At least one QGLP pillar lacks required dated evidence; score withheld.' };
  }
  const score = clamp(quality.score! * config.qualityWeight + growth.score! * config.growthWeight + longevity.score! * config.longevityWeight + price.score! * config.priceWeight);
  return { status: score >= config.passScore ? 'PASS' : 'FAIL', score, quality, growth, longevity, price, evidenceCompletenessPct: 100, reason: score >= config.passScore ? 'All QGLP pillars are evidenced and the score meets the configured threshold.' : 'All QGLP pillars are evidenced but the score is below the configured threshold.' };
}
