/**
 * ResearchExperienceAgent.ts
 * 
 * Institutional Research & Experience Agent (IREA v1.0)
 * 
 * Functions as an autonomous Senior Quantitative Research Analyst & Chief Investment Officer.
 * Synthesizes:
 * - Glenn Neely NEoWave structural wave position
 * - V6.0 Quantitative Institutional signals (LPE, DQS, OB Decay, S13 Acceleration)
 * - Fundamental EPV intrinsic valuation
 * - Microstructure Smart Money accumulation (OBI, Float Squeeze)
 * - Macro Volatility Regime gating & Fractional Kelly position sizing
 * 
 * Generates an executive publication-grade Investment Proposal & Scrip Dossier with:
 * - Interactive Chart Visualization Data (Wave pivots, Golden Pocket, Targets)
 * - "Why This Signal Works" Institutional Thesis
 * - "What is the Potential" Asymmetric Risk/Reward Breakdown
 * - Actionable Execution Ticket (Tranche A 35% + Tranche B 65% Limit Pullback Entry)
 */

import fs from 'fs';
import path from 'path';
import { getDB, dbAll, dbGet } from '../database.js';
import { DuckDbAdjustedOhlcvService } from './DuckDbAdjustedOhlcvService.js';
import { NEoWaveEngine, OHLCVBar, NEoWaveAnalysisResult } from '../quant/NEoWaveEngine.js';
import {
  classifyMacroRegimeV5,
  calculatePositionSizeV5,
  calculateEPVValuationV5,
  calculateLimitPullbackEntryV6,
  evaluateDisplacementQualityScoreV6,
  calculateOrderBlockDecayV6,
  evaluateS13EarningsAccelerationV6
} from '../quantEngine.js';

export interface ResearchDossier {
  symbol: string;
  companyName: string;
  sector: string;
  currentPrice: number;
  generatedAt: string;
  convictionScore: number; // 0 - 100
  convictionBadge: 'AAA_INSTITUTIONAL_COMPOUNDER' | 'AA_MOMENTUM_ALPHA' | 'A_STRUCTURAL_SETUP' | 'B_SPECULATIVE_WATCH';
  macroRegime: string;
  doubleMomentum?: any;
  
  // 1. Interactive Chart Data
  chartVisualization: {
    candles: Array<{
      date: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>;
    waveMarkers: Array<{
      label: string;
      price: number;
      date: string;
      isConfirmed: boolean;
      type: string;
    }>;
    supportZone: { low: number; high: number; label: string };
    targetLadder: Array<{ label: string; price: number; upsidePct: number; fibLevel: string }>;
    invalidationLine: { price: number; riskPct: number; label: string };
  };

  // 2. Structural & Quant Metrics
  waveAnalysis: NEoWaveAnalysisResult;
  fundamentalEpv: {
    operatingEarningsCr: number;
    epvIntrinsicValue: number;
    marginOfSafetyPct: number;
    rocePct: number;
    roePct: number;
  };
  smartMoneyMetrics: {
    displacementQualityScore: number;
    orderBlockFreshnessScore: number;
    floatSqueezeRatio: number;
    institutionalDeliveryPct: number;
  };

  // 3. "Why This Signal Works"
  whyThisSignalWorks: {
    headline: string;
    structuralEdge: string;
    fundamentalMoat: string;
    smartMoneyFootprint: string;
    catalystSummary: string;
  };

  // 4. "What is the Potential"
  whatIsThePotential: {
    target1Price: number;
    target1UpsidePct: number;
    target2Price: number;
    target2UpsidePct: number;
    hardStopLoss: number;
    maxDownsideRiskPct: number;
    rewardToRiskRatio: number;
    asymmetryRating: 'EXCEPTIONAL' | 'VERY_HIGH' | 'ATTRACTIVE' | 'MODERATE';
    downsideStressTest: string;
  };

  // 5. Actionable Execution Ticket
  executionTicket: {
    actionDirective: 'EXECUTE_LIMIT_PULLBACK' | 'ACCUMULATE_ON_DIPS' | 'HOLD_COMPOUNDER' | 'WAIT_CONFIRMATION';
    trancheA_AllocationPct: 35;
    trancheA_PriceLimit: number;
    trancheB_AllocationPct: 65;
    trancheB_PriceLimit: number;
    stopLossPrice: number;
    fastBreakevenTriggerPrice: number;
    recommendedShares: number;
    recommendedCapitalInr: number;
    maxEquityRiskPct: number;
    holdingHorizon: 'SWING_2_TO_6_WEEKS' | 'POSITIONAL_3_TO_9_MONTHS' | 'COMPOUNDER_2_TO_3_YEARS';
  };
}

export class ResearchExperienceAgent {
  private static instance: ResearchExperienceAgent;

  public static getInstance(): ResearchExperienceAgent {
    if (!ResearchExperienceAgent.instance) {
      ResearchExperienceAgent.instance = new ResearchExperienceAgent();
    }
    return ResearchExperienceAgent.instance;
  }

  /**
   * Generates an end-to-end Institutional Research Proposal and Dossier for any stock.
   */
  public async generateDossier(symbol: string, portfolioCapital = 10000000): Promise<ResearchDossier> {
    const db = getDB();
    const cleanSym = symbol.toUpperCase().trim();

    // 1. Fetch Company Master Information
    const master = await dbGet(db, `
      SELECT symbol, name, sector, upstox_key_nse, isin 
      FROM MasterTickers 
      WHERE symbol = ? OR symbol LIKE ?
      LIMIT 1
    `, [cleanSym, `${cleanSym}%`]);

    const companyName = master?.name || `${cleanSym} Limited`;
    const sector = master?.sector || 'Diversified Growth';

    // 2. Canonical adjusted history comes from DuckDB. SQLite is retained only
    // as a compatibility fallback for symbols absent from the market catalog.
    const duckBars = await DuckDbAdjustedOhlcvService.getDailyBars(cleanSym, 120);
    const rawDaily = duckBars?.length ? duckBars.map(bar => ({
      date: bar.trade_date, open: bar.open_adjusted, high: bar.high_adjusted,
      low: bar.low_adjusted, close: bar.close_adjusted, volume: bar.volume_raw
    })) : await dbAll(db, `
      SELECT trade_date as date, open, high, low, close, volume
      FROM DailyOHLCV
      WHERE symbol = ?
      ORDER BY trade_date DESC
      LIMIT 120
    `, [cleanSym]);

    const dailyBars: OHLCVBar[] = (rawDaily || []).reverse().map((r: any) => ({
      date: r.date,
      open: Number(r.open || r.close),
      high: Number(r.high || r.close),
      low: Number(r.low || r.close),
      close: Number(r.close),
      volume: Number(r.volume || 0)
    }));

    // Fallback synthesis if empty
    const cmp = dailyBars.length > 0 ? dailyBars[dailyBars.length - 1].close : null;
    if (cmp === null) {
      throw new Error('DATA_INSUFFICIENT: No price history available.');
    }

    // 3. Execute NEoWave Analysis
    const neowaveEngine = NEoWaveEngine.getInstance();
    const waveAnalysis = neowaveEngine.analyzeNEoWave(cleanSym, dailyBars);

    // Fail-close: We do not have actual fundamental data yet, and we cannot hardcode EBIT, ROE, ROCE, Macro, etc.
    // The previous implementation hardcoded 280 EBIT, Nifty 24500, and other metrics.
    // We now explicitly fail-close the dossier generation if inputs are not present in verified snapshots.
    throw new Error('DATA_INSUFFICIENT: Verified source inputs are missing for fundamental EPV and Quant models.');

    // End fail-close
  }
}
