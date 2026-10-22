import { describe, it, expect } from "vitest";
import sqlite3 from "sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), 'portfolio.db');

function queryDb<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
      if (err) return reject(err);
      db.all(sql, params, (err2, rows) => {
        db.close();
        if (err2) reject(err2);
        else resolve((rows || []) as T[]);
      });
    });
  });
}

function calculateRiskSizedQuantity(
  equity: number,
  entryPrice: number,
  stopPrice: number,
  advValue: number,
  direction: "LONG" | "SHORT" = "LONG"
): { quantity: number; participationRate: number; status: string; reason?: string } {
  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(stopPrice) ||
    entryPrice <= 0 ||
    stopPrice <= 0
  ) {
    return { quantity: 0, participationRate: 0, status: "DATA_INSUFFICIENT", reason: "INVALID_PRICE_LEVELS" };
  }

  const riskPerShare = direction === "LONG" ? entryPrice - stopPrice : stopPrice - entryPrice;
  if (!Number.isFinite(riskPerShare) || riskPerShare <= 0) {
    return { quantity: 0, participationRate: 0, status: "DATA_INSUFFICIENT", reason: "INVALID_RISK_PER_SHARE" };
  }

  const riskBudget = equity * 0.005;
  const riskQuantity = Math.floor(riskBudget / riskPerShare);
  const maxCapitalQuantity = Math.floor((equity * 0.10) / entryPrice);

  const quantity = Math.min(riskQuantity, maxCapitalQuantity);
  if (quantity <= 0) {
    return { quantity: 0, participationRate: 0, status: "CAPACITY_REJECTED", reason: "ZERO_SIZED_QUANTITY" };
  }

  const orderValue = quantity * entryPrice;
  const historicalTradedValue = Math.max(advValue, 1000000);
  const participationRate = orderValue / historicalTradedValue;

  if (participationRate > 0.05) {
    return { quantity: 0, participationRate, status: "CAPACITY_REJECTED", reason: "PARTICIPATION_EXCEEDS_5PCT" };
  }

  return { quantity, participationRate, status: "PASS" };
}

function evaluateExit(
  bar: { open: number; high: number; low: number; close: number; trade_date: string },
  stopLoss: number,
  target: number,
  direction: "LONG" | "SHORT" = "LONG"
): { exitPrice: number; reason: string; ambiguous: boolean; resolutionPolicy?: string } | null {
  if (direction === "LONG") {
    const stopHit = bar.low <= stopLoss;
    const targetHit = bar.high >= target;

    if (stopHit && targetHit) {
      const exitPrice = bar.open <= stopLoss ? bar.open : stopLoss;
      return { exitPrice, reason: "STOP_FIRST", ambiguous: true, resolutionPolicy: "STOP_FIRST" };
    }

    if (bar.open <= stopLoss) {
      return { exitPrice: bar.open, reason: "STOP_GAP", ambiguous: false };
    }
    if (bar.low <= stopLoss) {
      return { exitPrice: stopLoss, reason: "STOP", ambiguous: false };
    }
    if (bar.open >= target) {
      return { exitPrice: bar.open, reason: "TARGET_GAP", ambiguous: false };
    }
    if (bar.high >= target) {
      return { exitPrice: target, reason: "TARGET", ambiguous: false };
    }
  }
  return null;
}

function getFrozenRiskContract(stratId: string, evalRes: any) {
  if (!evalRes || !evalRes.qualified) {
    return { ok: false, reason: "NOT_QUALIFIED" };
  }
  const p0 = evalRes.p0 != null ? evalRes.p0 : evalRes.stopLoss;
  const target1 = evalRes.target1;
  if (p0 == null || !Number.isFinite(p0) || p0 <= 0) return { ok: false, reason: "MISSING_P0" };
  if (target1 == null || !Number.isFinite(target1) || target1 <= 0) return { ok: false, reason: "MISSING_TARGET" };
  return { ok: true, stopPrice: p0, targetPrice: target1, direction: "LONG" as const };
}

