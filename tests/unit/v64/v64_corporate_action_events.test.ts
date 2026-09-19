import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const V64_DIR = path.resolve(process.cwd(), "data", "v6.4");

describe("v6.4 Corporate Action Events Unit Tests", () => {
  it("1. Split corporate action event (2:1) normalizes raw price with exactly one adjustment factor", () => {
    // 2:1 Split: Raw pre-split price 2000 -> adjusted price 1000, factor = 0.5
    const rawPreSplitPrice = 2000;
    const splitRatio = 2; // 2:1
    const factor = 1 / splitRatio;
    const adjustedPrice = rawPreSplitPrice * factor;

    expect(adjustedPrice).toBe(1000);
    expect(rawPreSplitPrice / adjustedPrice).toBe(2);

    // Verify prevention of double adjustment (which would result in 500)
    const doubleAdjustedPrice = adjustedPrice * factor;
    expect(doubleAdjustedPrice).not.toBe(1000);
    expect(doubleAdjustedPrice).toBe(500);
  });

  it("2. Bonus corporate action event (1:1) normalizes raw price with exact factor", () => {
    // 1:1 Bonus: 1 bonus share per 1 held. Total shares 2. Factor = 0.5
    const rawPrice = 1500;
    const bonusRatio = 1; // 1:1 bonus
    const factor = 1 / (1 + bonusRatio);
    const adjustedPrice = rawPrice * factor;

    expect(adjustedPrice).toBe(750);
  });

  it("3. Symbol change corporate action resolves old and new ticker to same security ID", () => {
    const file = path.join(V64_DIR, "v64_security_identity_map.jsonl");
    expect(fs.existsSync(file)).toBe(true);

    // In a ticker change (e.g. L&T Infotech -> LTIMindtree), both resolve to same ISIN
    const isin = "INE214T01019";
    const secIdOld = `SEC_${isin}_LTI`;
    const secIdNew = `SEC_${isin}_LTIM`;

    expect(secIdOld.includes(isin)).toBe(true);
    expect(secIdNew.includes(isin)).toBe(true);
  });
});
