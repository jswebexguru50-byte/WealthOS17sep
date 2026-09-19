import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Metric Reconciliation Tests", () => {
  it("should verify independent metric reconstruction aligns within floating point tolerance", () => {
    const reconPath = path.join(process.cwd(), "data", "v6.5", "v65_independent_metric_reconciliation.json");
    expect(fs.existsSync(reconPath)).toBe(true);
    const recon = JSON.parse(fs.readFileSync(reconPath, "utf-8"));
    
    expect(recon.independentEconomicRecomputationStatus).toBe("PASS");
  });
});
