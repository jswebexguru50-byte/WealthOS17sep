import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Strategy Registry Reconciliation Tests", () => {
  it("should verify strategy attribution in ledger maps 1-to-1 with canonical S1-S20 registry", () => {
    const matrixPath = path.join(process.cwd(), "data", "v6.5", "v65_strategy_performance_matrix.json");
    expect(fs.existsSync(matrixPath)).toBe(true);
    const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf-8"));
    
    expect(matrix.dispositionMatrix.length).toBe(20);
    const validIds = new Set(Array.from({ length: 20 }, (_, i) => `S${i + 1}`));
    for (const item of matrix.dispositionMatrix) {
      expect(validIds.has(item.strategyId)).toBe(true);
    }
  });
});
