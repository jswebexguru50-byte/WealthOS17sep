import { retryWithBackoff, type BackoffOptions } from './backoff.js';

export type QueueItemStatus = 'PENDING' | 'DONE' | 'FAILED';
export type QueueState = 'RUNNING' | 'QUOTA_EXHAUSTED';

export interface QueueItem<R> {
  id: string;
  request: R;
  attempts: number;
  status: QueueItemStatus;
  lastError?: string;
}

/** Visible queue status, e.g. for the run report and the UI. */
export interface QueueStatus {
  state: QueueState;
  /** ISO time after which the queue may resume; null unless QUOTA_EXHAUSTED. */
  resumeAt: string | null;
  message: string;
  pending: number;
  done: number;
  failed: number;
}

/** Serialised form, so a paused run can resume in a later process. */
export interface QueueSnapshot<R> {
  items: Array<QueueItem<R>>;
  state: QueueState;
  resumeAt: string | null;
}

/**
 * Work queue that pauses after provider quota exhaustion (error 1002, "Maximum weighted channel
 * limit exceeded") and resumes at `resumeAt`. Unfinished items are never dropped or marked failed
 * because of quota.
 */
export class ResumeQueue<R> {
  private items: Array<QueueItem<R>>;
  private state: QueueState = 'RUNNING';
  private resumeAtMs: number | null = null;

  constructor(items: Array<{ id: string; request: R }>) {
    this.items = items.map(i => ({ id: i.id, request: i.request, attempts: 0, status: 'PENDING' as const }));
  }

  /** Restores a queue saved by toJSON. */
  static fromJSON<R>(snapshot: QueueSnapshot<R>): ResumeQueue<R> {
    const queue = new ResumeQueue<R>([]);
    queue.items = snapshot.items.map(i => ({ ...i }));
    queue.state = snapshot.state;
    queue.resumeAtMs = snapshot.resumeAt ? Date.parse(snapshot.resumeAt) : null;
    return queue;
  }

  toJSON(): QueueSnapshot<R> {
    return {
      items: this.items.map(i => ({ ...i })),
      state: this.state,
      resumeAt: this.resumeAtMs === null ? null : new Date(this.resumeAtMs).toISOString(),
    };
  }

  /** Next pending item, or null when empty or still paused for quota at `nowMs`. */
  next(nowMs: number): QueueItem<R> | null {
    if (this.state === 'QUOTA_EXHAUSTED') {
      if (this.resumeAtMs !== null && nowMs < this.resumeAtMs) return null;
      this.state = 'RUNNING';
      this.resumeAtMs = null;
    }
    return this.items.find(i => i.status === 'PENDING') ?? null;
  }

  recordAttempt(id: string): void { this.find(id).attempts++; }
  markDone(id: string): void { this.find(id).status = 'DONE'; }
  markFailed(id: string, error: string): void {
    const item = this.find(id);
    item.status = 'FAILED';
    item.lastError = error;
  }

  /** Pauses the queue until nowMs + cooldownMs. */
  markQuotaExhausted(nowMs: number, cooldownMs: number): void {
    this.state = 'QUOTA_EXHAUSTED';
    this.resumeAtMs = nowMs + cooldownMs;
  }

  status(nowMs: number): QueueStatus {
    const count = (s: QueueItemStatus): number => this.items.filter(i => i.status === s).length;
    const paused = this.state === 'QUOTA_EXHAUSTED' && this.resumeAtMs !== null && nowMs < this.resumeAtMs;
    const resumeAt = paused ? new Date(this.resumeAtMs as number).toISOString() : null;
    return {
      state: paused ? 'QUOTA_EXHAUSTED' : 'RUNNING',
      resumeAt,
      message: paused ? `quota exhausted, resume at ${resumeAt}` : 'running',
      pending: count('PENDING'), done: count('DONE'), failed: count('FAILED'),
    };
  }

  private find(id: string): QueueItem<R> {
    const item = this.items.find(i => i.id === id);
    if (!item) throw new Error(`QUEUE_ITEM_UNKNOWN:${id}`);
    return item;
  }
}

/** What an executor reports back to the drain loop. */
export interface ExecOutcome {
  ok: boolean;
  quotaExhausted?: boolean;
  retryable?: boolean;
  errorCode?: string;
  message?: string;
}

export interface DrainDeps<R, T extends ExecOutcome> {
  execute: (request: R, item: QueueItem<R>) => Promise<T>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Pause length after quota exhaustion persists through all retries. */
  cooldownMs: number;
  /** Attempts per item per drain (1 = no in-process retry). */
  maxAttempts: number;
  backoff?: BackoffOptions;
  random?: () => number;
  onResult?: (item: QueueItem<R>, outcome: T) => void | Promise<void>;
}

export interface DrainSummary {
  done: number;
  failed: number;
  pending: number;
  status: QueueStatus;
}

/**
 * Runs queued items. Quota errors (1002) retry with exponential backoff and jitter; if the quota
 * stays exhausted the queue pauses (visible status with resumeAt) and unfinished items stay pending.
 * Other errors fail only that item.
 */
export async function drainQueue<R, T extends ExecOutcome>(queue: ResumeQueue<R>, deps: DrainDeps<R, T>): Promise<DrainSummary> {
  let item = queue.next(deps.now());
  while (item) {
    const current = item;
    const outcome = await retryWithBackoff(
      async () => {
        queue.recordAttempt(current.id);
        return deps.execute(current.request, current);
      },
      {
        maxAttempts: deps.maxAttempts,
        isRetryable: r => !r.ok && (r.quotaExhausted === true || r.retryable === true),
        sleep: deps.sleep, backoff: deps.backoff, random: deps.random,
      },
    );
    if (deps.onResult) await deps.onResult(current, outcome.result);
    if (outcome.result.ok) {
      queue.markDone(current.id);
    } else if (outcome.result.quotaExhausted) {
      queue.markQuotaExhausted(deps.now(), deps.cooldownMs);
      break;
    } else {
      queue.markFailed(current.id, `${outcome.result.errorCode ?? 'ERROR'}: ${outcome.result.message ?? ''}`.trim());
    }
    item = queue.next(deps.now());
  }
  const status = queue.status(deps.now());
  return { done: status.done, failed: status.failed, pending: status.pending, status };
}
