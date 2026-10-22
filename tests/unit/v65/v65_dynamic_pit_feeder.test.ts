import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Dynamic PIT Feeder Tests", () => {
  it("should confirm pit snapshot audit log exists and contains fallback protection enforcement", () => {
    const auditPath = path.join(process.cwd(), "data", "v6.5", "v65_pit_snapshot_audit.jsonl");
    expect(fs.existsSync(auditPath)).toBe(true);
    const lines = fs.readFileSync(auditPath, "utf-8").trim().split("\n");
    expect(lines.length).toBeGreaterThan(0);
    const sample = JSON.parse(lines[0]);
    expect(sample.fallbackForbiddenEnforced).toBe(true);
    expect(sample.activeConstituentsCount).toBe(500);
  });
});