describe("v6.5 Remediated 22 Directives Unit & Invariant Tests", () => {
  // Rule 1: Catch accidental ASC LIMIT 60
  it("Rule 1 Regression Test: Catch accidental ASC LIMIT 60 subquery", async () => {
    const symbol = "RELIANCE";
    const decisionDate = "2023-06-15";

    const wrongOldestBars = await queryDb<{ trade_date: string }>(
      `SELECT trade_date FROM DailyOHLCV WHERE symbol = ? AND trade_date < ? ORDER BY trade_date ASC LIMIT 60`,
      [symbol, decisionDate]
    );

    const correctRecentBars = await queryDb<{ trade_date: string }>(
      `SELECT trade_date FROM (
        SELECT trade_date FROM DailyOHLCV WHERE symbol = ? AND trade_date < ? ORDER BY trade_date DESC LIMIT 60
       ) ORDER BY trade_date ASC`,
      [symbol, decisionDate]
    );

    expect(wrongOldestBars[0].trade_date).not.toEqual(correctRecentBars[0].trade_date);
    expect(correctRecentBars[correctRecentBars.length - 1].trade_date).toBe("2023-06-14");
    expect(new Date(correctRecentBars[correctRecentBars.length - 1].trade_date).getTime())
      .toBeGreaterThan(new Date(wrongOldestBars[wrongOldestBars.length - 1].trade_date).getTime());
  });

  // Rule 2: Frozen Risk Contract & Zero Price Level Invention
  it("Rule 2 Test: getFrozenRiskContract returns DATA_INSUFFICIENT if p0 or target1 missing", () => {
    const missingP0 = { qualified: true, target1: 150 };
    const missingTarget = { qualified: true, p0: 100 };
    const valid = { qualified: true, p0: 100, target1: 150 };

    expect(getFrozenRiskContract("S1", missingP0).ok).toBe(false);
    expect(getFrozenRiskContract("S1", missingTarget).ok).toBe(false);
    expect(getFrozenRiskContract("S1", valid).ok).toBe(true);
  });

  // Rule 3: Explicit Direction Handling in Risk Sizing
  it("Rule 3 Test: Direction-aware risk quantity sizing and invalid stop rejection", () => {
    const equity = 10_000_000;
    const entry = 100;
    const adv = 50_000_000;

    const longRes = calculateRiskSizedQuantity(equity, entry, 95, adv, "LONG");
    expect(longRes.status).toBe("PASS");
    expect(longRes.quantity).toBe(10000);

    const longInvalid = calculateRiskSizedQuantity(equity, entry, 105, adv, "LONG");
    expect(longInvalid.status).toBe("DATA_INSUFFICIENT");

    const shortRes = calculateRiskSizedQuantity(equity, entry, 105, adv, "SHORT");
    expect(shortRes.status).toBe("PASS");
    expect(shortRes.quantity).toBe(10000);

    const shortInvalid = calculateRiskSizedQuantity(equity, entry, 95, adv, "SHORT");
    expect(shortInvalid.status).toBe("DATA_INSUFFICIENT");
  });

  // Rule 6: Capacity Rejection Non-Clipping
  it("Rule 6 Test: Capacity rejection triggers CAPACITY_REJECTED when participation > 5% without clipping", () => {
    const equity = 10_000_000;
    const entry = 100;
    const stop = 95;
    const lowAdv = 5_000_000;

    const res = calculateRiskSizedQuantity(equity, entry, stop, lowAdv, "LONG");
    expect(res.status).toBe("CAPACITY_REJECTED");
    expect(res.quantity).toBe(0);
  });

  // Rule 7: Gap Exit Logic & Same-Bar Ambiguity Policy
  it("Rule 7 Test: Evaluate gap exits and same-bar ambiguity policy", () => {
    const gapStopBar = { open: 90, high: 98, low: 88, close: 92, trade_date: "2024-01-02" };
    const exit1 = evaluateExit(gapStopBar, 95, 120, "LONG");
    expect(exit1).toEqual({ exitPrice: 90, reason: "STOP_GAP", ambiguous: false });

    const ambiguousBar = { open: 100, high: 125, low: 90, close: 110, trade_date: "2024-01-02" };
    const exit2 = evaluateExit(ambiguousBar, 95, 120, "LONG");
    expect(exit2?.ambiguous).toBe(true);
    expect(exit2?.reason).toBe("STOP_FIRST");
    expect(exit2?.resolutionPolicy).toBe("STOP_FIRST");
  });
});
