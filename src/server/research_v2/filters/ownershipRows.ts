import type { ScorecardRow, Thresholds } from '../domain/index.js';
import { baseRow, clean, compareToThreshold, unverifiable } from './compare.js';
import { isQuarterEnd, onOrBefore, shiftMonthEnd } from './dates.js';
import type { InstitutionalPoint, PledgePoint, ScorecardInput, ScorecardRowX } from './inputs.js';

const validPct = (v: number | null): v is number => v !== null && Number.isFinite(v) && v >= 0 && v <= 100;

interface QuarterGroup<T> { quarterEnd: string; members: T[] }

/** Group points by quarter-end, ascending; every duplicate is kept so conflicts can be detected. */
function groupByQuarter<T extends { quarterEnd: string }>(points: T[]): Array<QuarterGroup<T>> {
  const map = new Map<string, T[]>();
  for (const p of points) map.set(p.quarterEnd, [...(map.get(p.quarterEnd) ?? []), p]);
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([quarterEnd, members]) => ({ quarterEnd, members }));
}

/** True when every duplicate in the group carries the same values (as judged by `signature`). */
function agrees<T>(members: T[], signature: (p: T) => unknown): boolean {
  const first = JSON.stringify(signature(members[0]));
  return members.every(p => JSON.stringify(signature(p)) === first);
}

/** Filter 1: latest official promoter holding, with no pledge-not-null condition. */
export function promoterRow(input: ScorecardInput, t: Thresholds): ScorecardRow {
  const row = baseRow(1, 'Promoter holding', '%', t.promoterPct, 'latest official promoter holding (quarter-end)');
  const point = input.ownership.promoterOfficial(input.asOf);
  if (!point) return unverifiable(row, 'No official promoter holding available at the as-of instant');
  if (!onOrBefore(point.quarterEnd, input.asOf)) {
    return unverifiable(row, `Promoter holding is dated ${point.quarterEnd}, after the as-of instant; not used`);
  }
  if (!validPct(point.value)) {
    return unverifiable(row, 'Official promoter holding is missing or outside 0-100', { asOf: point.quarterEnd });
  }
  const cmp = compareToThreshold(point.value, t.promoterPct);
  return {
    ...row, observed: point.value, gap: cmp.gap, status: cmp.status, basis: 'OFFICIAL',
    asOf: point.quarterEnd, period: point.quarterEnd, sources: [point.source],
  };
}

/** Explicit basis wins; otherwise a source named 'official' is OFFICIAL and anything else PROVIDER. */
const pledgeBasis = (p: PledgePoint): 'OFFICIAL' | 'PROVIDER' =>
  p.basis ?? (/official/i.test(p.source) ? 'OFFICIAL' : 'PROVIDER');

/** Filter 5: pledged % of promoter holding, latest dated non-null point; unknown is never zero. */
export function pledgeRow(input: ScorecardInput, t: Thresholds): ScorecardRow {
  const row = baseRow(5, 'Promoter pledge', '% of promoter holding', t.promoterPledge,
    'pledged shares / promoter shares, latest dated observation');
  const dated = input.ownership.pledgeSeries(input.asOf)
    .filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.quarterEnd) && onOrBefore(p.quarterEnd, input.asOf));
  const groups = groupByQuarter(dated);
  const known = groups.filter(g => g.members.some(p => p.pledgePct !== null));
  if (known.length === 0) return unverifiable(row, 'No dated pledge observation (official pledge is NULL)');
  const latestGroup = known[known.length - 1];
  if (!agrees(latestGroup.members, p => p.pledgePct)) {
    return unverifiable(row, `Conflicting pledge values for ${latestGroup.quarterEnd}; not chosen silently`,
      { asOf: latestGroup.quarterEnd });
  }
  const latest = latestGroup.members[0];
  if (!validPct(latest.pledgePct)) {
    return unverifiable(row, 'Pledge value is outside 0-100', { asOf: latest.quarterEnd });
  }
  const newest = groups[groups.length - 1];
  const stale = newest.quarterEnd > latest.quarterEnd
    ? `Newer pledge point ${newest.quarterEnd} has no value; showing ${latest.quarterEnd}.` : undefined;
  const cmp = compareToThreshold(latest.pledgePct, t.promoterPledge);
  return {
    ...row, observed: latest.pledgePct, gap: cmp.gap, status: cmp.status, basis: pledgeBasis(latest),
    asOf: latest.quarterEnd, period: latest.quarterEnd, sources: [latest.source],
    ...(stale ? { note: stale } : {}),
  };
}

