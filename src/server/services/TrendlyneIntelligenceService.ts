import { dbAll, getDB } from '../database.js';
import { z } from 'zod';

export const TrendlyneIntelligenceReportSchema = z.object({
  symbol: z.string(),
  companyName: z.string().nullable(),
  cmp: z.number().nullable(),
  sector: z.string().nullable(),
  industry: z.string().nullable(),
  dvm: z.object({
    durabilityScore: z.number().nullable(),
    durabilityGrade: z.enum(['HIGH', 'MEDIUM', 'LOW']).nullable(),
    durabilitySummary: z.string().nullable(),
    valuationScore: z.number().nullable(),
    valuationGrade: z.enum(['EXPENSIVE', 'ATTRACTIVE', 'FAIR', 'VERY_EXPENSIVE']).nullable(),
    valuationSummary: z.string().nullable(),
    momentumScore: z.number().nullable(),
    momentumGrade: z.enum(['STRONG', 'MEDIUM', 'WEAK']).nullable(),
    momentumSummary: z.string().nullable(),
    overallDvmClassification: z.string().nullable(),
    dvmBadgeColor: z.enum(['emerald', 'amber', 'rose', 'cyan', 'purple']).nullable(),
  }),
  swot: z.object({
    strengths: z.array(z.string()).nullable(),
    weaknesses: z.array(z.string()).nullable(),
    opportunities: z.array(z.string()).nullable(),
    threats: z.array(z.string()).nullable(),
  }),
  analystConsensus: z.object({
    totalAnalysts: z.number().nullable(),
    strongBuyCount: z.number().nullable(),
    buyCount: z.number().nullable(),
    holdCount: z.number().nullable(),
    sellCount: z.number().nullable(),
    strongSellCount: z.number().nullable(),
    consensusRating: z.enum(['STRONG_BUY', 'BUY', 'HOLD', 'REDUCE', 'SELL']).nullable(),
    meanTargetPrice: z.number().nullable(),
    upsidePct: z.number().nullable(),
    highTargetPrice: z.number().nullable(),
    lowTargetPrice: z.number().nullable(),
    callStatus: z.enum(['ACTIVE', 'TARGET_BREACHED', 'BELOW_ENTRY']).nullable(),
    callStatusLabel: z.string().nullable(),
  }),
  checklists: z.object({
    piotroskiScore: z.number().nullable(),
    piotroskiVerdict: z.enum(['STRONG', 'MODERATE', 'WEAK']).nullable(),
    altmanZScore: z.number().nullable(),
    altmanZVerdict: z.enum(['SAFE_ZONE', 'GREY_ZONE', 'DISTRESS_ZONE']).nullable(),
    fiiHoldingPct: z.number().nullable(),
    diiHoldingPct: z.number().nullable(),
    promoterHoldingPct: z.number().nullable(),
    promoterPledgePct: z.number().nullable(),
    institutionalTrend: z.enum(['ACCUMULATING', 'STABLE', 'DISTRIBUTING']).nullable(),
    mutualFundHoldingsCount: z.number().nullable(),
  }),
  forecaster: z.object({
    revenueGrowth1YExpectedPct: z.number().nullable(),
    profitGrowth1YExpectedPct: z.number().nullable(),
    epsForward: z.number().nullable(),
    peForward: z.number().nullable(),
    status: z.string().nullable(),
    note: z.string().nullable(),
  }),
  cachedAt: z.string().nullable(),
});

type TrendlyneMirrorObservationRow = {
  observationId?: string | null;
  providerToken?: string | null;
  canonicalMetric?: string | null;
  rawValue?: unknown;
  rawUnit?: string | null;
  status?: string | null;
  providerAsOf?: string | null;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
};

export interface TrendlyneDVM {
  durabilityScore: number | null; // 0-100
  durabilityGrade: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  durabilitySummary: string | null;

  valuationScore: number | null; // 0-100
  valuationGrade: 'EXPENSIVE' | 'ATTRACTIVE' | 'FAIR' | 'VERY_EXPENSIVE' | null;
  valuationSummary: string | null;

  momentumScore: number | null; // 0-100
  momentumGrade: 'STRONG' | 'MEDIUM' | 'WEAK' | null;
  momentumSummary: string | null;

  overallDvmClassification: string | null;
  dvmBadgeColor: 'emerald' | 'amber' | 'rose' | 'cyan' | 'purple' | null;
}

export interface TrendlyneSWOT {
  strengths: string[] | null;
  weaknesses: string[] | null;
  opportunities: string[] | null;
  threats: string[] | null;
}

