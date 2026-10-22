import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Gap Exit Engine Tests (P0)", () => {
  it("should verify exitReason and gap handling logic in trade ledger", () => {
    const ledgerPath = path.join(process.cwd(), "data", "v6.5", "v65_economic_replay_ledger.jsonl");
    expect(fs.existsSync(ledgerPath)).toBe(true);
    const lines = fs.readFileSync(ledgerPath, "utf-8").trim().split("\n");
    
    const validExitReasons = ["STOP", "TARGET", "STOP_GAP", "TARGET_GAP", "MAX_HOLD_EXPIRY", "END_OF_DATA", "HOLDING_PERIOD_EXPIRATION", "GAP_STOP"];
    for (let i = 0; i < Math.min(lines.length, 100); i++) {
      const trade = JSON.parse(lines[i]);
      expect(validExitReasons).toContain(trade.exitReason);
    }
  });
});
