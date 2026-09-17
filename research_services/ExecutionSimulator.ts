import { TransactionCostEngine } from "./TransactionCostEngine.js";
import type {
  ExecutionConfig,
  Fill,
  ResearchBar,
  ResearchSignal,
  TradeIdentityLedger
} from "./types.js";

export interface ActivePosition {
  signal: ResearchSignal;
  entryBar: ResearchBar;
  symbol: string;
  quantity: number;
  averageEntry: number;
  entryCost: number;
  entryNotional: number;
  entryBrokerage: number;
  entrySTT: number;
  entryExchangeTxn: number;
  entryStampDuty: number;
  entryGST: number;
  entrySlippage: number;
  entryImpact: number;
  stop: number;
  target?: number;
  lowestPrice: number;
  highestPrice: number;
  holdingBars: number;
}

export interface SimulationResult {
  fills: Fill[];
  trades: TradeIdentityLedger[];
  equity: { timestamp: string; equity: number }[];
  endingCapital: number;
}

export class ExecutionSimulator {
  private cash: number;
  private readonly fills: Fill[] = [];
  private readonly trades: TradeIdentityLedger[] = [];
  private readonly equity: { timestamp: string; equity: number }[] = [];
  private readonly costs: TransactionCostEngine;
  private readonly activePositions = new Map<string, ActivePosition>();

  constructor(
    private readonly config: ExecutionConfig,
    private readonly runId: string,
    private readonly parameterHash: string
  ) {
    this.cash = config.initialCapital;
    this.costs = new TransactionCostEngine(config);
  }

