import { ScreenerData } from './screenerService.js';
import { TechnicalAnalysisResult } from './TechnicalAnalysisEngine.js';
import { NewsSentimentResult } from './NewsSentimentService.js';
import { ModelFactorWeights } from './SelfLearningEngine.js';

export interface SignalContext {
  technical: TechnicalAnalysisResult | null;
  fundamental: ScreenerData | null;
  sentiment: NewsSentimentResult | null;
  portfolio?: {
    unrealized_pnl_pct: number;
    days_held: number;
    weight_pct: number;
  };
}

export interface SignalResult {
  action: 'BUY' | 'HOLD' | 'SELL' | 'STRONG BUY' | 'STRONG SELL' | 'ADD_MORE' | 'REDUCE';
  compositeScore: number; // 0 to 100
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  breakdown: {
    technicalScore: number;
    fundamentalScore: number;
    sentimentScore: number;
    contextScore: number;
  };
  catalysts: string[];
  bullCase: string[];
  bearCase: string[];
  redFlags: string[];
  aiRationale: string;
  analystTargetPrice?: number;
  convictionLevel: 'CRITICAL' | 'STRONG' | 'MODERATE' | 'WEAK';
  signalAgreementMap: Record<string, 'BULLISH' | 'BEARISH' | 'NEUTRAL'>;
}

