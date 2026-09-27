import { DuckDbAdjustedOhlcvService, AdjustedOhlcvBar } from './DuckDbAdjustedOhlcvService.js';

export type SectorMomentumStatus = 'BULLISH' | 'NOT_BULLISH' | 'UNAVAILABLE';

export interface SectorMomentumSnapshot {
  sectorName: string | null;
  indexSymbol: string | null;
  asOf: string | null;
  status: SectorMomentumStatus;
  aboveEma20: boolean | null;
  aboveSma20: boolean | null;
  close: number | null;
  ema20: number | null;
  sma20: number | null;
  return20dPct: number | null;
  source: 'DUCKDB_ADJUSTED' | 'UNAVAILABLE';
}

export const SECTOR_INDEX_MAP: Readonly<Record<string, string>> = {
  BANK: 'NIFTY BANK', BANKING: 'NIFTY BANK', FINANCIAL: 'NIFTY FIN SERVICE', 'FINANCIAL SERVICES': 'NIFTY FIN SERVICE',
  IT: 'NIFTY IT', 'INFORMATION TECHNOLOGY': 'NIFTY IT', AUTO: 'NIFTY AUTO', AUTOMOBILE: 'NIFTY AUTO',
  PHARMA: 'NIFTY PHARMA', PHARMACEUTICALS: 'NIFTY PHARMA', HEALTHCARE: 'NIFTY PHARMA', FMCG: 'NIFTY FMCG',
  METAL: 'NIFTY METAL', METALS: 'NIFTY METAL', REALTY: 'NIFTY REALTY', 'REAL ESTATE': 'NIFTY REALTY',
  ENERGY: 'NIFTY ENERGY', 'OIL & GAS': 'NIFTY ENERGY', 'PSU BANK': 'NIFTY PSU BANK', 'PRIVATE BANK': 'NIFTY PRIVATE BANK',
  'BASIC MATERIALS': 'NIFTY METAL', INDUSTRIALS: 'NIFTY INFRA', INFRASTRUCTURE: 'NIFTY INFRA',
  'CONSUMER CYCLICAL': 'NIFTY CONSUMPTION', 'CONSUMER DEFENSIVE': 'NIFTY FMCG', CONSUMPTION: 'NIFTY CONSUMPTION',
  'COMMUNICATION SERVICES': 'NIFTY MEDIA', MEDIA: 'NIFTY MEDIA', UTILITIES: 'NIFTY ENERGY'
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

export function classifySectorMomentum(sectorName: string | null, bars: AdjustedOhlcvBar[] | null): SectorMomentumSnapshot {
  const normalized = sectorName?.trim().toUpperCase() || null;
  const indexSymbol = normalized ? SECTOR_INDEX_MAP[normalized] || null : null;
  const ordered = (bars || []).slice().sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));
  const values = closes(ordered);
  const close = values.length ? values[values.length - 1] : null;
  const ema20 = calculateEma(values, 20);
  const sma20 = calculateSma(values, 20);
  const previous = values.length >= 21 ? values[values.length - 21] : null;
  const return20dPct = close !== null && previous !== null && previous !== 0 ? ((close / previous) - 1) * 100 : null;
  const aboveEma20 = close !== null && ema20 !== null ? close > ema20 : null;
  const aboveSma20 = close !== null && sma20 !== null ? close > sma20 : null;
  const available = Boolean(indexSymbol && close !== null && ema20 !== null && sma20 !== null);
  return {
    sectorName: sectorName || null, indexSymbol, asOf: ordered.length ? String(ordered[ordered.length - 1].trade_date) : null,
    status: available ? (aboveEma20 && aboveSma20 ? 'BULLISH' : 'NOT_BULLISH') : 'UNAVAILABLE',
    aboveEma20: available ? aboveEma20 : null, aboveSma20: available ? aboveSma20 : null,
    close: available ? close : null, ema20: available ? ema20 : null, sma20: available ? sma20 : null,
    return20dPct: available ? return20dPct : null, source: available ? 'DUCKDB_ADJUSTED' : 'UNAVAILABLE'
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
