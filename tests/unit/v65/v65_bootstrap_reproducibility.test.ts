import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Seeded PRNG Bootstrap Reproducibility Tests", () => {
  it("should verify bootstrap validation records PRNG seed 42", () => {
    const statPath = path.join(process.cwd(), "data", "v6.5", "v65_statistical_validation_results.json");
    expect(fs.existsSync(statPath)).toBe(true);
    const stat = JSON.parse(fs.readFileSync(statPath, "utf-8"));
    
    expect(stat.bootstrapSeed).toBe(42);
    expect(stat.bootstrapIterations).toBe(10000);
  });
});
