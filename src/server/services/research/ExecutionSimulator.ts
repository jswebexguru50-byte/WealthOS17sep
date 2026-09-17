import { TransactionCostEngine } from "./TransactionCostEngine.js";
import { TradingCalendarService } from "./TradingCalendarService.js";
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
  latestClose?: number;
}

export interface SimulationResult {
  fills: Fill[];
  trades: TradeIdentityLedger[];
  equity: { timestamp: string; equity: number }[];
  equityCurve?: { timestamp: string; equity: number }[];
  endingCapital: number;
  finalCash?: number;
  totalTrades?: number;
}

export class ExecutionSimulator {
  private _cash: number;
  private readonly _fills: Fill[] = [];
  private readonly _trades: TradeIdentityLedger[] = [];
  private readonly _equity: { timestamp: string; equity: number }[] = [];
  private readonly _costs: TransactionCostEngine;
  private readonly _calendar: TradingCalendarService;
  private readonly _activePositions = new Map<string, ActivePosition>();

  constructor(
    public readonly config: ExecutionConfig,
    public readonly runId: string = "RUN-SIM",
    public readonly parameterHash: string = "PARAM-HASH",
    calendar?: TradingCalendarService
  ) {
    this._cash = config.initialCapital;
    this._costs = new TransactionCostEngine(config);
    this._calendar = calendar ?? config.calendar ?? TradingCalendarService.getInstance();
  }

  public get calendar(): TradingCalendarService {
    return this._calendar;
  }

  public get positions(): Map<string, ActivePosition> {
    return this._activePositions;
  }

  public get cash(): number {
    return this._cash;
  }

  public get trades(): TradeIdentityLedger[] {
    return this._trades;
  }

  public get fills(): Fill[] {
    return this._fills;
  }

  public get equityCurve(): { timestamp: string; equity: number }[] {
    return this._equity;
  }

  public get costs(): TransactionCostEngine {
    return this._costs;
  }

  public executeEntry(
    signal: ResearchSignal,
    bar: ResearchBar,
    quantity: number,
    execution: { fillPrice: number; slippage: number; impact: number },
    statutory: { brokerage: number; stt: number; exchangeTxn: number; stampDuty: number; gst: number; total: number },
    grossValue: number
  ): Fill {
    if (signal.timestamp >= bar.timestamp) {
      throw new Error(
        `SAME_BAR_EXECUTION: signal=${signal.signalId} signalTimestamp=${signal.timestamp} executionTimestamp=${bar.timestamp}`
      );
    }

    this._cash -= (grossValue + statutory.total);

    const fill: Fill = {
      timestamp: bar.timestamp,
      symbol: signal.symbol,
      side: "BUY",
      quantity,
      requestedPrice: bar.open,
      fillPrice: execution.fillPrice,
      grossValue,
      estimatedCost: statutory.total,
      reason: "NEXT_TRADABLE_BAR_OPEN"
    };
    this._fills.push(fill);

    this._activePositions.set(signal.symbol, {
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
      holdingBars: 0,
      latestClose: bar.close
    });

    return fill;
  }

