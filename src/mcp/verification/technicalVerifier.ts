/**
 * Clean-Room Independent Technical Indicator Verifier Oracle
 * Master Developer Specification — Section AC
 */

import { VerificationComparison } from './xirrVerifier.js';

export function verifyTechnicalIndicatorOracle(
  indicatorName: string,
  rawBars: Array<{ close: number; high?: number; low?: number; volume?: number }>,
  productionResult: number | null,
  period: number = 20,
  tolerance: number = 0.05 // 0.05 unit tolerance
): VerificationComparison {
  if (!rawBars || rawBars.length < period) {
    return {
      productionResult,
      independentResult: null,
      difference: null,
      tolerance,
      status: 'INCONCLUSIVE',
      basis: `Insufficient raw bars (have ${rawBars?.length || 0}, require ${period})`,
      notes: 'Need at least period bars for technical verification'
    };
  }

  let independent: number | null = null;
  let basis = '';

  const closes = rawBars.map(b => b.close);

  switch (indicatorName.toUpperCase()) {
    case 'SMA': {
      const slice = closes.slice(-period);
      const sum = slice.reduce((acc, c) => acc + c, 0);
      independent = sum / period;
      basis = `Sum(last ${period} closes) / ${period}`;
      break;
    }

    case 'EMA': {
      const k = 2 / (period + 1);
      // Seed with initial SMA
      let ema = closes.slice(0, period).reduce((acc, c) => acc + c, 0) / period;
      for (let i = period; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
      }
      independent = ema;
      basis = `Standard EMA with multiplier k=2/(${period}+1)`;
      break;
    }

    case 'RSI': {
      // Wilder's RSI 14
      const rsiPeriod = period || 14;
      if (closes.length < rsiPeriod + 1) break;

      let gains = 0;
      let losses = 0;
      for (let i = 1; i <= rsiPeriod; i++) {
        const change = closes[i] - closes[i - 1];
        if (change >= 0) gains += change;
        else losses += Math.abs(change);
      }
      let avgGain = gains / rsiPeriod;
      let avgLoss = losses / rsiPeriod;

      for (let i = rsiPeriod + 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? Math.abs(change) : 0;
        avgGain = (avgGain * (rsiPeriod - 1) + gain) / rsiPeriod;
        avgLoss = (avgLoss * (rsiPeriod - 1) + loss) / rsiPeriod;
      }

      if (avgLoss === 0) {
        independent = 100;
      } else {
        const rs = avgGain / avgLoss;
        independent = 100 - (100 / (1 + rs));
      }
      basis = `Wilder's RSI(${rsiPeriod}) with smoothed exponential moving averages`;
      break;
    }

    default:
      return {
        productionResult,
        independentResult: null,
        difference: null,
        tolerance,
        status: 'INCONCLUSIVE',
        basis: `Unsupported indicator ${indicatorName}`,
        notes: 'Supported: SMA, EMA, RSI'
      };
  }

  if (independent === null || productionResult === null) {
    return {
      productionResult,
      independentResult: independent,
      difference: null,
      tolerance,
      status: 'INCONCLUSIVE',
      basis,
      notes: 'Failed to compute indicator from provided data'
    };
  }

  const diff = Math.abs(productionResult - independent);
  const status = diff <= tolerance ? 'MATCH' : 'DISCREPANCY';

  return {
    productionResult: Number(productionResult.toFixed(4)),
    independentResult: Number(independent.toFixed(4)),
    difference: Number(diff.toFixed(4)),
    tolerance,
    status,
    basis,
    notes: status === 'MATCH' ? 'Verified independent technical indicator' : 'Computed indicator deviates from production value'
  };
}
