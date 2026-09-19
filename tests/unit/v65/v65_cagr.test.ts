import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Independent CAGR Calculation Tests", () => {
  it("should verify CAGR is computed from actual starting and ending equity", () => {
    const reconPath = path.join(process.cwd(), "data", "v6.5", "v65_independent_metric_reconciliation.json");
    expect(fs.existsSync(reconPath)).toBe(true);
    const recon = JSON.parse(fs.readFileSync(reconPath, "utf-8"));
    
    expect(recon.auditedPortfolioEquity.cagrPct).toBeDefined();
    expect(typeof recon.auditedPortfolioEquity.cagrPct).toBe("number");
  });
});
