import path from 'node:path';
import type { SubAnswer } from '../domain/index.js';
import { assertSafeWrite, type WriteGuardOptions } from '../db/dbGuard.js';
import type { CheckVerdict, Defect, ReviewFinding } from './types.js';

/** Terminal and intermediate run statuses recorded in `research_report_runs.status`. */
export type RunStatus = 'RUNNING' | 'AWAITING_HOST' | 'READY_FOR_PUBLICATION' | 'ESCALATED_HUMAN' | 'ERROR';

/** Run header written when a run starts (or resumes). */
export interface RunStart {
  runId: string;
  symbol: string;
  asOf: string;
  routineVersion: string;
  contractVersion: string;
  bundleHash: string;
  drafterProvider: string;
  drafterModel?: string;
  reviewerProvider: string;
  reviewerModel?: string;
  startedAt: string;
}

/** One drafted or revised iteration with every verdict and finding. */
export interface IterationRecord {
  runId: string;
  loopNo: number;
  answers: SubAnswer[];
  reviewStatus: 'NOT_REVIEWED' | 'PASS' | 'REVISE';
  validator: CheckVerdict;
  gate: CheckVerdict;
  leakage: CheckVerdict;
  /** Deterministic defects (all three checks, schema defects included). */
  defects: Defect[];
  /** Reviewer findings, if the reviewer was called. */
  findings: ReviewFinding[];
}

/** Final run summary. */
export interface RunFinish {
  runId: string;
  status: RunStatus;
  validator: CheckVerdict | null;
  gate: CheckVerdict | null;
  spendUsd: number;
  loops: number;
  finishedAt: string | null;
}

/** Persistence port for the orchestrator. Implementations must record every iteration. */
export interface RunStore {
  startRun(run: RunStart): void;
  recordIteration(iteration: IterationRecord): void;
  /** Marks the findings of one loop with a resolution such as `SENT_FOR_REVISION` or `ESCALATED`. */
  resolveFindings(runId: string, loopNo: number, resolution: string): void;
  finishRun(finish: RunFinish): void;
}

/** In-memory store for tests and dry runs. */
export class MemoryRunStore implements RunStore {
  runs = new Map<string, RunStart & Partial<RunFinish>>();
  iterations: IterationRecord[] = [];
  resolutions: Array<{ runId: string; loopNo: number; resolution: string }> = [];

  startRun(run: RunStart): void {
    this.runs.set(run.runId, { ...run, status: 'RUNNING' });
  }

  recordIteration(iteration: IterationRecord): void {
    this.iterations = this.iterations.filter(i => !(i.runId === iteration.runId && i.loopNo === iteration.loopNo));
    this.iterations.push(iteration);
  }

  resolveFindings(runId: string, loopNo: number, resolution: string): void {
    this.resolutions.push({ runId, loopNo, resolution });
  }

  finishRun(finish: RunFinish): void {
    this.runs.set(finish.runId, { ...(this.runs.get(finish.runId) as RunStart), ...finish });
  }
}

/** Structural subset of a better-sqlite3 database used by the store. */
export interface SqlDatabase {
  name?: string;
  prepare(sql: string): { run(...params: unknown[]): unknown };
  transaction<T extends (...args: never[]) => unknown>(fn: T): T;
}

/** Either explicit guard options (preferred) or a custom guard function that throws when writes are not allowed. */
export type StoreGuard = WriteGuardOptions | (() => void);

const MEMORY = ':memory:';

const sameDbPath = (a: string, b: string): boolean =>
  path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

function toGuardFunction(db: SqlDatabase, guard: StoreGuard): () => void {
  if (typeof guard === 'function') return guard;
  return () => {
    assertSafeWrite(guard);
    const actual = db.name ?? MEMORY;
    const declared = guard.dbPath as string;
    const matches = declared === MEMORY ? actual === MEMORY || actual === '' : sameDbPath(actual, declared);
    if (!matches) throw new Error(`Run store guard mismatch: handle is ${actual} but guard approved ${declared}`);
  };
}

const json = (value: unknown): string => JSON.stringify(value);

/**
 * better-sqlite3 implementation over `research_report_runs`, `research_answer_store` and
 * `research_review_findings`. Every write first passes the db guard (production needs --allow-production and a
 * verified backup). The tables must already exist; this class never runs DDL.
 */
export class SqliteRunStore implements RunStore {
  private readonly guard: () => void;

  constructor(private readonly db: SqlDatabase, guard: StoreGuard) {
    this.guard = toGuardFunction(db, guard);
  }

  private write(work: () => void): void {
    this.guard();
    this.db.transaction(work)();
  }

  startRun(run: RunStart): void {
    this.write(() => {
      this.db.prepare(
        `INSERT INTO research_report_runs (run_id, symbol, as_of, routine_version, contract_version, bundle_hash,
           drafter_provider, drafter_model, reviewer_provider, reviewer_model, status, loops, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RUNNING', 0, ?)
         ON CONFLICT(run_id) DO UPDATE SET status = 'RUNNING', finished_at = NULL`,
      ).run(
        run.runId, run.symbol, run.asOf, run.routineVersion, run.contractVersion, run.bundleHash,
        run.drafterProvider, run.drafterModel ?? null, run.reviewerProvider, run.reviewerModel ?? null, run.startedAt,
      );
    });
  }

  recordIteration(it: IterationRecord): void {
    this.write(() => {
      this.db.prepare('DELETE FROM research_answer_store WHERE run_id = ?').run(it.runId);
      const insertAnswer = this.db.prepare(
        `INSERT INTO research_answer_store (run_id, sub_question_id, state, claims_json, narrative, gap, next_action,
           sources_searched_json, premise_check_json, review_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const a of it.answers) {
        insertAnswer.run(
          it.runId, a.subQuestionId, a.state, json(a.claims), a.narrative, a.gap ?? null, a.nextAction ?? null,
          a.sourcesSearched ? json(a.sourcesSearched) : null, a.premiseCheck ? json(a.premiseCheck) : null,
          it.reviewStatus,
        );
      }
      this.db.prepare('DELETE FROM research_review_findings WHERE run_id = ? AND loop_no = ?').run(it.runId, it.loopNo);
      const insertFinding = this.db.prepare(
        `INSERT INTO research_review_findings (run_id, sub_question_id, severity, defect, evidence, required_fix,
           resolution, loop_no) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
      );
      for (const d of it.defects) {
        insertFinding.run(it.runId, d.subQuestionId, d.severity, `${d.code}: ${d.message}`, d.evidence ?? d.claimId ?? '',
          'Fix the cited item so the deterministic check passes', it.loopNo);
      }
      for (const f of it.findings) {
        insertFinding.run(it.runId, f.subQuestionId, f.severity, f.defect, f.evidence, f.requiredFix, it.loopNo);
      }
    });
  }

  resolveFindings(runId: string, loopNo: number, resolution: string): void {
    this.write(() => {
      this.db.prepare('UPDATE research_review_findings SET resolution = ? WHERE run_id = ? AND loop_no = ?')
        .run(resolution, runId, loopNo);
    });
  }

  finishRun(f: RunFinish): void {
    this.write(() => {
      this.db.prepare(
        `UPDATE research_report_runs SET status = ?, validator_verdict_json = ?, gate_verdict_json = ?, spend_usd = ?,
           loops = ?, finished_at = ? WHERE run_id = ?`,
      ).run(f.status, f.validator ? json(f.validator) : null, f.gate ? json(f.gate) : null, f.spendUsd, f.loops,
        f.finishedAt, f.runId);
    });
  }
}
