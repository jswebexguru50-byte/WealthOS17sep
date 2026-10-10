import type { Bundle, CalcResult, Claim, Fact, ResearchItem, SubAnswer } from '../domain/index.js';
import { scanNumericTokens, tokenIsCovered, withinTolerance, DEFAULT_TOLERANCE } from './numberScan.js';
import {
  acceptableFactLabels, fiscalLabelsIn, normalizePeriodLabel, periodLabelMatchesFact, periodLabelsEqual,
} from './periodLabels.js';
import { verdictOf, type CheckVerdict, type Defect, type DefectCode, type DefectSeverity } from './types.js';

/** Options for the deterministic claim validator. */
export interface ClaimValidatorOptions {
  /** Relative tolerance for claim values (default 0.005 = 0.5 percent). */
  relativeTolerance?: number;
  /** Absolute tolerance for claim values (default 0.01). */
  absoluteTolerance?: number;
}

const UNIT_GROUPS: Array<[string, string[]]> = [
  ['INR_CR', ['INR_CR', 'CR', 'CRORE', 'CRORES', 'RSCR', 'INRCR', '₹CR']],
  ['PCT', ['PCT', '%', 'PERCENT', 'PERCENTAGE']],
  ['RATIO', ['RATIO', 'X', 'TIMES', '×']],
  ['SHARES', ['SHARES']],
  ['INR', ['INR', 'RS', '₹', 'RUPEES']],
  ['INR_PER_SHARE', ['INR_PER_SHARE', 'INR/SHARE', '₹/SHARE', 'RS/SHARE']],
  ['DAYS', ['DAYS', 'DAY']],
];

/** Canonical unit name; unknown units are returned upper-cased so they can still be compared. */
export function canonicalUnit(unit: string): string {
  const key = unit.trim().toUpperCase().replace(/\s+/g, '');
  const group = UNIT_GROUPS.find(([, names]) => names.includes(key));
  return group ? group[0] : key;
}

const BLOCKING: DefectSeverity = 'BLOCKING';

class DefectSink {
  readonly defects: Defect[] = [];

  add(code: DefectCode, answer: SubAnswer, claim: Claim | null, message: string, severity: DefectSeverity = BLOCKING): void {
    this.defects.push({
      code,
      severity,
      subQuestionId: answer.subQuestionId,
      claimId: claim?.claimId,
      message,
    });
  }
}

type Resolved =
  | { kind: 'FACT'; id: string; fact: Fact }
  | { kind: 'CALC'; id: string; calc: CalcResult }
  | { kind: 'RESEARCH'; id: string; item: ResearchItem };

function resolveRef(bundle: Bundle, ref: string): Resolved | null {
  const fact = bundle.facts[ref];
  if (fact) return { kind: 'FACT', id: ref, fact };
  const calc = bundle.calcs[ref];
  if (calc) return { kind: 'CALC', id: ref, calc };
  const item = bundle.researchItems.find(r => r.id === ref);
  return item ? { kind: 'RESEARCH', id: ref, item } : null;
}

function kindAllows(claimKind: Claim['kind'], refKind: Resolved['kind']): boolean {
  if (claimKind === 'INFERENCE') return true;
  if (claimKind === 'FACT') return refKind === 'FACT';
  if (claimKind === 'CALC') return refKind === 'CALC' || refKind === 'FACT';
  return refKind === 'RESEARCH' || refKind === 'FACT';
}

/** Evidence-quality rules for one fact. `inference` relaxes only the lead-tier rules. */
function checkFactQuality(fact: Fact, claim: Claim, answer: SubAnswer, sink: DefectSink): void {
  const inference = claim.kind === 'INFERENCE';
  if (fact.quarantined) sink.add('QUARANTINED_EVIDENCE', answer, claim, `Fact ${fact.factId} is quarantined`);
  if (fact.sourceTier === 'SIMULATED') sink.add('SIMULATED_EVIDENCE', answer, claim, `Fact ${fact.factId} is SIMULATED`);
  if (fact.qualityFlags.includes('PERIOD_RECON_FAIL')) {
    sink.add('RECON_FAILED_EVIDENCE', answer, claim, `Fact ${fact.factId} failed period reconciliation`);
  }
  const latest = fact.sourceTier === 'PROVIDER_LATEST' || fact.qualityFlags.some(f => f.startsWith('LATEST'));
  if (latest && !inference) {
    sink.add('LATEST_AS_STATUTORY', answer, claim, `Fact ${fact.factId} is a provider LATEST value, not statutory proof`);
  }
  if (fact.sourceTier === 'SECONDARY_LEAD' && !inference) {
    sink.add('SECONDARY_AS_STATUTORY', answer, claim, `Fact ${fact.factId} is a secondary lead; cite only as INFERENCE`);
  }
}

