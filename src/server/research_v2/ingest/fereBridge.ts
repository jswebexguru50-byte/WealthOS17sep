import { createHash } from 'node:crypto';
import type { Fact, FactUnit, Scope, SourceTier } from '../domain/types.js';

/** Stable, read-only boundary for FERE exports. It never opens or writes the portfolio DB. */
export interface FereExportRow {
  symbol: string; isin: string; metric: string; value: number | null; unit: string;
  periodEnd: string; periodStart?: string | null; scope?: string | null;
  sourceRef?: string | null; retrievedAt?: string | null; evidenceId?: string | null;
}
export interface FereBridgeResult { facts: Fact[]; rejected: Array<{ row: number; reason: string }>; }
const METRICS: Record<string, { metric: string; unit: FactUnit }> = {
  revenue: { metric: 'revenue', unit: 'INR_CR' }, operating_profit: { metric: 'operating_profit', unit: 'INR_CR' },
  pat: { metric: 'pat', unit: 'INR_CR' }, total_assets: { metric: 'total_assets', unit: 'INR_CR' },
  total_borrowings: { metric: 'total_borrowings', unit: 'INR_CR' }, roe_pct: { metric: 'roe_pct', unit: 'PCT' },
  roce_pct: { metric: 'roce_pct', unit: 'PCT' }, promoter_holding_pct: { metric: 'promoter_holding_pct', unit: 'PCT' },
  pe_ratio: { metric: 'pe_ratio', unit: 'RATIO' }, debt_equity: { metric: 'debt_equity', unit: 'RATIO' },
};
const ALIASES: Record<string,string> = { 'net_profit':'pat', 'profit_after_tax':'pat', 'revenue_growth':'revenue', 'roe':'roe_pct', 'roce':'roce_pct', 'debt_to_equity':'debt_equity' };
const units: Record<string, FactUnit> = { INR_CR:'INR_CR', CR:'INR_CR', PCT:'PCT', PERCENT:'PCT', RATIO:'RATIO', X:'X', INR_PER_SHARE:'INR_PER_SHARE' };
const validIsin = (v:string) => /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(v);
function factId(row:FereExportRow, i:number) { return `FERE_${createHash('sha256').update(JSON.stringify([row.symbol,row.isin,row.metric,row.periodEnd,row.scope,row.value,i])).digest('hex').slice(0,24)}`; }
export function bridgeFereExport(rows: FereExportRow[], asOf = new Date().toISOString()): FereBridgeResult {
  const facts: Fact[] = []; const rejected: FereBridgeResult['rejected'] = [];
  rows.forEach((r,i) => { const reason = (() => {
    const symbol=(r.symbol||'').trim().toUpperCase(), isin=(r.isin||'').trim().toUpperCase();
    if (!symbol || !validIsin(isin)) return 'INVALID_IDENTITY';
    const def=METRICS[ALIASES[(r.metric||'').trim().toLowerCase()] || (r.metric||'').trim().toLowerCase()]; if (!def) return 'UNMAPPED_METRIC';
    if (r.value === null || !Number.isFinite(r.value)) return 'INVALID_VALUE';
    const scope=(r.scope||'').toUpperCase(); if (scope !== 'CONSOLIDATED' && scope !== 'STANDALONE') return 'INVALID_SCOPE';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.periodEnd) || Number.isNaN(Date.parse(r.periodEnd))) return 'INVALID_PERIOD';
    const unit=units[(r.unit||'').toUpperCase()]; if (unit && unit !== def.unit) return 'UNIT_MISMATCH';
    const availableAt=r.retrievedAt || asOf; if (Number.isNaN(Date.parse(availableAt))) return 'INVALID_AVAILABLE_AT';
    facts.push({ factId:factId(r,i), isin, symbol, scope:scope as Scope, metric:def.metric, periodType:'POINT_IN_TIME', periodStart:r.periodStart || r.periodEnd, periodEnd:r.periodEnd, valueCr:r.value, unit:def.unit, sourceTier:'PROVIDER_VERIFIED' as SourceTier, source:'FERE', sourceRef:r.sourceRef || r.evidenceId || `fere-export-row-${i+1}`, availableAt:new Date(availableAt).toISOString(), vintage:1, qualityFlags:['FERE_EXPORT','UNREVIEWED_PERIOD_CLASSIFICATION'], quarantined:false }); return null;
  })(); if (reason) rejected.push({row:i,reason}); }); return { facts, rejected }; }
