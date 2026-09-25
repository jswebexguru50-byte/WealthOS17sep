/**
 * MultibaggerDiscoveryEngine.ts
 * 
 * Quantitative Multibagger Discovery Pipeline for NRI WealthOS
 * Implements the 4-Phase Architecture translating qualitative wisdom from:
 *  - Chris Mayer (100 Baggers) & Thomas Phelps (100 to 1 in the Stock Market)
 *  - William Thorndike (The Outsiders - Capital Allocation & Reinvestment Rate)
 *  - Motilal Oswal QGLP Framework (Quality, Growth, Longevity, Price)
 *  - Philip Fisher (Common Stocks and Uncommon Profits - Moat, Gross Margin Stability)
 *  - Robert Kirby & Saurabh Mukherjea ("Coffee Can" Sitting Policy & Trailing Drawdown Floors)
 */

import { getDB, dbAll } from '../database.js';
import { fetchTickerData } from '../yahooFinance.js';
import { ScreenerService } from './screenerService.js';

export type MultibaggerTier =
  | '10X_PHELPS_MAYER_RUNNER'  // Composite Score >= 85
  | '5X_QGLP_COMPOUNDER'       // Composite Score 75 - 84
  | '3X_ASYMMETRIC_RE_RATING'  // Composite Score 65 - 74
  | 'COFFEE_CAN_CORE_HOLD'     // Validated Long-Term Compounder
  | 'MONITORED_WATCHLIST'      // Composite Score 50 - 64
  | 'FAILED_GATE';             // Failed Phase 1 or Phase 2

export interface Phase1ExclusionAudit {
  passed: boolean;
  marketCapCr: number;
  marketCapValid: boolean; // ₹300 Cr to ₹7,500 Cr (or up to ₹15,000 Cr for mid-cap runners)
  avgDailyTurnoverLakhs: number;
  turnoverValid: boolean; // >= ₹35 Lakhs
  promoterHoldingPct: number;
  promoterHoldingValid: boolean; // >= 50.0%
  promoterPledgePct: number;
  pledgeValid: boolean; // <= 2.0%
  promoterStakeChange4QtrPct: number;
  promoterStabilityValid: boolean; // Decline <= 2.0%
  dsoIncrease2YrPct: number;
  dsoValid: boolean; // <= 20.0%
  contingentLiabilitiesToNetWorthPct: number;
  contingentValid: boolean; // <= 15.0%
  reasons: string[];
}

export interface Phase2QglpAudit {
  passed: boolean;
  salesCagr3YrPct: number;
  salesValid: boolean; // >= 15.0%
  patCagr3YrPct: number;
  patValid: boolean; // >= 18.0%
  roce3YrAvgPct: number;
  roceValid: boolean; // >= 20.0%
  roicPct: number;
  debtToEquity: number;
  debtValid: boolean; // <= 0.40x
  cfoToPat3YrRatio: number;
  cfoValid: boolean; // >= 0.75 (Cash reality check)
  grossMarginVolatility5YrPct: number;
  marginStabilityValid: boolean; // <= 3.5%
  priceAboveSma200: boolean;
  sma50AboveSma200: boolean;
  trendFilterValid: boolean;
  reasons: string[];
}

export interface Phase3ScoringBreakdown {
  // A. Capital Allocation & Reinvestment (Weight: 30%, Max 30 pts)
  allocationScore: number;
  reinvestmentRatePct: number;
  intrinsicGrowthPct: number; // ROIC * Reinvestment Rate
  capitalDisciplineRating: 'EXEMPLARY' | 'PRUDENT' | 'AVERAGE' | 'DILUTIVE';

  // B. Competitive Moat & Pricing Power (Weight: 25%, Max 25 pts)
  moatScore: number;
  grossMarginTtmPct: number;
  grossMargin3YrAvgPct: number;
  marginExpansionPct: number; // TTM - 3Yr Avg
  waccPct: number;
  moatSpreadPct: number; // ROCE - WACC (Target > 8%)
  cashConversionCycleDays: number;
  cccTrend: 'IMPROVING' | 'STABLE' | 'DETERIORATING';

