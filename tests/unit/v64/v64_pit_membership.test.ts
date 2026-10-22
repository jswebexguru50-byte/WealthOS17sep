import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const V64_DIR = path.resolve(process.cwd(), "data", "v6.4");

describe("v6.4 PIT NIFTY 500 Membership Data Unit Tests", () => {
  it("1. PIT membership dataset exists and contains 500 candidate symbol intervals", () => {
    const file = path.join(V64_DIR, "v64_pit_nifty500_membership.jsonl");
    expect(fs.existsSync(file)).toBe(true);

    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
    expect(lines.length).toBe(500);

    const records = lines.map(l => JSON.parse(l));
    const symbols = new Set<string>();

    for (const record of records) {
      expect(record.index_name).toBe("NIFTY_500");
      expect(record.symbol).toBeDefined();
      expect(record.effective_from).toBeDefined();
      expect(record.effective_to).toBeDefined();
      expect(record.source).toBeDefined();
      expect(record.source_document).toBeDefined();
      expect(record.record_hash).toBeDefined();
      expect(record.record_hash.length).toBe(64);

      // Verify effective date logic: effective_from <= effective_to
      expect(new Date(record.effective_from).getTime()).toBeLessThanOrEqual(
        new Date(record.effective_to).getTime()
      );

      symbols.add(record.symbol);
    }

    expect(symbols.size).toBe(500);
  });

  it("2. PIT membership query fails closed when a symbol was not a member on date D", () => {
    const file = path.join(V64_DIR, "v64_pit_nifty500_membership.jsonl");
    const records = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));

    function isPITMember(symbol: string, dateStr: string): boolean {
      const targetTime = new Date(dateStr).getTime();
      return records.some(r =>
        r.symbol === symbol &&
        new Date(r.effective_from).getTime() <= targetTime &&
        targetTime <= new Date(r.effective_to).getTime()
      );
    }

    // Valid symbol within range
    expect(isPITMember("RELIANCE", "2023-01-16")).toBe(true);

    // Out of range date or non-existent symbol
    expect(isPITMember("RELIANCE", "2015-01-01")).toBe(false);
    expect(isPITMember("NON_EXISTENT_TICKER", "2023-01-16")).toBe(false);
  });
});
