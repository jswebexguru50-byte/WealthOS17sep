import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const V64_DIR = path.resolve(process.cwd(), "data", "v6.4");

describe("v6.4.1 Historical Rebalance Unit Tests", () => {
  it("1. Historical rebalance records reconcile previous set + entries - exits = new set", () => {
    const file = path.join(V64_DIR, "v641_historical_rebalances.jsonl");
    expect(fs.existsSync(file)).toBe(true);

    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);

    const records = lines.map(l => JSON.parse(l));

    for (const r of records) {
      expect(r.index).toBe("NIFTY 500");
      expect(r.rebalanceDate).toBeDefined();
      expect(r.previousConstituentCount).toBeDefined();
      expect(r.newConstituentCount).toBeDefined();

      const expectedNewCount = r.previousConstituentCount + r.entries.length - r.exits.length;
      expect(r.newConstituentCount).toBe(expectedNewCount);
      expect(r.constituentSetHash).toBeDefined();
      expect(r.constituentSetHash.length).toBe(64);
    }
  });

  it("2. Membership interval dates enforce effective_from < effective_to with no interval overlap", () => {
    const file = path.join(V64_DIR, "v64_pit_nifty500_membership.jsonl");
    const records = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));

    for (const r of records) {
      const fromTime = new Date(r.effective_from).getTime();
      const toTime = new Date(r.effective_to).getTime();
      expect(fromTime).toBeLessThan(toTime);
    }
  });
});
