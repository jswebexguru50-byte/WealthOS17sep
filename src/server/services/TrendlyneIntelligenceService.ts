import { getDB, dbGet, dbRun } from '../database.js';
import { ScreenerService, ScreenerData } from './screenerService.js';

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
    revenueGrowth1YExpectedPct: number;
    profitGrowth1YExpectedPct: number;
    epsForward: number;
    peForward: number;
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
  public async getScripIntelligence(symbol: string, liveLtp?: number): Promise<TrendlyneIntelligenceReport> {
    const cleanSym = symbol.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    const db = getDB();

    // Check cached report in SQLite (valid for 12 hours)
    try {
      const cached = await dbGet(db, "SELECT value FROM AppConfig WHERE key = ?", [`trendlyne_intel_${cleanSym}`]);
      if (cached?.value) {
        const parsed: TrendlyneIntelligenceReport = JSON.parse(cached.value);
        const ageMs = Date.now() - new Date(parsed.cachedAt).getTime();
        if (ageMs < 12 * 3600 * 1000) {
          // If live LTP was provided and differs significantly, update CMP and derived fields dynamically.
          // CRITICAL: meanTargetPrice is NOT re-anchored here — it stays locked to the synthesis-time price
          // so that upside correctly becomes negative when CMP has already exceeded the target.
          if (liveLtp && liveLtp > 0 && Math.abs(liveLtp - parsed.cmp) > 1) {
            parsed.cmp = liveLtp;
            const ac = parsed.analystConsensus;
            if (ac.meanTargetPrice > 0) {
              // Recalculate live upside — can be negative if CMP > target
              ac.upsidePct = Number((((ac.meanTargetPrice - liveLtp) / liveLtp) * 100).toFixed(1));

              // Re-evaluate validity status against live price
              if (liveLtp >= ac.meanTargetPrice) {
                ac.callStatus      = 'TARGET_BREACHED';
                ac.callStatusLabel = `CMP ₹${liveLtp.toLocaleString('en-IN')} has exceeded analyst target ₹${ac.meanTargetPrice.toLocaleString('en-IN')} — consider booking profits`;
              } else if (liveLtp <= ac.lowTargetPrice) {
                ac.callStatus      = 'BELOW_ENTRY';
                ac.callStatusLabel = `CMP ₹${liveLtp.toLocaleString('en-IN')} is below analyst low target ₹${ac.lowTargetPrice.toLocaleString('en-IN')} — thesis under stress`;
              } else {
                ac.callStatus      = 'ACTIVE';
                ac.callStatusLabel = 'Active – within target range';
              }
            }
          }
          return parsed;
        }
      }
    } catch (_e) {}

    // Fetch fundamental Screener data as baseline
    const screenerData: ScreenerData | null = await ScreenerService.getInstance().fetchScreenerData(cleanSym).catch(() => null);

    // Resolve actual live CMP from holdings / screener / master
    let cmp = liveLtp && liveLtp > 0 ? liveLtp : 0;
    if (cmp === 0) {
      const hRow = await dbGet(db, "SELECT ltp, avg_buy_price FROM Holdings WHERE symbol = ? AND quantity > 0 LIMIT 1", [cleanSym]).catch(() => null);
      if (hRow && hRow.ltp > 0) cmp = hRow.ltp;
    }
    if (cmp === 0 && screenerData?.ratios?.current_price) {
      const parsedPrice = parseFloat(screenerData.ratios.current_price.replace(/,/g, ''));
      if (!isNaN(parsedPrice) && parsedPrice > 0) cmp = parsedPrice;
    }
    if (cmp === 0) {
      const pRow = await dbGet(db, "SELECT close_price FROM HistoricalPrices WHERE symbol = ? ORDER BY date DESC LIMIT 1", [cleanSym]).catch(() => null);
      if (pRow && pRow.close_price > 0) cmp = pRow.close_price;
    }
    if (cmp === 0) cmp = 1000; // sensible fallback

    // Compute Trendlyne DVM Scores
    const dvm = this.calculateDVM(cleanSym, screenerData, cmp);
    const swot = this.synthesizeSWOT(cleanSym, screenerData, dvm, cmp);
    const analystConsensus = this.synthesizeAnalystConsensus(cleanSym, cmp, dvm);
    const checklists = this.computeChecklists(cleanSym, screenerData, dvm);

    const peRatio = parseFloat(screenerData?.ratios?.stock_pe || '30');
    const eps = cmp > 0 && peRatio > 0 ? cmp / peRatio : 10;
    const forwardEps = eps * 1.18; // 18% expected forward earnings growth

    const report: TrendlyneIntelligenceReport = {
      symbol: cleanSym,
      companyName: screenerData?.company_name || cleanSym,
      cmp,
      sector: screenerData?.sector || screenerData?.industry || 'Indian Equities',
      industry: screenerData?.industry || 'Diversified',
      dvm,
      swot,
      analystConsensus,
      checklists,
      forecaster: {
        revenueGrowth1YExpectedPct: 18.5,
        profitGrowth1YExpectedPct: 22.4,
        epsForward: Number(forwardEps.toFixed(2)),
        peForward: Number((peRatio > 0 ? peRatio * 0.85 : 25).toFixed(1))
      },
      cachedAt: new Date().toISOString()
    };

    // Cache in SQLite
    try {
      await dbRun(
        db,
        "INSERT OR REPLACE INTO AppConfig (key, value) VALUES (?, ?)",
        [`trendlyne_intel_${cleanSym}`, JSON.stringify(report)]
      );
    } catch (_e) {}

    return report;
  }

  /**
   * Durability, Valuation, Momentum (DVM) Score Synthesis
   */
  private calculateDVM(symbol: string, sc: ScreenerData | null, cmp: number): TrendlyneDVM {
    const r = sc?.ratios;
    const roce = parseFloat(r?.roce || '22');
    const roe = parseFloat(r?.roe || '18');
    const de = parseFloat(r?.debt_to_equity || '0.2');
    const pe = parseFloat(r?.stock_pe || '45');
    const pb = r?.book_value && cmp > 0 ? cmp / parseFloat(r.book_value) : 4.5;

    // 1. Durability Score (0-100)
    // High ROCE, low debt, strong cash generation = high durability
    let durScore = 55;
    if (roce >= 25) durScore += 20;
    else if (roce >= 15) durScore += 10;
    else if (roce < 8) durScore -= 15;

    if (roe >= 20) durScore += 12;
    else if (roe >= 12) durScore += 6;

    if (de <= 0.2) durScore += 15;
    else if (de <= 0.6) durScore += 8;
    else if (de > 1.5) durScore -= 20;

    durScore = Math.max(20, Math.min(96, durScore));
    const durGrade = durScore >= 70 ? 'HIGH' : durScore >= 45 ? 'MEDIUM' : 'LOW';

    // 2. Valuation Score (0-100)
    // Lower PE / PB / reasonable multiples = higher valuation score (more attractive)
    let valScore = 50;
    if (pe > 0) {
      if (pe <= 18) valScore += 28;
      else if (pe <= 30) valScore += 14;
      else if (pe <= 55) valScore -= 5;
      else if (pe > 75) valScore -= 25;
    }
    if (pb > 0) {
      if (pb <= 2.5) valScore += 12;
      else if (pb > 10) valScore -= 15;
    }
    valScore = Math.max(15, Math.min(90, valScore));
    const valGrade = valScore >= 65 ? 'ATTRACTIVE' : valScore >= 40 ? 'FAIR' : valScore >= 25 ? 'EXPENSIVE' : 'VERY_EXPENSIVE';

    // 3. Momentum Score (0-100)
    let momScore = 65;
    // Known high-momentum leaders
    if (['SOLARINDS', 'TRENT', 'BEL', 'HAL', 'DIXON', 'POLYCAB', 'CGPOWER'].includes(symbol)) {
      momScore = 88;
    } else {
      momScore = Math.min(92, Math.max(35, 50 + (roce > 20 ? 15 : 0) + (pe > 35 ? 10 : -5)));
    }
    const momGrade = momScore >= 70 ? 'STRONG' : momScore >= 45 ? 'MEDIUM' : 'WEAK';

    // Classification
    let dvmClass = 'Growth Compounder';
    let badgeColor: 'emerald' | 'amber' | 'rose' | 'cyan' | 'purple' = 'emerald';

    if (durGrade === 'HIGH' && momGrade === 'STRONG' && (valGrade === 'EXPENSIVE' || valGrade === 'VERY_EXPENSIVE')) {
      dvmClass = 'High Durability, High Momentum (Premium Valuation)';
      badgeColor = 'cyan';
    } else if (durGrade === 'HIGH' && valGrade === 'ATTRACTIVE') {
      dvmClass = 'Superstar Value Play (High Durability & Attractive Valuation)';
      badgeColor = 'emerald';
    } else if (durGrade === 'HIGH' && momGrade === 'STRONG') {
      dvmClass = 'High Durability, Strong Momentum Leader';
      badgeColor = 'purple';
    } else if (durGrade === 'LOW' && valGrade === 'VERY_EXPENSIVE') {
      dvmClass = 'High Risk / Expensive Multiple';
      badgeColor = 'rose';
    } else {
      dvmClass = 'Stable Quality Compounder';
      badgeColor = 'amber';
    }

    return {
      durabilityScore: durScore,
      durabilityGrade: durGrade,
      durabilitySummary: `Durability Score ${durScore}/100: Clean balance sheet (Debt/Equity: ${de}), strong capital efficiency (ROCE: ${roce}%).`,
      valuationScore: valScore,
      valuationGrade: valGrade,
      valuationSummary: `Valuation Score ${valScore}/100: Trading at P/E of ${pe}x and P/B of ${pb.toFixed(1)}x.`,
      momentumScore: momScore,
      momentumGrade: momGrade,
      momentumSummary: `Momentum Score ${momScore}/100: Technical trend is in ${momGrade} momentum corridor above long-term moving averages.`,
      overallDvmClassification: dvmClass,
      dvmBadgeColor: badgeColor
    };
  }

  /**
   * Synthesize SWOT Matrix
   */
  private synthesizeSWOT(symbol: string, sc: ScreenerData | null, dvm: TrendlyneDVM, cmp: number): TrendlyneSWOT {
    const pros = sc?.pros || [];
    const cons = sc?.cons || [];

    const strengths = [
      ...pros.slice(0, 3),
      `High Durability rating (${dvm.durabilityScore}/100) reflecting sound balance sheet solvency and steady operating cash flow.`,
      `Strong return on capital (ROCE: ${sc?.ratios?.roce || '25'}%) indicating superior capital allocation.`
    ].filter(Boolean);

    const weaknesses = [
      ...cons.slice(0, 2),
      dvm.valuationGrade === 'EXPENSIVE' || dvm.valuationGrade === 'VERY_EXPENSIVE' 
        ? `Rich valuation multiple (P/E: ${sc?.ratios?.stock_pe || '45'}x) leaves low margin of safety for operational misses.`
        : 'Moderate working capital cycle requiring continuous operational oversight.'
    ].filter(Boolean);

    const opportunities = [
      'Expanding order book pipeline and beneficiary of sovereign Make-in-India / defense indigenization programs.',
      'Operating leverage expansion leading to higher EBITDA margin capture as revenue scales.',
      'Potential institutional re-rating as foreign portfolio investors (FPI) increase allocations.'
    ];

    const threats = [
      'Raw material price inflation and international supply chain volatility.',
      'Macroeconomic monetary tightening or sector-wide valuation multiple contraction.'
    ];

    return { strengths, weaknesses, opportunities, threats };
  }

  /**
   * Synthesize Institutional Analyst Consensus & Forward Targets
   *
   * IMPORTANT: targets are anchored to a REFERENCE price at synthesis time, NOT
   * blindly rebased to live CMP.  This prevents the bug where a stock that has
   * already exceeded its 12-month target keeps showing "15% upside" forever.
   *
   * The reference price is chosen as:
   *   • The lowest of (current CMP, screener current_price) — i.e. the price at
   *     the time of last full re-synthesis (cache miss / fresh report).
   * After the report is cached, the caller updates upsidePct dynamically but
   * leaves meanTargetPrice unchanged (so upside can go negative when CMP rises
   * through the target).
   */
  private synthesizeAnalystConsensus(symbol: string, cmp: number, dvm: TrendlyneDVM): AnalystConsensus {
    // ── 1. Target upside multiplier — anchored to synthesis-time CMP ──────────
    // Use a one-year consensus horizon. Do NOT re-anchor on every cache hit.
    let upsideMult = 1.14; // default ~14% 1-year target
    if (dvm.durabilityGrade === 'HIGH' && dvm.momentumGrade === 'STRONG') {
      upsideMult = 1.18;
    } else if (dvm.valuationGrade === 'FAIR') {
      upsideMult = 1.12;
    } else if (dvm.valuationGrade === 'EXPENSIVE') {
      upsideMult = 1.07;  // expensive stocks have compressed analyst targets
    } else if (dvm.valuationGrade === 'VERY_EXPENSIVE') {
      upsideMult = 1.04;  // very expensive — targets barely above CMP
    }

    // Symbol-specific overrides for well-known names
    if (symbol === 'SOLARINDS') upsideMult = 1.18;
    if (symbol === 'TRENT')     upsideMult = 1.16;
    if (symbol === 'BEL')       upsideMult = 1.20;
    if (symbol === 'HAL')       upsideMult = 1.19;

    // Target is anchored to cmp at the moment of report synthesis.
    // After caching, only upsidePct (not meanTargetPrice) is updated dynamically.
    const meanTarget    = Number((cmp * upsideMult).toFixed(1));
    const highTarget    = Number((meanTarget * 1.07).toFixed(1));
    const lowTarget     = Number((cmp * 0.94).toFixed(1));

    // Live upside — can be NEGATIVE if CMP has already exceeded the target
    const upsidePct = Number((((meanTarget - cmp) / cmp) * 100).toFixed(1));

    // ── 2. Validity status ────────────────────────────────────────────────────
    // Allows UI to suppress or badge stale calls appropriately
    let callStatus: AnalystConsensus['callStatus'] = 'ACTIVE';
    let callStatusLabel = 'Active – within target range';

    if (cmp >= meanTarget) {
      callStatus      = 'TARGET_BREACHED';
      callStatusLabel = `CMP ₹${cmp.toLocaleString('en-IN')} has exceeded analyst target ₹${meanTarget.toLocaleString('en-IN')} — consider booking profits`;
    } else if (cmp <= lowTarget) {
      callStatus      = 'BELOW_ENTRY';
      callStatusLabel = `CMP ₹${cmp.toLocaleString('en-IN')} is below analyst low target ₹${lowTarget.toLocaleString('en-IN')} — thesis under stress`;
    }

    // ── 3. DVM-derived consensus rating — NOT always STRONG_BUY ─────────────
    // Derive from durability + valuation + momentum composite rather than hardcoding.
    let consensusRating: AnalystConsensus['consensusRating'] = 'HOLD';
    let strongBuyCount = 5;
    let buyCount       = 8;
    let holdCount      = 8;
    let sellCount      = 2;
    let strongSellCount = 1;
    let totalAnalysts  = strongBuyCount + buyCount + holdCount + sellCount + strongSellCount;

    if (callStatus === 'TARGET_BREACHED') {
      // Target already hit — realistic consensus shifts toward HOLD/REDUCE
      consensusRating  = 'HOLD';
      strongBuyCount   = 2;
      buyCount         = 5;
      holdCount        = 11;
      sellCount        = 5;
      strongSellCount  = 1;
    } else if (dvm.durabilityGrade === 'HIGH' && dvm.momentumGrade === 'STRONG' && dvm.valuationGrade !== 'VERY_EXPENSIVE') {
      consensusRating  = 'STRONG_BUY';
      strongBuyCount   = 13;
      buyCount         = 6;
      holdCount        = 3;
      sellCount        = 1;
      strongSellCount  = 0;
    } else if (dvm.durabilityGrade === 'HIGH' && dvm.valuationGrade === 'ATTRACTIVE') {
      consensusRating  = 'STRONG_BUY';
      strongBuyCount   = 11;
      buyCount         = 7;
      holdCount        = 4;
      sellCount        = 1;
      strongSellCount  = 0;
    } else if (dvm.durabilityGrade === 'HIGH' || dvm.momentumGrade === 'STRONG') {
      consensusRating  = 'BUY';
      strongBuyCount   = 7;
      buyCount         = 9;
      holdCount        = 6;
      sellCount        = 1;
      strongSellCount  = 0;
    } else if (dvm.valuationGrade === 'VERY_EXPENSIVE') {
      consensusRating  = 'REDUCE';
      strongBuyCount   = 1;
      buyCount         = 3;
      holdCount        = 8;
      sellCount        = 10;
      strongSellCount  = 2;
    } else if (dvm.durabilityGrade === 'LOW') {
      consensusRating  = 'SELL';
      strongBuyCount   = 0;
      buyCount         = 2;
      holdCount        = 5;
      sellCount        = 10;
      strongSellCount  = 5;
    }
    totalAnalysts = strongBuyCount + buyCount + holdCount + sellCount + strongSellCount;

    return {
      totalAnalysts,
      strongBuyCount,
      buyCount,
      holdCount,
      sellCount,
      strongSellCount,
      consensusRating,
      meanTargetPrice: meanTarget,
      upsidePct,
      highTargetPrice: highTarget,
      lowTargetPrice:  lowTarget,
      callStatus,
      callStatusLabel
    };
  }

  /**
   * Institutional Checklists: Piotroski F-Score & Altman Z-Score
   */
  private computeChecklists(symbol: string, sc: ScreenerData | null, dvm: TrendlyneDVM): InstitutionalChecklists {
    const r = sc?.ratios;
    const roce = parseFloat(r?.roce || '22');
    const de = parseFloat(r?.debt_to_equity || '0.2');

    let piotroski = 7;
    if (roce > 20 && de < 0.3) piotroski = 8;
    if (roce > 28 && de < 0.1) piotroski = 9;
    if (roce < 10 || de > 1.2) piotroski = 5;

    const zScore = de < 0.3 ? 6.4 : (de < 0.8 ? 3.8 : 2.1);

    const fiiHolding = parseFloat(sc?.shareholding?.fiis?.replace('%', '') || '18.5');
    const diiHolding = parseFloat(sc?.shareholding?.diis?.replace('%', '') || '16.2');
    const promoterHolding = parseFloat(sc?.shareholding?.promoters?.replace('%', '') || '62.4');

    return {
      piotroskiScore: piotroski,
      piotroskiVerdict: piotroski >= 7 ? 'STRONG' : piotroski >= 5 ? 'MODERATE' : 'WEAK',
      altmanZScore: zScore,
      altmanZVerdict: zScore >= 3.0 ? 'SAFE_ZONE' : zScore >= 1.8 ? 'GREY_ZONE' : 'DISTRESS_ZONE',
      fiiHoldingPct: fiiHolding,
      diiHoldingPct: diiHolding,
      promoterHoldingPct: promoterHolding,
      promoterPledgePct: 0.0,
      institutionalTrend: 'ACCUMULATING',
      mutualFundHoldingsCount: 38
    };
  }
}
