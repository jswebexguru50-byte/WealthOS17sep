import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Exception Swallowing Invariants (P0)", () => {
  it("should verify strategy evaluation error logging count in runner status", () => {
    const statusPath = path.join(process.cwd(), "data", "v6.5", "V65_ECONOMIC_VALIDATION_STATUS.json");
    expect(fs.existsSync(statusPath)).toBe(true);
    const status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
    
    expect(status.strategyEvaluationErrors).toBe(0);
    expect(status.syntheticFallbackCount).toBe(0);
  });
});
