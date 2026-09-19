import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Trade Identity Reconciliation Tests", () => {
  it("should verify 100% trade identity match between runner and auditor", () => {
    const reconPath = path.join(process.cwd(), "data", "v6.5", "v65_independent_trade_identity_reconciliation.json");
    expect(fs.existsSync(reconPath)).toBe(true);
    const recon = JSON.parse(fs.readFileSync(reconPath, "utf-8"));
    
    expect(recon.identityMatchCount).toBe(recon.totalRunnerTrades);
    expect(recon.mismatchCount).toBe(0);
  });
});
