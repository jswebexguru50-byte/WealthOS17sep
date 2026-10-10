import type { FactUnit } from '../domain/types.js';

/** Quality flag recorded on a fact whose value was rescaled to its canonical unit. */
export type UnitFlag = 'UNIT_CONVERTED' | 'UNIT_ASSUMED_CRORE';

export interface ConvertedValue {
  value: number;
  unit: FactUnit;
  /** Human-readable conversion formula; absent when the value passed through unchanged. */
  derivation?: string;
  /** Flag to attach to the fact when the value was really rescaled or assumed. */
  flag?: UnitFlag;
}

const RUPEES_PER_CRORE = 1e7;
const LAKH_PER_CRORE = 100;
const CRORE_LABELS = ['INR_CR', 'CRORE', 'CR'];
const LAKH_LABELS = ['LAKH', 'INR_LAKH'];
const PERCENT_LABELS = ['PERCENT', 'PERCENTAGE', '%'];
const FRACTION_LABELS = ['FRACTION', 'DECIMAL'];
const PER_SHARE_LABELS = ['INRPERSHARE', 'INR_PER_SHARE', 'INR PER SHARE'];
const MULTIPLE_LABELS = ['X', 'TIMES'];

/** Removes binary-float noise (0.07 * 100) without losing real precision. */
const clean = (value: number): number => Number(value.toPrecision(12));

/**
 * Converts a raw value with its unit label to the canonical unit family.
 * Money becomes INR crore; "INR" from a provider catalogued as crore is taken as crore and flagged.
 * @throws Error `UNIT_VALUE_NOT_FINITE` or `UNIT_UNSUPPORTED:<unit>`.
 */
export function convertUnit(value: number, unit: string, moneyAlreadyCrore = false): ConvertedValue {
  if (!Number.isFinite(value)) throw new Error('UNIT_VALUE_NOT_FINITE');
  const label = String(unit).trim().toUpperCase();
  if (label === 'INR' && moneyAlreadyCrore) {
    return {
      value, unit: 'INR_CR', flag: 'UNIT_ASSUMED_CRORE',
      derivation: 'provider INR token is explicitly catalogued as crore',
    };
  }
  if (CRORE_LABELS.includes(label)) return { value, unit: 'INR_CR' };
  if (label === 'INR') {
    return {
      value: value / RUPEES_PER_CRORE, unit: 'INR_CR', flag: 'UNIT_CONVERTED',
      derivation: 'INR / 10,000,000 = INR crore',
    };
  }
  if (LAKH_LABELS.includes(label)) {
    return {
      value: value / LAKH_PER_CRORE,
      unit: 'INR_CR', flag: 'UNIT_CONVERTED', derivation: 'lakh / 100 = INR crore',
    };
  }
  if (PERCENT_LABELS.includes(label)) return { value, unit: 'PCT' };
  if (FRACTION_LABELS.includes(label)) return { value, unit: 'RATIO' };
  if (label === 'SHARES') return { value, unit: 'SHARES' };
  if (PER_SHARE_LABELS.includes(label)) return { value, unit: 'INR_PER_SHARE' };
  if (label === 'DAYS') return { value, unit: 'DAYS' };
  if (MULTIPLE_LABELS.includes(label)) return { value, unit: 'X' };
  throw new Error(`UNIT_UNSUPPORTED:${unit}`);
}

/**
 * Aligns a converted value to the unit a metric is defined in. A fraction on a percent metric is
 * multiplied by 100 and the change is recorded; every other difference is a hard mismatch.
 * @throws Error `UNIT_MISMATCH:<from>-><to>`.
 */
export function alignToMetricUnit(converted: ConvertedValue, target: string): ConvertedValue {
  if (converted.unit === target) return converted;
  if (converted.unit === 'RATIO' && target === 'PCT') {
    return {
      value: clean(converted.value * 100), unit: 'PCT', flag: 'UNIT_CONVERTED',
      derivation: 'fraction x 100 = percent',
    };
  }
  throw new Error(`UNIT_MISMATCH:${converted.unit}->${target}`);
}

/**
 * True when two same-key values differ by at least `factor` (default 1000x), the signature of a
 * rupee/crore/thousand scale error. Zero, null and non-finite neighbours never trigger.
 */
export function flagMagnitudeSuspect(value: number, adjacent: number | null, factor = 1000): boolean {
  if (adjacent === null || !Number.isFinite(adjacent) || !Number.isFinite(value)) return false;
  const high = Math.max(Math.abs(value), Math.abs(adjacent));
  const low = Math.min(Math.abs(value), Math.abs(adjacent));
  return low > 0 && high / low >= factor;
}
