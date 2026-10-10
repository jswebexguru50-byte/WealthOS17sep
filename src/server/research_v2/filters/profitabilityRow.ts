import type { Fact, PeriodType, Thresholds } from '../domain/index.js';
import { baseRow, compareToThreshold, unverifiable } from './compare.js';
import { quarterEndsBack } from './dates.js';
import { FactReader, staleReason } from './factReader.js';
import type { ScorecardInput, ScorecardRowDetail, ScorecardRowX } from './inputs.js';

const OWNERS = 'pat_attributable_to_owners';
const TOTAL = 'pat_total';
const WINDOW = 8;

/** PAT for one period: owners' share preferred, pat_total as flagged fallback. Null when neither exists. */
export function patFor(
  reader: FactReader, periodType: PeriodType, periodEnd: string,
): { fact: Fact; flags: string[] } | null {
  const owners = reader.one(OWNERS, periodType, periodEnd);
  if (owners) return { fact: owners, flags: [...owners.qualityFlags] };
  const total = reader.one(TOTAL, periodType, periodEnd);
  return total ? { fact: total, flags: ['PAT_TOTAL_FALLBACK', ...total.qualityFlags] } : null;
}

type QuarterPat = ScorecardRowDetail['quarterPats'][number];

/** Count of consecutive profitable quarters from the newest (list is newest first). */
export function consecutiveProfitable(pats: Array<number | null>): number {
  let n = 0;
  for (const pat of pats) {
    if (pat === null || !(pat > 0)) break;
    n += 1;
  }
  return n;
}

/**
 * Filter 2: consecutive profitable discrete quarters in the last 8 consecutive quarter-ends, one scope.
 * UNVERIFIABLE only when the 8 consecutive quarter-ends cannot all be established.
 */
export function profitabilityRow(input: ScorecardInput, reader: FactReader, t: Thresholds): ScorecardRowX {
  const row: ScorecardRowX = baseRow(2, 'Consecutive profitable quarters', 'quarters', t.profitableQuarters,
    'count of consecutive discrete quarters with PAT attributable to owners > 0, newest first (of 8)');
  const latest = reader.latestEnd([OWNERS, TOTAL], 'DISCRETE_Q');
  if (!latest) {
    return unverifiable(row, 'No discrete quarterly PAT available', { quartersAvailable: 0, quarterPats: [] });
  }
  const stale = staleReason(input, 'DISCRETE_Q', latest);
  if (stale) {
    return unverifiable(row, stale,
      { asOf: latest, scope: reader.scope, quartersAvailable: 0, quarterPats: [] });
  }
  const ends = quarterEndsBack(latest, WINDOW);
  const quarterPats: QuarterPat[] = ends.map(end => {
    const pat = patFor(reader, 'DISCRETE_Q', end);
    return { quarterEnd: end, pat: pat ? (pat.fact.valueCr as number) : null, metric: pat ? pat.fact.metric : null,
      flags: pat ? pat.flags : [] };
  });
  const available = quarterPats.filter(q => q.pat !== null).length;
  const common = { scope: reader.scope, asOf: latest, period: `${ends[WINDOW - 1]} to ${latest}`, quarterPats,
    quartersAvailable: available };
  const missing = quarterPats.filter(q => q.pat === null).map(q => q.quarterEnd);
  if (missing.length > 0) {
    return unverifiable(row, `Fewer than 8 consecutive discrete quarters: missing ${missing.join(', ')}`, common);
  }
  const observed = consecutiveProfitable(quarterPats.map(q => q.pat));
  const cmp = compareToThreshold(observed, t.profitableQuarters);
  const fallback = quarterPats.some(q => q.flags.includes('PAT_TOTAL_FALLBACK'));
  const derived = quarterPats.some(q => q.flags.some(f => f.includes('DERIVED')));
  const notes = [
    ...(fallback ? ['PAT total used for at least one quarter (owners share unavailable)'] : []),
    ...(derived ? ['At least one quarter is derived rather than directly reported'] : []),
  ];
  return {
    ...row, ...common, observed, gap: cmp.gap, status: cmp.status, basis: derived ? 'DERIVED' : 'OFFICIAL',
    sources: quarterPats.map(q => reader.one(q.metric as string, 'DISCRETE_Q', q.quarterEnd)!.factId),
    flags: [...new Set(quarterPats.flatMap(q => q.flags))], ...(notes.length ? { note: notes.join('; ') } : {}),
  };
}
