/**
 * Exponential backoff retry handler.
 * Retries transient failures (network timeouts, 429, 503) without surfacing them.
 */

export interface RetryOptions {
  maxAttempts?: number;   // default 3
  baseDelayMs?: number;   // default 100ms
  maxDelayMs?: number;    // default 5000ms
  retryableErrors?: (err: any) => boolean;
}

const defaultRetryable = (err: any): boolean => {
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') return true;
  const status = err?.status ?? err?.response?.status;
  if (status === 429 || status === 503 || status === 502 || status === 504) return true;
  const msg = String(err?.message ?? '').toLowerCase();
  return msg.includes('timeout') || msg.includes('network') || msg.includes('econnrefused') || msg.includes('econnreset');
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
  label = 'operation'
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 100,
    maxDelayMs = 5000,
    retryableErrors = defaultRetryable,
  } = options;

  let lastErr: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !retryableErrors(err)) throw err;
      const jitter = Math.random() * 0.3 * baseDelayMs;
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1) + jitter, maxDelayMs);
      console.warn(`[Retry] ${label} attempt ${attempt}/${maxAttempts} failed, retrying in ${Math.round(delay)}ms:`, (err as any)?.message ?? err);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
