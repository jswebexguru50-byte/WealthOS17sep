import { ReconstructedTrade } from './R421LedgerReconstructor';

export interface RightTailPercentile {
  percentileLabel: string;
  topTradeCount: number;
  grossContributionINR: number;
  grossContributionPct: number;
  netContributionINR: number;
  netContributionPct: number;
}

export interface RightTailAuditSummary {
  timestamp: string;
  totalTrades: number;
  totalGrossPnL: number;
  totalNetPnL: number;
  tailDependenceRating: 'LOW' | 'MODERATE' | 'HIGH';
  percentiles: RightTailPercentile[];
}

export class R421RightTailAudit {
  public static auditRightTail(trades: ReconstructedTrade[]): RightTailAuditSummary {
    const sortedByNet = [...trades].sort((a, b) => b.netPnL - a.netPnL);
    const n = sortedByNet.length;

    const totalGross = trades.reduce((sum, t) => sum + t.grossPnL, 0);
    const totalNet = trades.reduce((sum, t) => sum + t.netPnL, 0);

    const percentDefs = [
      { label: 'top 1%', pct: 0.01 },
      { label: 'top 2.5%', pct: 0.025 },
      { label: 'top 5%', pct: 0.05 },
      { label: 'top 10%', pct: 0.10 }
    ];

    const percentiles: RightTailPercentile[] = [];
    let top1PctNetShare = 0;

    for (const p of percentDefs) {
      const topN = Math.max(1, Math.round(n * p.pct));
      const topSubset = sortedByNet.slice(0, topN);

      const topGross = topSubset.reduce((sum, t) => sum + t.grossPnL, 0);
      const topNet = topSubset.reduce((sum, t) => sum + t.netPnL, 0);

      const grossPct = totalGross !== 0 ? (topGross / Math.abs(totalGross)) * 100 : 0;
      const netPct = totalNet !== 0 ? (topNet / Math.abs(totalNet)) * 100 : 0;

      if (p.pct === 0.01) top1PctNetShare = netPct;

      percentiles.push({
        percentileLabel: p.label,
        topTradeCount: topN,
        grossContributionINR: Math.round(topGross * 100) / 100,
        grossContributionPct: Math.round(grossPct * 100) / 100,
        netContributionINR: Math.round(topNet * 100) / 100,
        netContributionPct: Math.round(netPct * 100) / 100
      });
    }

    const tailRating = top1PctNetShare > 40 ? 'HIGH' : top1PctNetShare > 20 ? 'MODERATE' : 'LOW';

    return {
      timestamp: new Date().toISOString(),
      totalTrades: n,
      totalGrossPnL: Math.round(totalGross * 100) / 100,
      totalNetPnL: Math.round(totalNet * 100) / 100,
      tailDependenceRating: tailRating,
      percentiles
    };
  }
}
