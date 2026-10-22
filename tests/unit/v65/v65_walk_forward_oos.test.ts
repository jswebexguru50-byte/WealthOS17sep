import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Rolling Temporal OOS Tests", () => {
  it("should verify designation is Rolling Temporal OOS Validation with 2 windows", () => {
    const oosPath = path.join(process.cwd(), "data", "v6.5", "v65_walk_forward_oos_results.json");
    expect(fs.existsSync(oosPath)).toBe(true);
    const results = JSON.parse(fs.readFileSync(oosPath, "utf-8"));
    expect(results.designation).toBe("Rolling Temporal OOS Validation");
    expect(results.oosWindowCount).toBe(2);
    expect(results.oosYears).toEqual([2023, 2024]);
  });
});
