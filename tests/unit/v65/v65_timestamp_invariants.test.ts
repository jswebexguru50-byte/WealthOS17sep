import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Timestamp Invariants Tests", () => {
  it("should verify decisionTimestamp precedes entryTimestamp and uses Asia/Kolkata timezone", () => {
    const ledgerPath = path.join(process.cwd(), "data", "v6.5", "v65_economic_replay_ledger.jsonl");
    expect(fs.existsSync(ledgerPath)).toBe(true);
    const lines = fs.readFileSync(ledgerPath, "utf-8").trim().split("\n");
    
    for (let i = 0; i < Math.min(lines.length, 50); i++) {
      const trade = JSON.parse(lines[i]);
      expect(trade.decisionTimestamp).toContain("+05:30");
      expect(trade.entryTimestamp).toContain("+05:30");
      expect(new Date(trade.decisionTimestamp).getTime()).toBeLessThan(new Date(trade.entryTimestamp).getTime());
    }
  });
});
