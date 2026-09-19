import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Full Trading Date Replay Tests (P0)", () => {
  it("should verify that replay evaluates all eligible trading dates without skipping", () => {
    const statusPath = path.join(process.cwd(), "data", "v6.5", "V65_ECONOMIC_VALIDATION_STATUS.json");
    expect(fs.existsSync(statusPath)).toBe(true);
    const status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
    
    expect(status.samplingMode).toBe("NONE");
    expect(status.decisionDateCount).toBeGreaterThanOrEqual(1000);
    expect(status.evaluatedDecisionDateCount).toEqual(status.decisionDateCount);
  });
});
