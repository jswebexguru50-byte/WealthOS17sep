import { DuckDbAdjustedOhlcvService, AdjustedOhlcvBar } from './DuckDbAdjustedOhlcvService.js';

export type SectorMomentumStatus = 'BULLISH' | 'NOT_BULLISH' | 'UNAVAILABLE';

export interface SectorMomentumSnapshot {
  sectorName: string | null;
  indexSymbol: string | null;
  asOf: string | null;
  status: SectorMomentumStatus;
  aboveEma20: boolean | null;
  aboveSma20: boolean | null;
  aboveSma50: boolean | null;
  aboveSma200: boolean | null;
  close: number | null;
  ema20: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  return5dPct: number | null;
  return20dPct: number | null;
  source: 'DUCKDB_ADJUSTED' | 'UNAVAILABLE';
}

export const SECTOR_INDEX_MAP: Readonly<Record<string, string>> = {
  BANK: 'NIFTY BANK', BANKING: 'NIFTY BANK', FINANCIAL: 'NIFTY FIN SERVICE', 'FINANCIAL SERVICES': 'NIFTY FIN SERVICE',
  IT: 'NIFTY IT', 'INFORMATION TECHNOLOGY': 'NIFTY IT', TECHNOLOGY: 'NIFTY IT', AUTO: 'NIFTY AUTO', AUTOMOBILE: 'NIFTY AUTO',
  PHARMA: 'NIFTY PHARMA', PHARMACEUTICALS: 'NIFTY PHARMA', HEALTHCARE: 'NIFTY PHARMA', FMCG: 'NIFTY FMCG',
  METAL: 'NIFTY METAL', METALS: 'NIFTY METAL', REALTY: 'NIFTY REALTY', 'REAL ESTATE': 'NIFTY REALTY',
  ENERGY: 'NIFTY ENERGY', 'OIL & GAS': 'NIFTY ENERGY', 'PSU BANK': 'NIFTY PSU BANK', 'PRIVATE BANK': 'NIFTY PRIVATE BANK',
  'BASIC MATERIALS': 'NIFTY METAL', INDUSTRIALS: 'NIFTY INFRA', INFRASTRUCTURE: 'NIFTY INFRA',
  'CONSUMER CYCLICAL': 'NIFTY CONSUMPTION', 'CONSUMER DEFENSIVE': 'NIFTY FMCG', CONSUMPTION: 'NIFTY CONSUMPTION',
  'COMMUNICATION SERVICES': 'NIFTY MEDIA', MEDIA: 'NIFTY MEDIA', UTILITIES: 'NIFTY ENERGY',
  'CEMENT AND CONSTRUCTION': 'NIFTY INFRA', 'CEMENT': 'NIFTY INFRA', 'CONSTRUCTION': 'NIFTY INFRA',
  'INDUSTRIAL & SPECIALTY GROWTH': 'NIFTY INFRA', 'CAPITAL GOODS': 'NIFTY INFRA',
  'TEXTILES APPARELS & ACCESSORIES': 'NIFTY CONSUMPTION', 'TEXTILES': 'NIFTY CONSUMPTION',
  'COMMERCIAL SERVICES & SUPPLIES': 'NIFTY INFRA'
};

function closes(bars: AdjustedOhlcvBar[]): number[] {
  return bars.map(b => Number(b.close_adjusted)).filter(Number.isFinite);
}

export function calculateSma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const tail = values.slice(-period);
  return tail.every(Number.isFinite) ? tail.reduce((a, b) => a + b, 0) / period : null;
}

export function calculateEma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const k = 2 / (period + 1);
  let ema = seed;
  for (const value of values.slice(period)) ema = value * k + ema * (1 - k);
  return Number.isFinite(ema) ? ema : null;
}

