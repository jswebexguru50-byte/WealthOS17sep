import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const V64_DIR = path.resolve(process.cwd(), "data", "v6.4");

describe("v6.4 Independent PIT Membership & Static Substitution Audit Tests", () => {
  it("1. Independent PIT membership calculation verifies 500 securities and detects static substitution", () => {
    const file = path.join(V64_DIR, "v64_independent_pit_membership_audit.json");
    const rebalanceFile = path.join(V64_DIR, "v64_pit_rebalance_audit.json");

    expect(fs.existsSync(file)).toBe(true);
    expect(fs.existsSync(rebalanceFile)).toBe(true);

    const audit = JSON.parse(fs.readFileSync(file, "utf8"));
    const rebalance = JSON.parse(fs.readFileSync(rebalanceFile, "utf8"));

    expect(audit.uniqueSecurityIds).toBe(500);
    expect(audit.membershipIntervalCount).toBe(500);

    // Verify static substitution detector flag
    expect(rebalance.substitutionDetection.classification).toBe("LIKELY_STATIC_UNIVERSE");
    expect(rebalance.substitutionDetection.fullUniverse500ReplayAuthorized).toBe(false);
  });
});
