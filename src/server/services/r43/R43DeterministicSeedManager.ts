import * as crypto from 'crypto';

export class R43DeterministicSeedManager {
  private static DEFAULT_SEED = 421043;

  public static getSeed(namespace: string): number {
    const hash = crypto.createHash('sha256').update(`${this.DEFAULT_SEED}:${namespace}`).digest('hex');
    return parseInt(hash.substring(0, 8), 16);
  }

  public static getPseudoRandomSeries(seed: number, count: number): number[] {
    const result: number[] = [];
    let current = seed;
    for (let i = 0; i < count; i++) {
      current = (current * 1664525 + 1013904223) % 4294967296;
      result.push(current / 4294967296);
    }
    return result;
  }
}
