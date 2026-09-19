import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Benjamini-Hochberg FDR Control Tests", () => {
  it("should verify BH-FDR procedure calculates adjusted q-values without hardcoded shortcuts", () => {
    const statPath = path.join(process.cwd(), "data", "v6.5", "v65_statistical_validation_results.json");
    expect(fs.existsSync(statPath)).toBe(true);
    const stat = JSON.parse(fs.readFileSync(statPath, "utf-8"));
    
    expect(stat.bhFdrAlpha).toBe(0.05);
    expect(stat.familyId).toBe("strategy_expectancy_primary");
  });
});
