import { ReconstructedTrade } from './R421LedgerReconstructor';

export interface RegimePerformance {
  regimeLabel: string;
  tradeCount: number;
  tradeSharePct: number;
  grossPnL: number;
  totalCosts: number;
  netPnL: number;
  meanR: number;
  winRatePct: number;
}

export interface RegimeAuditSummary {
  timestamp: string;
  totalTrades: number;
  dominantRegime: string;
  regimes: RegimePerformance[];
}

export class R421RegimeAudit {
  public static auditRegimes(trades: ReconstructedTrade[]): RegimeAuditSummary {
    const regimeGroups: Record<string, ReconstructedTrade[]> = {};

    for (const t of trades) {
      const year = new Date(t.entryDate).getFullYear();
      let regime = 'BULL_TRENDING';
      if (year === 2022 || year === 2025) regime = 'HIGH_VOL';
      else if (year === 2023) regime = 'LOW_VOL';
      else if (year === 2024) regime = 'BULL_TRENDING';
      else regime = 'BEAR_TRENDING';

      if (!regimeGroups[regime]) regimeGroups[regime] = [];
      regimeGroups[regime].push(t);
    }

    const regimes: RegimePerformance[] = [];
    let maxCount = 0;
    let dominantRegime = 'UNKNOWN';

    for (const r of Object.keys(regimeGroups)) {
      const group = regimeGroups[r];
      const n = group.length;
      if (n > maxCount) {
        maxCount = n;
        dominantRegime = r;
      }

      let gross = 0;
      let costs = 0;
      let rSum = 0;
      let wins = 0;

      for (const t of group) {
        gross += t.grossPnL;
        costs += t.transactionCosts;
        rSum += t.strategyStopRiskR;
        if (t.netPnL > 0) wins++;
      }

      const net = gross - costs;
      regimes.push({
        regimeLabel: r,
        tradeCount: n,
        tradeSharePct: Math.round((n / trades.length) * 10000) / 100,
        grossPnL: Math.round(gross * 100) / 100,
        totalCosts: Math.round(costs * 100) / 100,
        netPnL: Math.round(net * 100) / 100,
        meanR: n > 0 ? Math.round((rSum / n) * 100000) / 100000 : 0,
        winRatePct: n > 0 ? Math.round((wins / n) * 10000) / 100 : 0
      });
    }

    return {
      timestamp: new Date().toISOString(),
      totalTrades: trades.length,
      dominantRegime,
      regimes
    };
  }
}
