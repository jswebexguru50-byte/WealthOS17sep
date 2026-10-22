import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const V64_DIR = path.resolve(process.cwd(), "data", "v6.4");

describe("v6.4 Research Readiness Gate Unit Tests", () => {
  it("1. Research readiness gate passes all 6 required data coverage and integrity checks", () => {
    const coverageFile = path.join(V64_DIR, "v64_data_coverage_audit.json");
    const statusFile = path.join(V64_DIR, "V64_DATA_EXPANSION_STATUS.json");
    const manifestFile = path.join(V64_DIR, "v64_data_expansion_manifest.json");

    expect(fs.existsSync(coverageFile)).toBe(true);
    expect(fs.existsSync(statusFile)).toBe(true);
    expect(fs.existsSync(manifestFile)).toBe(true);

    const coverage = JSON.parse(fs.readFileSync(coverageFile, "utf8"));
    const status = JSON.parse(fs.readFileSync(statusFile, "utf8"));
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));

    expect(coverage.status).toBe("PASS");
    expect(coverage.pitUniverse.historicalMembershipStatus).toBe("PASS");
    expect(coverage.priceCoverage.monotonicCheck).toBe("PASS");

    expect(status.status).toBe("DATA_EXPANSION_COMPLETE");
    expect(status.researchReplayAuthorized).toBe(true);
    expect(status.promotionAuthorized).toBe(false);

    expect(manifest.strategyChangesAllowed).toBe(false);
    expect(manifest.parameterChangesAllowed).toBe(false);
  });
});
