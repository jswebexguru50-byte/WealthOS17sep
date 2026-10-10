import type { CalcResult, CalcStatus } from '../domain/calc.js';
import type { CalcEnv } from './env.js';

/** Round for display inside formula strings only; stored values are never rounded. */
export function fmt(value: number): string {
  return String(Number(value.toFixed(4)));
}

function base(
  env: CalcEnv, key: string, name: string, period: string, unit: string, status: CalcStatus,
): CalcResult {
  return {
    calcId: `${key}|${period}|${env.scope ?? 'NONE'}`,
    name,
    value: null,
    unit,
    period,
    scope: env.scope,
    inputs: [],
    formula: '',
    status,
    note: '',
  };
}

/** A successful calculation. A non-finite value is downgraded to NOT_APPLICABLE, never emitted. */
export function okResult(
  env: CalcEnv, key: string, name: string, period: string, unit: string,
  value: number, inputs: string[], formula: string, note = '',
): CalcResult {
  if (!Number.isFinite(value)) {
    return notApplicable(env, key, name, period, unit, inputs, formula, 'result is not finite');
  }
  const scopeNote = env.scope ? `scope ${env.scope}` : '';
  return {
    ...base(env, key, name, period, unit, 'OK'),
    value,
    inputs,
    formula,
    note: [scopeNote, note].filter(Boolean).join('; '),
  };
}

/** Inputs are missing: no value, the missing items are listed. */
export function insufficient(
  env: CalcEnv, key: string, name: string, period: string, unit: string, missing: string[], formula = '',
): CalcResult {
  const unique = [...new Set(missing)];
  return {
    ...base(env, key, name, period, unit, 'INSUFFICIENT_DATA'),
    formula,
    missing: unique,
    note: `missing: ${unique.join(', ')}`,
  };
}

/** Inputs exist but the measure is undefined (for example a non-positive base). */
export function notApplicable(
  env: CalcEnv, key: string, name: string, period: string, unit: string,
  inputs: string[], formula: string, note: string,
): CalcResult {
  return { ...base(env, key, name, period, unit, 'NOT_APPLICABLE'), inputs, formula, note };
}
