// BudgetEnforcer — monthly spend gate
// Call isAllowed(provider) before any external fetch; returns false if over budget

import { PROVIDER } from './DataProviderRegistry.js';
import { CostTracker } from './CostTracker.js';
import { obs } from './ObservabilityHub.js';

// Monthly budget per provider (INR). 0 = unlimited.
const MONTHLY_BUDGET_INR: Partial<Record<string, number>> = {
  [PROVIDER.UPSTOX]:         500,
  [PROVIDER.KITE]:           500,
  [PROVIDER.YAHOO]:          200,
  [PROVIDER.SCREENER]:       200,
  [PROVIDER.TRENDLYNE_SITE]: 100,
};

const GLOBAL_BUDGET_INR = 2000; // ₹2,000/month total

export class BudgetEnforcer {
  private static instance: BudgetEnforcer;

  static getInstance(): BudgetEnforcer {
    if (!BudgetEnforcer.instance) BudgetEnforcer.instance = new BudgetEnforcer();
    return BudgetEnforcer.instance;
  }

  // Returns true if the call is allowed, false if over budget
  isAllowed(provider: string): boolean {
    const tracker = CostTracker.getInstance();
    const total = tracker.totalCostINR();
    if (total >= GLOBAL_BUDGET_INR) {
      obs.warn('BudgetEnforcer', 'global_budget_exceeded', { totalCostINR: total, limitINR: GLOBAL_BUDGET_INR });
      obs.increment('budget.blocked', { reason: 'global' });
      return false;
    }
    const limit = MONTHLY_BUDGET_INR[provider];
    if (limit !== undefined) {
      const summary = tracker.summary();
      const providerCost = summary.byProvider[provider]?.estimatedCostINR ?? 0;
      if (providerCost >= limit) {
        obs.warn('BudgetEnforcer', 'provider_budget_exceeded', { provider, providerCostINR: providerCost, limitINR: limit });
        obs.increment('budget.blocked', { reason: 'provider', provider });
        return false;
      }
    }
    return true;
  }

  // Expose budget status for health endpoint
  status(): {
    globalUsedINR: number;
    globalLimitINR: number;
    globalPct: number;
    providers: Record<string, { usedINR: number; limitINR: number; pct: number }>;
  } {
    const tracker = CostTracker.getInstance();
    const summary = tracker.summary();
    const globalUsedINR = summary.totalCostINR;
    const providers: Record<string, { usedINR: number; limitINR: number; pct: number }> = {};
    for (const [p, limit] of Object.entries(MONTHLY_BUDGET_INR)) {
      const usedINR = summary.byProvider[p]?.estimatedCostINR ?? 0;
      providers[p] = { usedINR, limitINR: limit, pct: Math.round((usedINR / limit) * 100) };
    }
    return {
      globalUsedINR,
      globalLimitINR: GLOBAL_BUDGET_INR,
      globalPct: Math.round((globalUsedINR / GLOBAL_BUDGET_INR) * 100),
      providers,
    };
  }
}
