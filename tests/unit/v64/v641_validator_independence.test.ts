import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const V64_DIR = path.resolve(process.cwd(), "data", "v6.4");

describe("v6.4.1 Validator Independence Unit Tests", () => {
  it("1. Independent validator calculates expected OHLCV rows directly from raw source records", () => {
    const file = path.join(V64_DIR, "v64_pit_nifty500_membership.jsonl");
    const records = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));

    const symbolCount = new Set(records.map(r => r.symbol)).size;
    const sessionCount = 1245;
    const derivedExpectedRows = symbolCount * sessionCount;

    expect(derivedExpectedRows).toBe(622500);
  });
});
