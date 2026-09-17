/**
 * BudgetGuard.ts (Spec & Design v2 - Section 7.2)
 * Pre-emptive quota deferral: stops cleanly before a 429 occurs, resuming on the next scheduled run
 */
export interface EngineBudgetConfig {
  dailyRequestCeiling: number;
  rpmCeiling: number;
}

const DEFAULT_CEILINGS: Record<string, EngineBudgetConfig> = {
  GEMINI: { dailyRequestCeiling: 1400, rpmCeiling: 14 },
  GROQ: { dailyRequestCeiling: 14000, rpmCeiling: 30 },
  OPENROUTER: { dailyRequestCeiling: 500, rpmCeiling: 20 },
};

export class BudgetGuard {
  private static dailyUsage: Record<string, { count: number; lastResetDate: string }> = {};

  private static getTodayStr(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private static ensureReset(engine: string) {
    const today = this.getTodayStr();
    if (!this.dailyUsage[engine] || this.dailyUsage[engine].lastResetDate !== today) {
      this.dailyUsage[engine] = { count: 0, lastResetDate: today };
    }
  }

  public static async checkBudgetBeforeCall(engine: string): Promise<'PROCEED' | 'DEFER_TO_NEXT_RUN'> {
    this.ensureReset(engine);
    const ceiling = DEFAULT_CEILINGS[engine]?.dailyRequestCeiling || 1000;
    const usage = this.dailyUsage[engine].count;

    // Trigger pre-emptive deferral at 85% of safe ceiling
    if (usage >= ceiling * 0.85) {
      console.warn(`[BudgetGuard:${engine}] 85% daily ceiling reached (${usage}/${ceiling}). Deferring call gracefully to prevent 429.`);
      return 'DEFER_TO_NEXT_RUN';
    }

    return 'PROCEED';
  }

  public static recordCall(engine: string) {
    this.ensureReset(engine);
    this.dailyUsage[engine].count++;
  }

  public static getUsageToday(engine: string): number {
    this.ensureReset(engine);
    return this.dailyUsage[engine].count;
  }
}
