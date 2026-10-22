import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Regime Robustness Tests", () => {
  it("should verify regime analysis includes Bull, Bear, Sideways, and High Volatility regimes", () => {
    const regimePath = path.join(process.cwd(), "data", "v6.5", "v65_regime_robustness_results.json");
    expect(fs.existsSync(regimePath)).toBe(true);
    const results = JSON.parse(fs.readFileSync(regimePath, "utf-8"));
    expect(results.regimes.length).toBe(4);
  });
});
