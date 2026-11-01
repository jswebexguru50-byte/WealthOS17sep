/**
 * Chaos tests: Provider fallback behaviour
 *
 * Tests the CircuitBreaker's primary→fallback cascade when upstream providers fail,
 * plus graceful degradation when ALL providers are unavailable.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitBreakerRegistry } from '../../src/server/services/CircuitBreaker.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProvider(name: string, shouldFail: boolean, failureMsg = 'provider down') {
  return async () => {
    if (shouldFail) throw new Error(failureMsg);
    return { price: 100, source: name };
  };
}

function makeProviderWithMalformedResponse(name: string) {
  return async () => {
    // Returns something that JSON.parse would fail on if callers tried to re-parse
    const raw = 'NOT_VALID_JSON{{{{';
    JSON.parse(raw); // throws SyntaxError
    return { price: 0, source: name };
  };
}

// ─── Scenario 1: Primary DOWN → Fallback to secondary ────────────────────────
describe('Provider fallback: primary DOWN → secondary UP', () => {
  let primaryCB: CircuitBreaker;
  let fallbackCB: CircuitBreaker;

  beforeEach(() => {
    // Use fresh instances so test state doesn't bleed across
    primaryCB = new CircuitBreaker('upstox-chaos-1', 3, 5000);
    fallbackCB = new CircuitBreaker('yahoo-chaos-1', 3, 5000);
  });

  test('returns fallback result when primary fails below threshold', async () => {
    const primary = makeProvider('UPSTOX', true);
    const fallback = makeProvider('YAHOO_FINANCE', false);

    const result = await primaryCB.call(primary, () => fallbackCB.call(fallback, async () => null!));
    expect(result).not.toBeNull();
    expect(result!.source).toBe('YAHOO_FINANCE');
  });

  test('circuit trips to OPEN after hitting threshold and fallback activates', async () => {
    const primary = makeProvider('UPSTOX', true);
    const fallback = makeProvider('YAHOO_FINANCE', false);

    // Drive primary to OPEN (threshold = 3)
    for (let i = 0; i < 3; i++) {
      await primaryCB.call(primary, async () => ({ price: -1, source: 'noop' }));
    }
    expect(primaryCB.state).toBe('OPEN');

    // Now circuit is OPEN — next call goes straight to fallback
    const result = await primaryCB.call(primary, () => fallbackCB.call(fallback, async () => null!));
    expect(result!.source).toBe('YAHOO_FINANCE');
  });

  test('result provenance shows fallback source', async () => {
    const primary = makeProvider('UPSTOX', true);
    const fallbackResult = { price: 200, source: 'YAHOO_FINANCE' as const };
    const fallback = async () => fallbackResult;

    const result = await primaryCB.call(primary, fallback);
    expect(result.source).toBe('YAHOO_FINANCE');
  });
});

// ─── Scenario 2: ALL providers DOWN → graceful error ─────────────────────────
describe('Provider fallback: ALL providers DOWN → graceful degradation', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker('all-down-chaos', 1, 5000);
  });

  test('does not throw when all providers fail — returns fallback result', async () => {
    const primary = makeProvider('UPSTOX', true);
    const fallback = makeProvider('YAHOO', true);

    // Graceful fallback chain: both fail, return a sentinel
    const result = await cb.call(primary, async () => {
      try {
        return await fallback();
      } catch {
        return { price: null, source: 'NONE', error: 'DATA_INSUFFICIENT' } as any;
      }
    });

    expect(result.error).toBe('DATA_INSUFFICIENT');
    expect(result.price).toBeNull();
  });

  test('failure counter increments on each provider failure', async () => {
    const cb2 = new CircuitBreaker('multi-fail-chaos', 5, 5000);
    const primary = makeProvider('UPSTOX', true);
    const fallback = async () => ({ price: 0, source: 'sentinel' });

    await cb2.call(primary, fallback);
    await cb2.call(primary, fallback);
    expect((cb2 as any).failureCount).toBe(2);
  });

  test('all-providers-down logs failure and returns sentinel without crashing', async () => {
    const providers = [
      makeProvider('UPSTOX', true),
      makeProvider('YAHOO', true),
      makeProvider('NSE', true),
    ];

    let result: any = null;
    for (const [i, provider] of providers.entries()) {
      const localCb = new CircuitBreaker(`p${i}-chaos`, 1, 5000);
      result = await localCb.call(provider, async () => ({ price: null, source: 'sentinel' }));
    }

    // Last fallback returns sentinel — no exception escaped
    expect(result).toBeDefined();
    expect(result.source).toBe('sentinel');
  });
});

// ─── Scenario 3: Malformed JSON → circuit breaker counts as failure ───────────
describe('Provider fallback: malformed response → circuit breaker counts failure', () => {
  test('SyntaxError from JSON.parse counts as a failure', async () => {
    const cb = new CircuitBreaker('malformed-chaos', 3, 5000);
    const malformed = makeProviderWithMalformedResponse('UPSTOX');
    const fallback = async () => ({ price: 50, source: 'YAHOO_FINANCE' });

    const result = await cb.call(malformed, fallback);
    expect(result.source).toBe('YAHOO_FINANCE');
    expect((cb as any).failureCount).toBe(1);
  });

  test('repeated malformed responses trip circuit to OPEN', async () => {
    const cb = new CircuitBreaker('malformed-trip-chaos', 2, 5000);
    const malformed = makeProviderWithMalformedResponse('UPSTOX');
    const fallback = async () => ({ price: 50, source: 'YAHOO_FINANCE' });

    await cb.call(malformed, fallback);
    await cb.call(malformed, fallback);
    expect(cb.state).toBe('OPEN');
  });

  test('fallback is invoked correctly after malformed response', async () => {
    const cb = new CircuitBreaker('malformed-fallback-chaos', 3, 5000);
    const malformed = makeProviderWithMalformedResponse('UPSTOX');
    const expected = { price: 75, source: 'NSE_BHAVCOPY' };
    const fallback = async () => expected;

    const result = await cb.call(malformed, fallback);
    expect(result).toEqual(expected);
  });
});

// ─── Scenario 4: CircuitBreakerRegistry shared state ─────────────────────────
describe('CircuitBreakerRegistry: shared state across calls', () => {
  test('registry returns the same instance for the same name', () => {
    const a = CircuitBreakerRegistry.get('registry-test-shared', 3);
    const b = CircuitBreakerRegistry.get('registry-test-shared', 3);
    expect(a).toBe(b);
  });

  test('registry state persists across multiple calls', async () => {
    const cb = CircuitBreakerRegistry.get('registry-persist-chaos', 2);
    // Reset state for isolation
    (cb as any).failureCount = 0;
    (cb as any).state = 'CLOSED';

    const failing = makeProvider('X', true);
    const fallback = async () => ({ price: 0, source: 'fallback' });

    await cb.call(failing, fallback);
    expect((cb as any).failureCount).toBe(1);
    await cb.call(failing, fallback);
    expect(cb.state).toBe('OPEN');
  });
});
