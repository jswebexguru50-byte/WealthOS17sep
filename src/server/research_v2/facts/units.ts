import type { FactUnit } from '../domain/types.js';

export function convertUnit(value: number, unit: string, moneyAlreadyCrore = false): { value: number; unit: FactUnit; derivation?: string } {
  if (!Number.isFinite(value)) throw new Error('UNIT_VALUE_NOT_FINITE');
  const normalized = String(unit).trim().toUpperCase();
  if (moneyAlreadyCrore && normalized === 'INR') return { value, unit: 'INR_CR', derivation: 'provider INR token is explicitly catalogued as crore' };
  if (normalized === 'INR') return { value: value / 1e7, unit: 'INR_CR', derivation: 'INR / 10,000,000 = INR crore' };
  if (normalized === 'LAKH' || normalized === 'INR_LAKH') return { value: value / 1e5, unit: 'INR_CR', derivation: 'lakh / 100,000 = INR crore' };
  if (normalized === 'PERCENT' || normalized === '%') return { value, unit: 'PCT' };
  if (normalized === 'FRACTION' || normalized === 'DECIMAL') return { value, unit: 'RATIO' };
  if (normalized === 'SHARES') return { value, unit: 'SHARES' };
  if (normalized === 'DAYS') return { value, unit: 'DAYS' };
  if (normalized === 'X' || normalized === 'TIMES') return { value, unit: 'X' };
  throw new Error(`UNIT_UNSUPPORTED:${unit}`);
}

export function flagMagnitudeSuspect(value: number, adjacent: number | null, factor = 1000): boolean {
  return adjacent !== null && Number.isFinite(adjacent) && Math.abs(adjacent) > 0 && Math.abs(value / adjacent) > factor;
}
