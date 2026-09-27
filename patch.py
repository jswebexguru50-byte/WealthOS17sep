import re

with open('src/server/services/OpportunityScannerEngine.ts', 'r', encoding='utf-8') as f:
    content = f.read()

target = """    // Extract Fundamental Scores & Sector Z-Score
    let roce = 0.0;
    let pe = 0.0;
    let debt = 0.0;
    let margin = 0.0;

    if (screener?.ratios) {
      roce = screener.ratios.roce ? (parseFloat(screener.ratios.roce.replace(/[^\\d.]/g, '')) || 0) : 0.0;
      pe = screener.ratios.stock_pe ? (parseFloat(screener.ratios.stock_pe.replace(/[^\\d.]/g, '')) || 0) : 0.0;
      debt = screener.ratios.debt_to_equity ? (parseFloat(screener.ratios.debt_to_equity.replace(/[^\\d.]/g, '')) || 0) : 0.0;
    }


    const { zScore, fundScore } = computeSectorZScore(pe, roce, debt, sector);

    // Extract Technical Scores
    let rsi = snap?.rsi14 ?? 55.0;
    let isSqueeze = (snap?.bbBandwidth ?? 10) <= weights.minBandwidthThresholdPct;
    let isVolBreakout = (snap?.relativeVolume ?? 1) >= 1.5;
    let trend = (snap?.close ?? cmp) > (snap?.ema50 ?? cmp * 0.98) ? 'STRONG_UPTREND' : (rsi < 40 ? 'DOWNTREND' : 'CONSOLIDATION');

    const isRsiOptimal = (rsi >= weights.rsiOversoldBoundary && rsi <= weights.rsiOverboughtBoundary);
    const techScore = isRsiOptimal ? 88 : (rsi > weights.rsiOverboughtBoundary ? 68 : (rsi < 35 ? 42 : 60));
    const bollScore = isSqueeze ? 92 : (snap?.bbBandwidth && snap.bbBandwidth < 9 ? 80 : 65);
    const volScore = isVolBreakout ? 92 : 68;

    // Delivery Surge & Relative Strength
    const deliverySurge = Number(((isVolBreakout ? 1.6 : 1.1) * (rsi > 55 ? 1.2 : 0.95)).toFixed(2));
    const deliveryScore = deliverySurge >= 1.4 ? 90 : (deliverySurge >= 1.1 ? 75 : 45);
    const rsNifty = Number(((rsi - 50) * 0.8 + 6.5).toFixed(1));
    const rsScore = rsNifty > 10 ? 90 : (rsNifty > 0 ? 75 : 45);
    const newsScore = 75;"""

replacement = """    // Extract Fundamental Scores & Sector Z-Score
    const roce = screener?.ratios?.roce ? parseFloat(screener.ratios.roce.replace(/[^\\d.]/g, '')) : null;
    const pe = screener?.ratios?.stock_pe ? parseFloat(screener.ratios.stock_pe.replace(/[^\\d.]/g, '')) : null;
    const debt = screener?.ratios?.debt_to_equity ? parseFloat(screener.ratios.debt_to_equity.replace(/[^\\d.]/g, '')) : null;

    const { zScore, fundScore } = computeSectorZScore(pe, roce, debt, sector);

    // Extract Technical Scores
    let rsi = snap?.rsi14 ?? null;
    let bandwidth = snap?.bbBandwidth ?? null;
    let relVol = snap?.relativeVolume ?? null;

    const mandatory = {
      pe_ratio: pe ?? null,
      roce_pct: roce ?? null,
      debt_to_equity: debt ?? null,
      rsi14: rsi ?? null,
      bbBandwidth: bandwidth ?? null,
      relativeVolume: relVol ?? null,
    };

    const missing = Object.entries(mandatory)
      .filter(([, value]) => value == null || Number.isNaN(value as number))
      .map(([key]) => key);

    if (missing.length) {
      return {
        securityId: `SEC_${symbol}_NSE`,
        candidateId: `CAND_${symbol}_${Date.now()}`,
        symbol,
        companyName,
        cmp,
        status: 'DATA_INSUFFICIENT',
        missingFactors: missing,
        compositeScore: null,
        probabilityPct: null,
        actionDirective: 'HOLD',
        strategyCategory: 'VALUE_COMPOUNDER',
        targetPrice: null,
        stopLossPrice: null,
        upsidePotentialPct: null,
        downsideRiskPct: null,
        riskRewardRatio: null,
        bullishProbabilityPct: null,
        confidenceLevel: 'LOW',
        portfolioVerdict: null,
        recommendationDate: new Date().toISOString().split('T')[0],
      } as any;
    }

    let isSqueeze = bandwidth! <= weights.minBandwidthThresholdPct;
    let isVolBreakout = relVol! >= 1.5;
    let trend = (snap?.close ?? cmp) > (snap?.ema50 ?? cmp * 0.98) ? 'STRONG_UPTREND' : (rsi! < 40 ? 'DOWNTREND' : 'CONSOLIDATION');

    const isRsiOptimal = (rsi! >= weights.rsiOversoldBoundary && rsi! <= weights.rsiOverboughtBoundary);
    const techScore = isRsiOptimal ? 88 : (rsi! > weights.rsiOverboughtBoundary ? 68 : (rsi! < 35 ? 42 : 60));
    const bollScore = isSqueeze ? 92 : (bandwidth! < 9 ? 80 : 65);
    const volScore = isVolBreakout ? 92 : 68;

    // Delivery Surge & Relative Strength
    const deliverySurge = Number(((isVolBreakout ? 1.6 : 1.1) * (rsi! > 55 ? 1.2 : 0.95)).toFixed(2));
    const deliveryScore = deliverySurge >= 1.4 ? 90 : (deliverySurge >= 1.1 ? 75 : 45);
    const rsNifty = Number(((rsi! - 50) * 0.8 + 6.5).toFixed(1));
    const rsScore = rsNifty > 10 ? 90 : (rsNifty > 0 ? 75 : 45);
    const newsScore = 75;"""

content = content.replace(target, replacement)
with open('src/server/services/OpportunityScannerEngine.ts', 'w', encoding='utf-8') as f:
    f.write(content)