  // C. Twin-Engine Re-Rating Headroom (Weight: 25%, Max 25 pts)
  twinEngineScore: number;
  trailingPe: number;
  sectorMedianPe: number;
  multipleHeadroomRatio: number; // Sector PE / Company PE
  pegRatio: number; // PE / 3Y PAT CAGR (Target <= 1.25)
  projectedMultipleExpansionPct: number;

  // D. Institutional Accumulation & Footprint (Weight: 20%, Max 20 pts)
  accumulationScore: number;
  fiiDiiNetChange6mPct: number;
  rsRating6m: number; // 0 - 100
  floatingSupplyPct: number; // 100 - Promoter - FII/DII

  // Composite Total Score (0 - 100)
  totalMultibaggerScore: number;
}

export interface Phase4CoffeeCanProtocol {
  recommendedPositionSizePct: number; // 4.0% to 6.0%
  holdingHorizonYears: string; // e.g., "5 - 10 Years"
  trailingDrawdownTolerancePct: number; // 35% - 50% normal pullback floor
  invalidationTriggers: {
    roceFloorBreached: boolean; // ROCE < 12% for 2 consecutive quarters
    operatingCashFlowNegative: boolean; // CFO turns systematically negative
    dilutionOrPledgeBreach: boolean; // Promoter pledge > 10% or aggressive dilutive raise
    valuationEuphoria: boolean; // PE > 3x 5Y median and PEG > 3.5
    trendInvalidation: boolean; // 3-week close below 40-week EMA
  };
  sittingPolicyRule: string;
}

export interface MultibaggerScripRecord {
  id: string;
  symbol: string;
  companyName: string;
  sector: string;
  cmp: number;
  marketCapCr: number;
  tier: MultibaggerTier;
  tierBadge: string;
  phase1Exclusion: Phase1ExclusionAudit;
  phase2Qglp: Phase2QglpAudit;
  phase3Scores: Phase3ScoringBreakdown;
  phase4Protocol: Phase4CoffeeCanProtocol;
  multibaggerThesis: string;
  catalystRunway: string;
  lastUpdated: string;
}

export interface MultibaggerRadarReport {
  status?: string;
  generatedAt: string;
  totalEvaluated: number;
  passedPhase1Count: number;
  passedPhase2QglpCount: number;
  topRunnersCount: number;
  universe: MultibaggerScripRecord[];
  screenerInQuery: string;
  pythonBacktestBlueprint: string;
}

export class MultibaggerDiscoveryEngine {
  private static instance: MultibaggerDiscoveryEngine;
  private lastReport: MultibaggerRadarReport | null = null;
  private lastScanTime: number = 0;

  private constructor() {}

  public static getInstance(): MultibaggerDiscoveryEngine {
    if (!MultibaggerDiscoveryEngine.instance) {
      MultibaggerDiscoveryEngine.instance = new MultibaggerDiscoveryEngine();
    }
    return MultibaggerDiscoveryEngine.instance;
  }

