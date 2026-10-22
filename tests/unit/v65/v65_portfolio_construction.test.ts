import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Portfolio Construction Invariants (P0)", () => {
  it("should verify portfolio construction rules and allocation limits", () => {
    const policyPath = path.join(process.cwd(), "data", "v6.5", "v65_portfolio_construction_policy.json");
    expect(fs.existsSync(policyPath)).toBe(true);
    const policy = JSON.parse(fs.readFileSync(policyPath, "utf-8"));

    expect(policy.initialCapital || policy.policy?.initialCapital).toBe(10000000);
    expect(policy.maximumSinglePositionPct !== undefined || policy.policy?.maximumSinglePositionPct !== undefined).toBe(true);
    expect(policy.maximumConcurrentPositions || policy.policy?.maximumConcurrentPositions).toBe(15);
  });
});