export interface AnalystConsensus {
  totalAnalysts: number | null;
  strongBuyCount: number | null;
  buyCount: number | null;
  holdCount: number | null;
  sellCount: number | null;
  strongSellCount: number | null;
  consensusRating: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'REDUCE' | 'SELL' | null;
  meanTargetPrice: number | null;
  upsidePct: number | null;         // live-recalculated: negative when CMP already above target
  highTargetPrice: number | null;
  lowTargetPrice: number | null;
  callStatus: 'ACTIVE' | 'TARGET_BREACHED' | 'BELOW_ENTRY' | null; // validity flag
  callStatusLabel: string | null;   // human-readable status e.g. "CMP above target — Target Hit"
}

export interface InstitutionalChecklists {
  piotroskiScore: number | null; // 0 to 9
  piotroskiVerdict: 'STRONG' | 'MODERATE' | 'WEAK' | null;
  altmanZScore: number | null;
  altmanZVerdict: 'SAFE_ZONE' | 'GREY_ZONE' | 'DISTRESS_ZONE' | null;
  fiiHoldingPct: number | null;
  diiHoldingPct: number | null;
  promoterHoldingPct: number | null;
  promoterPledgePct: number | null;
  institutionalTrend: 'ACCUMULATING' | 'STABLE' | 'DISTRIBUTING' | null;
  mutualFundHoldingsCount: number | null;
}

export interface TrendlyneIntelligenceReport {
  symbol: string;
  companyName: string | null;
  cmp: number | null;
  sector: string | null;
  industry: string | null;
  dvm: TrendlyneDVM;
  swot: TrendlyneSWOT;
  analystConsensus: AnalystConsensus;
  checklists: InstitutionalChecklists;
  forecaster: {
    revenueGrowth1YExpectedPct: number | null;
    profitGrowth1YExpectedPct: number | null;
    epsForward: number | null;
    peForward: number | null;
    status: string | null;
    note: string | null;
  };
  trailingRocePct: number | null;
  cachedAt: string | null;
}

export class TrendlyneIntelligenceService {
  private static instance: TrendlyneIntelligenceService;

  public static getInstance(): TrendlyneIntelligenceService {
    if (!TrendlyneIntelligenceService.instance) {
      TrendlyneIntelligenceService.instance = new TrendlyneIntelligenceService();
    }
    return TrendlyneIntelligenceService.instance;
  }

