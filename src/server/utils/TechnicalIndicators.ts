/**
 * Shared utility module for technical indicators
 *
 * This module contains utilities that were previously duplicated across
 * multiple services (TechnicalAnalysisEngine, TechnicalMomentumEngine, etc.)
 *
 * All consumers should import from this shared module instead of importing
 * from legacy service implementations.
 */

/**
 * Calculate Relative Strength Index (RSI)
 * Moved from TechnicalAnalysisEngine.calculateRSI()
 */
export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 0;

  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period - 1; i < prices.length - 1; i++) {
    const change = prices[i + 1] - prices[i];
    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Calculate Exponential Moving Average (EMA)
 * Shared utility for momentum and technical analysis
 */
export function calculateEMA(prices: number[], period: number): number[] {
  const multiplier = 2 / (period + 1);
  const ema: number[] = [];

  if (prices.length === 0) return ema;

  // First EMA is SMA
  let sum = 0;
  for (let i = 0; i < Math.min(period, prices.length); i++) {
    sum += prices[i];
  }
  ema[period - 1] = sum / Math.min(period, prices.length);

  // Subsequent EMAs
  for (let i = period; i < prices.length; i++) {
    ema[i] = (prices[i] - ema[i - 1]) * multiplier + ema[i - 1];
  }

  return ema;
}

/**
 * Calculate Simple Moving Average (SMA)
 */
export function calculateSMA(prices: number[], period: number): number[] {
  const sma: number[] = [];

  for (let i = period - 1; i < prices.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += prices[i - j];
    }
    sma.push(sum / period);
  }

  return sma;
}
