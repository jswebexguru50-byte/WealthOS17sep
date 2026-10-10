import type { Fact, Thresholds } from '../domain/index.js';
import { baseRow, clean, compareToThreshold, notApplicable, unverifiable } from './compare.js';
import { onOrBefore, shiftMonthEnd } from './dates.js';
import { FactReader, flowPeriodType, periodLabel, staleReason } from './factReader.js';
import type { ProviderRoce, ScorecardInput, ScorecardRowX } from './inputs.js';
import { patFor } from './profitabilityRow.js';

const pct = (numerator: number, denominator: number): number => clean((numerator / denominator) * 100);

/** Closing and opening (12 months earlier) point-in-time facts for one balance-sheet metric. */
function balance(reader: FactReader, metric: string, end: string): { close: Fact | null; open: Fact | null } {
  return {
    close: reader.one(metric, 'POINT_IN_TIME', end),
    open: reader.one(metric, 'POINT_IN_TIME', shiftMonthEnd(end, -12)),
  };
}

/** Provider ROCE usable at as-of: a value dated after the as-of instant is look-ahead and is ignored. */
function usableProviderRoce(input: ScorecardInput): ProviderRoce | null {
  const p = input.providerRoce;
  return p && Number.isFinite(p.value) && onOrBefore(p.asOf, input.asOf) ? p : null;
}

function crossCheckNote(input: ScorecardInput): string {
  const p = usableProviderRoce(input);
  return p ? `Provider ROCE ${p.value} (${p.source}, ${p.asOf}) is a cross-check only.` : '';
}

const join = (...parts: Array<string | undefined>): string => parts.filter(Boolean).join(' ');

/** Provider ROCE as value of last resort, labelled PROVIDER, when nothing can be derived or bounded. */
function providerOnly(input: ScorecardInput, row: ScorecardRowX, t: Thresholds, why: string): ScorecardRowX {
  const p = usableProviderRoce(input);
  if (!p) {
    const future = input.providerRoce && !onOrBefore(input.providerRoce.asOf, input.asOf);
    return unverifiable(row, future ? `${why}; provider ROCE is dated after the as-of instant` : why);
  }
  const cmp = compareToThreshold(p.value, t.roce);
  return {
    ...row, observed: p.value, gap: cmp.gap, status: cmp.status, basis: 'PROVIDER', asOf: p.asOf,
    scope: null, period: null, sources: [p.source],
    note: `Derivation not possible (${why}); provider value shown and labelled PROVIDER.`,
  };
}

/** Sum balances (equity + borrowings [+ lease]) at closing or opening date; null if any part is missing. */
function capitalEmployed(
  parts: Array<{ close: Fact | null; open: Fact | null }>, which: 'close' | 'open',
): number | null {
  const facts = parts.map(p => p[which]);
  return facts.every(f => f !== null) ? clean(facts.reduce((s, f) => s + (f!.valueCr as number), 0)) : null;
}

/**
 * Filter 3: ROCE = EBIT / average capital employed (EBIT = pbt_before_exceptional + finance_cost).
 * Without borrowings: UPPER_BOUND EBIT / equity (BELOW only when even the bound is below threshold).
 */