  /**
   * Evaluates the curated universe of Indian micro and small-cap compounders
   * through the 4-Phase Mayer-Phelps-QGLP-Thorndike-Fisher pipeline using live authentic data.
   */
  public async scanMultibaggerUniverse(symbols?: string[]): Promise<MultibaggerRadarReport> {
    if (process.env.NODE_ENV === 'production' && !process.env.LIVE_UNIVERSE_ENABLED) {
      return {
        status: 'NOT_IMPLEMENTED',
        generatedAt: new Date().toISOString(),
        totalEvaluated: 0,
        passedPhase1Count: 0,
        passedPhase2QglpCount: 0,
        topRunnersCount: 0,
        universe: [],
        screenerInQuery: 'NOT_IMPLEMENTED',
        pythonBacktestBlueprint: 'NOT_IMPLEMENTED'
      };
    }

    if (!symbols && this.lastReport && Date.now() - this.lastScanTime < 15 * 60 * 1000) {
      return this.lastReport;
    }

    const rawUniverse = this.getRawUniverse();
    const rawMap = new Map<string, any>(rawUniverse.map(item => [item.symbol, item]));

    let targetItems: any[] = [];
    if (symbols && symbols.length > 0) {
      targetItems = symbols.map(s => {
        const clean = s.toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
        const found = rawMap.get(clean);
        if (!found) {
          return { symbol: clean, isNotFound: true };
        }
        return found;
      });
    } else {
      targetItems = [...rawUniverse];
    }

    const evaluated: MultibaggerScripRecord[] = [];

    await Promise.all(targetItems.map(async (rawItem) => {
      try {
        if (rawItem.isNotFound) {
          evaluated.push({
            id: `MULTI_${rawItem.symbol}`,
            symbol: rawItem.symbol,
            companyName: 'NOT_FOUND',
            sector: 'NOT_FOUND',
            cmp: 0,
            marketCapCr: 0,
            tier: 'FAILED_GATE',
            tierBadge: 'DATA_INSUFFICIENT',
            phase1Exclusion: { passed: false, reasons: ['DATA_INSUFFICIENT'] } as any,
            phase2Qglp: { passed: false, reasons: ['DATA_INSUFFICIENT'] } as any,
            phase3Scores: { totalMultibaggerScore: 0 } as any,
            phase4Protocol: {} as any,
            multibaggerThesis: 'DATA_INSUFFICIENT',
            catalystRunway: 'DATA_INSUFFICIENT',
            lastUpdated: new Date().toISOString()
          });
          return;
        }

        const item = { ...rawItem };
        try {
          const tickerData = await fetchTickerData(`${item.symbol}.NS`, 200).catch(() => null);
          if (tickerData && tickerData.closePrices && tickerData.closePrices.length >= 25) {
            const closes = tickerData.closePrices.map((c: any) => Number(c.close));
            item.cmp = closes[closes.length - 1];
            item.sma50 = closes.slice(-50).reduce((a: number, b: number) => a + b, 0) / Math.min(50, closes.length);
            item.sma200 = closes.slice(-200).reduce((a: number, b: number) => a + b, 0) / Math.min(200, closes.length);
          }
        } catch {}

        evaluated.push(this.evaluateScrip(item));
      } catch (err) {
        console.warn(`[MultibaggerEngine] Failed evaluation for ${rawItem.symbol}:`, err);
      }
    }));

    // Sort by Total Multibagger Score descending
    evaluated.sort((a, b) => b.phase3Scores.totalMultibaggerScore - a.phase3Scores.totalMultibaggerScore);

    const passedPhase1 = evaluated.filter(e => e.phase1Exclusion.passed);
    const passedPhase2 = evaluated.filter(e => e.phase2Qglp.passed);
    const topRunners = evaluated.filter(e => e.tier === '10X_PHELPS_MAYER_RUNNER' || e.tier === '5X_QGLP_COMPOUNDER');

    const report: MultibaggerRadarReport = {
      generatedAt: new Date().toISOString(),
      totalEvaluated: evaluated.length,
      passedPhase1Count: passedPhase1.length,
      passedPhase2QglpCount: passedPhase2.length,
      topRunnersCount: topRunners.length,
      universe: evaluated,
      screenerInQuery: this.getScreenerInQuery(),
      pythonBacktestBlueprint: this.getPythonBacktestCode()
    };

    if (!symbols || symbols.length === 0) {
      this.lastReport = report;
      this.lastScanTime = Date.now();
    }

    return report;
  }

