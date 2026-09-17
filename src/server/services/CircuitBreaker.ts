/**
 * CircuitBreaker.ts (Spec & Design v2 - Section 7.1)
 * Per-dependency failure isolation for external sources: BSE, NSE, Screener, Gemini, Groq, OpenRouter
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private failureCount: number = 0;
  private successCount: number = 0;
  private threshold: number;
  private resetTimeoutMs: number;
  private lastFailureTime: number = 0;
  public state: CircuitState = 'CLOSED';
  public readonly name: string;

  constructor(name: string, threshold: number = 3, resetTimeoutMs: number = 30000) {
    this.name = name;
    this.threshold = threshold;
    this.resetTimeoutMs = resetTimeoutMs;
  }

  public async call<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        console.log(`[CircuitBreaker:${this.name}] Transitioned to HALF_OPEN. Probing dependency...`);
      } else {
        console.warn(`[CircuitBreaker:${this.name}] Circuit is OPEN. Triggering fallback.`);
        return await fallback();
      }
    }

    try {
      const result = await fn();
      if (this.state === 'HALF_OPEN') {
        this.successCount++;
        if (this.successCount >= 2) {
          this.state = 'CLOSED';
          this.failureCount = 0;
          this.successCount = 0;
          console.log(`[CircuitBreaker:${this.name}] Dependency healthy. Circuit reset to CLOSED.`);
        }
      } else {
        this.failureCount = 0;
      }
      return result;
    } catch (err: any) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      console.warn(`[CircuitBreaker:${this.name}] Failure #${this.failureCount}:`, err?.message || err);

      if (this.failureCount >= this.threshold) {
        this.state = 'OPEN';
        console.error(`[CircuitBreaker:${this.name}] Failure threshold (${this.threshold}) reached. Circuit tripped to OPEN!`);
      }
      return await fallback();
    }
  }
}

export class CircuitBreakerRegistry {
  private static breakers: Map<string, CircuitBreaker> = new Map();

  public static get(name: string, threshold: number = 3): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, threshold));
    }
    return this.breakers.get(name)!;
  }
}
