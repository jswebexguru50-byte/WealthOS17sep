import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 DATA_INSUFFICIENT Semantics Tests", () => {
  it("should verify DATA_INSUFFICIENT strategies expose null/N/A metrics rather than 0 values", () => {
    const matrixPath = path.join(process.cwd(), "data", "v6.5", "v65_strategy_performance_matrix.json");
    expect(fs.existsSync(matrixPath)).toBe(true);
    const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf-8"));
    
    const insufficient = matrix.dispositionMatrix.filter((s: any) => s.disposition === "DATA_INSUFFICIENT");
    for (const item of insufficient) {
      expect(item.cagrPct).toBe("N/A");
      expect(item.sharpe).toBe("N/A");
      expect(item.fdrPValue).toBe("N/A");
    }
  });
});