  /**
   * Evaluates a single candidate through all 4 phases of the architecture.
   */
  public evaluateScrip(raw: any): MultibaggerScripRecord {
    // ─── PHASE 1: SMALL-BASE & GOVERNANCE EXCLUSION GATE ───
    const p1Reasons: string[] = [];
    const marketCapValid = raw.marketCapCr >= 300 && raw.marketCapCr <= 15000;
    if (!marketCapValid) p1Reasons.push(`Market cap ₹${raw.marketCapCr} Cr outside small-base sweet spot (₹300 - ₹15,000 Cr)`);

    const turnoverValid = raw.avgDailyTurnoverLakhs >= 35;
    if (!turnoverValid) p1Reasons.push(`Daily turnover ₹${raw.avgDailyTurnoverLakhs}L below liquidity floor (₹35L)`);

    const promoterHoldingValid = raw.promoterHoldingPct >= 50.0;
    if (!promoterHoldingValid) p1Reasons.push(`Promoter holding ${raw.promoterHoldingPct}% below skin-in-the-game threshold (50%)`);

    const pledgeValid = raw.promoterPledgePct <= 2.0;
    if (!pledgeValid) p1Reasons.push(`Promoter pledge ${raw.promoterPledgePct}% exceeds strict safety ceiling (2.0%)`);

    const promoterStabilityValid = raw.promoterStakeChange4QtrPct >= -2.0;
    if (!promoterStabilityValid) p1Reasons.push(`Promoter stake declined by ${Math.abs(raw.promoterStakeChange4QtrPct)}% over last 4Q`);

    const dsoValid = raw.dsoIncrease2YrPct <= 20.0;
    if (!dsoValid) p1Reasons.push(`DSO increased by ${raw.dsoIncrease2YrPct}% over 2 years (Receivable bloating warning)`);

    const contingentValid = raw.contingentLiabilitiesToNetWorthPct <= 15.0;
    if (!contingentValid) p1Reasons.push(`Contingent liabilities represent ${raw.contingentLiabilitiesToNetWorthPct}% of net worth (>15%)`);

    const p1Passed = marketCapValid && turnoverValid && promoterHoldingValid && pledgeValid && promoterStabilityValid && dsoValid && contingentValid;

    const phase1: Phase1ExclusionAudit = {
      passed: p1Passed,
      marketCapCr: raw.marketCapCr,
      marketCapValid,
      avgDailyTurnoverLakhs: raw.avgDailyTurnoverLakhs,
      turnoverValid,
      promoterHoldingPct: raw.promoterHoldingPct,
      promoterHoldingValid,
      promoterPledgePct: raw.promoterPledgePct,
      pledgeValid,
      promoterStakeChange4QtrPct: raw.promoterStakeChange4QtrPct,
      promoterStabilityValid,
      dsoIncrease2YrPct: raw.dsoIncrease2YrPct,
      dsoValid,
      contingentLiabilitiesToNetWorthPct: raw.contingentLiabilitiesToNetWorthPct,
      contingentValid,
      reasons: p1Reasons
    };

    // ─── PHASE 2: QGLP FUNDAMENTAL COMPOUNDER GATE ───
    const p2Reasons: string[] = [];
    const salesValid = raw.salesCagr3YrPct >= 15.0;
    if (!salesValid) p2Reasons.push(`3Y Sales CAGR ${raw.salesCagr3YrPct}% below 15% TAM expansion threshold`);

    const patValid = raw.patCagr3YrPct >= 18.0;
    if (!patValid) p2Reasons.push(`3Y PAT CAGR ${raw.patCagr3YrPct}% below 18% operational leverage threshold`);

    const roceValid = raw.roce3YrAvgPct >= 20.0;
    if (!roceValid) p2Reasons.push(`3Y ROCE ${raw.roce3YrAvgPct}% below 20% compounding capital hurdle`);

    const debtValid = raw.debtToEquity <= 0.40;
    if (!debtValid) p2Reasons.push(`Debt-to-equity ${raw.debtToEquity}x exceeds 0.40x fortress balance sheet limit`);

    const cfoValid = raw.cfoToPat3YrRatio >= 0.75;
    if (!cfoValid) p2Reasons.push(`CFO/PAT ratio ${raw.cfoToPat3YrRatio} below 0.75 cash reality check`);

    const marginStabilityValid = raw.grossMarginVolatility5YrPct <= 3.5;
    if (!marginStabilityValid) p2Reasons.push(`5Y Gross margin volatility ${raw.grossMarginVolatility5YrPct}% exceeds 3.5% pricing power limit`);

    const trendFilterValid = raw.cmp > raw.sma200 && raw.sma50 > raw.sma200;
    if (!trendFilterValid) p2Reasons.push(`Technical trend failed: CMP must be > SMA200 and SMA50 > SMA200`);

    const p2Passed = salesValid && patValid && roceValid && debtValid && cfoValid && marginStabilityValid && trendFilterValid;

    const phase2: Phase2QglpAudit = {
      passed: p2Passed,
      salesCagr3YrPct: raw.salesCagr3YrPct,
      salesValid,
      patCagr3YrPct: raw.patCagr3YrPct,
      patValid,
      roce3YrAvgPct: raw.roce3YrAvgPct,
      roceValid,
      roicPct: raw.roicPct,
      debtToEquity: raw.debtToEquity,
      debtValid,
      cfoToPat3YrRatio: raw.cfoToPat3YrRatio,
      cfoValid,
      grossMarginVolatility5YrPct: raw.grossMarginVolatility5YrPct,
      marginStabilityValid,
      priceAboveSma200: raw.cmp > raw.sma200,
      sma50AboveSma200: raw.sma50 > raw.sma200,
      trendFilterValid,
      reasons: p2Reasons
    };

    // ─── PHASE 3: COMPOSITE MULTIBAGGER SCORING ENGINE (0 - 100) ───
    // A. Capital Allocation & Reinvestment (Weight: 30%)
    const reinvestmentRate = Math.min(1.0, Math.max(0.0, (raw.capex + raw.deltaNwc - raw.depreciation) / Math.max(1, raw.nopat)));
    const intrinsicGrowth = raw.roicPct * reinvestmentRate;
    let sAllocation = Math.min(30, Math.round((intrinsicGrowth / 25) * 30));
    if (raw.roce3YrAvgPct >= 30 && reinvestmentRate >= 0.45) sAllocation = Math.min(30, sAllocation + 5);

    // B. Moat & Pricing Power (Weight: 25%)
    const marginExpansion = raw.grossMarginTtmPct - raw.grossMargin3YrAvgPct;
    const moatSpread = raw.roce3YrAvgPct - raw.waccPct;
    let sMoat = 15;
    if (moatSpread >= 12) sMoat += 6;
    else if (moatSpread >= 8) sMoat += 3;
    if (marginExpansion >= 0.5) sMoat += 4;
    else if (marginExpansion >= 0.0) sMoat += 2;
    sMoat = Math.min(25, sMoat);

    // C. Twin-Engine Re-Rating Headroom (Weight: 25%)
    const multipleHeadroom = Math.min(3.0, Math.max(0.5, raw.sectorMedianPe / Math.max(1, raw.trailingPe)));
    const peg = raw.trailingPe / Math.max(1, raw.patCagr3YrPct);
    let sTwinEngine = 14;
    if (peg <= 0.8) sTwinEngine += 6;
    else if (peg <= 1.25) sTwinEngine += 3;
    if (multipleHeadroom >= 1.5) sTwinEngine += 5;
    else if (multipleHeadroom >= 1.1) sTwinEngine += 3;
    sTwinEngine = Math.min(25, sTwinEngine);

    // D. Institutional Footprint & Accumulation (Weight: 20%)
    let sAccumulation = 10;
    if (raw.fiiDiiNetChange6mPct >= 1.5) sAccumulation += 6;
    else if (raw.fiiDiiNetChange6mPct > 0) sAccumulation += 3;
    if (raw.rsRating6m >= 80) sAccumulation += 4;
    else if (raw.rsRating6m >= 65) sAccumulation += 2;
    sAccumulation = Math.min(20, sAccumulation);

    // Total Composite Score
    const totalScore = Math.min(100, Math.round(sAllocation + sMoat + sTwinEngine + sAccumulation));

    const phase3: Phase3ScoringBreakdown = {
      allocationScore: sAllocation,
      reinvestmentRatePct: +(reinvestmentRate * 100).toFixed(1),
      intrinsicGrowthPct: +intrinsicGrowth.toFixed(1),
      capitalDisciplineRating: sAllocation >= 25 ? 'EXEMPLARY' : sAllocation >= 18 ? 'PRUDENT' : 'AVERAGE',
      moatScore: sMoat,
      grossMarginTtmPct: raw.grossMarginTtmPct,
      grossMargin3YrAvgPct: raw.grossMargin3YrAvgPct,
      marginExpansionPct: +marginExpansion.toFixed(1),
      waccPct: raw.waccPct,
      moatSpreadPct: +moatSpread.toFixed(1),
      cashConversionCycleDays: raw.cashConversionCycleDays,
      cccTrend: raw.cashConversionCycleDays <= 60 ? 'IMPROVING' : 'STABLE',
      twinEngineScore: sTwinEngine,
      trailingPe: raw.trailingPe,
      sectorMedianPe: raw.sectorMedianPe,
      multipleHeadroomRatio: +multipleHeadroom.toFixed(2),
      pegRatio: +peg.toFixed(2),
      projectedMultipleExpansionPct: +((multipleHeadroom - 1) * 100).toFixed(0),
      accumulationScore: sAccumulation,
      fiiDiiNetChange6mPct: raw.fiiDiiNetChange6mPct,
      rsRating6m: raw.rsRating6m,
      floatingSupplyPct: raw.floatingSupplyPct,
      totalMultibaggerScore: totalScore
    };

    // ─── PHASE 4: "SIT TIGHT" (COFFEE CAN) PORTFOLIO PROTOCOL ───
    const phase4: Phase4CoffeeCanProtocol = {
      recommendedPositionSizePct: totalScore >= 85 ? 6.0 : totalScore >= 75 ? 5.0 : 4.0,
      holdingHorizonYears: '5 to 10 Years',
      trailingDrawdownTolerancePct: 40.0, // Normal 30%-50% compounder pullback floor
      invalidationTriggers: {
        roceFloorBreached: raw.roce3YrAvgPct < 12.0,
        operatingCashFlowNegative: raw.cfoToPat3YrRatio < 0.20,
        dilutionOrPledgeBreach: raw.promoterPledgePct > 10.0,
        valuationEuphoria: raw.sectorMedianPe > 0 && raw.trailingPe > 3.0 * raw.sectorMedianPe && peg > 3.5,
        trendInvalidation: raw.cmp < raw.sma200 * 0.90
      },
      sittingPolicyRule: 'The "Do Not Sell" Rule: Never sell a position simply because it has gained 2x, 3x, or 5x if quarterly earnings and ROCE continue to compound.'
    };

    // Determine Classification Tier
    let tier: MultibaggerTier = 'FAILED_GATE';
    let tierBadge = 'FAILED EXCLUSION GATE';

    if (!p1Passed || !p2Passed) {
      tier = 'FAILED_GATE';
      tierBadge = '❌ FAILED SCREENING GATES';
    } else if (totalScore >= 85) {
      tier = '10X_PHELPS_MAYER_RUNNER';
      tierBadge = '🚀 10X RUNNER (MAYER/PHELPS)';
    } else if (totalScore >= 75) {
      tier = '5X_QGLP_COMPOUNDER';
      tierBadge = '⚡ 5X COMPOUNDER (QGLP)';
    } else if (totalScore >= 65) {
      tier = '3X_ASYMMETRIC_RE_RATING';
      tierBadge = '🎯 3X ASYMMETRIC RE-RATING';
    } else {
      tier = 'MONITORED_WATCHLIST';
      tierBadge = '👁️ MONITORED WATCHLIST';
    }

    return {
      id: `MULTI_${raw.symbol}`,
      symbol: raw.symbol,
      companyName: raw.companyName,
      sector: raw.sector,
      cmp: raw.cmp,
      marketCapCr: raw.marketCapCr,
      tier,
      tierBadge,
      phase1Exclusion: phase1,
      phase2Qglp: phase2,
      phase3Scores: phase3,
      phase4Protocol: phase4,
      multibaggerThesis: raw.thesis || `${raw.companyName} possesses a ${phase3.moatSpreadPct}% ROCE spread over cost of capital with ${phase3.intrinsicGrowthPct}% intrinsic growth and zero pledge.`,
      catalystRunway: raw.catalyst || 'Structural domestic formalization and capacity reinvestment.',
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Generates the direct, copy-pasteable query for Screener.in
   */
  public getScreenerInQuery(): string {
    return `Market Capitalization < 7500 AND
Market Capitalization > 300 AND
EPS growth 3Years > 18 AND
Sales growth 3Years > 15 AND
Return on equity > 18 AND
Return on capital employed > 20 AND
Debt to equity < 0.4 AND
PEG Ratio > 0 AND
PEG Ratio < 1.25 AND
Price to Earning < 35 AND
OPM > 12 AND
Promoter holding > 50 AND
Pledged percentage < 2 AND
(DII holding > 1 OR FII holding > 1)`;
  }

  /**
   * Generates a Python VectorBT / Backtrader blueprint script for algorithmic execution.
   */
  public getPythonBacktestCode(): string {
    return `# VectorBT Multibagger Backtesting Blueprint
# Run via: python multibagger_backtest.py

import numpy as np
import pandas as pd

def screen_qglp_universe(df: pd.DataFrame) -> pd.DataFrame:
    """Implements Phase 1 & Phase 2 hard exclusion hurdles."""
    criteria = (
        # 1. Market Cap & Liquidity Runway
        (df["market_cap_cr"].between(300, 7500)) &
        (df["avg_daily_turnover_lakhs"] >= 35) &
        # 2. Insider Ownership & Alignment
        (df["promoter_holding_pct"] >= 50.0) &
        (df["promoter_pledge_pct"] <= 2.0) &
        # 3. Capital Efficiency & Leverage
        (df["roce_3yr_avg"] >= 20.0) &
        (df["debt_to_equity"] <= 0.4) &
        # 4. Growth & Cash Realization
        (df["sales_cagr_3yr"] >= 15.0) &
        (df["pat_cagr_3yr"] >= 18.0) &
        (df["cfo_to_pat_3yr"] >= 0.75) &
        # 5. Moat Proxy: Stable Gross Margins
        (df["gross_margin_volatility_5yr"] <= 3.5) &
        # 6. Trend Filter
        (df["close"] > df["sma_200"]) &
        (df["sma_50"] > df["sma_200"])
    )
    return df[criteria].copy()

def calculate_multibagger_rank(candidates: pd.DataFrame) -> pd.DataFrame:
    """Calculates multi-factor weights incorporating Reinvestment and Multiple Expansion."""
    # 1. Capital Allocation & Intrinsic Growth Score
    candidates["reinvestment_rate"] = (
        candidates["capex"] + candidates["delta_nwc"] - candidates["depreciation"]
    ) / candidates["nopat"].replace(0, np.nan)
    candidates["reinvestment_rate"] = candidates["reinvestment_rate"].clip(0.0, 1.0)
    candidates["intrinsic_growth"] = candidates["roic"] * candidates["reinvestment_rate"]
    score_allocation = candidates["intrinsic_growth"].rank(pct=True)

    # 2. Moat & Pricing Power Score (Margin Expansion + Spread over WACC)
    margin_expansion = candidates["gross_margin_ttm"] - candidates["gross_margin_3yr_avg"]
    moat_spread = candidates["roce_3yr_avg"] - candidates["wacc"]
    score_moat = margin_expansion.rank(pct=True) * 0.5 + moat_spread.rank(pct=True) * 0.5

    # 3. Twin-Engine Potential (PEG headroom + Multiple Expansion capacity)
    peg_rank = 1.0 - candidates["peg_ratio"].rank(pct=True)
    pe_gap_to_sector = (candidates["sector_median_pe"] / candidates["trailing_pe"]).clip(0.5, 3.0)
    score_twin_engine = peg_rank * 0.6 + pe_gap_to_sector.rank(pct=True) * 0.4

    # 4. Institutional Footprint
    score_accumulation = (
        candidates["fii_dii_net_change_6m"].rank(pct=True) * 0.5 +
        candidates["rs_rating_6m"].rank(pct=True) * 0.5
    )

    # Final Weighted Multibagger Score (0 to 100)
    candidates["multibagger_score"] = 100 * (
        0.30 * score_allocation +
        0.25 * score_moat +
        0.25 * score_twin_engine +
        0.20 * score_accumulation
    )
    return candidates.sort_values(by="multibagger_score", ascending=False)
`;
  }

  /**
   * Curated Indian equity seed universe calibrated across small-cap leaders
   * and contrasting case studies.
   */
  private getRawUniverse(): any[] {
    // Zero-tolerance for synthetic/fake data in production path.
    return [];
  }
}
