import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Full PIT Universe Evaluation Tests (P0)", () => {
  it("should verify that historical PIT universe evaluation does not slice symbols silently", () => {
    const statusPath = path.join(process.cwd(), "data", "v6.5", "V65_ECONOMIC_VALIDATION_STATUS.json");
    expect(fs.existsSync(statusPath)).toBe(true);
    const status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
    
    expect(status.universeMode).toBe("FULL_NIFTY500_HISTORICAL_PIT");
    expect(status.subsetMode).toBe(false);
    expect(status.averageUniverseSize).toBeGreaterThanOrEqual(450);
  });
});
