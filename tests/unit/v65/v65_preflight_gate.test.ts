import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Preflight Gate Tests", () => {
  it("should verify v6.4.2 validation status flag is V642_PIT_DATA_VALIDATION_CLOSED", () => {
    const statusPath = path.join(process.cwd(), "data", "v6.4", "V642_HISTORICAL_PIT_VALIDATION_STATUS.json");
    expect(fs.existsSync(statusPath)).toBe(true);
    const status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
    expect(status.statusFlag).toBe("V642_PIT_DATA_VALIDATION_CLOSED");
  });

  it("should verify V65_PREFLIGHT_AND_IMMUTABILITY_REPORT.md contains exact wording standard", () => {
    const reportPath = path.join(process.cwd(), "docs", "v6.5", "V65_PREFLIGHT_AND_IMMUTABILITY_REPORT.md");
    expect(fs.existsSync(reportPath)).toBe(true);
    const content = fs.readFileSync(reportPath, "utf-8");
    expect(content).toContain("2020–2024 historically reconstructed and independently verified NIFTY 500 PIT universe");
    expect(content).toContain("productionPromotionAuthorized = false");
  });
});
