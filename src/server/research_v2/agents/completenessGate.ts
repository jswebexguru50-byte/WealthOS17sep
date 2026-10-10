import type { Bundle, ReadinessResult, SubAnswer, SubQuestion } from '../domain/index.js';
import { verdictOf, type CheckVerdict, type Defect, type DefectCode, type DefectSeverity } from './types.js';

const TERMINAL = new Set(['ANSWERED', 'PARTIAL', 'NOT_DISCLOSED', 'NOT_APPLICABLE']);

/** Wording that would turn a fundamental write-up into a recommendation, rating or overall verdict. */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /\bstrong\s+(?:buy|sell)\b/i,
  /\brecommend(?:s|ed|ation)?\s+(?:to\s+)?(?:a\s+)?(?:buy|sell|hold|accumulate)\b/i,
  /\b(?:price|target)\s+(?:target|price)\b/i,
  /\b(?:buy|sell|hold|accumulate)\s+(?:rating|call|signal)\b/i,
  /\brating\s+of\s+(?:buy|sell|hold)\b/i,
  /\b(?:overweight|underweight|outperform|underperform)\b/i,
  /\boverall\s+(?:pass|fail)\b/i,
];

function defect(
  code: DefectCode,
  subQuestionId: string,
  message: string,
  severity: DefectSeverity = 'BLOCKING',
): Defect {
  return { code, severity, subQuestionId, message };
}

const blank = (text: string | undefined): boolean => !text || !text.trim();

function checkStateFields(answer: SubAnswer, sub: SubQuestion | undefined, out: Defect[]): void {
  const id = answer.subQuestionId;
  switch (answer.state) {
    case 'ANSWERED':
      if (!answer.claims.some(c => c.refs.length > 0)) {
        out.push(defect('ANSWERED_WITHOUT_CLAIMS', id, 'ANSWERED requires at least one claim with refs'));
      }
      break;
    case 'PARTIAL':
      if (blank(answer.gap) || blank(answer.nextAction)) {
        out.push(defect('PARTIAL_WITHOUT_GAP', id, 'PARTIAL requires both gap and nextAction'));
      }
      break;
    case 'NOT_DISCLOSED':
      if (!answer.sourcesSearched || answer.sourcesSearched.length === 0) {
        out.push(defect('NOT_DISCLOSED_WITHOUT_SOURCES', id, 'NOT_DISCLOSED requires sourcesSearched'));
      }
      break;
    case 'NOT_APPLICABLE':
      checkNotApplicable(answer, sub, out);
      break;
    default:
      break;
  }
}

function checkNotApplicable(answer: SubAnswer, sub: SubQuestion | undefined, out: Defect[]): void {
  const id = answer.subQuestionId;
  const outOfScope = sub?.appliesIn === 'OUT_OF_SCOPE';
  if (outOfScope) {
    const reason = (sub?.outOfScopeReason ?? '').trim().toLowerCase();
    const text = `${answer.narrative} ${answer.premiseCheck?.note ?? ''}`.toLowerCase();
    if (!answer.premiseCheck && !(reason && text.includes(reason))) {
      out.push(defect('NA_WITHOUT_PREMISE_CHECK', id, 'NOT_APPLICABLE needs premiseCheck or the out-of-scope reason'));
    }
    return;
  }
  if (!answer.premiseCheck || blank(answer.premiseCheck.note)) {
    out.push(defect('NA_WITHOUT_PREMISE_CHECK', id, 'NOT_APPLICABLE needs a premiseCheck with a note'));
  } else if (answer.premiseCheck.holds) {
    out.push(defect('NA_PREMISE_HOLDS', id, 'NOT_APPLICABLE is invalid when the premise check says the premise holds'));
  }
  if (sub && !sub.premise) {
    out.push(defect('NA_NOT_ALLOWED', id, 'This sub-question declares no premise; confirm NOT_APPLICABLE', 'WARNING'));
  }
}

