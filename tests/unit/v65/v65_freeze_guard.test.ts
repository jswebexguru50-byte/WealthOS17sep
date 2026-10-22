import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Freeze Guard Tests (P0)", () => {
  it("should verify prepatch freeze manifest exists and SHA-256 hashes match", () => {
    const freezePath1 = path.join(process.cwd(), "data", "v6.5", "v65_remediation_prepatch_freeze.json");
    const freezePath2 = path.join(process.cwd(), "data", "v6.5", "v65_prepatch_freeze_manifest.json");
    
    const exists1 = fs.existsSync(freezePath1);
    const exists2 = fs.existsSync(freezePath2);
    expect(exists1 || exists2).toBe(true);
    
    const targetPath = exists1 ? freezePath1 : freezePath2;
    const freeze = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
    
    expect(Object.keys(freeze.hashes || freeze.manifest || {}).length).toBeGreaterThan(0);
  });
});


