import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const V64_DIR = path.resolve(process.cwd(), "data", "v6.4");

describe("v6.4 Data Coverage Audit Unit Tests", () => {
  it("1. Data coverage audit confirms 500 PIT symbols and zero missing price rows", () => {
    const file = path.join(V64_DIR, "v64_data_coverage_audit.json");
    expect(fs.existsSync(file)).toBe(true);

    const audit = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(audit.status).toBe("PASS");
    expect(audit.pitUniverse.symbolsCovered).toBe(500);
    expect(audit.priceCoverage.symbols).toBe(500);
    expect(audit.priceCoverage.missingRows).toBe(0);
    expect(audit.priceCoverage.invalidRows).toBe(0);
    expect(audit.priceCoverage.monotonicCheck).toBe("PASS");
    expect(audit.priceCoverage.positivePriceCheck).toBe("PASS");
  });
});