export class SignalEngine {
  static computeSignal(ctx: SignalContext, evolvedWeights?: ModelFactorWeights): SignalResult {
    const catalysts: string[] = [];
    const bullCase: string[] = [];
    const bearCase: string[] = [];
    const redFlags: string[] = [];
    const signalAgreementMap: Record<string, 'BULLISH' | 'BEARISH' | 'NEUTRAL'> = {
      technical: 'NEUTRAL',
      fundamental: 'NEUTRAL',
      sentiment: 'NEUTRAL'
    };

    // 1. Technical Score (Weight: 40%)
    let techScore = 50;
    if (ctx.technical) {
      techScore = ctx.technical.technicalScore;
      if (ctx.technical.trend === 'UPTREND') {
        catalysts.push('Strong Technical Uptrend');
        bullCase.push('Uptrend in progress');
        signalAgreementMap.technical = 'BULLISH';
      }
      if (ctx.technical.trend === 'DOWNTREND') {
        catalysts.push('Technical Downtrend');
        bearCase.push('Downtrend in progress');
        signalAgreementMap.technical = 'BEARISH';
      }
      if (ctx.technical.rsi14 < 30) {
        catalysts.push('RSI Oversold (Potential Rebound)');
        bullCase.push('Oversold conditions');
      }
      if (ctx.technical.rsi14 > 70) {
        catalysts.push('RSI Overbought (Correction Risk)');
        redFlags.push('Overbought RSI');
      }
      if (ctx.technical.patterns.includes('MACD_BULLISH_CROSSOVER')) catalysts.push('MACD Bullish Crossover');
    }

    // 2. Fundamental Score (Weight: 35%)
    let fundScore = 50;
    if (ctx.fundamental && ctx.fundamental.ratios) {
      const r = ctx.fundamental.ratios;
      const pe = parseFloat(r.stock_pe || '0');
      const roe = parseFloat(r.roe || '0');
      const roce = parseFloat(r.roce || '0');
      const de = parseFloat(r.debt_to_equity || '0');

      if (roce > 20) { fundScore += 15; catalysts.push(`High ROCE (${roce}%)`); bullCase.push('High capital efficiency'); signalAgreementMap.fundamental = 'BULLISH'; }
      else if (roce > 15) { fundScore += 10; }
      else if (roce > 0 && roce < 10) { fundScore -= 10; catalysts.push(`Low ROCE (${roce}%)`); bearCase.push('Inefficient capital use'); signalAgreementMap.fundamental = 'BEARISH'; }

      if (roe > 15) { fundScore += 10; catalysts.push(`Strong ROE (${roe}%)`); bullCase.push('Strong profitability'); }
      
      if (de > 2) { fundScore -= 15; catalysts.push(`High Debt/Equity (${de})`); redFlags.push('High leverage risk'); }
      else if (de < 0.5 && de >= 0) { fundScore += 10; catalysts.push('Low Debt Burden'); bullCase.push('Conservative balance sheet'); }

      if (pe > 0) {
        if (pe < 15) { fundScore += 10; catalysts.push('Attractive P/E Valuation'); bullCase.push('Value play'); }
        if (pe > 50) { fundScore -= 10; catalysts.push('Expensive P/E Valuation'); redFlags.push('High valuation'); }
      }

      fundScore = Math.max(0, Math.min(100, fundScore));
    }

    // 3. Sentiment Score (Weight: 15%)
    let sentScore = 50;
    if (ctx.sentiment) {
      sentScore = 50 + (ctx.sentiment.overallSentimentScore * 50);
      if (ctx.sentiment.overallSentimentScore > 0.5) {
        catalysts.push('Highly Positive News Sentiment');
        bullCase.push('Positive market sentiment');
        signalAgreementMap.sentiment = 'BULLISH';
      }
      if (ctx.sentiment.overallSentimentScore < -0.5) {
        catalysts.push('Negative News Sentiment');
        bearCase.push('Negative market sentiment');
        signalAgreementMap.sentiment = 'BEARISH';
      }
    }

    // 4. Portfolio Context (Weight: 10%)
    let ctxScore = 50;
    if (ctx.portfolio) {
      const pnl = ctx.portfolio.unrealized_pnl_pct;
      if (pnl > 50) { ctxScore -= 10; redFlags.push('Profit taking zone'); }
      else if (pnl < -20) { ctxScore += 10; bullCase.push('Accumulation opportunity'); }
    }

    // Use evolved weights from SelfLearningEngine if available, otherwise default percentages
    const techW = evolvedWeights ? evolvedWeights.technicalMomentumWeightPct / 100 : 0.40;
    const fundW = evolvedWeights ? evolvedWeights.fundamentalWeightPct / 100 : 0.35;
    const sentW = evolvedWeights ? evolvedWeights.newsSentimentWeightPct / 100 : 0.15;
    const ctxW  = evolvedWeights ? evolvedWeights.sectorRelativeStrengthWeightPct / 100 : 0.10;

    // Normalize weights to sum to 1.0 in case evolved weights don't perfectly balance
    const totalW = techW + fundW + sentW + ctxW;
    const normFactor = totalW > 0 ? 1.0 / totalW : 1.0;

    const compositeScore = ((techScore * techW) + (fundScore * fundW) + (sentScore * sentW) + (ctxScore * ctxW)) * normFactor;

    // Action thresholds: ordered from highest to lowest to eliminate dead zones
    let action: 'BUY' | 'HOLD' | 'SELL' | 'STRONG BUY' | 'STRONG SELL' | 'ADD_MORE' | 'REDUCE' = 'HOLD';
    if (compositeScore >= 80) action = 'STRONG BUY';
    else if (compositeScore >= 65) action = 'ADD_MORE';
    else if (compositeScore >= 50) action = 'BUY';
    else if (compositeScore >= 45) action = 'HOLD';
    else if (compositeScore >= 35) action = 'SELL';
    else if (compositeScore >= 20) action = 'REDUCE';
    else action = 'STRONG SELL';

    const diff = Math.abs(techScore - fundScore);
    const confidence: 'HIGH' | 'MEDIUM' | 'LOW' = diff < 20 ? 'HIGH' : (diff > 40 ? 'LOW' : 'MEDIUM');

    return {
      action,
      compositeScore: Math.round(compositeScore),
      confidence,
      breakdown: {
        technicalScore: Math.round(techScore),
        fundamentalScore: Math.round(fundScore),
        sentimentScore: Math.round(sentScore),
        contextScore: Math.round(ctxScore)
      },
      catalysts,
      bullCase,
      bearCase,
      redFlags,
      aiRationale: `Signal generated based on a ${Math.round(compositeScore)}/100 composite index, primarily driven by ${techScore > fundScore ? 'technical momentum' : 'fundamental strength'}.`,
      convictionLevel: compositeScore > 75 ? 'CRITICAL' : (compositeScore > 60 ? 'STRONG' : (compositeScore > 40 ? 'MODERATE' : 'WEAK')),
      signalAgreementMap
    };
  }
}
