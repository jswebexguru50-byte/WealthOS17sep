import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Bootstrap Observation Unit Tests", () => {
  it("should verify bootstrap observation unit is explicitly recorded as DAYS or TRADES", () => {
    const statPath = path.join(process.cwd(), "data", "v6.5", "v65_statistical_validation_results.json");
    expect(fs.existsSync(statPath)).toBe(true);
    const stat = JSON.parse(fs.readFileSync(statPath, "utf-8"));
    
    expect(["DAYS", "TRADES"]).toContain(stat.bootstrapObservationUnit);
  });
});
