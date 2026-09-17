/**
 * tests/unit/reconciled_execution_simulator.test.ts
 *
 * 9 DETERMINISTIC GOLDEN INVARIANT TESTS FOR RECONCILED EXECUTION SIMULATOR
 * Strictly verifies the reviewer handover contract:
 * 1. Zero same-bar fills (SAME_BAR_EXECUTION rejection)
 * 2. Next-tradable-bar entry (fills strictly at bar.open on subsequent tradable bar)
 * 3. Next-tradable-bar exit (condition triggered at t exits at t+1 open)
 * 4. Stop-first ambiguity (CONSERVATIVE_STOP_FIRST when stop and target both touched)
 * 5. All-symbol continuous MTM (synchronous multi-asset portfolio valuation)
 * 6. Insufficient cash guard (skips execution when margin exceeded)
 * 7. Deterministic output (bitwise reproducible trades and equity curve)
 * 8. PIT violation guard (throws PIT_VIOLATION when availableAt > timestamp)
 * 9. Transaction cost reconciliation (matches TransactionCostEngine.estimate exactly)
 */

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { ExecutionSimulator } from "../../src/server/services/research/ExecutionSimulator.js";
import { TransactionCostEngine } from "../../src/server/services/research/TransactionCostEngine.js";
import {
  ResearchBar,
  ResearchSignal,
  ExecutionConfig,
  getDefaultExecutionConfig
} from "../../src/server/services/research/types.js";

function createTestBar(
  symbol: string,
  date: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number = 100000,
  tradable: boolean = true,
  availableAt?: string
): ResearchBar {
  const ts = `${date}T15:35:00+05:30`;
  return {
    symbol,
    timestamp: ts,
    date,
    open,
    high,
    low,
    close,
    volume,
    deliveryVolume: Math.floor(volume * 0.5),
    turnover: close * volume,
    tradable,
    availableAt: availableAt ?? ts
  };
}

function createTestSignal(
  symbol: string,
  date: string,
  entry: number,
  stop: number,
  target?: number,
  quantityHint: number = 100
): ResearchSignal {
  const ts = `${date}T15:35:00+05:30`;
  return {
    signalId: `SIG-${symbol}-${date}`,
    strategyId: "S1",
    symbol,
    timestamp: ts,
    availableAt: ts,
    direction: "LONG",
    entry,
    stop,
    target,
    quantityHint,
    reasons: ["TEST_BREAKOUT"]
  };
}

