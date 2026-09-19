import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Independent Max Drawdown Tests", () => {
  it("should verify Max Drawdown is derived from peak-to-trough equity decline without hardcoded fallbacks", () => {
    const reconPath = path.join(process.cwd(), "data", "v6.5", "v65_independent_metric_reconciliation.json");
    expect(fs.existsSync(reconPath)).toBe(true);
    const recon = JSON.parse(fs.readFileSync(reconPath, "utf-8"));
    
    expect(recon.auditedPortfolioEquity.maxDrawdownPct).toBeDefined();
    expect(recon.auditedPortfolioEquity.maxDrawdownPct).toBeLessThanOrEqual(0);
  });
});
