import re

with open('src/server/services/TechnicalAnalysisEngine.ts', 'r', encoding='utf-8') as f:
    content = f.read()

target1 = """  sma20: number;
  sma50: number;
  sma200: number;
  ema9: number;
  ema21: number;
  rsi14: number;"""

repl1 = """  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema9: number | null;
  ema21: number | null;
  rsi14: number | null;"""

target2 = """    // Compute moving averages & indicators
    const sma20 = SMA.calculate({ period: Math.min(20, closePrices.length), values: closePrices });
    const sma50 = SMA.calculate({ period: Math.min(50, closePrices.length), values: closePrices });
    const sma200 = SMA.calculate({ period: Math.min(200, closePrices.length), values: closePrices });
    
    const ema9 = EMA.calculate({ period: Math.min(9, closePrices.length), values: closePrices });
    const ema21 = EMA.calculate({ period: Math.min(21, closePrices.length), values: closePrices });"""

repl2 = """    // Compute moving averages & indicators only if sufficient data is available
    const sma20 = closePrices.length >= 20 ? SMA.calculate({ period: 20, values: closePrices }) : [];
    const sma50 = closePrices.length >= 50 ? SMA.calculate({ period: 50, values: closePrices }) : [];
    const sma200 = closePrices.length >= 200 ? SMA.calculate({ period: 200, values: closePrices }) : [];
    
    const ema9 = closePrices.length >= 9 ? EMA.calculate({ period: 9, values: closePrices }) : [];
    const ema21 = closePrices.length >= 21 ? EMA.calculate({ period: 21, values: closePrices }) : [];"""

target3 = """    const latestSma20 = sma20.length > 0 ? Number(sma20[sma20.length - 1].toFixed(2)) : latestClose;
    const latestSma50 = sma50.length > 0 ? Number(sma50[sma50.length - 1].toFixed(2)) : latestClose;
    const latestSma200 = sma200.length > 0 ? Number(sma200[sma200.length - 1].toFixed(2)) : latestClose;
    
    const latestEma9 = ema9.length > 0 ? Number(ema9[ema9.length - 1].toFixed(2)) : latestClose;
    const latestEma21 = ema21.length > 0 ? Number(ema21[ema21.length - 1].toFixed(2)) : latestClose;

    const latestRsi = rsi14.length > 0 ? Number(rsi14[rsi14.length - 1].toFixed(2)) : 50;"""

repl3 = """    const latestSma20 = sma20.length > 0 ? Number(sma20[sma20.length - 1].toFixed(2)) : null;
    const latestSma50 = sma50.length > 0 ? Number(sma50[sma50.length - 1].toFixed(2)) : null;
    const latestSma200 = sma200.length > 0 ? Number(sma200[sma200.length - 1].toFixed(2)) : null;
    
    const latestEma9 = ema9.length > 0 ? Number(ema9[ema9.length - 1].toFixed(2)) : null;
    const latestEma21 = ema21.length > 0 ? Number(ema21[ema21.length - 1].toFixed(2)) : null;

    const latestRsi = rsi14.length > 0 ? Number(rsi14[rsi14.length - 1].toFixed(2)) : null;"""

target4 = """    let trend: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS' = 'SIDEWAYS';
    if (latestClose > latestSma50 && latestSma50 > latestSma200) {
      trend = 'UPTREND';
    } else if (latestClose < latestSma50 && latestSma50 < latestSma200) {
      trend = 'DOWNTREND';
    }"""

repl4 = """    let trend: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS' = 'SIDEWAYS';
    if (latestSma50 !== null && latestSma200 !== null) {
      if (latestClose > latestSma50 && latestSma50 > latestSma200) {
        trend = 'UPTREND';
      } else if (latestClose < latestSma50 && latestSma50 < latestSma200) {
        trend = 'DOWNTREND';
      }
    }"""

content = content.replace(target1, repl1)
content = content.replace(target2, repl2)
content = content.replace(target3, repl3)
content = content.replace(target4, repl4)

with open('src/server/services/TechnicalAnalysisEngine.ts', 'w', encoding='utf-8') as f:
    f.write(content)