function checkResearchQuality(item: ResearchItem, claim: Claim, answer: SubAnswer, sink: DefectSink): void {
  if (item.status === 'REJECTED') sink.add('REJECTED_EVIDENCE', answer, claim, `Research item ${item.id} was rejected`);
  const lead = item.tier === 'SECONDARY' || item.status === 'UNVERIFIED_LEAD';
  if (lead && claim.kind !== 'INFERENCE') {
    sink.add('SECONDARY_AS_STATUTORY', answer, claim, `Research item ${item.id} is a secondary lead; cite only as INFERENCE`);
  }
}

/** Walks a calc's inputs; every input must exist and must itself pass the fact quality rules. */
function checkCalc(bundle: Bundle, calc: CalcResult, claim: Claim, answer: SubAnswer, sink: DefectSink): void {
  if (calc.status !== 'OK' || calc.value === null) {
    sink.add('UNSUPPORTED_CALC', answer, claim, `Calc ${calc.calcId} has status ${calc.status} and no usable value`);
    return;
  }
  if (!calc.formula.trim() || calc.inputs.length === 0) {
    sink.add('UNSUPPORTED_CALC', answer, claim, `Calc ${calc.calcId} lacks a formula or inputs`);
  }
  const seen = new Set<string>();
  const stack = [...calc.inputs];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const fact = bundle.facts[id];
    const inner = bundle.calcs[id];
    if (fact) checkFactQuality(fact, claim, answer, sink);
    else if (inner) stack.push(...inner.inputs);
    else sink.add('UNSUPPORTED_CALC', answer, claim, `Calc ${calc.calcId} input ${id} is not in the bundle`);
  }
}

interface RefValue {
  value: number;
  unit: string;
  scope: Fact['scope'] | null;
  periodOk: (label: string) => boolean;
}

function refValue(resolved: Resolved): RefValue | null {
  if (resolved.kind === 'FACT') {
    const { fact } = resolved;
    if (fact.valueCr === null) return null;
    return {
      value: fact.valueCr,
      unit: fact.unit,
      scope: fact.scope,
      periodOk: label => periodLabelMatchesFact(label, fact),
    };
  }
  if (resolved.kind === 'CALC') {
    const { calc } = resolved;
    if (calc.value === null) return null;
    return { value: calc.value, unit: calc.unit, scope: calc.scope, periodOk: label => periodLabelsEqual(label, calc.period) };
  }
  return null;
}

function excerptCovers(item: ResearchItem, value: number): boolean {
  const tokens = scanNumericTokens(item.excerpt);
  return tokens.some(t => tokenIsCovered(t, [value]));
}

function validateLabels(claim: Claim, match: RefValue, answer: SubAnswer, sink: DefectSink): void {
  if (!claim.unit) sink.add('MISSING_LABEL', answer, claim, 'Numeric claim has no unit');
  else if (canonicalUnit(claim.unit) !== canonicalUnit(match.unit)) {
    sink.add('UNIT_MISMATCH', answer, claim, `Claim unit ${claim.unit} differs from referenced unit ${match.unit}`);
  }
  if (!claim.period) sink.add('MISSING_LABEL', answer, claim, 'Numeric claim has no period');
  else if (!match.periodOk(claim.period)) {
    sink.add('PERIOD_MISMATCH', answer, claim, `Claim period ${claim.period} does not match the referenced period`);
  }
  if (match.scope !== null) {
    if (!claim.scope) sink.add('MISSING_LABEL', answer, claim, 'Numeric claim has no scope');
    else if (claim.scope !== match.scope) {
      sink.add('SCOPE_MISMATCH', answer, claim, `Claim scope ${claim.scope} differs from referenced scope ${match.scope}`);
    }
  }
}

function validateNumericClaim(
  claim: Claim,
  resolved: Resolved[],
  answer: SubAnswer,
  sink: DefectSink,
  tolerance: { relative: number; absolute: number },
): void {
  const value = claim.value as number;
  const numeric = resolved.map(r => ({ r, v: refValue(r) })).filter(x => x.v !== null) as Array<{ r: Resolved; v: RefValue }>;
  const matched = numeric.find(x => withinTolerance(value, x.v.value, tolerance));
  if (matched) {
    validateLabels(claim, matched.v, answer, sink);
    return;
  }
  const research = resolved.filter((r): r is Extract<Resolved, { kind: 'RESEARCH' }> => r.kind === 'RESEARCH');
  if (research.some(r => excerptCovers(r.item, value))) return;
  const nullRef = resolved.find(r => r.kind !== 'RESEARCH' && refValue(r) === null);
  if (nullRef && numeric.length === 0) {
    sink.add('NULL_VALUE_REF', answer, claim, `Referenced ${nullRef.id} has no value but the claim states ${value}`);
    return;
  }
  const shown = numeric.map(x => `${x.r.id}=${x.v.value}`).join(', ') || 'no numeric reference';
  sink.add('VALUE_MISMATCH', answer, claim, `Claim value ${value} is not within tolerance of ${shown}`);
}

