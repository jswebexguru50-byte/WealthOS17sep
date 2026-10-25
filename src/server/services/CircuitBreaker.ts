/**
 * Per-provider circuit breaker.
 * States: CLOSED (normal) → OPEN (failing, reject fast) → HALF_OPEN (probe).
 *
 * Usage:
 *   const cb = CircuitBreaker.for('yahoo-finance');
 *   const result = await cb.execute(() => fetch(...));
 */

type State = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CBOptions {
  failureThreshold?: number;    // open after N failures in window (default 5)
  windowMs?: number;            // failure count window (default 60s)
  halfOpenAfterMs?: number;     // attempt probe after open for this long (default 30s)
  successThreshold?: number;    // close after N consecutive successes in HALF_OPEN (default 2)
}

class CircuitBreakerInstance {
  private state: State = 'CLOSED';
  private failures: number[] = [];  // timestamps of recent failures
  private successes = 0;
  private openedAt = 0;
  private readonly opts: Required<CBOptions>;

  constructor(readonly name: string, opts: CBOptions = {}) {
    this.opts = {
      failureThreshold: opts.failureThreshold ?? 5,
      windowMs: opts.windowMs ?? 60_000,
      halfOpenAfterMs: opts.halfOpenAfterMs ?? 30_000,
      successThreshold: opts.successThreshold ?? 2,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.prune();

    if (this.state === 'OPEN') {
      if (Date.now() - this.openedAt < this.opts.halfOpenAfterMs) {
        throw new Error(`[CircuitBreaker] ${this.name} is OPEN — fast fail`);
      }
      this.state = 'HALF_OPEN';
      this.successes = 0;
      console.log(`[CircuitBreaker] ${this.name} → HALF_OPEN (probing)`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.opts.successThreshold) {
        this.state = 'CLOSED';
        this.failures = [];
        console.log(`[CircuitBreaker] ${this.name} → CLOSED (recovered)`);
      }
    }
  }

  private onFailure() {
    this.failures.push(Date.now());
    if (this.state === 'HALF_OPEN' || this.failures.length >= this.opts.failureThreshold) {
      this.state = 'OPEN';
      this.openedAt = Date.now();
      console.error(`[CircuitBreaker] ${this.name} → OPEN after ${this.failures.length} failures`);
    }
  }

  private prune() {
    const cutoff = Date.now() - this.opts.windowMs;
    this.failures = this.failures.filter(t => t > cutoff);
  }

  getState(): State { return this.state; }
  isAvailable(): boolean { return this.state !== 'OPEN' || Date.now() - this.openedAt >= this.opts.halfOpenAfterMs; }
}

export class CircuitBreaker {
  private static registry = new Map<string, CircuitBreakerInstance>();

  static for(name: string, opts?: CBOptions): CircuitBreakerInstance {
    if (!CircuitBreaker.registry.has(name)) {
      CircuitBreaker.registry.set(name, new CircuitBreakerInstance(name, opts));
    }
    return CircuitBreaker.registry.get(name)!;
  }

  static status(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [name, cb] of CircuitBreaker.registry) out[name] = cb.getState();
    return out;
  }
}
