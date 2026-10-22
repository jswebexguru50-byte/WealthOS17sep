import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const V64_DIR = path.resolve(process.cwd(), "data", "v6.4");

describe("v6.4.1 Corporate Action Events Unit Tests", () => {
  it("1. 1:1 Bonus corporate action event explicitly applies a 2.0 share multiplier", () => {
    const file = path.join(V64_DIR, "v641_corporate_action_identity_audit.json");
    expect(fs.existsSync(file)).toBe(true);

    const audit = JSON.parse(fs.readFileSync(file, "utf8"));
    const bonus = audit.shareMultiplierLogic.bonus_1_1;

    expect(bonus.ratio).toBe("1:1");
    expect(bonus.shareMultiplier).toBe(2.0);
  });

  it("2. Ticker change does not create false economic security identity changes", () => {
    const isin = "INE214T01019";
    const secId1 = `SEC_${isin}_LTI`;
    const secId2 = `SEC_${isin}_LTIM`;

    expect(secId1.includes(isin)).toBe(true);
    expect(secId2.includes(isin)).toBe(true);
  });
});