export function roceRow(input: ScorecardInput, reader: FactReader, t: Thresholds): ScorecardRowX {
  const row: ScorecardRowX = baseRow(3, 'ROCE', '%', t.roce,
    'EBIT / average capital employed; EBIT = pbt_before_exceptional + finance_cost');
  if (input.isFinancial) return notApplicable(row, 'Banks and NBFCs: ROCE is not meaningful');
  const type = flowPeriodType(input);
  const end = input.periodEnd ?? reader.latestEnd(['pbt_before_exceptional'], type);
  if (!end) return providerOnly(input, row, t, 'no pre-exceptional PBT for an annual/TTM period');
  const stale = input.periodEnd ? null : staleReason(input, type, end);
  if (stale) return providerOnly(input, row, t, stale);
  const pbt = reader.one('pbt_before_exceptional', type, end);
  const fin = reader.one('finance_cost', type, end);
  if (!pbt || !fin || pbt.periodStart !== fin.periodStart) {
    return providerOnly(input, row, t, `EBIT inputs incomplete or on different durations for ${end}`);
  }
  const ebit = clean((pbt.valueCr as number) + (fin.valueCr as number));
  const equity = balance(reader, 'equity_total', end);
  if (!equity.close) return providerOnly(input, row, t, `equity_total missing at ${end}`);
  const withLease = input.includeLeaseInCapitalEmployed === true;
  const debtParts = [
    balance(reader, 'borrowings_total', end),
    ...(withLease ? [balance(reader, 'lease_liabilities', end)] : []),
  ];
  const common = { scope: reader.scope, asOf: end, period: periodLabel(input, end) };
  const sources = [pbt.factId, fin.factId, equity.close.factId];
  const closeCe = capitalEmployed([equity, ...debtParts], 'close');
  const crossNote = crossCheckNote(input);
  const usable = usableProviderRoce(input);
  const crossCheck = usable ? { crossCheck: { basis: 'PROVIDER' as const, ...usable } } : {};

  if (closeCe !== null) {
    const openCe = capitalEmployed([equity, ...debtParts], 'open');
    const denominator = openCe === null ? closeCe : (closeCe + openCe) / 2;
    if (!(denominator > 0)) return unverifiable(row, 'Capital employed is not positive', common);
    const observed = pct(ebit, denominator);
    const cmp = compareToThreshold(observed, t.roce);
    return {
      ...row, ...common, ...crossCheck, observed, gap: cmp.gap, status: cmp.status, basis: 'DERIVED', sources,
      ...(openCe === null ? { flags: ['CLOSING_BALANCE'] } : {}),
      note: join(openCe === null ? 'Opening capital employed unavailable; closing balance used.' : '',
        withLease ? 'Capital employed includes lease liabilities (Ind AS 116 basis).' : '', crossNote),
    };
  }

  const denominator = equity.open ? ((equity.close.valueCr as number) + (equity.open.valueCr as number)) / 2
    : (equity.close.valueCr as number);
  if (!(denominator > 0)) return unverifiable(row, 'Equity is not positive; no upper bound possible', common);
  const bound = pct(ebit, denominator);
  const cmp = compareToThreshold(bound, t.roce);
  const failsEvenAtBound = cmp.status === 'BELOW_THRESHOLD';
  const reason = 'Borrowings (or leases) missing: only an upper bound EBIT/equity exists';
  const base = {
    ...row, ...common, ...crossCheck, observed: bound, gap: cmp.gap, basis: 'UPPER_BOUND' as const, sources,
    note: join(
      `Upper bound (EBIT / ${equity.open ? 'average' : 'closing'} equity); true ROCE is at most this.`,
      crossNote,
    ),
  };
  return failsEvenAtBound
    ? { ...base, status: 'BELOW_THRESHOLD' }
    : unverifiable(base, `${reason}; the bound does not rule out meeting the threshold`);
}

/**
 * Filter 4: ROE = PAT attributable to owners / average total equity; closing equity flagged
 * CLOSING_BALANCE when no opening balance exists.
 */
export function roeRow(input: ScorecardInput, reader: FactReader, t: Thresholds): ScorecardRowX {
  const row: ScorecardRowX = baseRow(4, 'ROE', '%', t.roe, 'PAT attributable to owners / average equity_total');
  const type = flowPeriodType(input);
  const end = input.periodEnd
    ?? reader.latestEnd(['pat_attributable_to_owners', 'pat_total'], type);
  if (!end) return unverifiable(row, 'No annual/TTM PAT available');
  const stale = input.periodEnd ? null : staleReason(input, type, end);
  if (stale) return unverifiable(row, stale, { asOf: end, scope: reader.scope });
  const pat = patFor(reader, type, end);
  if (!pat) return unverifiable(row, `PAT missing for ${end}`);
  const equity = balance(reader, 'equity_total', end);
  if (!equity.close) return unverifiable(row, `equity_total missing at ${end}`);
  const closing = (equity.close.valueCr as number);
  const denominator = equity.open ? (closing + (equity.open.valueCr as number)) / 2 : closing;
  if (!(denominator > 0)) return unverifiable(row, 'Equity is not positive; ROE not meaningful');
  const observed = pct(pat.fact.valueCr as number, denominator);
  const cmp = compareToThreshold(observed, t.roe);
  const flags = [...(equity.open ? [] : ['CLOSING_BALANCE']), ...(pat.flags.includes('PAT_TOTAL_FALLBACK')
    ? ['PAT_TOTAL_FALLBACK'] : [])];
  return {
    ...row, observed, gap: cmp.gap, status: cmp.status, basis: 'DERIVED', asOf: end,
    period: periodLabel(input, end), scope: reader.scope,
    sources: [pat.fact.factId, equity.close.factId, ...(equity.open ? [equity.open.factId] : [])], flags,
    ...(flags.length ? { note: join(flags.includes('CLOSING_BALANCE')
      ? 'Closing equity used (no opening balance), so ROE is understated versus average equity if equity grew.' : '',
    flags.includes('PAT_TOTAL_FALLBACK') ? 'PAT total used (owners share unavailable).' : '') } : {}),
  };
}

