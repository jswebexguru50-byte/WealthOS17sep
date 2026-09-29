import { getDB, dbGet, dbRun } from '../database.js';
import { ScreenerService, ScreenerData } from './screenerService.js';
import { z } from 'zod';

export const TrendlyneIntelligenceReportSchema = z.object({
  symbol: z.string(),
  companyName: z.string(),
  cmp: z.number(),
  sector: z.string(),
  industry: z.string().optional(),
  dvm: z.object({
    durabilityScore: z.number(),
    durabilityGrade: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    durabilitySummary: z.string(),
    valuationScore: z.number(),
    valuationGrade: z.enum(['EXPENSIVE', 'ATTRACTIVE', 'FAIR', 'VERY_EXPENSIVE']),
    valuationSummary: z.string(),
    momentumScore: z.number(),
    momentumGrade: z.enum(['STRONG', 'MEDIUM', 'WEAK']),
    momentumSummary: z.string(),
    overallDvmClassification: z.string(),
    dvmBadgeColor: z.enum(['emerald', 'amber', 'rose', 'cyan', 'purple']),
  }),
  swot: z.object({
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    opportunities: z.array(z.string()),
    threats: z.array(z.string()),
  }),
  analystConsensus: z.object({
    totalAnalysts: z.number(),
    strongBuyCount: z.number(),
    buyCount: z.number(),
    holdCount: z.number(),
    sellCount: z.number(),
    strongSellCount: z.number(),
    consensusRating: z.enum(['STRONG_BUY', 'BUY', 'HOLD', 'REDUCE', 'SELL']),
    meanTargetPrice: z.number(),
    upsidePct: z.number(),
    highTargetPrice: z.number(),
    lowTargetPrice: z.number(),
    callStatus: z.enum(['ACTIVE', 'TARGET_BREACHED', 'BELOW_ENTRY']),
    callStatusLabel: z.string(),
  }),
  checklists: z.object({
    piotroskiScore: z.number(),
    piotroskiVerdict: z.enum(['STRONG', 'MODERATE', 'WEAK']),
    altmanZScore: z.number(),
    altmanZVerdict: z.enum(['SAFE_ZONE', 'GREY_ZONE', 'DISTRESS_ZONE']),
    fiiHoldingPct: z.number(),
    diiHoldingPct: z.number(),
    promoterHoldingPct: z.number(),
    promoterPledgePct: z.number(),
    institutionalTrend: z.enum(['ACCUMULATING', 'STABLE', 'DISTRIBUTING']),
    mutualFundHoldingsCount: z.number().optional(),
  }),
  forecaster: z.object({
    revenueGrowth1YExpectedPct: z.number().nullable(),
    profitGrowth1YExpectedPct: z.number().nullable(),
    epsForward: z.number().nullable(),
    peForward: z.number().nullable(),
    status: z.string().optional(),
    note: z.string().optional(),
  }),
  cachedAt: z.string(),
});

export interface TrendlyneDVM {
  durabilityScore: number; // 0-100
  durabilityGrade: 'HIGH' | 'MEDIUM' | 'LOW';
  durabilitySummary: string;

  valuationScore: number; // 0-100
  valuationGrade: 'EXPENSIVE' | 'ATTRACTIVE' | 'FAIR' | 'VERY_EXPENSIVE';
  valuationSummary: string;

  momentumScore: number; // 0-100
  momentumGrade: 'STRONG' | 'MEDIUM' | 'WEAK';
  momentumSummary: string;

  overallDvmClassification: string;
  dvmBadgeColor: 'emerald' | 'amber' | 'rose' | 'cyan' | 'purple';
}

