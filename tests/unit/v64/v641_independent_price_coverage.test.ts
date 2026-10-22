import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const V64_DIR = path.resolve(process.cwd(), "data", "v6.4");

describe("v6.4.1 Independent Price Coverage Unit Tests", () => {
  it("1. Price coverage distinguishes coverage relative to supplied universe from historically valid PIT coverage", () => {
    const file = path.join(V64_DIR, "v641_independent_price_coverage.json");
    expect(fs.existsSync(file)).toBe(true);

    const audit = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(audit.expectedRows).toBe(622500);
    expect(audit.observedRows).toBe(622500);
    expect(audit.missingRows).toBe(0);
    expect(audit.status).toBe("PASS_RELATIVE_TO_SUPPLIED_UNIVERSE");
  });
});
