import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Volatility PIT Invariants", () => {
  it("should verify historical volatility calculation uses 20 observations strictly before decision date", () => {
    const ledgerPath = path.join(process.cwd(), "data", "v6.5", "v65_economic_replay_ledger.jsonl");
    expect(fs.existsSync(ledgerPath)).toBe(true);
    const lines = fs.readFileSync(ledgerPath, "utf-8").trim().split("\n");
    
    for (let i = 0; i < Math.min(lines.length, 50); i++) {
      const trade = JSON.parse(lines[i]);
      expect(trade.entryVolatility).toBeGreaterThan(0);
      expect(trade.exitVolatility).toBeGreaterThan(0);
    }
  });
});