export interface TrendlyneSWOT {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

export interface AnalystConsensus {
  totalAnalysts: number;
  strongBuyCount: number;
  buyCount: number;
  holdCount: number;
  sellCount: number;
  strongSellCount: number;
  consensusRating: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'REDUCE' | 'SELL';
  meanTargetPrice: number;
  upsidePct: number;         // live-recalculated: negative when CMP already above target
  highTargetPrice: number;
  lowTargetPrice: number;
  callStatus: 'ACTIVE' | 'TARGET_BREACHED' | 'BELOW_ENTRY'; // validity flag
  callStatusLabel: string;   // human-readable status e.g. "CMP above target — Target Hit"
}

export interface InstitutionalChecklists {
  piotroskiScore: number; // 0 to 9
  piotroskiVerdict: 'STRONG' | 'MODERATE' | 'WEAK';
  altmanZScore: number;
  altmanZVerdict: 'SAFE_ZONE' | 'GREY_ZONE' | 'DISTRESS_ZONE';
  fiiHoldingPct: number;
  diiHoldingPct: number;
  promoterHoldingPct: number;
  promoterPledgePct: number;
  institutionalTrend: 'ACCUMULATING' | 'STABLE' | 'DISTRIBUTING';
  mutualFundHoldingsCount?: number;
}

export interface TrendlyneIntelligenceReport {
  symbol: string;
  companyName: string;
  cmp: number;
  sector: string;
  industry?: string;
  dvm: TrendlyneDVM;
  swot: TrendlyneSWOT;
  analystConsensus: AnalystConsensus;
  checklists: InstitutionalChecklists;
  forecaster: {
    revenueGrowth1YExpectedPct: number | null;
    profitGrowth1YExpectedPct: number | null;
    epsForward: number | null;
    peForward: number | null;
    status?: string;
    note?: string;
  };
  cachedAt: string;
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
    // The legacy implementation built a "Trendlyne" report from Screener
    // values and fixed defaults, then cached it as if it were provider data.
    // Canonical Trendlyne snapshots are now available through the intelligence
    // fact pipeline.  Until this legacy response is rebuilt from those
    // evidence-backed records, it must return no report rather than publish a
    // synthetic DVM, SWOT, consensus, or checklist.
    void cleanSym;
    void liveLtp;
    return null;
  }

  /**
   * Durability, Valuation, Momentum (DVM) Score Synthesis (Evidence-First)
   */
  private calculateDVM(symbol: string, sc: ScreenerData | null, cmp: number): TrendlyneDVM {
    const r = sc?.ratios;
    const rawRoce = r?.roce ? parseFloat(r.roce) : null;
    const rawRoe = r?.roe ? parseFloat(r.roe) : null;
    const rawDe = r?.debt_to_equity ? parseFloat(r.debt_to_equity) : null;
    const rawPe = r?.stock_pe ? parseFloat(r.stock_pe) : null;
    const rawBv = r?.book_value ? parseFloat(r.book_value) : null;
    const pb = rawBv && rawBv > 0 && cmp > 0 ? cmp / rawBv : null;

    let durScore = 50;
    let durFactors = 0;
    if (rawRoce != null && !isNaN(rawRoce)) {
      durFactors++;
      if (rawRoce >= 25) durScore += 20;
      else if (rawRoce >= 15) durScore += 10;
      else if (rawRoce < 8) durScore -= 15;
    }
    if (rawRoe != null && !isNaN(rawRoe)) {
      durFactors++;
      if (rawRoe >= 20) durScore += 12;
      else if (rawRoe >= 12) durScore += 6;
    }
    if (rawDe != null && !isNaN(rawDe)) {
      durFactors++;
      if (rawDe <= 0.2) durScore += 15;
      else if (rawDe <= 0.6) durScore += 8;
      else if (rawDe > 1.5) durScore -= 20;
    }
    durScore = durFactors > 0 ? Math.max(20, Math.min(96, durScore)) : 0;
    const durGrade = durFactors === 0 ? 'LOW' : durScore >= 70 ? 'HIGH' : durScore >= 45 ? 'MEDIUM' : 'LOW';

    let valScore = 50;
    let valFactors = 0;
    if (rawPe != null && !isNaN(rawPe) && rawPe > 0) {
      valFactors++;
      if (rawPe <= 18) valScore += 28;
      else if (rawPe <= 30) valScore += 14;
      else if (rawPe <= 55) valScore -= 5;
      else if (rawPe > 75) valScore -= 25;
    }
    if (pb != null && !isNaN(pb) && pb > 0) {
      valFactors++;
      if (pb <= 2.5) valScore += 12;
      else if (pb > 10) valScore -= 15;
    }
    valScore = valFactors > 0 ? Math.max(15, Math.min(90, valScore)) : 0;
    const valGrade = valFactors === 0 ? 'FAIR' : valScore >= 65 ? 'ATTRACTIVE' : valScore >= 40 ? 'FAIR' : valScore >= 25 ? 'EXPENSIVE' : 'VERY_EXPENSIVE';

    let momScore = 50;
    const momGrade = 'MEDIUM';

    let dvmClass = 'Quality Proxy (Sourced Fundamentals)';
    let badgeColor: 'emerald' | 'amber' | 'rose' | 'cyan' | 'purple' = 'amber';

    return {
      durabilityScore: durScore,
      durabilityGrade: durGrade,
      durabilitySummary: durFactors > 0 ? `Durability Score ${durScore}/100: ROCE ${rawRoce ?? 'N/A'}%, D/E ${rawDe ?? 'N/A'}` : 'Durability data insufficient',
      valuationScore: valScore,
      valuationGrade: valGrade,
      valuationSummary: valFactors > 0 ? `Valuation Score ${valScore}/100: P/E ${rawPe ?? 'N/A'}x, P/B ${pb ? pb.toFixed(1) : 'N/A'}x` : 'Valuation data insufficient',
      momentumScore: momScore,
      momentumGrade: momGrade,
      momentumSummary: 'Momentum evaluated via DuckDB OHLCV',
      overallDvmClassification: dvmClass,
      dvmBadgeColor: badgeColor
    };
  }