  run(
    signals: ResearchSignal[],
    bars: ResearchBar[],
    arm: TradeIdentityLedger["experimentArm"]
  ): SimulationResult {
    // 1. Group bars by timestamp for synchronous mark-to-market and chronological progression
    const barsByTimestamp = new Map<string, Map<string, ResearchBar>>();
    const allTimestampsSet = new Set<string>();

    for (const bar of bars) {
      allTimestampsSet.add(bar.timestamp);
      let map = barsByTimestamp.get(bar.timestamp);
      if (!map) {
        map = new Map<string, ResearchBar>();
        barsByTimestamp.set(bar.timestamp, map);
      }
      map.set(bar.symbol, bar);
    }

    const timestamps = Array.from(allTimestampsSet).sort((a, b) => a.localeCompare(b));

    // 2. Index signals sorted chronologically
    const sortedSignals = [...signals].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    let signalIdx = 0;

    for (let tIdx = 0; tIdx < timestamps.length; tIdx++) {
      const currentTimestamp = timestamps[tIdx];
      const barsAtT = barsByTimestamp.get(currentTimestamp)!;
      const isLastBarOfSimulation = tIdx === timestamps.length - 1;

      // ------------------------------------------------------------
      // A. EVALUATE EXITS FOR ACTIVE POSITIONS AT CURRENT BAR
      // ------------------------------------------------------------
      for (const [symbol, pos] of Array.from(this.activePositions.entries())) {
        const bar = barsAtT.get(symbol);
        if (!bar) continue; // No bar for this symbol today

        pos.holdingBars++;
        pos.lowestPrice = Math.min(pos.lowestPrice, bar.low);
        pos.highestPrice = Math.max(pos.highestPrice, bar.high);

        let requestedExit: number | null = null;
        let exitReason = "";

        // Conservative Intrabar Ambiguity Resolution:
        // If both stop and target touched in the same daily bar, STOP is assumed first.
        if (bar.low <= pos.stop && pos.target !== undefined && bar.high >= pos.target) {
          requestedExit = pos.stop;
          exitReason = "CONSERVATIVE_STOP_FIRST";
        } else if (bar.low <= pos.stop) {
          requestedExit = pos.stop;
          exitReason = "STOP_LOSS";
        } else if (pos.target !== undefined && bar.high >= pos.target) {
          requestedExit = pos.target;
          exitReason = "TARGET_HIT";
        } else if (pos.holdingBars >= 15) {
          requestedExit = bar.close;
          exitReason = "TIME_STOP";
        } else if (isLastBarOfSimulation) {
          requestedExit = bar.close;
          exitReason = "END_OF_SIMULATION";
        }

        if (requestedExit !== null) {
          const participation = bar.volume > 0 ? pos.quantity / bar.volume : 1;
          const execution = this.costs.executionPrice("SELL", requestedExit, pos.quantity, participation);
          const statutory = this.costs.estimate("SELL", execution.fillPrice, pos.quantity);

          const grossPnl = (execution.fillPrice - pos.averageEntry) * pos.quantity;
          const totalCost = pos.entryCost + statutory.total;
          const netPnl = grossPnl - totalCost;

          this.cash += execution.fillPrice * pos.quantity - statutory.total;

          this.fills.push({
            timestamp: bar.timestamp,
            symbol,
            side: "SELL",
            quantity: pos.quantity,
            requestedPrice: requestedExit,
            fillPrice: execution.fillPrice,
            grossValue: execution.fillPrice * pos.quantity,
            estimatedCost: statutory.total,
            reason: exitReason
          });

          const initialRiskPerShare = Math.abs(pos.signal.entry - pos.signal.stop);
          const maePricePct = pos.averageEntry > 0 ? (pos.lowestPrice - pos.averageEntry) / pos.averageEntry : 0;
          const mfePricePct = pos.averageEntry > 0 ? (pos.highestPrice - pos.averageEntry) / pos.averageEntry : 0;
          const maeR = initialRiskPerShare > 0 ? (pos.lowestPrice - pos.averageEntry) / initialRiskPerShare : 0;
          const mfeR = initialRiskPerShare > 0 ? (pos.highestPrice - pos.averageEntry) / initialRiskPerShare : 0;
          const netR = initialRiskPerShare > 0 ? netPnl / (initialRiskPerShare * pos.quantity) : 0;

          this.trades.push({
            tradeId: `${this.runId}-${pos.signal.signalId}`,
            signalId: pos.signal.signalId,
            strategyId: pos.signal.strategyId,
            experimentArm: arm,
            symbol,
            signalTimestamp: pos.signal.timestamp,
            entryTimestamp: pos.entryBar.timestamp,
            exitTimestamp: bar.timestamp,
            direction: pos.signal.direction,
            entrySignalPrice: pos.signal.entry,
            actualEntryPrice: pos.averageEntry,
            initialStop: pos.stop,
            finalExitPrice: execution.fillPrice,
            quantity: pos.quantity,
            grossPnl: Number(grossPnl.toFixed(2)),
            estimatedAllInCosts: Number(totalCost.toFixed(2)),
            netPnl: Number(netPnl.toFixed(2)),
            netRMultiple: Number(netR.toFixed(4)),
            mae: Number(maePricePct.toFixed(4)),
            mfe: Number(mfePricePct.toFixed(4)),
            maePricePct: Number(maePricePct.toFixed(4)),
            mfePricePct: Number(mfePricePct.toFixed(4)),
            maeR: Number(maeR.toFixed(4)),
            mfeR: Number(mfeR.toFixed(4)),
            exitReason,
            regime: "UNCLASSIFIED",
            runId: this.runId,
            parameterHash: this.parameterHash,
            createdAt: new Date().toISOString(),
            provenance: ["REAL_HISTORICAL", "NEXT_BAR_OPEN", "ExecutionSimulator"],

            // Exact Cost and Notional Breakdown
            entryNotional: Number(pos.entryNotional.toFixed(2)),
            exitNotional: Number((execution.fillPrice * pos.quantity).toFixed(2)),
            entryBrokerage: Number(pos.entryBrokerage.toFixed(2)),
            entrySTT: Number(pos.entrySTT.toFixed(2)),
            entryExchangeTxn: Number(pos.entryExchangeTxn.toFixed(2)),
            entryStampDuty: Number(pos.entryStampDuty.toFixed(2)),
            entryGST: Number(pos.entryGST.toFixed(2)),
            exitBrokerage: Number(statutory.brokerage.toFixed(2)),
            exitSTT: Number(statutory.stt.toFixed(2)),
            exitExchangeTxn: Number(statutory.exchangeTxn.toFixed(2)),
            exitStampDuty: Number(statutory.stampDuty.toFixed(2)),
            exitGST: Number(statutory.gst.toFixed(2)),
            slippageCost: Number((pos.entrySlippage + execution.slippage).toFixed(2)),
            marketImpactCost: Number((pos.entryImpact + execution.impact).toFixed(2))
          });

          this.activePositions.delete(symbol);
        }
      }

      // ------------------------------------------------------------
      // B. EVALUATE ENTRIES FOR ELIGIBLE SIGNALS AT CURRENT BAR OPEN
      // ------------------------------------------------------------
      while (
        signalIdx < sortedSignals.length &&
        sortedSignals[signalIdx].timestamp < currentTimestamp
      ) {
        const signal = sortedSignals[signalIdx];
        signalIdx++;

        // Can only enter if we do not already have an open position in this symbol
        if (this.activePositions.has(signal.symbol)) {
          continue;
        }

        const bar = barsAtT.get(signal.symbol);
        if (!bar || !bar.tradable || signal.direction !== "LONG") {
          continue;
        }

        if (signal.timestamp >= bar.timestamp) {
          throw new Error(
            `INVALID_SAME_BAR_EXECUTION: ${signal.signalId} ${signal.timestamp} >= ${bar.timestamp}`
          );
        }

        const requestedEntry = bar.open;
        if (!Number.isFinite(requestedEntry) || requestedEntry <= 0) {
          continue;
        }

        const riskPerShare = Math.abs(requestedEntry - signal.stop);
        if (!Number.isFinite(riskPerShare) || riskPerShare <= 0) {
          continue;
        }

        const riskBudget = this.cash * 0.005; // 0.5% capital risk budget
        const rawQty = Math.floor(riskBudget / riskPerShare);
        const liquidityQty = Math.floor(bar.volume * this.config.maxParticipationPct);
        const quantity = Math.max(0, Math.min(rawQty, liquidityQty));

        if (quantity <= 0) {
          continue;
        }

        const participation = bar.volume > 0 ? quantity / bar.volume : 1;
        if (participation > this.config.maxParticipationPct + 1e-12) {
          throw new Error(`LIQUIDITY_PARTICIPATION_VIOLATION: ${participation} > ${this.config.maxParticipationPct}`);
        }

        const execution = this.costs.executionPrice("BUY", requestedEntry, quantity, participation);
        const statutory = this.costs.estimate("BUY", execution.fillPrice, quantity);
        const grossValue = execution.fillPrice * quantity;

        if (grossValue + statutory.total > this.cash) {
          continue; // Insufficient cash
        }

        this.cash -= grossValue + statutory.total;

        this.fills.push({
          timestamp: bar.timestamp,
          symbol: signal.symbol,
          side: "BUY",
          quantity,
          requestedPrice: requestedEntry,
          fillPrice: execution.fillPrice,
          grossValue,
          estimatedCost: statutory.total,
          reason: "NEXT_TRADABLE_BAR_OPEN"
        });

        this.activePositions.set(signal.symbol, {
          signal,
          entryBar: bar,
          symbol: signal.symbol,
          quantity,
          averageEntry: execution.fillPrice,
          entryCost: statutory.total,
          entryNotional: grossValue,
          entryBrokerage: statutory.brokerage,
          entrySTT: statutory.stt,
          entryExchangeTxn: statutory.exchangeTxn,
          entryStampDuty: statutory.stampDuty,
          entryGST: statutory.gst,
          entrySlippage: execution.slippage,
          entryImpact: execution.impact,
          stop: signal.stop,
          target: signal.target,
          lowestPrice: bar.low,
          highestPrice: bar.high,
          holdingBars: 0
        });
      }

      // ------------------------------------------------------------
      // C. CONTINUOUS MARK-TO-MARKET PORTFOLIO EQUITY
      // True continuous equity = Cash + Current Market Value of Open Positions
      // ------------------------------------------------------------
      let mtmEquity = this.cash;
      for (const pos of this.activePositions.values()) {
        const currentBar = barsAtT.get(pos.symbol);
        const markPrice = currentBar ? currentBar.close : pos.averageEntry;
        mtmEquity += pos.quantity * markPrice;
      }

      this.equity.push({
        timestamp: currentTimestamp,
        equity: Number(mtmEquity.toFixed(2))
      });
    }

    return {
      fills: this.fills,
      trades: this.trades,
      equity: this.equity,
      endingCapital: this.cash
    };
  }

