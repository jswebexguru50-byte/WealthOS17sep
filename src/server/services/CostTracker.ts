// CostTracker — per-provider call accounting
// Cost config: rough estimates per call in INR

import { PROVIDER } from './DataProviderRegistry.js';
import { obs } from './ObservabilityHub.js';

// Cost per call in INR (rounded estimates)
const COST_PER_CALL_INR: Partial<Record<string, number>> = {
  [PROVIDER.UPSTOX]:         0.50,
  [PROVIDER.KITE]:           0.50,
  [PROVIDER.TRADINGVIEW]:    0.10,
  [PROVIDER.TRENDLYNE_SITE]: 0.10,
  [PROVIDER.NSE]:            0.05,
  [PROVIDER.BSE]:            0.05,
  [PROVIDER.MCA]:            0.05,
  [PROVIDER.COMPANY_IR]:     0.02,
  [PROVIDER.SCREENER]:       0.10,
  [PROVIDER.YAHOO]:          0.10,
  [PROVIDER.TRENDLYNE_MCP]:  0.20,
};

export interface ProviderStats {
  calls: number;
  estimatedCostINR: number;
  errors: number;
}

export class CostTracker {
  private static instance: CostTracker;
  private stats = new Map<string, ProviderStats>();
  private monthStart = new Date();

  static getInstance(): CostTracker {
    if (!CostTracker.instance) CostTracker.instance = new CostTracker();
    return CostTracker.instance;
  }

  recordCall(provider: string, success: boolean): void {
    const s = this.stats.get(provider) ?? { calls: 0, estimatedCostINR: 0, errors: 0 };
    s.calls++;
    s.estimatedCostINR += COST_PER_CALL_INR[provider] ?? 0;
    if (!success) s.errors++;
    this.stats.set(provider, s);
    obs.increment('provider.calls', { provider, success: String(success) });
  }

  totalCostINR(): number {
    let total = 0;
    for (const s of this.stats.values()) total += s.estimatedCostINR;
    return total;
  }

  summary(): { byProvider: Record<string, ProviderStats>; totalCostINR: number; monthStart: string } {
    const byProvider: Record<string, ProviderStats> = {};
    for (const [p, s] of this.stats) byProvider[p] = { ...s };
    return { byProvider, totalCostINR: this.totalCostINR(), monthStart: this.monthStart.toISOString() };
  }

  reset(): void {
    this.stats.clear();
    this.monthStart = new Date();
  }
}
