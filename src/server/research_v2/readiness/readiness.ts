import type { QuestionContract, SubQuestion } from '../domain/contract.js';
import type { ReadinessGapItem, ReadinessResult } from '../domain/readiness.js';
import type { CalcResult } from '../domain/calc.js';
import type { Fact, Scope } from '../domain/types.js';
import type { ResearchItem } from '../domain/research.js';

export interface ReadinessInput {
  facts: Fact[];
  calcs?: CalcResult[];
  researchItems?: ResearchItem[];
  asOf: string;
  scope?: Scope;
  /** Maximum age in days for the latest reported period; defaults to 550. */
  freshnessDays?: number;
  /** Minimum discrete quarters required by metric. */
  minimumDiscreteQuarters?: number;
}

const DAY = 86_400_000;
const REQUIRED_TIER: Record<string, Fact['sourceTier']> = { statutory: 'STATUTORY' };
const sourceRequiresDocuments = (sub: SubQuestion): boolean =>
  sub.sourceNeeds.some(s => ['FILING_DOCUMENT', 'ANNUAL_REPORT', 'CONCALL', 'WEB_PRIMARY'].includes(s));

function gap(input: string, reason: ReadinessGapItem['reason'], detail: string): ReadinessGapItem {
  return { input, reason, detail };
}

function fresh(f: Fact, asOf: number, maxAge: number): boolean {
  const end = Date.parse(f.periodEnd);
  return Number.isFinite(end) && end <= asOf && asOf - end <= maxAge * DAY;
}

/** Deterministically evaluates contract inputs without inventing facts or verdicts. */
export function assessSubQuestion(sub: SubQuestion, input: ReadinessInput): ReadinessResult {
  if (sub.appliesIn === 'OUT_OF_SCOPE') {
    return { subQuestionId: sub.id, state: 'NOT_APPLICABLE', satisfiedBy: [], gaps: [], premiseHolds: false, note: sub.outOfScopeReason };
  }
  const asOf = Date.parse(input.asOf);
  const maxAge = input.freshnessDays ?? 550;
  const facts = input.facts;
  const calcs = input.calcs ?? [];
  const research = input.researchItems ?? [];
  const satisfiedBy: string[] = [];
  const gaps: ReadinessGapItem[] = [];
  const scope = input.scope;
  for (const metric of sub.requiredMetrics) {
    const matching = facts.filter(f => f.metric === metric && (!scope || f.scope === scope) && !f.quarantined);
    if (!matching.length) { gaps.push(gap(metric, 'MISSING', 'No non-quarantined fact satisfies this metric and scope')); continue; }
    const usable = matching.filter(f => f.valueCr !== null);
    if (!usable.length) { gaps.push(gap(metric, 'UNRESOLVED_CONFLICT', 'Facts exist but none has a usable value')); continue; }
    const unitsValid = usable.every(f => Boolean(f.unit) && !f.qualityFlags.includes('UNIT_UNVALIDATED'));
    if (!unitsValid) { gaps.push(gap(metric, 'UNIT_UNVALIDATED', 'At least one candidate fact has an unvalidated unit')); continue; }
    const statutoryRequired = sub.sourceNeeds.includes('XBRL_FACTS');
    if (statutoryRequired && !usable.some(f => f.sourceTier === REQUIRED_TIER.statutory)) {
      gaps.push(gap(metric, 'TIER_TOO_LOW', 'A statutory fact is required for this input')); continue;
    }
    if (!usable.some(f => fresh(f, asOf, maxAge))) { gaps.push(gap(metric, 'STALE', `No fact is within ${maxAge} days of asOf`)); continue; }
    satisfiedBy.push(...usable.map(f => f.factId));
  }
  for (const calcId of sub.calcIds) {
    const calc = calcs.find(c => c.calcId === calcId || c.name === calcId);
    if (!calc) { gaps.push(gap(calcId, 'MISSING', 'Required calculation is absent')); continue; }
    if (calc.status !== 'OK' || calc.value === null) { gaps.push(gap(calcId, 'PREMISE_FAILED', calc.note || `Calculation status is ${calc.status}`)); continue; }
    satisfiedBy.push(calc.calcId);
  }
  if (sourceRequiresDocuments(sub)) {
    const docs = research.filter(r => r.status === 'VERIFIED' && r.tier === 'PRIMARY' && r.excerpt.trim().length > 0 && r.subQuestionIds.includes(sub.id));
    if (!docs.length) gaps.push(gap('filing_evidence', 'DOCUMENT_UNPARSED', 'No parsed primary document excerpt is linked to this sub-question'));
    else satisfiedBy.push(...docs.map(d => d.id));
  }
  let state: ReadinessResult['state'] = 'READY';
  if (gaps.length) state = satisfiedBy.length ? 'PARTIAL' : 'DATA_INSUFFICIENT';
  return { subQuestionId: sub.id, state, satisfiedBy: [...new Set(satisfiedBy)], gaps };
}

export function assessContract(contract: QuestionContract[], input: ReadinessInput): Record<string, ReadinessResult> {
  const out: Record<string, ReadinessResult> = {};
  for (const q of contract) for (const sub of q.subQuestions) out[sub.id] = assessSubQuestion(sub, input);
  return out;
}
