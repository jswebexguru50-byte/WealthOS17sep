import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Liquidity Gate Tests (P0)", () => {
  it("should verify ADV and participation rate calculations per trade", () => {
    const ledgerPath = path.join(process.cwd(), "data", "v6.5", "v65_economic_replay_ledger.jsonl");
    expect(fs.existsSync(ledgerPath)).toBe(true);
    const lines = fs.readFileSync(ledgerPath, "utf-8").trim().split("\n");
    
    for (let i = 0; i < Math.min(lines.length, 100); i++) {
      const trade = JSON.parse(lines[i]);
      expect(trade.entryADV).toBeGreaterThan(0);
      expect(trade.entryParticipationRate).toBeGreaterThanOrEqual(0);
      expect(trade.entryParticipationRate).toBeLessThanOrEqual(0.05);
    }
  });
});
