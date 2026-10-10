import type { Bundle, LlmProvider, LlmRequest, LlmResponse, SubAnswer, SubQuestion } from '../domain/index.js';
import { HostTaskPendingError } from './adapters/hostAgent.js';
import { validateClaims } from './claimValidator.js';
import { completenessGate } from './completenessGate.js';
import { validateJsonSchema, type JsonSchema } from './jsonSchema.js';
import { leakageCheck, type OtherScrip } from './leakageCheck.js';
import { isMetered, SpendCapExceededError, parseJsonFromText } from './provider.js';
import { loadAnswersSchema, loadPrompt, loadReviewSchema } from './schemaFiles.js';
import type { RunStatus, RunStore } from './runStore.js';
import { verdictOf, type CheckVerdict, type Defect, type ReviewFinding, type ReviewResult } from './types.js';

/** Maximum number of revision loops after the first draft (spec 11.6). */
export const MAX_REVISION_LOOPS = 2;

/** Inputs of one run for one scrip. */
export interface RunInput {
  runId: string;
  bundle: Bundle;
  /** Sub-questions the draft must cover (from the contract). */
  subQuestions: SubQuestion[];
  contractVersion: string;
  drafter: LlmProvider;
  reviewer: LlmProvider;
  store: RunStore;
  /** Other scrips in the run, for the leakage check. */
  otherScrips?: OtherScrip[];
  drafterModel?: string;
  reviewerModel?: string;
  /** Include the bundle JSON in the prompts. Host mode sets false because the host reads the bundle file. */
  inlineBundle?: boolean;
  maxLoops?: number;
  /** Spend caps (USD) applied to API-metered providers only. */
  spendCapRunUsd?: number;
  spendCapDayUsd?: number;
  /** USD already spent today by other runs (for the day cap). */
  spentTodayUsd?: number;
  now?: () => Date;
}

/** One loop of the run, as returned to the caller (also persisted through the store). */
export interface IterationSummary {
  loopNo: number;
  answers: SubAnswer[];
  defects: Defect[];
  findings: ReviewFinding[];
  reviewed: boolean;
}

/** Why a run was handed to a human. */
export interface Escalation {
  reason: string;
  openDefects: Defect[];
  openFindings: ReviewFinding[];
}

/** Outcome of a run. READY_FOR_PUBLICATION means all gates and the reviewer cleared; it is not a rating. */
export interface RunResult {
  runId: string;
  status: Extract<RunStatus, 'READY_FOR_PUBLICATION' | 'ESCALATED_HUMAN'>;
  answers: SubAnswer[];
  loops: number;
  iterations: IterationSummary[];
  validator: CheckVerdict;
  gate: CheckVerdict;
  leakage: CheckVerdict;
  spendUsd: number;
  usage: { inTok: number; outTok: number };
  escalation?: Escalation;
}

/** Raised when the drafter and reviewer are the same provider instance (the reviewer must be a separate call). */
export class ReviewerSeparationError extends Error {
  constructor() {
    super('The reviewer must be a separate provider instance from the drafter');
    this.name = 'ReviewerSeparationError';
  }
}

class Meter {
  spendUsd = 0;
  inTok = 0;
  outTok = 0;

  constructor(private readonly input: RunInput) {}

  async call(provider: LlmProvider, request: LlmRequest): Promise<LlmResponse> {
    if (isMetered(provider)) this.assertWithinCaps();
    const response = await provider.complete(request);
    this.inTok += response.usage.inTok;
    this.outTok += response.usage.outTok;
    this.spendUsd += response.usage.costUsd ?? 0;
    return response;
  }

  private assertWithinCaps(): void {
    const { spendCapRunUsd, spendCapDayUsd, spentTodayUsd = 0 } = this.input;
    if (spendCapRunUsd !== undefined && this.spendUsd >= spendCapRunUsd) {
      throw new SpendCapExceededError(this.spendUsd, spendCapRunUsd);
    }
    if (spendCapDayUsd !== undefined && spentTodayUsd + this.spendUsd >= spendCapDayUsd) {
      throw new SpendCapExceededError(spentTodayUsd + this.spendUsd, spendCapDayUsd);
    }
  }
}

function contractView(subQuestions: SubQuestion[]): unknown[] {
  return subQuestions.map(s => ({
    id: s.id,
    text: s.text,
    requiredMetrics: s.requiredMetrics,
    calcIds: s.calcIds,
    premise: s.premise,
    appliesIn: s.appliesIn,
    outOfScopeReason: s.outOfScopeReason,
  }));
}

function defectLine(d: Defect): string {
  return `- [${d.severity}] ${d.code} ${d.subQuestionId}${d.claimId ? ` (${d.claimId})` : ''}: ${d.message}`;
}

function findingLine(f: ReviewFinding): string {
  return `- [${f.severity}] ${f.subQuestionId}: ${f.defect} | evidence: ${f.evidence} | fix: ${f.requiredFix}`;
}