function validateClaim(
  bundle: Bundle,
  claim: Claim,
  answer: SubAnswer,
  sink: DefectSink,
  tolerance: { relative: number; absolute: number },
): void {
  const resolved: Resolved[] = [];
  for (const ref of claim.refs) {
    const found = resolveRef(bundle, ref);
    if (!found) {
      sink.add('MISSING_REF', answer, claim, `Reference ${ref} does not exist in the bundle`);
      continue;
    }
    if (!kindAllows(claim.kind, found.kind)) {
      sink.add('REF_KIND_MISMATCH', answer, claim, `Claim kind ${claim.kind} cannot rest on ${found.kind} ${ref}`);
    }
    resolved.push(found);
    if (found.kind === 'FACT') checkFactQuality(found.fact, claim, answer, sink);
    else if (found.kind === 'CALC') checkCalc(bundle, found.calc, claim, answer, sink);
    else checkResearchQuality(found.item, claim, answer, sink);
  }
  if (typeof claim.value === 'number' && resolved.length === claim.refs.length && claim.refs.length > 0) {
    validateNumericClaim(claim, resolved, answer, sink, tolerance);
  } else if (typeof claim.value === 'number' && claim.refs.length === 0) {
    sink.add('CLAIM_WITHOUT_REFS', answer, claim, 'Numeric claim has no refs');
  }
}

function checkUnclaimedNumbers(answer: SubAnswer, sink: DefectSink): void {
  const values = answer.claims.filter(c => typeof c.value === 'number').map(c => c.value as number);
  const texts: Array<{ where: string; text: string }> = [{ where: 'narrative', text: answer.narrative }];
  answer.claims.forEach(c => texts.push({ where: `claim ${c.claimId} text`, text: c.text }));
  for (const { where, text } of texts) {
    for (const token of scanNumericTokens(text)) {
      if (!tokenIsCovered(token, values)) {
        sink.add('UNCLAIMED_NUMBER', answer, null, `Number "${token.raw}" in ${where} is not covered by any claim`);
      }
    }
  }
}

function addPeriodLabels(known: Set<string>, label: string): void {
  const normalized = normalizePeriodLabel(label);
  known.add(normalized);
  const fy = /FYd{2}/.exec(normalized);
  if (fy) known.add(fy[0]);
}

function knownPeriods(bundle: Bundle, answer: SubAnswer): Set<string> {
  const known = new Set<string>();
  for (const claim of answer.claims) {
    if (claim.period) addPeriodLabels(known, claim.period);
    for (const ref of claim.refs) {
      const fact = bundle.facts[ref];
      if (fact) acceptableFactLabels(fact).forEach(label => addPeriodLabels(known, label));
      const calc = bundle.calcs[ref];
      if (calc) addPeriodLabels(known, calc.period);
    }
  }
  return known;
}

function checkNarrativePeriods(bundle: Bundle, answer: SubAnswer, sink: DefectSink): void {
  const known = knownPeriods(bundle, answer);
  for (const label of fiscalLabelsIn(answer.narrative)) {
    if (!known.has(label)) {
      sink.add('PERIOD_LABEL_UNSUPPORTED', answer, null, `Narrative period ${label} matches no claim or referenced fact`, 'WARNING');
    }
  }
}

/**
 * Deterministic claim validation (spec 11.3). Every ref must exist; numeric values must equal the referenced
 * value within tolerance with matching unit, period and scope; quarantined, SIMULATED, LATEST and secondary-lead
 * evidence cannot be proof; numbers in the text must be claimed.
 * @param bundle frozen evidence bundle
 * @param answers draft answers to check
 * @param options tolerance overrides
 */
export function validateClaims(bundle: Bundle, answers: SubAnswer[], options: ClaimValidatorOptions = {}): CheckVerdict {
  const tolerance = {
    relative: options.relativeTolerance ?? DEFAULT_TOLERANCE.relative,
    absolute: options.absoluteTolerance ?? DEFAULT_TOLERANCE.absolute,
  };
  const sink = new DefectSink();
  const seenIds = new Set<string>();
  for (const answer of answers) {
    for (const claim of answer.claims) {
      if (seenIds.has(claim.claimId)) sink.add('DUPLICATE_CLAIM_ID', answer, claim, `Claim id ${claim.claimId} is reused`);
      seenIds.add(claim.claimId);
      validateClaim(bundle, claim, answer, sink, tolerance);
    }
    checkUnclaimedNumbers(answer, sink);
    checkNarrativePeriods(bundle, answer, sink);
  }
  return verdictOf(sink.defects);
}
