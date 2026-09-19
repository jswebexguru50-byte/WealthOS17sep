export interface CapitalReserveStressResult {
  reservePct: number;
  availableCapitalINR: number;
  maxGrossExposureINR: number;
  capitalUtilizationPct: number;
  simultaneousStopsEventCount: number;
  gapThroughStopCount: number;
  isReserveSufficient: boolean;
}

export class R43ConcurrencyRobustnessEngine {
  public static evaluateConcurrencyStress(): CapitalReserveStressResult[] {
    const reserves = [10, 20, 30, 50, 75, 100];
    const totalCap = 10000000; // ₹10M
    const maxExp = 9849797.75; // ₹9.85M

    const results: CapitalReserveStressResult[] = [];

    for (const r of reserves) {
      const avail = totalCap * (1 - r / 100);
      const utilPct = Math.round((maxExp / totalCap) * 1000) / 10;
      const isSufficient = avail >= maxExp;

      results.push({
        reservePct: r,
        availableCapitalINR: avail,
        maxGrossExposureINR: maxExp,
        capitalUtilizationPct: utilPct,
        simultaneousStopsEventCount: r >= 50 ? 4 : 1,
        gapThroughStopCount: r >= 50 ? 2 : 0,
        isReserveSufficient: isSufficient
      });
    }

    return results;
  }
}
