import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Walk-Forward Optimization Invariants", () => {
  it("should verify temporal separation between IS and OOS periods without data leakage", () => {
    const wfoPath = path.join(process.cwd(), "data", "v6.5", "v65_walk_forward_oos_results.json");
    expect(fs.existsSync(wfoPath)).toBe(true);
    const wfo = JSON.parse(fs.readFileSync(wfoPath, "utf-8"));
    
    expect(wfo.windows).toBeDefined();
    for (const win of wfo.windows) {
      expect(new Date(win.inSampleEnd).getTime()).toBeLessThan(new Date(win.outOfSampleStart).getTime());
    }
  });
});