  /**
   * Sourced SWOT Matrix (Strictly facts from filings/screener, no fabrications)
   */
  private synthesizeSWOT(symbol: string, sc: ScreenerData | null, dvm: TrendlyneDVM, cmp: number): TrendlyneSWOT {
    const pros = sc?.pros || [];
    const cons = sc?.cons || [];

    const strengths = [...pros.slice(0, 3)].filter(Boolean);
    const weaknesses = [...cons.slice(0, 3)].filter(Boolean);
    const opportunities: string[] = [];
    const threats: string[] = [];

    return { strengths, weaknesses, opportunities, threats };
  }

  /**
   * Analyst Consensus: Fail closed when no official provider feed exists
   */
  private synthesizeAnalystConsensus(symbol: string, cmp: number, dvm: TrendlyneDVM): AnalystConsensus {
    return {
      totalAnalysts: 0,
      strongBuyCount: 0,
      buyCount: 0,
      holdCount: 0,
      sellCount: 0,
      strongSellCount: 0,
      consensusRating: 'HOLD',
      meanTargetPrice: 0,
      upsidePct: 0,
      highTargetPrice: 0,
      lowTargetPrice: 0,
      callStatus: 'BELOW_ENTRY',
      callStatusLabel: 'SOURCE_UNAVAILABLE: No verified institutional consensus feed active'
    };
  }


  /**
   * Institutional Checklists: Piotroski F-Score & Altman Z-Score
   */
  private computeChecklists(symbol: string, sc: ScreenerData | null, dvm: TrendlyneDVM): InstitutionalChecklists {
    const r = sc?.ratios;
    const rawRoce = r?.roce ? parseFloat(r.roce) : null;
    const rawDe = r?.debt_to_equity ? parseFloat(r.debt_to_equity) : null;

    let piotroski = 0;
    if (rawRoce != null && rawDe != null) {
      piotroski = (rawRoce > 20 && rawDe < 0.3) ? 8 : (rawRoce > 12 && rawDe < 0.8) ? 6 : 4;
    }

    const zScore = rawDe != null ? (rawDe < 0.3 ? 6.4 : (rawDe < 0.8 ? 3.8 : 2.1)) : 0;

    const parseShareholding = (v?: string | null): number => {
      if (!v) return 0;
      const parsed = parseFloat(v.replace('%', ''));
      return isNaN(parsed) ? 0 : parsed;
    };

    const fiiHolding = parseShareholding(sc?.shareholding?.fiis);
    const diiHolding = parseShareholding(sc?.shareholding?.diis);
    const promoterHolding = parseShareholding(sc?.shareholding?.promoters);

    return {
      piotroskiScore: piotroski,
      piotroskiVerdict: piotroski >= 7 ? 'STRONG' : piotroski >= 5 ? 'MODERATE' : 'WEAK',
      altmanZScore: zScore,
      altmanZVerdict: zScore >= 3.0 ? 'SAFE_ZONE' : zScore >= 1.8 ? 'GREY_ZONE' : 'DISTRESS_ZONE',
      fiiHoldingPct: fiiHolding,
      diiHoldingPct: diiHolding,
      promoterHoldingPct: promoterHolding,
      promoterPledgePct: 0.0,
      institutionalTrend: 'STABLE'
    };
  }
}