describe("Reconciled ExecutionSimulator Golden Invariants", () => {
  const baseConfig: ExecutionConfig = getDefaultExecutionConfig({
    initialCapital: 1_000_000,
    brokeragePerLeg: 20,
    sttRate: 0.001,
    stampDutyBuyRate: 0.00015,
    exchangeTxnRate: 0.0000345,
    gstRate: 0.18,
    slippageBps: 0,
    impactBps: 0,
    maxParticipationPct: 0.10,
    allowShortCash: false,
    intrabarPolicy: "CONSERVATIVE_STOP_FIRST",
    enforcePitTimestamps: true
  });

  // 1. Zero Same-Bar Fills
  it("1. Strictly prevents same-bar execution (signal generated at t cannot fill on t)", () => {
    const bars: ResearchBar[] = [
      createTestBar("TCS", "2024-01-01", 3800, 3850, 3780, 3820),
      createTestBar("TCS", "2024-01-02", 3830, 3880, 3810, 3860)
    ];

    // Signal created at Bar 1 close (2024-01-01)
    const signal = createTestSignal("TCS", "2024-01-01", 3820, 3750, 4000, 10);

    const barsBySymbol = new Map([["TCS", bars]]);
    const result = ExecutionSimulator.simulate([signal], barsBySymbol, baseConfig);

    expect(result.fills.length).toBe(1);
    const fill = result.fills[0];
    // Must fill on Bar 2, NEVER on Bar 1
    expect(fill.timestamp).toBe("2024-01-02T15:35:00+05:30");
    expect(fill.requestedPrice).toBe(3830); // Bar 2 open
    expect(fill.timestamp).not.toBe(signal.timestamp);
  });

  // 2. Next-Tradable-Bar Entry
  it("2. Fills strictly on NEXT_TRADABLE_BAR_OPEN, skipping non-tradable holidays", () => {
    const bars: ResearchBar[] = [
      createTestBar("INFY", "2024-01-01", 1500, 1520, 1490, 1510),
      createTestBar("INFY", "2024-01-02", 1510, 1510, 1510, 1510, 0, false), // Market holiday (tradable: false)
      createTestBar("INFY", "2024-01-03", 1525, 1550, 1520, 1540, 50000, true)  // Tradable resume
    ];

    const signal = createTestSignal("INFY", "2024-01-01", 1510, 1470, 1600, 100);
    const barsBySymbol = new Map([["INFY", bars]]);

    const result = ExecutionSimulator.simulate([signal], barsBySymbol, baseConfig);

    expect(result.fills.length).toBe(1);
    const entryFill = result.fills[0];
    // Must skip non-tradable bar 2024-01-02 and fill on 2024-01-03 open
    expect(entryFill.timestamp).toBe("2024-01-03T15:35:00+05:30");
    expect(entryFill.requestedPrice).toBe(1525);
  });

  // 3. Next-Tradable-Bar Exit
  it("3. Executes stop loss on the NEXT tradable bar open after condition triggered", () => {
    const bars: ResearchBar[] = [
      createTestBar("RELIANCE", "2024-01-01", 2500, 2520, 2490, 2510), // Signal emitted at close
      createTestBar("RELIANCE", "2024-01-02", 2515, 2530, 2500, 2520), // Entry executed at open 2515
      createTestBar("RELIANCE", "2024-01-03", 2510, 2515, 2430, 2440), // Low breaches stop 2450
      createTestBar("RELIANCE", "2024-01-04", 2435, 2460, 2420, 2450)  // Exit executed at open 2435
    ];

    const signal = createTestSignal("RELIANCE", "2024-01-01", 2510, 2450, 2700, 10);
    const barsBySymbol = new Map([["RELIANCE", bars]]);

    const result = ExecutionSimulator.simulate([signal], barsBySymbol, baseConfig);

    expect(result.trades.length).toBe(1);
    const trade = result.trades[0];
    expect(trade.exitReason).toBe("STOP_LOSS");
    // Entry at Bar 2, Exit at Bar 4 open (2435)
    expect(trade.entryTimestamp).toBe("2024-01-02T15:35:00+05:30");
    expect(trade.exitTimestamp).toBe("2024-01-04T15:35:00+05:30");
    expect(trade.finalExitPrice).toBe(2435);
  });

  // 4. Stop-First Ambiguity Resolution
  it("4. Resolves intrabar ambiguity to STOP_LOSS when both stop and target touched in same bar", () => {
    const bars: ResearchBar[] = [
      createTestBar("HDFCBANK", "2024-01-01", 1600, 1620, 1590, 1610), // Signal emitted
      createTestBar("HDFCBANK", "2024-01-02", 1615, 1630, 1605, 1620), // Entry at 1615 (Stop=1580, Target=1660)
      createTestBar("HDFCBANK", "2024-01-03", 1620, 1670, 1570, 1630), // Touches BOTH 1670 (>1660) and 1570 (<1580)
      createTestBar("HDFCBANK", "2024-01-04", 1575, 1590, 1560, 1580)  // Next bar open
    ];

    const signal = createTestSignal("HDFCBANK", "2024-01-01", 1610, 1580, 1660, 20);
    const barsBySymbol = new Map([["HDFCBANK", bars]]);

    const result = ExecutionSimulator.simulate([signal], barsBySymbol, baseConfig);

    expect(result.trades.length).toBe(1);
    const trade = result.trades[0];
    // Must be conservative stop first
    expect(trade.exitReason).toBe("CONSERVATIVE_STOP_FIRST");
    expect(trade.exitTimestamp).toBe("2024-01-04T15:35:00+05:30");
  });

  // 5. All-Symbol Continuous MTM
  it("5. Computes continuous MTM synchronously across ALL open multi-asset positions", () => {
    const barsTcs: ResearchBar[] = [
      createTestBar("TCS", "2024-01-01", 3800, 3820, 3790, 3810),
      createTestBar("TCS", "2024-01-02", 3815, 3850, 3810, 3840), // Entry 10 shares @ 3815 (Value: 38,150)
      createTestBar("TCS", "2024-01-03", 3840, 3900, 3830, 3880)  // Close: 3880 (MTM: 38,800)
    ];

    const barsInfy: ResearchBar[] = [
      createTestBar("INFY", "2024-01-01", 1500, 1520, 1490, 1510),
      createTestBar("INFY", "2024-01-02", 1515, 1540, 1510, 1530), // Entry 100 shares @ 1515 (Value: 151,500)
      createTestBar("INFY", "2024-01-03", 1530, 1560, 1520, 1550)  // Close: 1550 (MTM: 155,000)
    ];

    const sigTcs = createTestSignal("TCS", "2024-01-01", 3810, 3700, 4100, 10);
    const sigInfy = createTestSignal("INFY", "2024-01-01", 1510, 1450, 1700, 100);

    const barsBySymbol = new Map([
      ["TCS", barsTcs],
      ["INFY", barsInfy]
    ]);

    const result = ExecutionSimulator.simulate([sigTcs, sigInfy], barsBySymbol, baseConfig);

    // At Bar 3 (2024-01-03), both positions must be marked to market:
    // TCS position: 10 * 3880 = 38,800
    // INFY position: 100 * 1550 = 155,000
    // Total position market value = 193,800
    const snapshotBar3 = result.equityCurve?.find(e => e.timestamp === "2024-01-03T15:35:00+05:30");
    expect(snapshotBar3).toBeDefined();

    // Check that equity includes BOTH positions plus final cash
    const expectedEquity = (result.finalCash ?? 0) + (10 * 3880) + (100 * 1550);
    expect(snapshotBar3!.equity).toBeCloseTo(expectedEquity, 2);
  });

  // 6. Insufficient Cash Guard
  it("6. Rejects execution when required margin + statutory costs exceed available cash", () => {
    const tightConfig: ExecutionConfig = getDefaultExecutionConfig({
      initialCapital: 10_000, // Only 10k cash
      slippageBps: 0,
      impactBps: 0
    });

    const bars: ResearchBar[] = [
      createTestBar("MRF", "2024-01-01", 120000, 122000, 119000, 121000),
      createTestBar("MRF", "2024-01-02", 121500, 123000, 121000, 122500)
    ];

    // Signal requests 1 share of MRF @ 121,500 (requires 121.5k cash, but we only have 10k)
    const signal = createTestSignal("MRF", "2024-01-01", 121000, 115000, 130000, 1);
    const barsBySymbol = new Map([["MRF", bars]]);

    const result = ExecutionSimulator.simulate([signal], barsBySymbol, tightConfig);

    // Order should NOT execute due to insufficient cash
    expect(result.fills.length).toBe(0);
    expect(result.trades.length).toBe(0);
    expect(result.finalCash).toBe(10_000);
  });

  // 7. Deterministic Output
  it("7. Produces bitwise identical trades and equity curve across multiple runs", () => {
    const bars: ResearchBar[] = [
      createTestBar("TCS", "2024-01-01", 3800, 3850, 3780, 3820),
      createTestBar("TCS", "2024-01-02", 3830, 3880, 3810, 3860),
      createTestBar("TCS", "2024-01-03", 3860, 3920, 3850, 3900),
      createTestBar("TCS", "2024-01-04", 3900, 3950, 3750, 3780),
      createTestBar("TCS", "2024-01-05", 3770, 3800, 3760, 3790)
    ];

    const signal = createTestSignal("TCS", "2024-01-01", 3820, 3800, 4200, 15);
    const barsBySymbol = new Map([["TCS", bars]]);

    const run1 = ExecutionSimulator.simulate([signal], barsBySymbol, baseConfig);
    const run2 = ExecutionSimulator.simulate([signal], barsBySymbol, baseConfig);

    expect(run1.finalCash).toBe(run2.finalCash);
    expect(run1.trades.length).toBe(run2.trades.length);

    // Strip wall-clock createdAt timestamp before bitwise JSON comparison
    const cleanTrades1 = run1.trades.map(({ createdAt, ...rest }) => rest);
    const cleanTrades2 = run2.trades.map(({ createdAt, ...rest }) => rest);
    expect(JSON.stringify(cleanTrades1)).toBe(JSON.stringify(cleanTrades2));
    expect(JSON.stringify(run1.equityCurve)).toBe(JSON.stringify(run2.equityCurve));
  });

  // 8. PIT Violation Guard
  it("8. Throws PIT_VIOLATION when bar availableAt is later than decision timestamp", () => {
    const bars: ResearchBar[] = [
      createTestBar("WIPRO", "2024-01-01", 450, 460, 445, 455),
      // Bar 2 has availableAt in future relative to timestamp!
      createTestBar("WIPRO", "2024-01-02", 455, 465, 450, 460, 100000, true, "2024-01-03T15:35:00+05:30")
    ];

    const signal = createTestSignal("WIPRO", "2024-01-01", 455, 440, 490, 50);
    const barsBySymbol = new Map([["WIPRO", bars]]);

    expect(() => ExecutionSimulator.simulate([signal], barsBySymbol, baseConfig)).toThrow("PIT_VIOLATION");
  });

  // 9. Transaction Cost Reconciliation
  it("9. Matches TransactionCostEngine.estimate statutory breakdown exactly", () => {
    const costEngine = new TransactionCostEngine(baseConfig);

    const bars: ResearchBar[] = [
      createTestBar("SBIN", "2024-01-01", 600, 610, 595, 605),
      createTestBar("SBIN", "2024-01-02", 610, 620, 605, 615), // Entry @ 610
      createTestBar("SBIN", "2024-01-03", 615, 618, 580, 585), // Stop breached (<590)
      createTestBar("SBIN", "2024-01-04", 585, 590, 580, 588)  // Exit @ 585
    ];

    const quantity = 100;
    const signal = createTestSignal("SBIN", "2024-01-01", 605, 590, 650, quantity);
    const barsBySymbol = new Map([["SBIN", bars]]);

    const result = ExecutionSimulator.simulate([signal], barsBySymbol, baseConfig);

    expect(result.trades.length).toBe(1);
    const trade = result.trades[0];

    // Compute expected costs via engine directly
    const expectedBuyCosts = costEngine.estimate("BUY", 610, quantity);
    const expectedSellCosts = costEngine.estimate("SELL", 585, quantity);
    const totalExpectedCosts = expectedBuyCosts.total + expectedSellCosts.total;

    expect(trade.entryBrokerage).toBe(expectedBuyCosts.brokerage);
    expect(trade.entryStampDuty).toBeCloseTo(expectedBuyCosts.stampDuty, 2);
    expect(trade.entryExchangeTxn).toBeCloseTo(expectedBuyCosts.exchangeTxn, 2);
    expect(trade.entryGST).toBeCloseTo(expectedBuyCosts.gst, 2);

    expect(trade.exitBrokerage).toBe(expectedSellCosts.brokerage);
    expect(trade.exitSTT).toBeCloseTo(expectedSellCosts.stt, 2);
    expect(trade.exitExchangeTxn).toBeCloseTo(expectedSellCosts.exchangeTxn, 2);
    expect(trade.exitGST).toBeCloseTo(expectedSellCosts.gst, 2);

    expect(trade.estimatedAllInCosts).toBeCloseTo(totalExpectedCosts, 2);
  });

  // 10. Golden JSON Fixture Ingestion & Multi-Asset Execution
  it("10. Successfully loads research_golden_bars.json and research_golden_signals.json fixtures", () => {
    const barsPath = path.resolve(process.cwd(), "tests/fixtures/research_golden_bars.json");
    const signalsPath = path.resolve(process.cwd(), "tests/fixtures/research_golden_signals.json");

    expect(fs.existsSync(barsPath)).toBe(true);
    expect(fs.existsSync(signalsPath)).toBe(true);

    const goldenBars: ResearchBar[] = JSON.parse(fs.readFileSync(barsPath, "utf8"));
    const goldenSignals: ResearchSignal[] = JSON.parse(fs.readFileSync(signalsPath, "utf8"));

    expect(goldenBars.length).toBeGreaterThanOrEqual(12);
    expect(goldenSignals.length).toBe(3);

    const barsBySymbol = new Map<string, ResearchBar[]>();
    for (const b of goldenBars) {
      const list = barsBySymbol.get(b.symbol) ?? [];
      list.push(b);
      barsBySymbol.set(b.symbol, list);
    }

    const result = ExecutionSimulator.simulate(goldenSignals, barsBySymbol, baseConfig);

    // Multi-asset positions entered on 2024-01-02 at open
    expect(result.fills.length).toBeGreaterThanOrEqual(3);
    const buyFills = result.fills.filter(f => f.side === "BUY");
    const sellFills = result.fills.filter(f => f.side === "SELL");

    expect(buyFills.length).toBe(3);
    for (const fill of buyFills) {
      expect(fill.reason).toBe("NEXT_TRADABLE_BAR_OPEN");
    }
    for (const fill of sellFills) {
      expect(fill.reason).toBe("STOP_LOSS");
    }

    // Equity curve should be continuous across all 4 dates
    expect(result.equityCurve.length).toBe(4);
    for (const pt of result.equityCurve) {
      expect(pt.equity).toBeGreaterThan(0);
    }
  });
});
