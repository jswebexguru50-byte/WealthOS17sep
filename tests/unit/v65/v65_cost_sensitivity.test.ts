import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 2D Cost Sensitivity Tests", () => {
  it("should verify friction levels and market impact multipliers exist in 2D sensitivity grid", () => {
    const gridPath = path.join(process.cwd(), "data", "v6.5", "v65_cost_sensitivity_results.json");
    expect(fs.existsSync(gridPath)).toBe(true);
    const results = JSON.parse(fs.readFileSync(gridPath, "utf-8"));
    expect(results.frictionLevelsBps).toContain(15);
    expect(results.frictionLevelsBps).toContain(50);
    expect(results.marketImpactMultipliers).toContain(1.0);
    expect(results.marketImpactMultipliers).toContain(2.0);
  });
});
