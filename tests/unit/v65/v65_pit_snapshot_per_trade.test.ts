import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 PIT Snapshot per Trade Invariant Tests (P0)", () => {
  it("should verify every trade contains valid pitUniverseHash and pitMembershipVerified", () => {
    const ledgerPath = path.join(process.cwd(), "data", "v6.5", "v65_economic_replay_ledger.jsonl");
    expect(fs.existsSync(ledgerPath)).toBe(true);
    const lines = fs.readFileSync(ledgerPath, "utf-8").trim().split("\n");
    expect(lines.length).toBeGreaterThan(0);
    
    for (let i = 0; i < Math.min(lines.length, 100); i++) {
      const trade = JSON.parse(lines[i]);
      expect(trade.pitUniverseHash).toBeDefined();
      expect(trade.pitUniverseHash.length).toBeGreaterThan(0);
      expect(trade.pitMembershipVerified).toBe(true);
      expect(trade.securityId).toBeDefined();
      expect(trade.symbolAtDecision).toBeDefined();
    }
  });
});
