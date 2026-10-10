import type { Fact, Thresholds } from '../domain/index.js';
import { baseRow, clean, compareToThreshold, notApplicable, unverifiable } from './compare.js';
import { FactReader, flowPeriodType, periodLabel, staleReason } from './factReader.js';
import type { ScorecardInput, ScorecardRowX } from './inputs.js';

/** Metric holding lease principal repaid (positive outflow); used only for the Ind AS 116-adjusted ratio. */
export const LEASE_PRINCIPAL_METRIC = 'lease_principal_paid';

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

interface Ebitda { value: number; sources: string[]; periodStart: string; derived: boolean }

/**
 * EBITDA before exceptional items for a period: built from its pre-exceptional components, with a
 * stored ebitda_derived used only when components are missing (same order as calc/measures.ts, because
 * a stored value may have deducted exceptionals).
 */
function ebitdaFor(reader: FactReader, type: 'ANNUAL' | 'TTM', end: string): Ebitda | { missing: string } {
  const names = ['pbt_before_exceptional', 'finance_cost', 'depreciation_amortisation', 'other_income'];
  const facts = names.map(n => reader.one(n, type, end));
  const absent = names.filter((_, i) => facts[i] === null);
  if (absent.length) return storedEbitda(reader, type, end, absent);
  const [pbt, fin, dep, oi] = facts as Fact[];
  if (new Set(facts.map(f => f!.periodStart)).size > 1) {
    return { missing: 'EBITDA components have different durations' };
  }
  const value = clean(
    (pbt.valueCr as number) + (fin.valueCr as number) + (dep.valueCr as number) - (oi.valueCr as number),
  );
  return { value, sources: facts.map(f => f!.factId), periodStart: pbt.periodStart, derived: true };
}

/** Fallback: stored ebitda_derived when components are missing; otherwise report what is missing. */
function storedEbitda(
  reader: FactReader, type: 'ANNUAL' | 'TTM', end: string, absent: string[],
): Ebitda | { missing: string } {
  const stored = reader.one('ebitda_derived', type, end);
  if (!stored) return { missing: `ebitda_derived absent and components missing: ${absent.join(', ')}` };
  return { value: stored.valueCr as number, sources: [stored.factId], periodStart: stored.periodStart, derived: false };
}

/**
 * Filter 7: CFO / EBITDA on the same duration (FY or TTM), EBITDA before exceptional items.
 * Also reports a lease-adjusted ratio ((CFO - lease principal) / EBITDA) when lease data exists.
 */
export function cashflowRow(input: ScorecardInput, reader: FactReader, t: Thresholds): ScorecardRowX {
  const row: ScorecardRowX = baseRow(7, 'Operating cash-flow discipline', 'x', t.cfoToEbitda,
    'cfo / ebitda_derived on the same duration; ebitda = pbt_before_exceptional + finance_cost + '
    + 'depreciation_amortisation - other_income');
  if (input.isFinancial) {
    return notApplicable(row, 'Banks and NBFCs: EBITDA and operating cash flow are not comparable');
  }
  const type = flowPeriodType(input) as 'ANNUAL' | 'TTM';
  const end = input.periodEnd ?? reader.latestEnd(['cfo'], type);
  if (!end) return unverifiable(row, 'No annual/TTM operating cash flow available');
  const stale = input.periodEnd ? null : staleReason(input, type, end);
  if (stale) return unverifiable(row, stale, { asOf: end, scope: reader.scope });
  const cfo = reader.one('cfo', type, end);
  if (!cfo) return unverifiable(row, `cfo missing for ${end}`);
  const ebitda = ebitdaFor(reader, type, end);
  if ('missing' in ebitda) return unverifiable(row, ebitda.missing);
  if (ebitda.periodStart !== cfo.periodStart) {
    return unverifiable(row,
      `CFO (${cfo.periodStart}) and EBITDA (${ebitda.periodStart}) cover different durations`);
  }
  const common = { scope: reader.scope, asOf: end, period: periodLabel(input, end) };
  if (!(ebitda.value > 0)) {
    return unverifiable(row, `EBITDA is not positive (${ebitda.value}); ratio not meaningful`, common);
  }
  const cfoValue = cfo.valueCr as number;
  const observed = round3(cfoValue / ebitda.value);
  const cmp = compareToThreshold(observed, t.cfoToEbitda);
  const lease = reader.one(LEASE_PRINCIPAL_METRIC, type, end, cfo.periodStart);
  const adjusted = lease ? round3((cfoValue - (lease.valueCr as number)) / ebitda.value) : null;
  const notes = [
    `CFO ${cfoValue} / EBITDA ${ebitda.value}`
      + `${ebitda.derived ? ' (derived before exceptional items)' : ' (stored ebitda_derived; components missing)'}.`,
    ...(adjusted !== null ? [`Ind AS 116-adjusted (CFO less lease principal ${lease!.valueCr}) = ${adjusted}; `
      + 'unadjusted ratio is inflated for lessee-heavy businesses.'] : []),
  ];
  return {
    ...row, ...common, observed, gap: cmp.gap, status: cmp.status, basis: 'DERIVED',
    sources: [cfo.factId, ...ebitda.sources, ...(lease ? [lease.factId] : [])],
    leaseAdjustedRatio: adjusted, note: notes.join(' '),
  };
}
