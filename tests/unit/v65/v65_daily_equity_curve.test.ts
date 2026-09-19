import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Daily Portfolio Equity Curve Tests", () => {
  it("should verify existence and structure of daily portfolio equity curve jsonl file", () => {
    const equityPath = path.join(process.cwd(), "data", "v6.5", "v65_daily_portfolio_equity.jsonl");
    expect(fs.existsSync(equityPath)).toBe(true);
    const lines = fs.readFileSync(equityPath, "utf-8").trim().split("\n");
    expect(lines.length).toBeGreaterThan(100);
    
    const firstRow = JSON.parse(lines[0]);
    expect(firstRow.date).toBeDefined();
    expect(firstRow.cash).toBeDefined();
    expect(firstRow.equity).toBeDefined();
    expect(firstRow.dailyReturn).toBeDefined();
  });
});
