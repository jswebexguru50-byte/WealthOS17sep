export interface DeterministicRunContext {
  runId: string;
  fixedTimestamp: string;
  seed: number;
}

export function createDeterministicRunContext(
  params: { runId: string; seed: number; timestamp: string }
): DeterministicRunContext {
  return {
    runId: params.runId,
    seed: params.seed,
    fixedTimestamp: params.timestamp
  };
}

// Simple deterministic PRNG (Linear Congruential Generator)
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  // Returns a pseudo-random float between 0 (inclusive) and 1 (exclusive)
  public next(): number {
    // LCG parameters commonly used (e.g. in glibc)
    this.state = (this.state * 1103515245 + 12345) % 2147483648;
    return this.state / 2147483648;
  }
}
