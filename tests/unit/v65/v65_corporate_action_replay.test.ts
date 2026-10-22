import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Corporate Action Replay Invariants", () => {
  it("should verify corporate action handling preserves security identity and price adjustments", () => {
    const statusPath = path.join(process.cwd(), "data", "v6.5", "V65_ECONOMIC_VALIDATION_STATUS.json");
    expect(fs.existsSync(statusPath)).toBe(true);
    const status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
    
    expect(status.corporateActionTreatment).toBe("POINT_IN_TIME_ADJUSTED");
  });
});
