/** Exponential backoff with jitter. Clock and randomness are injectable for deterministic tests. */

export type JitterMode = 'none' | 'full' | 'equal';

export interface BackoffOptions {
  baseMs?: number;
  maxMs?: number;
  factor?: number;
  jitter?: JitterMode;
}

const DEFAULTS: Required<BackoffOptions> = { baseMs: 1000, maxMs: 60_000, factor: 2, jitter: 'full' };

/**
 * Delay before retry number `attempt` (1 = first retry): min(max, base * factor^(attempt-1)) with
 * jitter. "full" draws from [0, cap]; "equal" from [cap/2, cap]; "none" returns the cap.
 */
export function backoffDelayMs(attempt: number, options: BackoffOptions = {}, random: () => number = Math.random): number {
  if (!Number.isInteger(attempt) || attempt < 1) throw new RangeError('attempt must be an integer >= 1');
  const cfg = { ...DEFAULTS, ...options };
  const cap = Math.min(cfg.maxMs, cfg.baseMs * Math.pow(cfg.factor, attempt - 1));
  if (cfg.jitter === 'none') return Math.round(cap);
  const r = random();
  return Math.round(cfg.jitter === 'full' ? cap * r : cap / 2 + (cap / 2) * r);
}

export interface RetryOptions<T> {
  maxAttempts: number;
  /** Decides from a result whether another attempt is worthwhile. */
  isRetryable: (result: T) => boolean;
  sleep: (ms: number) => Promise<void>;
  backoff?: BackoffOptions;
  random?: () => number;
}

export interface RetryOutcome<T> {
  result: T;
  attempts: number;
  /** Delays slept between attempts, in order. */
  delaysMs: number[];
  /** True when the last result was still retryable (attempts ran out). */
  gaveUp: boolean;
}

/** Runs `fn` until it returns a non-retryable result or attempts run out. */
export async function retryWithBackoff<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions<T>): Promise<RetryOutcome<T>> {
  const delaysMs: number[] = [];
  let result!: T;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    result = await fn(attempt);
    if (!options.isRetryable(result)) return { result, attempts: attempt, delaysMs, gaveUp: false };
    if (attempt === options.maxAttempts) break;
    const delay = backoffDelayMs(attempt, options.backoff, options.random);
    delaysMs.push(delay);
    await options.sleep(delay);
  }
  return { result, attempts: options.maxAttempts, delaysMs, gaveUp: true };
}