  /**
   * Get complete Trendlyne Intelligence Report for any NSE/BSE stock
   */
  public async getScripIntelligence(symbol: string, liveLtp?: number): Promise<TrendlyneIntelligenceReport | null> {
    const cleanSym = symbol.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    if (!cleanSym) return null;

    // This reader is intentionally limited to the immutable mirror observations.
    // In particular, liveLtp is not used as a fallback because it is not part of
    // this evidence contract.
    void liveLtp;

    let observations: TrendlyneMirrorObservationRow[];
    try {
      observations = await dbAll<TrendlyneMirrorObservationRow>(getDB(), `
        SELECT observationId, providerToken, canonicalMetric, rawValue, rawUnit,
               status, providerAsOf, firstSeenAt, lastSeenAt
        FROM trendlyne_mirror_observations
        WHERE UPPER(symbol) = ?
        ORDER BY lastSeenAt DESC, firstSeenAt DESC, observationId DESC
      `, [cleanSym]);
    } catch (error) {
      // The mirror is an optional migration. A database created before it was
      // installed is equivalent to having no Trendlyne evidence, not a reason
      // to manufacture a legacy report.
      if (isMissingTrendlyneMirrorTable(error)) return null;
      throw error;
    }

    if (!observations.length) return null;

    // Observations are append-only. Keep the newest row per token/metric so a
    // newer provider-null remains null instead of falling back to an older
    // value. The query orders rows for the real DB, while the comparison also
    // keeps mocked/read-through callers deterministic when their rows are not.
    const latestByToken = new Map<string, TrendlyneMirrorObservationRow>();
    const latestByMetric = new Map<string, TrendlyneMirrorObservationRow>();
    for (const observation of observations) {
      const token = normalizeKey(observation.providerToken);
      const metric = normalizeKey(observation.canonicalMetric);
      if (token && isNewerObservation(observation, latestByToken.get(token))) {
        latestByToken.set(token, observation);
      }
      if (metric && isNewerObservation(observation, latestByMetric.get(metric))) {
        latestByMetric.set(metric, observation);
      }
    }

    const observationFor = (tokens: string[], metrics: string[] = []): TrendlyneMirrorObservationRow | null => {
      for (const token of tokens) {
        const observation = latestByToken.get(normalizeKey(token));
        if (observation) return observation;
      }
      for (const metric of metrics) {
        const observation = latestByMetric.get(normalizeKey(metric));
        if (observation) return observation;
      }
      return null;
    };
    const numericValueFor = (tokens: string[], metrics: string[] = []): number | null =>
      parseMirrorNumber(observationFor(tokens, metrics));
    const newestTimestamp = observations.reduce<string | null>((newest, observation) => {
      const timestamp = observation.lastSeenAt || observation.firstSeenAt || observation.providerAsOf || null;
      if (!timestamp) return newest;
      return !newest || compareTimestamps(timestamp, newest) > 0 ? timestamp : newest;
    }, null);

    return {
      symbol: cleanSym,
      companyName: null,
      cmp: numericValueFor(['currentprice'], ['current_price', 'cmp']),
      sector: null,
      industry: null,
      dvm: {
        durabilityScore: null,
        durabilityGrade: null,
        durabilitySummary: null,
        valuationScore: null,
        valuationGrade: null,
        valuationSummary: null,
        momentumScore: null,
        momentumGrade: null,
        momentumSummary: null,
        overallDvmClassification: null,
        dvmBadgeColor: null,
      },
      swot: {
        strengths: null,
        weaknesses: null,
        opportunities: null,
        threats: null,
      },
      analystConsensus: {
        totalAnalysts: null,
        strongBuyCount: null,
        buyCount: null,
        holdCount: null,
        sellCount: null,
        strongSellCount: null,
        consensusRating: null,
        meanTargetPrice: null,
        upsidePct: null,
        highTargetPrice: null,
        lowTargetPrice: null,
        callStatus: null,
        callStatusLabel: null,
      },
      checklists: {
        piotroskiScore: numericValueFor(['pitroskif'], ['piotroski_f_score']),
        piotroskiVerdict: null,
        altmanZScore: null,
        altmanZVerdict: null,
        fiiHoldingPct: numericValueFor(['fiihold'], ['fii_holding', 'fii_holding_pct']),
        // The mirror contract has no verified DII token. Do not relabel
        // institutional or mutual-fund holdings as DII.
        diiHoldingPct: null,
        promoterHoldingPct: numericValueFor(['prompct'], ['promoter_holding', 'promoter_holding_pct']),
        promoterPledgePct: numericValueFor(['prompledge'], ['promoter_pledge', 'promoter_pledge_pct']),
        institutionalTrend: null,
        mutualFundHoldingsCount: null,
      },
      forecaster: {
        revenueGrowth1YExpectedPct: null,
        profitGrowth1YExpectedPct: null,
        epsForward: null,
        peForward: null,
        status: null,
        note: null,
      },
      trailingRocePct: numericValueFor(['rocea'], ['roce_pct']),
      cachedAt: newestTimestamp,
    };
  }

}

function parseMirrorNumber(observation: TrendlyneMirrorObservationRow | null): number | null {
  if (!observation || observation.status !== 'AVAILABLE') return null;
  if (typeof observation.rawValue === 'number') {
    return Number.isFinite(observation.rawValue) ? observation.rawValue : null;
  }
  if (typeof observation.rawValue !== 'string') return null;

  const text = observation.rawValue.trim();
  if (!text) return null;
  const normalized = text.replace(/,/g, '').replace(/₹/g, '').trim();
  if (!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?%?$/.test(normalized)) return null;
  const parsed = Number(normalized.replace(/%$/, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function isNewerObservation(
  candidate: TrendlyneMirrorObservationRow,
  current: TrendlyneMirrorObservationRow | undefined,
): boolean {
  if (!current) return true;
  const timestampComparison = compareTimestamps(
    observationTimestamp(candidate),
    observationTimestamp(current),
  );
  if (timestampComparison !== 0) return timestampComparison > 0;
  return String(candidate.observationId || '') > String(current.observationId || '');
}

function observationTimestamp(observation: TrendlyneMirrorObservationRow): string {
  return observation.lastSeenAt || observation.firstSeenAt || observation.providerAsOf || '';
}

function compareTimestamps(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return leftTime - rightTime;
  return left.localeCompare(right);
}

function isMissingTrendlyneMirrorTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table:\s*trendlyne_mirror_observations/i.test(message);
}
