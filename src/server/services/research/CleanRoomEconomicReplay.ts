import crypto from 'node:crypto';
import { CanonicalTrade } from './CanonicalTradeLedger';
import { ProducerTradePnlCalculator, CostModel } from './ProducerTradePnlCalculator';
import { ResearchRun } from './ResearchRun';

export interface ReplayedTrade extends CanonicalTrade {
  entry: number;
  exit: number;
  gross: number;
  costs: number;
  net: number;
  R: number | null;
}

export interface EquityPoint {
  date: string;
  equity: number;
  drawdownPct: number;
}

export interface EconomicReplayResult {
  runId: string;
  trades: ReplayedTrade[];
  equityCurve: EquityPoint[];

  metrics: {
    CAGR: number;
    Sharpe: number;
    Sortino: number;
    MaxDD: number;
    Calmar: number;
    profitFactor: number;
    expectancyR: number;
    turnover: number;
    costs: number;
    exposure: number;
    tradeCount: number;
  };

  inputHash: string;
  configurationHash: string;
  outputHash: string;
}

export class CleanRoomEconomicReplay {
  public run(
    runContext: ResearchRun,
    trades: CanonicalTrade[],
    costModel: CostModel
  ): EconomicReplayResult {
    // 1. Deterministic order
    const sortedTrades = [...trades].sort((a, b) => a.tradeId.localeCompare(b.tradeId));

    // 2. Trade Level economics
    const replayedTrades: ReplayedTrade[] = sortedTrades.map((t) => {
      const pnl = ProducerTradePnlCalculator.calculateTradePnl(t, costModel);
      
      const riskPerShare = Math.abs(pnl.entry - t.stopPrice);
      const initialRisk = riskPerShare * t.quantity;
      const R = initialRisk > 0 ? pnl.net / initialRisk : null;

      return {
        ...t,
        ...pnl,
        R
      };
    });

    // 3. Trade Level Aggregation
    let totalGross = 0;
    let totalCosts = 0;
    let totalNet = 0;
    let winPnl = 0;
    let lossPnl = 0;
    const validR: number[] = [];

    for (const t of replayedTrades) {
      totalGross += t.gross;
      totalCosts += t.costs;
      totalNet += t.net;

      if (t.net > 0) winPnl += t.net;
      else lossPnl += Math.abs(t.net);

      if (t.R !== null && isFinite(t.R)) {
        validR.push(t.R);
      }
    }

    const expectancyR = validR.length > 0 
      ? validR.reduce((a, b) => a + b, 0) / validR.length 
      : 0;

    const profitFactor = lossPnl > 0 ? +(winPnl / lossPnl).toFixed(4) : 0;

    // Output hash serialization
    const outputHash = crypto.createHash('sha256')
      .update(JSON.stringify({ 
        runId: runContext.runId,
        tradeCount: replayedTrades.length,
        totalNet,
        expectancyR 
      }))
      .digest('hex');

    return {
      runId: runContext.runId,
      trades: replayedTrades,
      equityCurve: [], // To be built from true daily MTM logic, stubbed for now
      metrics: {
        CAGR: 0, // Stubbed, requires true MTM logic based on time
        Sharpe: 0, // Stubbed
        Sortino: 0, // Stubbed
        MaxDD: 0, // Stubbed
        Calmar: 0, // Stubbed
        profitFactor,
        expectancyR,
        turnover: 0, // Stubbed
        costs: totalCosts,
        exposure: 0, // Stubbed
        tradeCount: replayedTrades.length,
      },
      inputHash: runContext.inputs.configurationHash, // simplifying for now
      configurationHash: runContext.inputs.configurationHash,
      outputHash
    };
  }
}