const total = (p: InstitutionalPoint): number | null =>
  p.fii === null || p.diiOther === null || p.mutualFunds === null ? null : clean(p.fii + p.diiOther + p.mutualFunds);

const missingParts = (p: InstitutionalPoint): string[] => [
  ...(p.fii === null ? ['fii'] : []), ...(p.diiOther === null ? ['dii_other'] : []),
  ...(p.mutualFunds === null ? ['mutual_funds'] : []),
];

const instSignature = (p: InstitutionalPoint): unknown => [p.fii, p.diiOther, p.mutualFunds, p.basis];

/** Filter 6: FII + DII(other) + mutual funds at the latest quarter-end, plus QoQ change; info comparator. */
export function institutionalRow(input: ScorecardInput, t: Thresholds): ScorecardRowX {
  const row: ScorecardRowX = baseRow(6, 'Institutional participation', '%', t.institutional,
    'fii + dii_other + mutual_funds at quarter-end; QoQ = latest - prior quarter-end');
  const groups = groupByQuarter(input.ownership.institutionalAtQuarterEnds(input.asOf)
    .filter(p => isQuarterEnd(p.quarterEnd) && onOrBefore(p.quarterEnd, input.asOf)));
  if (groups.length === 0) return unverifiable(row, 'No quarter-end institutional holding available');
  const latestGroup = groups[groups.length - 1];
  if (!agrees(latestGroup.members, instSignature)) {
    return unverifiable(row, `Conflicting institutional values for ${latestGroup.quarterEnd}; not chosen silently`,
      { asOf: latestGroup.quarterEnd });
  }
  const latest = latestGroup.members[0];
  const level = total(latest);
  if (level === null) {
    const parts = missingParts(latest).join(', ');
    return unverifiable(row, `Institutional components missing at ${latest.quarterEnd}: ${parts}`,
      { asOf: latest.quarterEnd });
  }
  const priorGroup = groups.find(g => g.quarterEnd === shiftMonthEnd(latest.quarterEnd, -3));
  const priorConflict = priorGroup !== undefined && !agrees(priorGroup.members, instSignature);
  const prior = priorGroup && !priorConflict ? priorGroup.members[0] : undefined;
  const priorLevel = prior ? total(prior) : null;
  const qoq = priorLevel === null ? null : clean(level - priorLevel);
  const cmp = compareToThreshold(level, t.institutional);
  const qoqText = qoq !== null
    ? `QoQ change ${qoq >= 0 ? '+' : ''}${qoq} pp vs ${prior!.quarterEnd} (${priorLevel}%)`
    : priorConflict
      ? `QoQ change not available (conflicting prior quarter-end values at ${priorGroup!.quarterEnd})`
      : 'QoQ change not available (no complete prior quarter-end)';
  return {
    ...row, observed: level, gap: cmp.gap, status: cmp.status, basis: latest.basis, asOf: latest.quarterEnd,
    period: latest.quarterEnd, sources: [latest.source, ...(prior ? [prior.source] : [])], qoqChange: qoq,
    components: { fii: latest.fii, diiOther: latest.diiOther, mutualFunds: latest.mutualFunds },
    note: `Informational level (no threshold unless configured); ${qoqText}. Components FII ${latest.fii}, `
      + `DII other ${latest.diiOther}, mutual funds ${latest.mutualFunds}.`,
  };
}
