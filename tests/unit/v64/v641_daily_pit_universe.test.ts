import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const V64_DIR = path.resolve(process.cwd(), "data", "v6.4");

describe("v6.4.1 Daily PIT Universe Audit Unit Tests", () => {
  it("1. Daily PIT universe summary reports expected vs observed alignment relative to supplied universe", () => {
    const summaryFile = path.join(V64_DIR, "v641_daily_pit_universe_summary.json");
    const auditFile = path.join(V64_DIR, "v641_daily_pit_universe_audit.jsonl");

    expect(fs.existsSync(summaryFile)).toBe(true);
    expect(fs.existsSync(auditFile)).toBe(true);

    const summary = JSON.parse(fs.readFileSync(summaryFile, "utf8"));
    expect(summary.status).toBe("PASS_RELATIVE_TO_SUPPLIED_UNIVERSE");
    expect(summary.minimumExpected).toBe(500);
    expect(summary.maximumExpected).toBe(500);
    expect(summary.averageDailyCoverage).toBe(1.0);
  });
});
