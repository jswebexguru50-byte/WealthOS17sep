/**
 * TechnicalModuleAdapter.ts
 *
 * Agent A Deliverable:
 * Pure adapter wiring existing WealthOS technical engines into canonical ModuleResult<TechnicalPayload>.
 *
 * Reuses:
 * - AnalysisEvidenceRepository / DuckDbAdjustedOhlcvService for canonical OHLCV bars
 * - TechnicalAnalysisEngine for classical indicators (SMA, EMA, RSI, ATR, 52W levels, Trend)
 * - PureTechnicalStrategiesEngine for S1-S10 strategy signals
 *
 * Invariants:
 * - NO strategy mathematics or formula changes
 * - NO synthetic or fabricated fallback prices
 * - Fail-closed on missing data -> DATA_INSUFFICIENT
 */

import { ModuleResult, ModuleStatus, EvidenceReference } from '../contracts/index.js';
import { TechnicalPayload, StrategySignal } from '../types/TechnicalPayload.js';
import { AnalysisEvidenceRepository } from '../AnalysisEvidenceRepository.js';
import { TechnicalAnalysisEngine } from '../../TechnicalAnalysisEngine.js';
import { PureTechnicalStrategiesEngine } from '../../PureTechnicalStrategiesEngine.js';
import { EMA } from 'technicalindicators';

export class TechnicalModuleAdapter {
  private static instance: TechnicalModuleAdapter;

  private constructor() {}

  public static getInstance(): TechnicalModuleAdapter {
    if (!TechnicalModuleAdapter.instance) {
      TechnicalModuleAdapter.instance = new TechnicalModuleAdapter();
    }
    return TechnicalModuleAdapter.instance;
  }

