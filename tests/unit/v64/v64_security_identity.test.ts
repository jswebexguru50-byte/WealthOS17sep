import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const V64_DIR = path.resolve(process.cwd(), "data", "v6.4");

describe("v6.4 Security Identity Map Unit Tests", () => {
  it("1. Security identity map exists and contains valid ISIN & symbol mapping", () => {
    const file = path.join(V64_DIR, "v64_security_identity_map.jsonl");
    expect(fs.existsSync(file)).toBe(true);

    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
    expect(lines.length).toBe(500);

    const records = lines.map(l => JSON.parse(l));
    const securityIds = new Set<string>();

    for (const record of records) {
      expect(record.securityId).toBeDefined();
      expect(record.symbol).toBeDefined();
      expect(record.exchange).toBe("NSE");
      expect(record.isin).toBeDefined();
      expect(record.isin.startsWith("INE")).toBe(true);
      expect(record.validFrom).toBeDefined();
      expect(record.validTo).toBeDefined();

      expect(securityIds.has(record.securityId)).toBe(false);
      securityIds.add(record.securityId);
    }

    expect(securityIds.size).toBe(500);
  });
});
