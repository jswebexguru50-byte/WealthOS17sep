/**
 * AlphaArchitectQmomFilter.ts — v5.4.1 (Production Master)
 * Quantitative Momentum (QMOM) with Frog-in-the-Pan (Information Discreteness) Path Smoothness.
 * Grounded in Da, Gurun & Reicher (2014) & Wesley Gray / Jack Vogel (Alpha Architect).
 */

export interface DailyPriceBar {
  date: string;
  close: number;
}

export interface QmomScoreResult {
  symbol: string;
  rawReturn12_2Pct: number;
  informationDiscreteness: number; // Lower/Negative is smoother & indicative of steady institutional accumulation
  isHighQualityMomentum: boolean;
  convictionRankScore: number;
  notes: string;
}

export class AlphaArchitectQmomFilter {
  private static readonly MIN_12_2_RETURN = 0.20;  // 20.0% minimum 12-2 momentum hurdle
  private static readonly MAX_ID_THRESHOLD = -0.02; // Calibrated for Indian market daily volatility

  /**
   * Evaluates 12-2 month momentum and path smoothness.
   * ID = sign(PR12-2) * (% Negative Days - % Positive Days)
   */
  public static evaluateQmom(symbol: string, dailyPrices: DailyPriceBar[]): QmomScoreResult {
    if (!dailyPrices || dailyPrices.length < 240) {
      return {
        symbol,
        rawReturn12_2Pct: 0,
        informationDiscreteness: 0,
        isHighQualityMomentum: false,
        convictionRankScore: 0,
        notes: 'Insufficient trading history for 12-2 QMOM evaluation (minimum 240 bars required).'
      };
    }

    // Skip most recent 21 trading days (Month 1 reversal filter)
    const activeWindow = dailyPrices.slice(0, dailyPrices.length - 21);
    const startPrice = activeWindow[0].close;
    const endPrice = activeWindow[activeWindow.length - 1].close;

    if (startPrice <= 0) {
      return {
        symbol,
        rawReturn12_2Pct: 0,
        informationDiscreteness: 0,
        isHighQualityMomentum: false,
        convictionRankScore: 0,
        notes: 'Invalid price series data: non-positive start price.'
      };
    }

    const rawReturn12_2 = (endPrice - startPrice) / startPrice;
    const signPr = rawReturn12_2 >= 0 ? 1 : -1;

    let positiveDays = 0;
    let negativeDays = 0;

    for (let i = 1; i < activeWindow.length; i++) {
      const prev = activeWindow[i - 1].close;
      const curr = activeWindow[i].close;
      if (prev > 0) {
        const ret = (curr - prev) / prev;
        if (ret > 0) positiveDays++;
        else if (ret < 0) negativeDays++;
      }
    }

    const totalDays = activeWindow.length - 1;
    const pctPos = totalDays > 0 ? positiveDays / totalDays : 0;
    const pctNeg = totalDays > 0 ? negativeDays / totalDays : 0;

    // Information Discreteness metric
    const id = signPr * (pctNeg - pctPos);

    // High Quality Momentum: Return >= 20% AND smooth path (ID <= -0.02)
    const isHighQualityMomentum = rawReturn12_2 >= this.MIN_12_2_RETURN && id <= this.MAX_ID_THRESHOLD;

    // Conviction Rank: Higher smooth return yields higher conviction
    const convictionScore = Math.max(0, Math.min(100, Math.round((rawReturn12_2 * 80) - (id * 100))));

    return {
      symbol,
      rawReturn12_2Pct: Math.round(rawReturn12_2 * 1000) / 10,
      informationDiscreteness: Math.round(id * 1000) / 1000,
      isHighQualityMomentum,
      convictionRankScore: convictionScore,
      notes: isHighQualityMomentum
        ? `Persistent Institutional Accumulation: 12-2 Return +${(rawReturn12_2 * 100).toFixed(1)}% with smooth trend (ID: ${id.toFixed(3)}).`
        : `Jumpy or Insufficient Momentum: 12-2 Return ${(rawReturn12_2 * 100).toFixed(1)}%, ID ${id.toFixed(3)}.`
    };
  }
}
