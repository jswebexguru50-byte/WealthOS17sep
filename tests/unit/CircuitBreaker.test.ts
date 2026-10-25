import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker } from '../../src/server/services/CircuitBreaker.js';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset all breakers between tests by getting fresh ones with unique names
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('CLOSED state — executes and returns result', async () => {
    const cb = CircuitBreaker.for(`test-closed-${Date.now()}`);
    const result = await cb.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('opens after failureThreshold consecutive failures', async () => {
    const name = `test-opens-${Date.now()}`;
    const cb = CircuitBreaker.for(name, { failureThreshold: 3, windowMs: 60000, halfOpenAfterMs: 30000 });

    const failing = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await cb.execute(failing).catch(() => {});
    }

    await expect(cb.execute(() => Promise.resolve('should-not-run'))).rejects.toThrow(/circuit.*open/i);
  });

  it('OPEN state fast-fails without calling the function', async () => {
    const name = `test-fast-fail-${Date.now()}`;
    const cb = CircuitBreaker.for(name, { failureThreshold: 2, windowMs: 60000, halfOpenAfterMs: 30000 });
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    for (let i = 0; i < 2; i++) {
      await cb.execute(fn).catch(() => {});
    }

    const probeFn = vi.fn().mockResolvedValue('ok');
    await cb.execute(probeFn).catch(() => {});
    expect(probeFn).not.toHaveBeenCalled();
  });

  it('transitions to HALF_OPEN after halfOpenAfterMs', async () => {
    const name = `test-half-open-${Date.now()}`;
    const cb = CircuitBreaker.for(name, { failureThreshold: 2, windowMs: 60000, halfOpenAfterMs: 5000 });

    for (let i = 0; i < 2; i++) {
      await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    }

    vi.advanceTimersByTime(5001);

    // Should allow one probe through (HALF_OPEN)
    const probeResult = await cb.execute(() => Promise.resolve('probe'));
    expect(probeResult).toBe('probe');
  });

  it('closes after successThreshold consecutive successes in HALF_OPEN', async () => {
    const name = `test-closes-${Date.now()}`;
    const cb = CircuitBreaker.for(name, {
      failureThreshold: 2,
      windowMs: 60000,
      halfOpenAfterMs: 5000,
      successThreshold: 2,
    });

    for (let i = 0; i < 2; i++) {
      await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    }

    vi.advanceTimersByTime(5001);

    await cb.execute(() => Promise.resolve('ok1'));
    await cb.execute(() => Promise.resolve('ok2'));

    // Should now be CLOSED — executes normally without throwing
    await expect(cb.execute(() => Promise.resolve('closed-check'))).resolves.toBe('closed-check');
  });

  it('re-opens if probe fails in HALF_OPEN', async () => {
    const name = `test-reopen-${Date.now()}`;
    const cb = CircuitBreaker.for(name, { failureThreshold: 2, windowMs: 60000, halfOpenAfterMs: 5000 });

    for (let i = 0; i < 2; i++) {
      await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    }

    vi.advanceTimersByTime(5001);

    // Probe fails → back to OPEN
    await cb.execute(() => Promise.reject(new Error('probe-fail'))).catch(() => {});

    // Should fast-fail again
    await expect(cb.execute(() => Promise.resolve('should-not-run'))).rejects.toThrow(/circuit.*open/i);
  });

  it('status() returns state string for each registered breaker', async () => {
    const name = `test-status-${Date.now()}`;
    CircuitBreaker.for(name, { failureThreshold: 5, windowMs: 60000, halfOpenAfterMs: 30000 });

    const status = CircuitBreaker.status();
    expect(status[name]).toBe('CLOSED');
  });
});
