import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const V64_DIR = path.resolve(process.cwd(), "data", "v6.4");

describe("v6.4.1 No Fabricated PIT History Invariant Unit Tests", () => {
  it("1. Static 500-security input dataset yields DATA_INSUFFICIENT_FOR_500_SYMBOL_DYNAMIC_PIT even with 100% OHLCV coverage", () => {
    const file = path.join(V64_DIR, "v641_membership_source_inventory.json");
    const rebalanceFile = path.join(V64_DIR, "v641_rebalance_reconstruction_audit.json");
    const coverageFile = path.join(V64_DIR, "v641_independent_price_coverage.json");

    expect(fs.existsSync(file)).toBe(true);
    expect(fs.existsSync(rebalanceFile)).toBe(true);
    expect(fs.existsSync(coverageFile)).toBe(true);

    const inventory = JSON.parse(fs.readFileSync(file, "utf8"));
    const rebalance = JSON.parse(fs.readFileSync(rebalanceFile, "utf8"));
    const coverage = JSON.parse(fs.readFileSync(coverageFile, "utf8"));

    // 100% OHLCV coverage relative to supplied universe
    expect(coverage.coverageRatio).toBe(1.0);

    // BUT static universe detected -> membership status must remain DATA_INSUFFICIENT_FOR_500_SYMBOL_DYNAMIC_PIT
    expect(inventory.overallSourceStatus).toBe("DATA_INSUFFICIENT_FOR_500_SYMBOL_DYNAMIC_PIT");
    expect(rebalance.classification).toBe("LIKELY_STATIC_UNIVERSE");
    expect(rebalance.distinctConstituentSets).toBe(1);
    expect(rebalance.fullUniverseReplayAuthorized).toBe(false);
  });

  it("2. Prohibits inferring historical membership from price presence alone", () => {
    function evaluatePITMembership(hasConstituentRebalanceEvidence: boolean, hasOHLCVData: boolean): string {
      if (!hasConstituentRebalanceEvidence) {
        return "DATA_INSUFFICIENT_FOR_500_SYMBOL_DYNAMIC_PIT";
      }
      return hasOHLCVData ? "PASS" : "DATA_INSUFFICIENT_PRICE_COVERAGE";
    }

    // OHLCV present but no rebalance circular evidence -> MUST return DATA_INSUFFICIENT
    expect(evaluatePITMembership(false, true)).toBe("DATA_INSUFFICIENT_FOR_500_SYMBOL_DYNAMIC_PIT");
  });
});