function checkReadiness(answer: SubAnswer, readiness: ReadinessResult | undefined, out: Defect[]): void {
  if (!readiness) return;
  const id = answer.subQuestionId;
  if (answer.state === 'ANSWERED' && readiness.state === 'DATA_INSUFFICIENT') {
    out.push(defect('ANSWER_CONTRADICTS_READINESS', id, 'ANSWERED although the bundle readiness is DATA_INSUFFICIENT'));
  }
  if ((answer.state === 'PARTIAL' || answer.state === 'NOT_DISCLOSED') && readiness.state === 'READY') {
    out.push(defect('ANSWER_CONTRADICTS_READINESS', id, `${answer.state} although readiness is READY`, 'WARNING'));
  }
}

function checkForbiddenLanguage(answer: SubAnswer, out: Defect[]): void {
  const text = [answer.narrative, ...answer.claims.map(c => c.text)].join(' \n ');
  for (const pattern of FORBIDDEN_PATTERNS) {
    const hit = pattern.exec(text);
    if (hit) out.push(defect('FORBIDDEN_LANGUAGE', answer.subQuestionId, `Recommendation or verdict wording: "${hit[0]}"`));
  }
}

function checkDuplicateNarratives(answers: SubAnswer[], out: Defect[]): void {
  const seen = new Map<string, string>();
  for (const answer of answers) {
    const key = answer.narrative.toLowerCase().replace(/\s+/g, ' ').trim();
    if (key.length < 40) continue;
    const first = seen.get(key);
    if (first) out.push(defect('DUPLICATE_NARRATIVE', answer.subQuestionId, `Narrative repeats ${first}`, 'WARNING'));
    else seen.set(key, answer.subQuestionId);
  }
}

function checkCoverage(answers: SubAnswer[], contract: SubQuestion[], out: Defect[]): Map<string, SubAnswer> {
  const byId = new Map<string, SubAnswer>();
  const known = new Set(contract.map(s => s.id));
  for (const answer of answers) {
    if (byId.has(answer.subQuestionId)) out.push(defect('DUPLICATE_ANSWER', answer.subQuestionId, 'More than one answer'));
    else byId.set(answer.subQuestionId, answer);
    if (!known.has(answer.subQuestionId)) {
      out.push(defect('UNKNOWN_SUBQUESTION', answer.subQuestionId, 'Not a sub-question of the contract'));
    }
  }
  for (const sub of contract) {
    if (!byId.has(sub.id)) out.push(defect('MISSING_ANSWER', sub.id, 'No answer for this sub-question'));
  }
  return byId;
}

/**
 * Completeness gate (spec 11.4): every contract sub-question has exactly one terminal answer with the fields
 * its state requires; OUT_OF_SCOPE sub-questions must be NOT_APPLICABLE; no recommendation wording.
 * @param answers draft answers
 * @param contract sub-questions the run must cover
 * @param bundle optional bundle, used to compare answers with readiness
 */
export function completenessGate(answers: SubAnswer[], contract: SubQuestion[], bundle?: Bundle): CheckVerdict {
  const out: Defect[] = [];
  const byId = checkCoverage(answers, contract, out);
  for (const sub of contract) {
    const answer = byId.get(sub.id);
    if (!answer) continue;
    if (!TERMINAL.has(answer.state)) out.push(defect('NON_TERMINAL_STATE', sub.id, `State ${String(answer.state)} is not terminal`));
    if (blank(answer.narrative)) out.push(defect('EMPTY_NARRATIVE', sub.id, 'Narrative is empty'));
    if (sub.appliesIn === 'OUT_OF_SCOPE' && answer.state !== 'NOT_APPLICABLE') {
      out.push(defect('OUT_OF_SCOPE_MUST_BE_NA', sub.id, 'Out-of-scope sub-questions must be NOT_APPLICABLE'));
    }
    checkStateFields(answer, sub, out);
    answer.claims.filter(c => c.refs.length === 0).forEach(c => {
      out.push({ ...defect('CLAIM_WITHOUT_REFS', sub.id, `Claim ${c.claimId} has no refs`), claimId: c.claimId });
    });
    checkReadiness(answer, bundle?.readiness[sub.id], out);
    checkForbiddenLanguage(answer, out);
  }
  checkDuplicateNarratives(answers, out);
  return verdictOf(out);
}
