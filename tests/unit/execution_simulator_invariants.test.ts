import { describe, expect, it } from "vitest";
import {
  ExecutionSimulator,
  assertNextBarExecutionInvariant,
  findFirstTradableBarAfter,
  ExecutionBar
} from "../../src/server/services/research/ExecutionSimulator";
import { getDefaultExecutionConfig, ResearchSignal, ResearchBar } from "../../src/server/services/research/types";

describe("ExecutionSimulator Invariants", () => {
  const config = getDefaultExecutionConfig();
  const simulator = new ExecutionSimulator(config);

  const makeSignal = (timestamp: string, close: number): ResearchSignal => ({
    signalId: `TEST-SIG-${timestamp}`,
    strategyId: "TEST",
    symbol: "TEST",
    timestamp,
    direction: "LONG",
    entry: close,
    stop: close * 0.9,
    target: close * 1.2,
    quantityHint: 100,
    reasons: []
  });

  const makeBar = (timestamp: string, open: number, tradable = true): ResearchBar => ({
    symbol: "TEST",
    timestamp,
    open,
    high: open * 1.05,
    low: open * 0.95,
    close: open,
    volume: 100000,
    deliveryVolume: 50000,
    tradable,
    availableAt: timestamp
  });

  it("Test 1 — rejects same-session execution", () => {
    expect(() =>
      assertNextBarExecutionInvariant({
        signalTimestamp: "2024-01-05T15:35:00",
        entryTimestamp: "2024-01-05T15:35:00",
        signalDate: "2024-01-05",
        entryDate: "2024-01-05",
        entryBarTimestamp: "2024-01-05T15:35:00",
        expectedEntryTimestamp: "2024-01-08T09:15:00",
        entryBarOpen: 100,
        rawEntryPrice: 100,
      })
    ).toThrow();
  });

  it("Test 2 — allows correct next session execution", () => {
    expect(() =>
      assertNextBarExecutionInvariant({
        signalTimestamp: "2024-01-05T15:35:00",
        entryTimestamp: "2024-01-08T09:15:00",
        signalDate: "2024-01-05",
        entryDate: "2024-01-08",
        entryBarTimestamp: "2024-01-08T09:15:00",
        expectedEntryTimestamp: "2024-01-08T09:15:00",
        entryBarOpen: 105,
        rawEntryPrice: 105,
      })
    ).not.toThrow();
  });

  it("Test 3 — weekend/holiday rollover (Friday -> Monday)", () => {
    const bars: ExecutionBar[] = [
      { timestamp: "2024-01-05T15:35:00", open: 100, tradable: true }, // Friday
      { timestamp: "2024-01-08T09:15:00", open: 105, tradable: true }, // Monday
    ];
    const nextBar = findFirstTradableBarAfter(bars, "2024-01-05T15:35:00");
    expect(nextBar.timestamp).toBe("2024-01-08T09:15:00");
    expect(nextBar.open).toBe(105);
  });

  it("Test 4 — rejects T+2 when T+1 is available", () => {
    expect(() =>
      assertNextBarExecutionInvariant({
        signalTimestamp: "2024-01-05T15:35:00",
        entryTimestamp: "2024-01-09T09:15:00", // Tuesday
        signalDate: "2024-01-05",
        entryDate: "2024-01-09",
        entryBarTimestamp: "2024-01-09T09:15:00",
        expectedEntryTimestamp: "2024-01-08T09:15:00", // Monday
        entryBarOpen: 105,
        rawEntryPrice: 105,
      })
    ).toThrow();
  });

  it("Test 5 — rejects raw open price mismatch", () => {
    expect(() =>
      assertNextBarExecutionInvariant({
        signalTimestamp: "2024-01-05T15:35:00",
        entryTimestamp: "2024-01-08T09:15:00",
        signalDate: "2024-01-05",
        entryDate: "2024-01-08",
        entryBarTimestamp: "2024-01-08T09:15:00",
        expectedEntryTimestamp: "2024-01-08T09:15:00",
        entryBarOpen: 105,
        rawEntryPrice: 104.895, // Mismatch!
      })
    ).toThrow();
  });

  it("Test 6 — rejects invalid open price (<= 0)", () => {
    expect(() =>
      assertNextBarExecutionInvariant({
        signalTimestamp: "2024-01-05T15:35:00",
        entryTimestamp: "2024-01-08T09:15:00",
        signalDate: "2024-01-05",
        entryDate: "2024-01-08",
        entryBarTimestamp: "2024-01-08T09:15:00",
        expectedEntryTimestamp: "2024-01-08T09:15:00",
        entryBarOpen: 0,
        rawEntryPrice: 0,
      })
    ).toThrow();
  });

  it("Test 7 — missing future session fails closed", () => {
    const bars: ExecutionBar[] = [
      { timestamp: "2024-01-05T15:35:00", open: 100, tradable: true }
    ];
    expect(() => findFirstTradableBarAfter(bars, "2024-01-05T15:35:00")).toThrow("no tradable session after");
  });
});
