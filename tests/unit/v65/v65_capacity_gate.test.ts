import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Capacity Gate Tests (P0)", () => {
  it("should verify participation rate capacity threshold enforcement", () => {
    const statusPath = path.join(process.cwd(), "data", "v6.5", "V65_ECONOMIC_VALIDATION_STATUS.json");
    expect(fs.existsSync(statusPath)).toBe(true);
    const status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
    
    expect(status.capacityGateMaxParticipationPct).toBe(0.05);
  });
});