function draftMessage(input: RunInput, previous: SubAnswer[] | null, defects: Defect[], findings: ReviewFinding[]): string {
  const parts = [
    `Scrip: ${input.bundle.symbol} (${input.bundle.isin}); bundle as of ${input.bundle.asOf}; hash ${input.bundle.bundleHash}`,
    `Sub-questions to answer (all of them):\n${JSON.stringify(contractView(input.subQuestions), null, 1)}`,
  ];
  if (input.inlineBundle !== false) parts.push(`Bundle:\n${JSON.stringify(input.bundle)}`);
  if (previous) {
    parts.push(`REVISION. Previous draft:\n${JSON.stringify({ answers: previous })}`);
    parts.push(`Deterministic defects to fix:\n${defects.map(defectLine).join('\n') || '(none)'}`);
    parts.push(`Reviewer findings to fix:\n${findings.map(findingLine).join('\n') || '(none)'}`);
  }
  return parts.join('\n\n');
}

function reviewMessage(input: RunInput, answers: SubAnswer[], warnings: Defect[]): string {
  const parts = [
    `Scrip: ${input.bundle.symbol}; bundle as of ${input.bundle.asOf}; hash ${input.bundle.bundleHash}`,
    `Sub-questions:\n${JSON.stringify(contractView(input.subQuestions), null, 1)}`,
  ];
  if (input.inlineBundle !== false) parts.push(`Bundle:\n${JSON.stringify(input.bundle)}`);
  parts.push(`Draft under review:\n${JSON.stringify({ answers })}`);
  parts.push(`Deterministic warnings already known:\n${warnings.map(defectLine).join('\n') || '(none)'}`);
  return parts.join('\n\n');
}

function structured(response: LlmResponse): unknown {
  return response.json !== undefined ? response.json : parseJsonFromText(response.text);
}

interface ParsedDraft {
  answers: SubAnswer[] | null;
  schemaDefects: Defect[];
}

function parseDraft(raw: unknown, schema: JsonSchema): ParsedDraft {
  const wrapped = Array.isArray(raw) ? { answers: raw } : raw;
  const errors = validateJsonSchema(wrapped, schema);
  if (errors.length > 0) {
    const schemaDefects: Defect[] = errors.slice(0, 20).map(message => ({
      code: 'SCHEMA_INVALID', severity: 'BLOCKING', subQuestionId: '*', message,
    }));
    return { answers: null, schemaDefects };
  }
  return { answers: (wrapped as { answers: SubAnswer[] }).answers, schemaDefects: [] };
}

