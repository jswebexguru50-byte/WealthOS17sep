import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Market Impact Unit Validation Tests", () => {
  it("should verify entry and exit participation rates and market impact bps unit ranges", () => {
    const ledgerPath = path.join(process.cwd(), "data", "v6.5", "v65_economic_replay_ledger.jsonl");
    expect(fs.existsSync(ledgerPath)).toBe(true);
    const lines = fs.readFileSync(ledgerPath, "utf-8").trim().split("\n");
    
    for (let i = 0; i < Math.min(lines.length, 50); i++) {
      const trade = JSON.parse(lines[i]);
      expect(trade.entryParticipationRate).toBeGreaterThanOrEqual(0);
      expect(trade.exitParticipationRate).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(trade.entryImpactCost)).toBe(true);
      expect(Number.isFinite(trade.exitImpactCost)).toBe(true);
    }
  });
});
