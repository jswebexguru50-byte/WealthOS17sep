import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Statistical Significance Tests", () => {
  it("should verify hypothesis family, block bootstrap method, and BH-FDR adjustment", () => {
    const statsPath = path.join(process.cwd(), "data", "v6.5", "v65_statistical_validation_results.json");
    expect(fs.existsSync(statsPath)).toBe(true);
    const results = JSON.parse(fs.readFileSync(statsPath, "utf-8"));
    expect(results.primaryHypothesisFamily).toContain("12-Hypothesis Evaluated Family");
    expect(results.multipleTestingCorrection).toContain("Benjamini-Hochberg FDR");
    expect(results.bootstrapMethod).toContain("Block Bootstrap");
  });
});