  public async run(identifier: string): Promise<ModuleResult<TechnicalPayload>> {
    const evaluationTimestamp = new Date().toISOString();
    const cleanSym = identifier.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');

    // 1. Fetch genuine historical OHLCV bars from canonical evidence repository
    const ohlcvResult = await AnalysisEvidenceRepository.getInstance().getAdjustedOhlcv(cleanSym, 600);
    const bars = ohlcvResult.bars;

    if (!bars || bars.length < 20) {
      return {
        moduleId: 'TECHNICAL',
        status: 'DATA_INSUFFICIENT',
        dataStatus: ohlcvResult.status,
        result: null,
        evidenceRefs: ohlcvResult.provenance,
        missingRequirements: ['Requires minimum 20 adjusted OHLCV bars for technical evaluation'],
        warnings: [`Insufficient OHLCV bars available for ${cleanSym} (found ${bars?.length || 0})`],
        evaluationTimestamp,
        dataAsOf: null,
        configVersion: '1.0.0',
        engineVersion: 'TechnicalAnalysisEngine-v6.6',
      };
    }

    // 2. Adapt bars for existing TechnicalAnalysisEngine
    const engineInput = bars.map(b => ({
      date: b.trade_date,
      open: Number(b.open_adjusted),
      high: Number(b.high_adjusted),
      low: Number(b.low_adjusted),
      close: Number(b.close_adjusted),
      volume: Number(b.volume_raw) || 0,
    }));

    const techAnalysis = TechnicalAnalysisEngine.analyze(engineInput, cleanSym);
    const closePrices = engineInput.map(b => b.close);

    // EMA20 and EMA50 canonical calculation
    let ema20Value: number | null = null;
    if (closePrices.length >= 20) {
      const ema20Series = EMA.calculate({ period: 20, values: closePrices });
      if (ema20Series.length > 0) {
        ema20Value = Number(ema20Series[ema20Series.length - 1].toFixed(2));
      }
    }

    let ema50Value: number | null = null;
    if (closePrices.length >= 50) {
      const ema50Series = EMA.calculate({ period: 50, values: closePrices });
      if (ema50Series.length > 0) {
        ema50Value = Number(ema50Series[ema50Series.length - 1].toFixed(2));
      }
    }

    // 3. Evaluate existing pure technical strategies (S1 to S10)
    const strategySignals: StrategySignal[] = [];
    const evidenceRefs: EvidenceReference[] = [...ohlcvResult.provenance];
    const warnings: string[] = [];

    try {
      const pureEngine = PureTechnicalStrategiesEngine.getInstance();
      const stratResult = await pureEngine.evaluateScripOnDemand(cleanSym);

      if (stratResult) {
        evidenceRefs.push({
          evidenceId: `PURE_TECH_SIGNALS_${cleanSym}_${evaluationTimestamp}`,
          sourceType: 'DUCKDB_OHLCV',
          sourceId: 'PureTechnicalStrategiesEngine.evaluateScripOnDemand',
          timestamp: evaluationTimestamp,
          notes: `Evaluated 10 pure strategies; ${stratResult.matchedCount} qualified`,
        });

        const stratMap: Array<{ id: string; name: string; res: any }> = [
          { id: 'S1', name: 'VPA Base Breakout', res: stratResult.strategy1 },
          { id: 'S2', name: 'Institutional Inflow & FVG/CE', res: stratResult.strategy2 },
          { id: 'S3', name: 'Higher High Compaction & Smart Money', res: stratResult.strategy3 },
          { id: 'S4', name: 'Gap Momentum & Trend Continuation', res: stratResult.strategy4 },
          { id: 'S5', name: 'Minervini Volatility Contraction Pattern', res: stratResult.strategy5 },
          { id: 'S6', name: 'Relative Strength Sector Leader Breakout', res: stratResult.strategy6 },
          { id: 'S7', name: 'Multi-Timeframe VWAP Squeeze', res: stratResult.strategy7 },
          { id: 'S8', name: 'Turnaround Deep Value Mean Reversion', res: stratResult.strategy8 },
          { id: 'S9', name: 'NeoWave Diamond Thrust Acceleration', res: stratResult.strategy9 },
          { id: 'S10', name: 'Order Flow Delta Exhaustion Reversal', res: stratResult.strategy10 },
        ];

        for (const item of stratMap) {
          if (item.res) {
            strategySignals.push({
              strategyId: item.id,
              name: item.name,
              qualified: Boolean(item.res.qualified),
              score: item.res.totalScore || (item.res.qualified ? 100 : 0),
              details: {
                cmp: item.res.cmp,
                stopLoss: item.res.stopLoss,
                target: item.res.targetPrice || item.res.target,
              },
            });
          }
        }
      }
    } catch (stratErr: any) {
      // Invariant: Errors cannot disappear silently. Propagate warning and adjust status.
      warnings.push(`Pure technical strategy engine evaluation error: ${stratErr?.message || stratErr}`);
    }

    const latestBar = bars[bars.length - 1];
    const dataAsOf = latestBar ? latestBar.trade_date : null;

    let trendStatus: 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'UNKNOWN' = 'UNKNOWN';
    if (techAnalysis?.trend === 'UPTREND') trendStatus = 'BULLISH';
    else if (techAnalysis?.trend === 'DOWNTREND') trendStatus = 'BEARISH';
    else if (techAnalysis?.trend === 'SIDEWAYS') trendStatus = 'NEUTRAL';

    const payload: TechnicalPayload = {
      price: techAnalysis ? techAnalysis.cmp : (latestBar ? Number(latestBar.close_adjusted) : null),
      ema20: ema20Value,
      ema50: ema50Value,
      sma200: techAnalysis ? (techAnalysis.sma200 ?? null) : null,
      rsi14: techAnalysis ? (techAnalysis.rsi14 ?? null) : null,
      atrPct: techAnalysis ? (techAnalysis.atrPct ?? null) : null,
      high52w: techAnalysis ? (techAnalysis.keyLevels?.fiftyTwoWeekHigh ?? null) : null,
      low52w: techAnalysis ? (techAnalysis.keyLevels?.fiftyTwoWeekLow ?? null) : null,
      // Invariant: Do not conflate absolute composite technicalScore with relative-strength percentile
      rsPercentile: null,
      trend: trendStatus,
      signals: strategySignals,
      dataAsOf,
    };

    const status: ModuleStatus = (payload.price !== null && payload.rsi14 !== null)
      ? (warnings.length > 0 ? 'PARTIAL' : 'WORKING')
      : 'PARTIAL';

    return {
      moduleId: 'TECHNICAL',
      status,
      dataStatus: 'VERIFIED',
      result: payload,
      evidenceRefs,
      missingRequirements: [],
      warnings,
      evaluationTimestamp,
      dataAsOf,
      configVersion: '1.0.0',
      engineVersion: 'TechnicalAnalysisEngine-v6.6+PureTech',
    };
  }
}