export function calculateRsi(values: number[], period: number = 14): number | null {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    let gain = diff > 0 ? diff : 0;
    let loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

export function calculateAtrPct(bars: AdjustedOhlcvBar[], period: number = 14): number | null {
  if (bars.length <= period) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high_adjusted;
    const low = bars[i].low_adjusted;
    const prevClose = bars[i - 1].close_adjusted;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }
  
  // Wilders smoothing for ATR
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  
  const lastClose = bars[bars.length - 1].close_adjusted;
  return lastClose > 0 ? (atr / lastClose) * 100 : null;
}

export function classifySectorMomentum(sectorName: string | null, bars: AdjustedOhlcvBar[] | null): SectorMomentumSnapshot {
  const normalized = sectorName?.trim().toUpperCase() || null;
  const indexSymbol = normalized ? SECTOR_INDEX_MAP[normalized] || null : null;
  const ordered = (bars || []).slice().sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));
  const values = closes(ordered);
  const close = values.length ? values[values.length - 1] : null;
  const ema20 = calculateEma(values, 20);
  const sma20 = calculateSma(values, 20);
  const sma50 = calculateSma(values, 50);
  const sma200 = calculateSma(values, 200);
  const rsi14 = calculateRsi(values, 14);
  
  const previous5 = values.length >= 6 ? values[values.length - 6] : null;
  const return5dPct = close !== null && previous5 !== null && previous5 !== 0 ? ((close / previous5) - 1) * 100 : null;
  
  const previous20 = values.length >= 21 ? values[values.length - 21] : null;
  const return20dPct = close !== null && previous20 !== null && previous20 !== 0 ? ((close / previous20) - 1) * 100 : null;
  
  const aboveEma20 = close !== null && ema20 !== null ? close > ema20 : null;
  const aboveSma20 = close !== null && sma20 !== null ? close > sma20 : null;
  const aboveSma50 = close !== null && sma50 !== null ? close > sma50 : null;
  const aboveSma200 = close !== null && sma200 !== null ? close > sma200 : null;
  
  const available = Boolean(indexSymbol && close !== null && ema20 !== null && sma20 !== null);
  
  let status: SectorMomentumStatus = 'UNAVAILABLE';
  if (available) {
    if (aboveEma20 && aboveSma20) status = 'BULLISH';
    else status = 'NOT_BULLISH';
  }

  return {
    sectorName: sectorName || null, indexSymbol, asOf: ordered.length ? String(ordered[ordered.length - 1].trade_date) : null,
    status,
    aboveEma20: available ? aboveEma20 : null, 
    aboveSma20: available ? aboveSma20 : null,
    aboveSma50: available ? aboveSma50 : null,
    aboveSma200: available ? aboveSma200 : null,
    close: available ? close : null, 
    ema20: available ? ema20 : null, 
    sma20: available ? sma20 : null,
    sma50: available ? sma50 : null,
    sma200: available ? sma200 : null,
    rsi14: available ? rsi14 : null,
    return5dPct: available ? return5dPct : null,
    return20dPct: available ? return20dPct : null, 
    source: available ? 'DUCKDB_ADJUSTED' : 'UNAVAILABLE'
  };
}

export class SectorMomentumService {
  static async getForSector(sectorName: string | null): Promise<SectorMomentumSnapshot> {
    const normalized = sectorName?.trim().toUpperCase() || null;
    const indexSymbol = normalized ? SECTOR_INDEX_MAP[normalized] || null : null;
    if (!indexSymbol) return classifySectorMomentum(sectorName, null);
    const bars = await DuckDbAdjustedOhlcvService.getDailyBars(indexSymbol, 60).catch(() => null);
    return classifySectorMomentum(sectorName, bars);
  }

  static async getUniverse(): Promise<SectorMomentumSnapshot[]> {
    const indexSymbols = [...new Set(Object.values(SECTOR_INDEX_MAP))];
    return Promise.all(indexSymbols.map(async (indexSymbol) => {
      const bars = await DuckDbAdjustedOhlcvService.getDailyBars(indexSymbol, 60).catch(() => null);
      return classifySectorMomentum(indexSymbol, bars);
    }));
  }
}