function dedupe(defects: Defect[]): Defect[] {
  const seen = new Set<string>();
  return defects.filter(d => {
    const key = `${d.code}|${d.subQuestionId}|${d.claimId ?? ''}|${d.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function runChecks(input: RunInput, answers: SubAnswer[]): { validator: CheckVerdict; gate: CheckVerdict; leakage: CheckVerdict } {
  return {
    validator: validateClaims(input.bundle, answers),
    gate: completenessGate(answers, input.subQuestions, input.bundle),
    leakage: leakageCheck(answers, input.otherScrips ?? []),
  };
}

/** Reviewer verdict is recomputed here: PASS stands only when no BLOCKING finding exists. */
function parseReview(raw: unknown, schema: JsonSchema): ReviewResult | string {
  const errors = validateJsonSchema(raw, schema);
  if (errors.length > 0) return `Reviewer output violates review schema: ${errors.slice(0, 5).join('; ')}`;
  const review = raw as ReviewResult;
  const blocking = review.findings.some(f => f.severity === 'BLOCKING');
  return { verdict: blocking ? 'REVISE' : review.verdict, findings: review.findings };
}

const emptyVerdict: CheckVerdict = { ok: false, defects: [] };

/**
 * Runs the pipeline for one scrip: draft, then claim validator + completeness gate + leakage check, then the
 * separate reviewer, then up to two revision loops, then human escalation (spec 11.6). Every iteration, defect
 * and finding is persisted through the injected RunStore. A host agent that has not answered yet raises
 * HostTaskPendingError; the run is marked AWAITING_HOST and can be resumed by calling again with the same runId.
 * @param input run configuration, providers and store
 */
export async function runReport(input: RunInput): Promise<RunResult> {
  if (input.drafter === input.reviewer) throw new ReviewerSeparationError();
  const now = input.now ?? (() => new Date());
  const meter = new Meter(input);
  const maxLoops = input.maxLoops ?? MAX_REVISION_LOOPS;
  const answersSchema = loadAnswersSchema();
  const reviewSchema = loadReviewSchema();
  const system = { drafter: loadPrompt('drafter'), reviewer: loadPrompt('reviewer') };
  input.store.startRun({
    runId: input.runId, symbol: input.bundle.symbol, asOf: input.bundle.asOf,
    routineVersion: input.bundle.routineVersion, contractVersion: input.contractVersion,
    bundleHash: input.bundle.bundleHash, drafterProvider: input.drafter.id, drafterModel: input.drafterModel,
    reviewerProvider: input.reviewer.id, reviewerModel: input.reviewerModel, startedAt: now().toISOString(),
  });

  const iterations: IterationSummary[] = [];
  let previous: SubAnswer[] | null = null;
  let feedbackDefects: Defect[] = [];
  let feedbackFindings: ReviewFinding[] = [];
  let last = { validator: emptyVerdict, gate: emptyVerdict, leakage: emptyVerdict };
  let escalation: Escalation | undefined;
  let answers: SubAnswer[] = [];

  const finish = (status: RunStatus, loops: number): void => {
    input.store.finishRun({
      runId: input.runId, status, validator: last.validator, gate: last.gate, spendUsd: meter.spendUsd, loops,
      finishedAt: status === 'AWAITING_HOST' ? null : now().toISOString(),
    });
  };

  try {
    for (let loopNo = 0; loopNo <= maxLoops; loopNo += 1) {
      const draftReq: LlmRequest = {
        system: system.drafter,
        messages: [{ role: 'user', content: draftMessage(input, previous, feedbackDefects, feedbackFindings) }],
        jsonSchema: answersSchema,
      };
      const parsed = parseDraft(structured(await meter.call(input.drafter, draftReq)), answersSchema);
      let defects: Defect[];
      let reviewStatus: 'NOT_REVIEWED' | 'PASS' | 'REVISE' = 'NOT_REVIEWED';
      let findings: ReviewFinding[] = [];
      if (parsed.answers) {
        answers = parsed.answers;
        last = runChecks(input, answers);
        defects = dedupe([...last.validator.defects, ...last.gate.defects, ...last.leakage.defects]);
      } else {
        defects = parsed.schemaDefects;
        last = { validator: verdictOf(defects), gate: emptyVerdict, leakage: emptyVerdict };
      }
      const blockingDefects = defects.filter(d => d.severity === 'BLOCKING');

      if (parsed.answers && blockingDefects.length === 0) {
        const review = await runReviewer(input, meter, system.reviewer, reviewSchema, answers, defects);
        if (typeof review === 'string') {
          escalation = { reason: review, openDefects: defects, openFindings: [] };
        } else {
          findings = review.findings;
          reviewStatus = review.verdict;
        }
      }
      input.store.recordIteration({
        runId: input.runId, loopNo, answers, reviewStatus, validator: last.validator, gate: last.gate,
        leakage: last.leakage, defects, findings,
      });
      iterations.push({ loopNo, answers, defects, findings, reviewed: reviewStatus !== 'NOT_REVIEWED' });

      const blockingFindings = findings.filter(f => f.severity === 'BLOCKING');
      const clear = parsed.answers !== null && blockingDefects.length === 0 && reviewStatus === 'PASS';
      if (clear) {
        input.store.resolveFindings(input.runId, loopNo, 'ACKNOWLEDGED');
        finish('READY_FOR_PUBLICATION', loopNo);
        return result('READY_FOR_PUBLICATION', loopNo);
      }
      if (escalation || loopNo === maxLoops) {
        escalation ??= {
          reason: `Blocking items remain after ${maxLoops} revision loops`,
          openDefects: blockingDefects, openFindings: blockingFindings,
        };
        input.store.resolveFindings(input.runId, loopNo, 'ESCALATED');
        finish('ESCALATED_HUMAN', loopNo);
        return result('ESCALATED_HUMAN', loopNo);
      }
      input.store.resolveFindings(input.runId, loopNo, 'SENT_FOR_REVISION');
      previous = parsed.answers ?? previous ?? [];
      feedbackDefects = blockingDefects.length > 0 ? blockingDefects : [];
      feedbackFindings = blockingFindings;
    }
  } catch (error) {
    return await handleFailure(error);
  }
  throw new Error('unreachable: loop always returns');

  function result(status: RunResult['status'], loops: number): RunResult {
    return {
      runId: input.runId, status, answers, loops, iterations, validator: last.validator, gate: last.gate,
      leakage: last.leakage, spendUsd: meter.spendUsd, usage: { inTok: meter.inTok, outTok: meter.outTok }, escalation,
    };
  }

  async function handleFailure(error: unknown): Promise<RunResult> {
    if (error instanceof HostTaskPendingError) {
      finish('AWAITING_HOST', iterations.length);
      throw error;
    }
    if (error instanceof SpendCapExceededError) {
      escalation = { reason: error.message, openDefects: [], openFindings: [] };
      finish('ESCALATED_HUMAN', iterations.length);
      return result('ESCALATED_HUMAN', iterations.length);
    }
    finish('ERROR', iterations.length);
    throw error;
  }
}

async function runReviewer(
  input: RunInput,
  meter: Meter,
  systemPrompt: string,
  schema: JsonSchema,
  answers: SubAnswer[],
  defects: Defect[],
): Promise<ReviewResult | string> {
  const request: LlmRequest = {
    system: systemPrompt,
    messages: [{ role: 'user', content: reviewMessage(input, answers, defects) }],
    jsonSchema: schema,
  };
  return parseReview(structured(await meter.call(input.reviewer, request)), schema);
}