  // Diagnostic helper for tests
  public markToMarket(
    bars: ResearchBar[],
    positions: Map<string, { quantity: number; symbol: string }>
  ): { timestamp: string; equity: number }[] {
    const barsByTimestamp = new Map<string, Map<string, ResearchBar>>();
    const allTimestampsSet = new Set<string>();

    for (const bar of bars) {
      allTimestampsSet.add(bar.timestamp);
      let map = barsByTimestamp.get(bar.timestamp);
      if (!map) {
        map = new Map<string, ResearchBar>();
        barsByTimestamp.set(bar.timestamp, map);
      }
      map.set(bar.symbol, bar);
    }

    const timestamps = Array.from(allTimestampsSet).sort((a, b) => a.localeCompare(b));
    const result: { timestamp: string; equity: number }[] = [];
    const latest = new Map<string, ResearchBar>();

    for (const ts of timestamps) {
      const barsAtT = barsByTimestamp.get(ts)!;
      for (const [sym, b] of barsAtT.entries()) {
        latest.set(sym, b);
      }

      let equity = this.cash;
      for (const position of positions.values()) {
        const mark = latest.get(position.symbol);
        if (!mark) continue;
        equity += position.quantity * mark.close;
      }

      result.push({
        timestamp: ts,
        equity: Number(equity.toFixed(2))
      });
    }
    return result;
  }
}
