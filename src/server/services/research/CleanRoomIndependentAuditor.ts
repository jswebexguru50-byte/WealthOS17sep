import crypto from 'node:crypto';
import { CanonicalTrade } from './CanonicalTradeLedger';
import { ResearchRun } from './ResearchRun';

// NOTE: CleanRoomIndependentAuditor MUST NOT import ProducerTradePnlCalculator
// or CleanRoomEconomicReplay. It independently validates the economic outcomes.

export interface AuditorTradePnl {
  calculatedEntry: number;
  calculatedExit: number;
  calculatedGross: number;
  calculatedNet: number;
  calculatedR: number | null;
}

export interface AuditResult {
  runId: string;
  auditedTrades: Record<string, AuditorTradePnl>;
  auditedExpectancyR: number;
  auditedTotalNetPnl: number;
  auditedTradeCount: number;
  outputHash: string;
}

export class CleanRoomIndependentAuditor {
  public run(
    runContext: ResearchRun,
    trades: CanonicalTrade[],
    // Using a simple function here to avoid sharing the CostModel interface 
    // from the Producer side if it introduces a shared dependency.
    calculateCosts: (trade: CanonicalTrade, entry: number, exit: number) => number
  ): AuditResult {
    // 1. Deterministic sort
    const sortedTrades = [...trades].sort((a, b) => a.tradeId.localeCompare(b.tradeId));
    
    const auditedTrades: Record<string, AuditorTradePnl> = {};
    let totalNet = 0;
    const validRs: number[] = [];

    // 2. Independent P&L implementation using nullish coalescing
    for (const t of sortedTrades) {
      const entry = t.actualEntryPrice ?? t.entryPrice;
      const exit = t.actualExitPrice ?? t.exitPrice;
      const gross = (exit - entry) * t.quantity;
      const costs = calculateCosts(t, entry, exit);
      const net = gross - costs;

      const riskPerShare = Math.abs(entry - t.stopPrice);
      const initialRisk = riskPerShare * t.quantity;
      const R = initialRisk > 0 ? net / initialRisk : null;

      auditedTrades[t.tradeId] = {
        calculatedEntry: entry,
        calculatedExit: exit,
        calculatedGross: gross,
        calculatedNet: net,
        calculatedR: R
      };

      totalNet += net;
      if (R !== null && isFinite(R)) {
        validRs.push(R);
      }
    }

    const auditedExpectancyR = validRs.length > 0
      ? validRs.reduce((a, b) => a + b, 0) / validRs.length
      : 0;

    const outputHash = crypto.createHash('sha256')
      .update(JSON.stringify({ 
        runId: runContext.runId,
        auditedTradeCount: sortedTrades.length,
        auditedTotalNetPnl: totalNet,
        auditedExpectancyR 
      }))
      .digest('hex');

    return {
      runId: runContext.runId,
      auditedTrades,
      auditedExpectancyR,
      auditedTotalNetPnl: totalNet,
      auditedTradeCount: sortedTrades.length,
      outputHash
    };
  }
}