  public executeExitAtBarOpen(
    pos: ActivePosition,
    bar: ResearchBar,
    exitReason: string,
    arm: TradeIdentityLedger["experimentArm"] = "A_RAW"
  ): Fill {
    const participation = bar.volume > 0 ? pos.quantity / bar.volume : 0;
    const execution = this._costs.executionPrice("SELL", bar.open, pos.quantity, participation);
    const statutory = this._costs.estimate("SELL", execution.fillPrice, pos.quantity);

    const grossPnl = (execution.fillPrice - pos.averageEntry) * pos.quantity;
    const totalCost = pos.entryCost + statutory.total;
    const netPnl = grossPnl - totalCost;

    this._cash += execution.fillPrice * pos.quantity - statutory.total;

    const fill: Fill = {
      timestamp: bar.timestamp,
      symbol: pos.symbol,
      side: "SELL",
      quantity: pos.quantity,
      requestedPrice: bar.open,
      fillPrice: execution.fillPrice,
      grossValue: execution.fillPrice * pos.quantity,
      estimatedCost: statutory.total,
      reason: exitReason
    };
    this._fills.push(fill);

    const initialRiskPerShare = Math.abs(pos.signal.entry - pos.signal.stop);
    const maePricePct = pos.averageEntry > 0 ? (pos.lowestPrice - pos.averageEntry) / pos.averageEntry : 0;
    const mfePricePct = pos.averageEntry > 0 ? (pos.highestPrice - pos.averageEntry) / pos.averageEntry : 0;
    const maeR = initialRiskPerShare > 0 ? (pos.lowestPrice - pos.averageEntry) / initialRiskPerShare : 0;
    const mfeR = initialRiskPerShare > 0 ? (pos.highestPrice - pos.averageEntry) / initialRiskPerShare : 0;
    const netR = initialRiskPerShare > 0 ? netPnl / (initialRiskPerShare * pos.quantity) : 0;

    this._trades.push({
      tradeId: `${this.runId}-${pos.signal.signalId}`,
      signalId: pos.signal.signalId,
      strategyId: pos.signal.strategyId,
      experimentArm: arm,
      symbol: pos.symbol,
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

    this._activePositions.delete(pos.symbol);
    return fill;
  }

  public executeExitAtBarClose(
    pos: ActivePosition,
    bar: ResearchBar,
    exitReason: string,
    arm: TradeIdentityLedger["experimentArm"] = "A_RAW"
  ): Fill {
    const participation = bar.volume > 0 ? pos.quantity / bar.volume : 0;
    const execution = this._costs.executionPrice("SELL", bar.close, pos.quantity, participation);
    const statutory = this._costs.estimate("SELL", execution.fillPrice, pos.quantity);

    const grossPnl = (execution.fillPrice - pos.averageEntry) * pos.quantity;
    const totalCost = pos.entryCost + statutory.total;
    const netPnl = grossPnl - totalCost;

    this._cash += execution.fillPrice * pos.quantity - statutory.total;

    const fill: Fill = {
      timestamp: bar.timestamp,
      symbol: pos.symbol,
      side: "SELL",
      quantity: pos.quantity,
      requestedPrice: bar.close,
      fillPrice: execution.fillPrice,
      grossValue: execution.fillPrice * pos.quantity,
      estimatedCost: statutory.total,
      reason: exitReason
    };
    this._fills.push(fill);

    const initialRiskPerShare = Math.abs(pos.signal.entry - pos.signal.stop);
    const maePricePct = pos.averageEntry > 0 ? (pos.lowestPrice - pos.averageEntry) / pos.averageEntry : 0;
    const mfePricePct = pos.averageEntry > 0 ? (pos.highestPrice - pos.averageEntry) / pos.averageEntry : 0;
    const maeR = initialRiskPerShare > 0 ? (pos.lowestPrice - pos.averageEntry) / initialRiskPerShare : 0;
    const mfeR = initialRiskPerShare > 0 ? (pos.highestPrice - pos.averageEntry) / initialRiskPerShare : 0;
    const netR = initialRiskPerShare > 0 ? netPnl / (initialRiskPerShare * pos.quantity) : 0;

    this._trades.push({
      tradeId: `${this.runId}-${pos.signal.signalId}`,
      signalId: pos.signal.signalId,
      strategyId: pos.signal.strategyId,
      experimentArm: arm,
      symbol: pos.symbol,
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
      provenance: ["REAL_HISTORICAL", "CLOSE_OF_SIMULATION", "ExecutionSimulator"],
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

    this._activePositions.delete(pos.symbol);
    return fill;
  }

  public evaluateBar(
    bar: ResearchBar,
    nextBar: ResearchBar | null
  ): { symbol: string; exitReason: string; exitBarTimestamp: string } | null {
    const pos = this._activePositions.get(bar.symbol);
    if (!pos) return null;

    pos.holdingBars++;
    pos.lowestPrice = Math.min(pos.lowestPrice, bar.low);
    pos.highestPrice = Math.max(pos.highestPrice, bar.high);
    pos.latestClose = bar.close;

    let exitReason: string | null = null;

    // Conservative Intrabar Ambiguity Resolution:
    // If both stop and target touched in the same daily bar, STOP is assumed first.
    if (bar.low <= pos.stop && pos.target !== undefined && bar.high >= pos.target) {
      exitReason = "CONSERVATIVE_STOP_FIRST";
    } else if (bar.low <= pos.stop) {
      exitReason = "STOP_LOSS";
    } else if (pos.target !== undefined && bar.high >= pos.target) {
      exitReason = "TARGET_HIT";
    } else if (pos.holdingBars >= 15) {
      exitReason = "TIME_STOP";
    }

    if (exitReason) {
      return {
        symbol: bar.symbol,
        exitReason,
        exitBarTimestamp: nextBar ? nextBar.timestamp : bar.timestamp
      };
    }
    return null;
  }

  public markToMarketAll(currentBars: Map<string, ResearchBar>, timestamp?: string): number {
    let mtmEquity = this._cash;
    for (const pos of this._activePositions.values()) {
      const currentBar = currentBars.get(pos.symbol);
      const markPrice = currentBar ? currentBar.close : (pos.latestClose ?? pos.averageEntry);
      if (currentBar) {
        pos.latestClose = currentBar.close;
      }
      mtmEquity += pos.quantity * markPrice;
    }

    const ts = timestamp || (currentBars.values().next().value?.timestamp ?? new Date().toISOString());
    const roundedEquity = Number(mtmEquity.toFixed(2));
    this._equity.push({
      timestamp: ts,
      equity: roundedEquity
    });
    return roundedEquity;
  }

  /**
   * Deterministic Multi-Asset Event Loop
   * Strictly adheres to reviewer contract:
   * 1. Validate all bars at this timestamp (PIT check)
   * 2. Process signals executable on this bar (strictly signal.timestamp < bar.timestamp)
   * 3. Evaluate existing positions against this bar (exit on next tradable bar open)
   * 4. Continuous multi-asset mark-to-market across all open positions
   */
  public static simulate(
    signals: ResearchSignal[],
    barsBySymbol: Map<string, ResearchBar[]>,
    config: ExecutionConfig
  ): SimulationResult {
    const sim = new ExecutionSimulator(config);
    const pendingExits = new Map<string, { pos: ActivePosition; exitReason: string; exitBarTimestamp: string }>();

    const signalsBySymbol = new Map<string, ResearchSignal[]>();
    for (const signal of signals) {
      const list = signalsBySymbol.get(signal.symbol) ?? [];
      list.push(signal);
      signalsBySymbol.set(signal.symbol, list);
    }

    for (const list of signalsBySymbol.values()) {
      list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    }

    const timestamps = Array.from(
      new Set(
        Array.from(barsBySymbol.values())
          .flat()
          .map(bar => bar.timestamp)
      )
    ).sort((a, b) => a.localeCompare(b));

    const barsAtTimestamp = new Map<string, Map<string, ResearchBar>>();
    for (const [symbol, bars] of barsBySymbol.entries()) {
      for (const bar of bars) {
        let bySymbol = barsAtTimestamp.get(bar.timestamp);
        if (!bySymbol) {
          bySymbol = new Map<string, ResearchBar>();
          barsAtTimestamp.set(bar.timestamp, bySymbol);
        }
        bySymbol.set(symbol, bar);
      }
    }

    const executedSignals = new Set<string>();

    for (let tIdx = 0; tIdx < timestamps.length; tIdx++) {
      const timestamp = timestamps[tIdx];
      const currentBars = barsAtTimestamp.get(timestamp);
      if (!currentBars) continue;

      /*
       * 1. Validate all bars used at this timestamp.
       */
      for (const bar of currentBars.values()) {
        if (config.enforcePitTimestamps) {
          if (bar.availableAt > bar.timestamp) {
            throw new Error(
              `PIT_VIOLATION: bar=${bar.symbol} ` +
              `availableAt=${bar.availableAt} ` +
              `decisionTimestamp=${bar.timestamp}`
            );
          }
        }
      }

      /*
       * 1B. Process pending exits scheduled to execute on THIS bar (at this bar's open)
       */
      for (const [symbol, pending] of Array.from(pendingExits.entries())) {
        if (pending.exitBarTimestamp === timestamp) {
          const bar = currentBars.get(symbol);
          if (bar && bar.tradable) {
            sim.executeExitAtBarOpen(pending.pos, bar, pending.exitReason);
            pendingExits.delete(symbol);
          }
        }
      }

      /*
       * 2. Process signals that became executable on this bar.
       *
       * A signal generated at T is NEVER executable on T.
       * It may only execute on a later legal/tradable bar.
       */
      for (const [symbol, bar] of currentBars.entries()) {
        if (!bar.tradable) continue;

        const symbolSignals = signalsBySymbol.get(symbol) ?? [];

        for (const signal of symbolSignals) {
          if (executedSignals.has(signal.signalId)) {
            continue;
          }

          if (signal.timestamp >= bar.timestamp) {
            continue;
          }

          if (signal.availableAt && signal.availableAt > bar.timestamp) {
            continue;
          }

          /*
           * Do not execute duplicate signals once a position exists or is pending exit.
           */
          if (sim.positions.has(symbol) || pendingExits.has(symbol)) {
            continue;
          }

          if (signal.direction !== "LONG") {
            continue;
          }

          const quantity = Math.max(
            0,
            Math.floor(signal.quantityHint ?? 0)
          );

          if (quantity <= 0) {
            continue;
          }

          const requestedPrice = bar.open;
          if (!Number.isFinite(requestedPrice) || requestedPrice <= 0) {
            continue;
          }

          const participation = bar.volume > 0 ? quantity / bar.volume : 0;
          if (participation > (config.maxParticipationPct ?? 0.015) + 1e-12) {
            continue;
          }

          const execution = sim.costs.executionPrice("BUY", requestedPrice, quantity, participation);
          const statutory = sim.costs.estimate("BUY", execution.fillPrice, quantity);
          const grossValue = execution.fillPrice * quantity;

          if (grossValue + statutory.total > sim.cash) {
            continue; // Insufficient cash
          }

          sim.executeEntry(signal, bar, quantity, execution, statutory, grossValue);
          executedSignals.add(signal.signalId);
        }
      }

      /*
       * 3. Evaluate existing positions against this bar.
       *
       * Stop/target detection happens using the current bar's
       * high/low, but the actual exit is the NEXT LEGAL TRADABLE
       * BAR OPEN.
       */
      for (const bar of currentBars.values()) {
        if (!bar.tradable) continue;
        if (!sim.positions.has(bar.symbol) || pendingExits.has(bar.symbol)) continue;

        const futureBars = barsBySymbol.get(bar.symbol) ?? [];
        const index = futureBars.findIndex(b => b.timestamp === bar.timestamp);
        const nextBar = index >= 0 ? (futureBars.slice(index + 1).find(b => b.tradable) ?? null) : null;

        const exitTrigger = sim.evaluateBar(bar, nextBar);

        if (exitTrigger) {
          const pos = sim.positions.get(bar.symbol)!;
          if (nextBar) {
            pendingExits.set(bar.symbol, {
              pos,
              exitReason: exitTrigger.exitReason,
              exitBarTimestamp: nextBar.timestamp
            });
          }
        }
      }

      /*
       * 4. Mark EVERY open position to market.
       */
      sim.markToMarketAll(currentBars, timestamp);
    }

    return {
      fills: sim.fills,
      trades: sim.trades,
      equity: sim.equityCurve,
      equityCurve: sim.equityCurve,
      endingCapital: sim.cash,
      finalCash: sim.cash,
      totalTrades: sim.trades.length
    };
  }

  /**
   * Legacy run method for backwards compatibility with FrozenSignalAdapter
   */
  public run(
    signals: ResearchSignal[],
    bars: ResearchBar[],
    arm: TradeIdentityLedger["experimentArm"]
  ): SimulationResult {
    const barsBySymbol = new Map<string, ResearchBar[]>();
    for (const b of bars) {
      const list = barsBySymbol.get(b.symbol) ?? [];
      list.push(b);
      barsBySymbol.set(b.symbol, list);
    }

    return ExecutionSimulator.simulate(signals, barsBySymbol, this.config);
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

      let equity = this._cash;
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
