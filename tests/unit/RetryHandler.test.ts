import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '../../src/server/services/RetryHandler.js';

describe('RetryHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('happy path — resolves on first attempt without delay', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxAttempts: 3 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable error and succeeds on third attempt', async () => {
    const err = Object.assign(new Error('timeout'), { name: 'AbortError' });
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('success');

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry non-retryable error — throws after 1 attempt', async () => {
    const err = Object.assign(new Error('bad request'), { status: 400 });
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 })).rejects.toThrow('bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('respects maxAttempts — exhausts retries and throws last error', async () => {
    const err = Object.assign(new Error('timeout'), { name: 'AbortError' });
    const fn = vi.fn().mockRejectedValue(err);

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 }).catch(e => e);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe('timeout');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('AbortError is retryable', async () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('done');

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('done');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('HTTP 429 is retryable', async () => {
    const err = Object.assign(new Error('rate limited'), { status: 429 });
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('ok');

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('HTTP 400 is NOT retryable', async () => {
    const err = Object.assign(new Error('client error'), { status: 400 });
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 })).rejects.toThrow('client error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('custom retryableErrors predicate overrides defaults', async () => {
    const err = new Error('custom-fail');
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('custom-ok');

    const promise = withRetry(
      fn,
      { maxAttempts: 3, baseDelayMs: 10, retryableErrors: () => true },
    );
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('custom-ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
