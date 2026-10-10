/** Token-bucket rate limiter measured in provider cost units (weighted calls). */

export interface TokenBucketOptions {
  /** Maximum stored tokens (burst size). */
  capacity: number;
  /** Tokens added per second. */
  refillPerSecond: number;
  /** Clock in milliseconds; injectable. */
  now?: () => number;
}

export class TokenBucket {
  private tokens: number;
  private last: number;
  private readonly now: () => number;

  constructor(private readonly options: TokenBucketOptions) {
    if (options.capacity <= 0 || options.refillPerSecond <= 0) throw new RangeError('capacity and refill must be > 0');
    this.now = options.now ?? Date.now;
    this.tokens = options.capacity;
    this.last = this.now();
  }

  private refill(): void {
    const t = this.now();
    const elapsedSec = Math.max(0, t - this.last) / 1000;
    this.tokens = Math.min(this.options.capacity, this.tokens + elapsedSec * this.options.refillPerSecond);
    this.last = t;
  }

  /** Tokens currently available. */
  available(): number {
    this.refill();
    return this.tokens;
  }

  /** Takes `cost` tokens if available now. */
  tryTake(cost: number): boolean {
    this.assertSatisfiable(cost);
    this.refill();
    if (this.tokens + 1e-9 < cost) return false;
    this.tokens = Math.max(0, this.tokens - cost);
    return true;
  }

  /** Milliseconds until `cost` tokens will be available (0 if available now). */
  msUntil(cost: number): number {
    this.assertSatisfiable(cost);
    this.refill();
    const missing = cost - this.tokens;
    return missing <= 0 ? 0 : Math.ceil((missing / this.options.refillPerSecond) * 1000);
  }

  /** Waits (via the injected sleep) until `cost` tokens can be taken, then takes them. */
  async take(cost: number, sleep: (ms: number) => Promise<void>): Promise<void> {
    while (!this.tryTake(cost)) await sleep(Math.max(1, this.msUntil(cost)));
  }

  private assertSatisfiable(cost: number): void {
    if (!(cost > 0)) throw new RangeError('cost must be > 0');
    if (cost > this.options.capacity) throw new RangeError('cost exceeds bucket capacity and can never be satisfied');
  }
}
