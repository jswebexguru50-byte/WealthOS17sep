// FeatureFlags.ts — per-consumer feature flag for new data platform (Phase 5)
// Flags are read from environment variables with safe boolean fallbacks.
// Set FLAG_<NAME>=true in .env to enable; omit or set false to disable.

export const FLAG = {
  // New /api/v2/facts/* endpoints active (always true now)
  V2_FACTS_ENABLED: 'V2_FACTS_ENABLED',
  // Use BatchFundamentalProvider instead of direct FundamentalDataService
  USE_BATCH_FUNDAMENTALS: 'USE_BATCH_FUNDAMENTALS',
  // Use FactsRepository for Holdings reads (vs direct dbAll)
  USE_FACTS_REPO_HOLDINGS: 'USE_FACTS_REPO_HOLDINGS',
  // Use MultiLayerCache for market data
  USE_MULTI_LAYER_CACHE: 'USE_MULTI_LAYER_CACHE',
  // BudgetEnforcer active (gates provider calls when over budget)
  BUDGET_ENFORCER_ACTIVE: 'BUDGET_ENFORCER_ACTIVE',
  // LoggingMiddleware structured JSON logs active
  STRUCTURED_LOGGING: 'STRUCTURED_LOGGING',
} as const;

export type FlagName = typeof FLAG[keyof typeof FLAG];

// Defaults: all platform flags ON except budget enforcement (conservative)
const DEFAULTS: Record<FlagName, boolean> = {
  [FLAG.V2_FACTS_ENABLED]: true,
  [FLAG.USE_BATCH_FUNDAMENTALS]: true,
  [FLAG.USE_FACTS_REPO_HOLDINGS]: true,
  [FLAG.USE_MULTI_LAYER_CACHE]: true,
  [FLAG.BUDGET_ENFORCER_ACTIVE]: false,  // opt-in: turn on when ready
  [FLAG.STRUCTURED_LOGGING]: true,
};

export class FeatureFlags {
  private static instance: FeatureFlags;
  private overrides = new Map<FlagName, boolean>();

  static getInstance(): FeatureFlags {
    if (!FeatureFlags.instance) FeatureFlags.instance = new FeatureFlags();
    return FeatureFlags.instance;
  }

  isEnabled(flag: FlagName): boolean {
    if (this.overrides.has(flag)) return this.overrides.get(flag)!;
    const env = process.env[`FLAG_${flag}`];
    if (env !== undefined) return env === 'true' || env === '1';
    return DEFAULTS[flag] ?? false;
  }

  // For tests and admin API — override at runtime without env change
  set(flag: FlagName, value: boolean): void { this.overrides.set(flag, value); }
  reset(flag?: FlagName): void {
    if (flag) this.overrides.delete(flag);
    else this.overrides.clear();
  }

  snapshot(): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const f of Object.values(FLAG)) out[f] = this.isEnabled(f as FlagName);
    return out;
  }
}
