/**
 * src/server/services/SevenStrategiesCandidatesService.ts
 *
 * Unified Candidate Extraction & Normalization Service for the 7 Strategies Developed Today:
 * 1. S1a - VPA Three-Leg Reclaim (Volume Price Alignment)
 * 2. S1b - VPA Trough Reversal (Trough exhaustion with volume drying)
 * 3. S2a - Institutional Fair Value Gap (FVG) and Consequent Encroachment (CE)
 * 4. S3a - HH/HL ATR Compression
 * 5. S4a - Gap Running Breakouts
 * 6. S4b - RSI-Supported Gap Breakout
 * 7. S5a - Minervini Trend Template Winning Stocks
 *
 * Reads latest verified 90-session JSON execution reports, normalizes rule parameters,
 * identifies cross-strategy convergence, and correlates each candidate with FERE fundamental cards.
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type StrategyKey = 'S1a' | 'S1b' | 'S2a' | 'S3a' | 'S4a' | 'S4b' | 'S5a';

export interface StrategyMetaInfo {
  id: StrategyKey;
  name: string;
  tagline: string;
  color: string;
  badgeBg: string;
  badgeText: string;
  reportPrefix: string;
}

export const STRATEGY_METAS: Record<StrategyKey, StrategyMetaInfo> = {
  S1a: {
    id: 'S1a',
    name: 'VPA Three-Leg Reclaim',
    tagline: 'Impulse, drying pullback, and institutional reclaim of L1 high',
    color: '#2563EB',
    badgeBg: 'bg-blue-500/10 border-blue-500/30',
    badgeText: 'text-blue-400',
    reportPrefix: 'vpa_three_leg_full_universe_90_',
  },
  S1b: {
    id: 'S1b',
    name: 'VPA Trough Reversal',
    tagline: 'Trough volume dry-up with bullish candle and RSI support',
    color: '#7C3AED',
    badgeBg: 'bg-purple-500/10 border-purple-500/30',
    badgeText: 'text-purple-400',
    reportPrefix: 's1b_full_universe_90_',
  },
  S2a: {
    id: 'S2a',
    name: 'Institutional FVG & CE',
    tagline: 'Displacement gap retest holding Consequent Encroachment midpoint',
    color: '#EA580C',
    badgeBg: 'bg-orange-500/10 border-orange-500/30',
    badgeText: 'text-orange-400',
    reportPrefix: 's2a_full_universe_90_',
  },
  S3a: {
    id: 'S3a',
    name: 'HH/HL ATR Compression',
    tagline: 'Higher highs / higher lows with Volatility & ATR contraction',
    color: '#059669',
    badgeBg: 'bg-emerald-500/10 border-emerald-500/30',
    badgeText: 'text-emerald-400',
    reportPrefix: 's3a_full_universe_90_',
  },
  S4a: {
    id: 'S4a',
    name: 'Gap Running Breakouts',
    tagline: 'Weekly pivot breakout gap with pullback ATR compression',
    color: '#0E7490',
    badgeBg: 'bg-cyan-500/10 border-cyan-500/30',
    badgeText: 'text-cyan-400',
    reportPrefix: 's4a_full_universe_90_',
  },
  S4b: {
    id: 'S4b',
    name: 'RSI-Supported Gap Breakout',
    tagline: 'Gap up supported by RSI momentum baseline & bullish candle structure',
    color: '#0F766E',
    badgeBg: 'bg-teal-500/10 border-teal-500/30',
    badgeText: 'text-teal-400',
    reportPrefix: 's4b_full_universe_90_',
  },
  S5a: {
    id: 'S5a',
    name: 'Minervini Winning Stocks',
    tagline: 'Stage 2 Trend Template, VCP contraction, and 52W high proximity',
    color: '#9F1239',
    badgeBg: 'bg-rose-500/10 border-rose-500/30',
    badgeText: 'text-rose-400',
    reportPrefix: 's5a_full_universe_90_',
  },
};

export interface NormalizedRuleCheck {
  name: string;
  passed: boolean;
  actualValue: string | number;
  benchmarkRule: string;
  explanation?: string;
}

export interface CandidateResult {
  symbol: string;
  strategyId: StrategyKey;
  strategyName: string;
  strategyColor: string;
  signalDate: string;
  cmp: number;
  entry: number | null;
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  riskReward: number | null;
  candlePattern?: string;
  rsiValue?: number | null;
  keyParameters: Record<string, string | number | boolean | null>;
  ruleChecks: NormalizedRuleCheck[];
  forwardReturns?: {
    fwd5b?: number | null;
    fwd10b?: number | null;
    fwd20b?: number | null;
  };
  fereStatus: 'VERIFIED_PARTIAL' | 'DATA_INSUFFICIENT' | 'NO_CARD';
  hasFereEvidence: boolean;
}

export interface ConvergenceStock {
  symbol: string;
  strategies: Array<{
    strategyId: StrategyKey;
    strategyName: string;
    strategyColor: string;
    signalDate: string;
    cmp: number;
  }>;
  convergenceCount: number;
  latestDate: string;
  cmp: number;
  fereStatus: 'VERIFIED_PARTIAL' | 'DATA_INSUFFICIENT' | 'NO_CARD';
  candidates: CandidateResult[];
}

export interface SevenStrategiesScanPayload {
  success: boolean;
  generatedAt: string;
  reportFiles: Record<StrategyKey, string | null>;
  summary: {
    totalSignalsAcrossAll: number;
    uniqueCandidatesCount: number;
    convergenceCount: number;
    strategyCounts: Record<StrategyKey, number>;
  };
  convergence: ConvergenceStock[];
  strategies: Record<StrategyKey, {
    meta: StrategyMetaInfo;
    count: number;
    candidates: CandidateResult[];
  }>;
}

export class SevenStrategiesCandidatesService {
  private static instance: SevenStrategiesCandidatesService;
  private cache: SevenStrategiesScanPayload | null = null;
  private lastLoadTimestamp = 0;
  private readonly reportsDir = path.resolve('reports', 'readiness', 'vpa_three_leg');
  private readonly fereDbPath = path.resolve('data', 'fere', 'verified_filings', 'fere_evidence.db');

  public static getInstance(): SevenStrategiesCandidatesService {
    if (!SevenStrategiesCandidatesService.instance) {
      SevenStrategiesCandidatesService.instance = new SevenStrategiesCandidatesService();
    }
    return SevenStrategiesCandidatesService.instance;
  }

  public invalidateCache(): void {
    this.cache = null;
    this.lastLoadTimestamp = 0;
  }

  public async getCandidatesPayload(forceRefresh = false): Promise<SevenStrategiesScanPayload> {
    const now = Date.now();
    if (!forceRefresh && this.cache && (now - this.lastLoadTimestamp < 60000)) {
      return this.cache;
    }

    const payload = this.buildPayload();
    this.cache = payload;
    this.lastLoadTimestamp = now;
    return payload;
  }

  private getFereStatusMap(): Map<string, 'VERIFIED_PARTIAL' | 'DATA_INSUFFICIENT'> {
    const statusMap = new Map<string, 'VERIFIED_PARTIAL' | 'DATA_INSUFFICIENT'>();
    if (!fs.existsSync(this.fereDbPath)) return statusMap;

    try {
      const db = new Database(this.fereDbPath, { readonly: true });
      const rows = db.prepare('SELECT symbol, status FROM company_check_result').all() as Array<{ symbol: string; status: string }>;
      for (const r of rows) {
        if (r.status === 'VERIFIED_PARTIAL' || r.status === 'DATA_INSUFFICIENT') {
          statusMap.set(r.symbol.toUpperCase(), r.status);
        }
      }
      db.close();
    } catch (e) {
      console.warn('[SevenStrategiesCandidatesService] Error reading fere_evidence.db:', e);
    }
    return statusMap;
  }

  private findLatestReport(prefix: string): string | null {
    if (!fs.existsSync(this.reportsDir)) return null;
    try {
      const allFiles = fs.readdirSync(this.reportsDir);
      const matches = allFiles.filter(f => f.startsWith(prefix) && f.endsWith('.json')).sort();
      const latest = matches.at(-1);
      return latest ? path.join(this.reportsDir, latest) : null;
    } catch (e) {
      console.error(`[SevenStrategiesCandidatesService] Error finding report for ${prefix}:`, e);
      return null;
    }
  }

  private readJsonSafe(filePath: string): any {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const sanitized = raw.replace(/:\s*NaN(?=\s*[,}])/g, ': null');
      return JSON.parse(sanitized);
    } catch (e) {
      console.error(`[SevenStrategiesCandidatesService] Failed to read ${filePath}:`, e);
      return null;
    }
  }

  private buildPayload(): SevenStrategiesScanPayload {
    const fereStatusMap = this.getFereStatusMap();
    const strategyKeys: StrategyKey[] = ['S1a', 'S1b', 'S2a', 'S3a', 'S4a', 'S4b', 'S5a'];
    const reportFiles: Record<StrategyKey, string | null> = {
      S1a: null, S1b: null, S2a: null, S3a: null, S4a: null, S4b: null, S5a: null
    };

    const strategiesOutput: Record<StrategyKey, { meta: StrategyMetaInfo; count: number; candidates: CandidateResult[] }> = {
      S1a: { meta: STRATEGY_METAS.S1a, count: 0, candidates: [] },
      S1b: { meta: STRATEGY_METAS.S1b, count: 0, candidates: [] },
      S2a: { meta: STRATEGY_METAS.S2a, count: 0, candidates: [] },
      S3a: { meta: STRATEGY_METAS.S3a, count: 0, candidates: [] },
      S4a: { meta: STRATEGY_METAS.S4a, count: 0, candidates: [] },
      S4b: { meta: STRATEGY_METAS.S4b, count: 0, candidates: [] },
      S5a: { meta: STRATEGY_METAS.S5a, count: 0, candidates: [] },
    };

    const allCandidatesBySymbol = new Map<string, CandidateResult[]>();

    for (const key of strategyKeys) {
      const meta = STRATEGY_METAS[key];
      const filePath = this.findLatestReport(meta.reportPrefix);
      reportFiles[key] = filePath ? path.basename(filePath) : null;

      if (!filePath) continue;
      const data = this.readJsonSafe(filePath);
      if (!data || !Array.isArray(data.matches)) continue;

      const normalizedList: CandidateResult[] = [];

      for (const m of data.matches) {
        const symbol = String(m.symbol || m.Symbol || '').trim().toUpperCase();
        if (!symbol) continue;

        const fereStatus = fereStatusMap.get(symbol) || 'NO_CARD';
        const hasFereEvidence = fereStatus !== 'NO_CARD';

        const candidate = this.normalizeCandidate(key, m, symbol, fereStatus, hasFereEvidence);
        normalizedList.push(candidate);

        const existing = allCandidatesBySymbol.get(symbol) || [];
        existing.push(candidate);
        allCandidatesBySymbol.set(symbol, existing);
      }

      strategiesOutput[key].candidates = normalizedList;
      strategiesOutput[key].count = normalizedList.length;
    }

    // Build multi-strategy convergence list
    const convergence: ConvergenceStock[] = [];
    for (const [symbol, list] of allCandidatesBySymbol.entries()) {
      if (list.length > 1) {
        const sorted = [...list].sort((a, b) => b.signalDate.localeCompare(a.signalDate));
        const strategiesSummary = list.map(c => ({
          strategyId: c.strategyId,
          strategyName: c.strategyName,
          strategyColor: c.strategyColor,
          signalDate: c.signalDate,
          cmp: c.cmp
        }));

        const distinctStrategies = Array.from(new Set(list.map(c => c.strategyId)));

        convergence.push({
          symbol,
          strategies: strategiesSummary,
          convergenceCount: list.length,
          distinctStrategyCount: distinctStrategies.length,
          distinctStrategies,
          latestDate: sorted[0].signalDate,
          cmp: sorted[0].cmp,
          fereStatus: sorted[0].fereStatus,
          candidates: list,
        } as any);
      }
    }

    // Sort convergence by distinct strategy count first (cross-strategy), then total signals, then latest date
    convergence.sort((a, b) => {
      const aDistinct = (a as any).distinctStrategyCount || 0;
      const bDistinct = (b as any).distinctStrategyCount || 0;
      if (bDistinct !== aDistinct) return bDistinct - aDistinct;
      if (b.convergenceCount !== a.convergenceCount) return b.convergenceCount - a.convergenceCount;
      return b.latestDate.localeCompare(a.latestDate);
    });

    const totalSignalsAcrossAll = strategyKeys.reduce((acc, k) => acc + strategiesOutput[k].count, 0);
    const strategyCounts: Record<StrategyKey, number> = {
      S1a: strategiesOutput.S1a.count,
      S1b: strategiesOutput.S1b.count,
      S2a: strategiesOutput.S2a.count,
      S3a: strategiesOutput.S3a.count,
      S4a: strategiesOutput.S4a.count,
      S4b: strategiesOutput.S4b.count,
      S5a: strategiesOutput.S5a.count,
    };

    return {
      success: true,
      generatedAt: new Date().toISOString(),
      reportFiles,
      summary: {
        totalSignalsAcrossAll,
        uniqueCandidatesCount: allCandidatesBySymbol.size,
        convergenceCount: convergence.length,
        strategyCounts,
      },
      convergence,
      strategies: strategiesOutput,
    };
  }

  private normalizeCandidate(
    strategyId: StrategyKey,
    m: any,
    symbol: string,
    fereStatus: 'VERIFIED_PARTIAL' | 'DATA_INSUFFICIENT' | 'NO_CARD',
    hasFereEvidence: boolean
  ): CandidateResult {
    const meta = STRATEGY_METAS[strategyId];
    let signalDate = String(m.signal_date || m.as_of_date || m.Signal_Date || '').slice(0, 10);
    let cmp = Number(m.cmp || m.close || m.Signal_Price || 0);
    let entry: number | null = null;
    let stopLoss: number | null = null;
    let target1: number | null = null;
    let target2: number | null = null;
    let riskReward: number | null = null;
    let candlePattern: string | undefined = undefined;
    let rsiValue: number | null = null;

    const keyParams: Record<string, any> = {};
    const ruleChecks: NormalizedRuleCheck[] = [];
    const forwardReturns: { fwd5b?: number | null; fwd10b?: number | null; fwd20b?: number | null } = {};

    switch (strategyId) {
      case 'S1a':
        entry = m.entry ?? null;
        stopLoss = m.stop ?? null;
        target1 = m.target_1 ?? null;
        target2 = m.target_2 ?? null;
        riskReward = m.rr_target_1 ?? null;
        candlePattern = m.candle_pattern;
        rsiValue = m.rsi_value ?? null;
        keyParams['Impulse %'] = m.displacement_pct ? `${(m.displacement_pct * 100).toFixed(1)}%` : null;
        keyParams['Retracement %'] = m.retracement_ratio ? `${(m.retracement_ratio * 100).toFixed(1)}%` : null;
        keyParams['Reclaim %'] = m.reclaim_ratio ? `${(m.reclaim_ratio * 100).toFixed(1)}%` : null;
        keyParams['L1 Volume Multiple'] = m.leg1_volume_multiple ? `${Number(m.leg1_volume_multiple).toFixed(2)}x` : null;
        keyParams['L2/L1 Volume Ratio'] = m.leg2_to_leg1_volume_ratio ? `${Number(m.leg2_to_leg1_volume_ratio).toFixed(2)}x` : null;
        keyParams['ATH Discount %'] = m.ath_discount_pct ? `${(m.ath_discount_pct * 100).toFixed(1)}%` : null;
        keyParams['SMA200 Distance %'] = m.sma_distance_pct ? `${(m.sma_distance_pct * 100).toFixed(1)}%` : null;
        forwardReturns.fwd5b = m.forward_return_5b_pct ?? null;
        forwardReturns.fwd10b = m.forward_return_10b_pct ?? null;
        forwardReturns.fwd20b = m.forward_return_20b_pct ?? null;
        if (m.rule_checks_and_measured_values) {
          ruleChecks.push({
            name: 'VPA Rules & Measured Values',
            passed: true,
            actualValue: String(m.rule_checks_and_measured_values),
            benchmarkRule: 'Impulse >= 15%, Retrace <= 60%, Reclaim >= 90%, Vol dry-up',
          });
        }
        break;

      case 'S1b':
        entry = m.entry ?? null;
        stopLoss = m.stop ?? null;
        candlePattern = m.candle_pattern;
        rsiValue = m.rsi_value ?? null;
        keyParams['Impulse %'] = m.displacement_pct ? `${(m.displacement_pct * 100).toFixed(1)}%` : null;
        keyParams['Retracement %'] = m.retracement_ratio ? `${(m.retracement_ratio * 100).toFixed(1)}%` : null;
        keyParams['Trigger Vol / SMA'] = m.trigger_volume_multiple ? `${Number(m.trigger_volume_multiple).toFixed(2)}x` : null;
        keyParams['Pullback / L1 Vol'] = m.leg2_to_leg1_volume_ratio ? `${Number(m.leg2_to_leg1_volume_ratio).toFixed(2)}x` : null;
        keyParams['Trough Date'] = m.trough_date ?? null;
        keyParams['ATH Discount %'] = m.ath_discount_pct ? `${(m.ath_discount_pct * 100).toFixed(1)}%` : null;
        forwardReturns.fwd5b = m.forward_return_5b_pct ?? null;
        forwardReturns.fwd10b = m.forward_return_10b_pct ?? null;
        forwardReturns.fwd20b = m.forward_return_20b_pct ?? null;
        ruleChecks.push({
          name: 'Trough Reversal Validation',
          passed: true,
          actualValue: `RSI: ${m.rsi_value ?? 'N/A'}, Candle: ${m.candle_pattern ?? 'Bullish'}`,
          benchmarkRule: 'RSI at support + Bullish trigger candle with volume dry-up',
        });
        break;

      case 'S2a':
        entry = m.Signal_Price ?? null;
        stopLoss = m.FVG_Low_Bound ?? null;
        candlePattern = m.Candle_Pattern;
        keyParams['CE Level ₹'] = m.CE_Level ? `₹${Number(m.CE_Level).toFixed(2)}` : null;
        keyParams['FVG Floor ₹'] = m.FVG_Low_Bound ? `₹${Number(m.FVG_Low_Bound).toFixed(2)}` : null;
        keyParams['FVG Ceiling ₹'] = m.FVG_High_Bound ? `₹${Number(m.FVG_High_Bound).toFixed(2)}` : null;
        keyParams['FVG Size %'] = m.FVG_Size_Pct ? `${Number(m.FVG_Size_Pct).toFixed(2)}%` : null;
        keyParams['Initial Move %'] = m.Initial_Move_Pct ? `${Number(m.Initial_Move_Pct).toFixed(2)}%` : null;
        keyParams['Pullback Bars'] = m.Pullback_Duration_Bars ?? null;
        keyParams['Displacement Vol Ratio'] = m.Displacement_Vol_Ratio ? `${Number(m.Displacement_Vol_Ratio).toFixed(2)}x` : null;
        keyParams['Trigger Vol Ratio'] = m.Trigger_Vol_Ratio ? `${Number(m.Trigger_Vol_Ratio).toFixed(2)}x` : null;
        keyParams['Weekly Swing Low ₹'] = m.Weekly_Swing_Low ? `₹${Number(m.Weekly_Swing_Low).toFixed(2)}` : null;
        keyParams['Peak Rise from Low %'] = m.Weekly_Advance_From_Swing_Low_Pct ? `${Number(m.Weekly_Advance_From_Swing_Low_Pct).toFixed(1)}%` : null;
        forwardReturns.fwd5b = m['Fwd_Return_5B (%)'] ?? null;
        forwardReturns.fwd10b = m['Fwd_Return_10B (%)'] ?? null;
        forwardReturns.fwd20b = m['Fwd_Return_20B (%)'] ?? null;
        ruleChecks.push({
          name: 'Institutional FVG & Consequent Encroachment',
          passed: true,
          actualValue: `CE: ₹${m.CE_Level}, Size: ${m.FVG_Size_Pct}%`,
          benchmarkRule: 'Close above CE midpoint of displacement FVG',
        });
        break;

      case 'S3a':
        entry = m.Entry ?? null;
        stopLoss = m.Stop ?? null;
        target1 = m.Target_1 ?? null;
        target2 = m.Target_2 ?? null;
        riskReward = m.RR_Target_1 ?? null;
        keyParams['P0 Low ₹'] = m.P0 ? `₹${Number(m.P0).toFixed(2)}` : null;
        keyParams['H1 ₹'] = m.H1 ? `₹${Number(m.H1).toFixed(2)}` : null;
        keyParams['L1 ₹'] = m.L1 ? `₹${Number(m.L1).toFixed(2)}` : null;
        keyParams['H2 ₹'] = m.H2 ? `₹${Number(m.H2).toFixed(2)}` : null;
        keyParams['L2 ₹'] = m.L2 ? `₹${Number(m.L2).toFixed(2)}` : null;
        keyParams['ATR Compression Ratio'] = m.ATR_Compression_Ratio ? `${Number(m.ATR_Compression_Ratio).toFixed(2)}` : null;
        keyParams['Prior 5-Bar Move %'] = m.Preceding_Move_Pct ? `${Number(m.Preceding_Move_Pct).toFixed(1)}%` : null;
        keyParams['Rising SMA50 ₹'] = m.SMA50_At_Signal ? `₹${Number(m.SMA50_At_Signal).toFixed(2)}` : null;
        if (Array.isArray(m.Rule_Checks)) {
          for (const c of m.Rule_Checks) {
            ruleChecks.push({
              name: c.name,
              passed: c.passed ?? true,
              actualValue: c.actualValue,
              benchmarkRule: c.benchmarkRule,
            });
          }
        }
        break;

      case 'S4a':
        entry = m.Recommended_Entry_Price ?? null;
        stopLoss = m.Stop_Loss ?? null;
        keyParams['Gap Up %'] = m.Gap_Up_Pct ? `${Number(m.Gap_Up_Pct).toFixed(2)}%` : null;
        keyParams['Entry Trigger'] = m.Entry_Trigger ?? null;
        keyParams['Weekly Pivot Date'] = m.Weekly_Pivot_Date ?? null;
        keyParams['Previous Swing High ₹'] = m.Previous_Swing_High ? `₹${Number(m.Previous_Swing_High).toFixed(2)}` : null;
        keyParams['Pullback ATR Ratio'] = m.Pullback_ATR_Ratio ? `${Number(m.Pullback_ATR_Ratio).toFixed(2)}` : null;
        keyParams['Supply Dry-Up Ratio'] = m.Supply_Dry_Up_Ratio ? `${Number(m.Supply_Dry_Up_Ratio).toFixed(2)}` : null;
        keyParams['Market Cap (Cr) ₹'] = m.Market_Cap_Cr ? `₹${Number(m.Market_Cap_Cr).toFixed(0)} Cr` : null;
        if (Array.isArray(m.Rule_Checks)) {
          for (const c of m.Rule_Checks) {
            ruleChecks.push({
              name: c.name,
              passed: c.passed ?? true,
              actualValue: c.actualValue,
              benchmarkRule: c.benchmarkRule,
            });
          }
        }
        break;

      case 'S4b':
        stopLoss = m.Stop_Loss ?? null;
        candlePattern = m.Candle_Pattern;
        rsiValue = m.RSI14 ?? null;
        keyParams['Gap Up %'] = m.Gap_Up_Pct ? `${Number(m.Gap_Up_Pct).toFixed(2)}%` : null;
        keyParams['RSI(14)'] = m.RSI14 ? Number(m.RSI14).toFixed(1) : null;
        keyParams['RSI Support Level'] = m.RSI_Support_Level ?? null;
        keyParams['Bullish Candle Pattern'] = m.Candle_Pattern ?? null;
        if (Array.isArray(m.Rule_Checks)) {
          for (const c of m.Rule_Checks) {
            ruleChecks.push({
              name: c.name,
              passed: c.passed ?? true,
              actualValue: c.actualValue,
              benchmarkRule: c.benchmarkRule,
            });
          }
        }
        break;

      case 'S5a':
        entry = m.Entry_Price ?? null;
        stopLoss = m.Stop_Loss ?? null;
        keyParams['Stop Loss %'] = m.Stop_Loss_Pct ? `${Number(m.Stop_Loss_Pct).toFixed(1)}%` : null;
        keyParams['52W High ₹'] = m.Weekly_52W_High ? `₹${Number(m.Weekly_52W_High).toFixed(2)}` : null;
        keyParams['Discount from 52W High %'] = m.Discount_From_52W_High_Pct ? `${Number(m.Discount_From_52W_High_Pct).toFixed(1)}%` : null;
        keyParams['52W Low ₹'] = m.Weekly_52W_Low ? `₹${Number(m.Weekly_52W_Low).toFixed(2)}` : null;
        keyParams['Gain from 52W Low %'] = m.Gain_From_52W_Low_Pct ? `${Number(m.Gain_From_52W_Low_Pct).toFixed(1)}%` : null;
        keyParams['SMA 50 ₹'] = m.SMA50 ? `₹${Number(m.SMA50).toFixed(2)}` : null;
        keyParams['SMA 200 ₹'] = m.SMA200 ? `₹${Number(m.SMA200).toFixed(2)}` : null;
        keyParams['High Recurrence (Weeks)'] = m.High_Recurrence_Weeks ?? null;
        keyParams['VCP Count'] = m.VCP_Count ?? null;
        keyParams['Supply Dry-Up Ratio'] = m.Supply_Dry_Up_Ratio ? `${Number(m.Supply_Dry_Up_Ratio).toFixed(2)}` : null;
        keyParams['20-Day ATR ₹'] = m.ATR20 ? `₹${Number(m.ATR20).toFixed(2)}` : null;
        if (Array.isArray(m.Rule_Checks)) {
          for (const c of m.Rule_Checks) {
            ruleChecks.push({
              name: c.name,
              passed: c.passed ?? true,
              actualValue: c.actualValue,
              benchmarkRule: c.benchmarkRule,
            });
          }
        }
        break;
    }

    return {
      symbol,
      strategyId,
      strategyName: meta.name,
      strategyColor: meta.color,
      signalDate,
      cmp,
      entry,
      stopLoss,
      target1,
      target2,
      riskReward,
      candlePattern,
      rsiValue,
      keyParameters: keyParams,
      ruleChecks,
      forwardReturns,
      fereStatus,
      hasFereEvidence,
    };
  }
}
export default SevenStrategiesCandidatesService;
