import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Cost Reconciliation Tests (P0)", () => {
  it("should verify totalCosts === sum of individual cost components and netPnL === grossPnL - totalCosts", () => {
    const ledgerPath = path.join(process.cwd(), "data", "v6.5", "v65_economic_replay_ledger.jsonl");
    expect(fs.existsSync(ledgerPath)).toBe(true);
    const lines = fs.readFileSync(ledgerPath, "utf-8").trim().split("\n");
    
    for (let i = 0; i < Math.min(lines.length, 100); i++) {
      const trade = JSON.parse(lines[i]);
      const expectedTotal = 
        trade.brokerage +
        trade.stt +
        trade.stampDuty +
        trade.sebiFee +
        trade.exchangeCharges +
        trade.gst +
        trade.slippageCost +
        trade.entryImpactCost +
        trade.exitImpactCost;
        
      expect(Math.abs(trade.totalCosts - expectedTotal)).toBeLessThan(0.02);
      expect(Math.abs(trade.netPnL - (trade.grossPnL - trade.totalCosts))).toBeLessThan(0.02);
    }
  });
});
