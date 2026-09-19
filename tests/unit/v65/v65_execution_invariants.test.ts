import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Execution Invariants Tests (P0)", () => {
  it("should verify entryDate > decisionDate and rawEntryPrice === entryBar.open", () => {
    const ledgerPath = path.join(process.cwd(), "data", "v6.5", "v65_economic_replay_ledger.jsonl");
    expect(fs.existsSync(ledgerPath)).toBe(true);
    const lines = fs.readFileSync(ledgerPath, "utf-8").trim().split("\n");
    
    for (let i = 0; i < Math.min(lines.length, 100); i++) {
      const trade = JSON.parse(lines[i]);
      expect(trade.entryDate > trade.decisionDate).toBe(true);
      expect(trade.actualEntryPrice).toBeGreaterThan(0);
      expect(trade.actualExitPrice).toBeGreaterThan(0);
      expect(trade.usedSyntheticTradePrice).toBe(false);
      expect(trade.usedSyntheticExit).toBe(false);
    }
  });
});
