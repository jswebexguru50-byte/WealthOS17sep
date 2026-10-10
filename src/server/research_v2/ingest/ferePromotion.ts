import { createHash } from 'node:crypto';
import type { Fact, FactUnit, Scope } from '../domain/types.js';

/** A row exported from FERE's verified_metric table. This boundary is read-only. */
export interface VerifiedMetricRow {
  isin: string; symbol: string; metric: string; value: number | null; periodEnd: string;
  periodStart?: string | null; scope?: string | null; availableAt?: string | null;
  inputFactIds?: string[] | null; filingHashes?: string[] | null;
}
export interface PromotionResult { facts: Fact[]; rejected: Array<{ row: number; reason: string }> }

const UNITS: Record<string, FactUnit> = {
  beneish_m: 'RATIO', altman_z_public_manufacturing: 'RATIO', piotroski_f: 'X',
  sloan_accrual: 'RATIO', cash_conversion_cycle: 'DAYS', cfo_to_ebitda: 'RATIO',
};
const isinOk = (s: string) => /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(s);
const factId = (r: VerifiedMetricRow, i: number) => `FERE_VM_${createHash('sha256').update(JSON.stringify([r.isin,r.metric,r.periodEnd,r.value,i])).digest('hex').slice(0,24)}`;

/** Promote only a complete, verified formula result. Missing period/scope is rejected. */
export function promoteVerifiedMetrics(rows: VerifiedMetricRow[], asOf = new Date().toISOString()): PromotionResult {
  const facts: Fact[] = []; const rejected: PromotionResult['rejected'] = [];
  rows.forEach((r, i) => {
    const isin = (r.isin || '').trim().toUpperCase(); const symbol = (r.symbol || '').trim().toUpperCase();
    const scope = (r.scope || '').trim().toUpperCase(); const unit = UNITS[(r.metric || '').trim()];
    let reason: string | undefined;
    if (!symbol || !isinOk(isin)) reason = 'INVALID_IDENTITY';
    else if (!unit) reason = 'UNMAPPED_METRIC';
    else if (r.value === null || !Number.isFinite(r.value)) reason = 'INVALID_VALUE';
    else if (scope !== 'CONSOLIDATED' && scope !== 'STANDALONE') reason = 'INVALID_SCOPE';
    else if (!r.periodStart || !/^\d{4}-\d{2}-\d{2}$/.test(r.periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(r.periodEnd)) reason = 'MISSING_PERIOD_START';
    else if (Number.isNaN(Date.parse(r.periodStart)) || Number.isNaN(Date.parse(r.periodEnd))) reason = 'INVALID_PERIOD';
    else if (!r.inputFactIds?.length || !r.filingHashes?.length) reason = 'MISSING_PROVENANCE';
    const availableAt = r.availableAt || asOf;
    if (!reason && Number.isNaN(Date.parse(availableAt))) reason = 'INVALID_AVAILABLE_AT';
    if (reason) { rejected.push({ row: i, reason }); return; }
    facts.push({ factId: factId(r, i), isin, symbol, scope: scope as Scope, metric: r.metric, periodType: 'ANNUAL', periodStart: r.periodStart!, periodEnd: r.periodEnd, valueCr: r.value, unit, sourceTier: 'PROVIDER_VERIFIED', source: 'FERE', sourceRef: `verified_metric:${r.metric}:${r.periodEnd}`, availableAt: new Date(availableAt).toISOString(), vintage: 1, derivation: { formula: r.metric, inputs: r.inputFactIds! }, qualityFlags: ['FERE_VERIFIED_METRIC', 'FORMULA_RESULT'], quarantined: false });
  });
  return { facts, rejected };
}
