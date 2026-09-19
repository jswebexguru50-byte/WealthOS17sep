import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Strategy Disposition Matrix Tests", () => {
  it("should verify strategy disposition states and proper N/A metric representation for DATA_INSUFFICIENT strategies", () => {
    const matrixPath = path.join(process.cwd(), "data", "v6.5", "v65_strategy_performance_matrix.json");
    expect(fs.existsSync(matrixPath)).toBe(true);
    const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf-8"));
    
    // S1 VPA Base Breakout
    const s1 = matrix.dispositionMatrix.find((s: any) => s.strategyId === "S1");
    expect(s1.strategyCode).toBe("S1_VPA_BASE_BREAKOUT");
    expect(s1.strategyName).toBe("VPA Base Breakout");
    expect(["ECONOMICALLY_SUPPORTED", "ECONOMICALLY_UNSUPPORTED", "DATA_INSUFFICIENT", "REJECTED_BY_AUDIT"]).toContain(s1.disposition);

    // S8 High-Tight Flag
    const s8 = matrix.dispositionMatrix.find((s: any) => s.strategyId === "S8");
    expect(s8.strategyCode).toBe("S8_HIGH_TIGHT_FLAG");
    expect(s8.strategyName).toBe("High-Tight Flag");
    expect(["ECONOMICALLY_SUPPORTED", "ECONOMICALLY_UNSUPPORTED", "DATA_INSUFFICIENT", "REJECTED_BY_AUDIT"]).toContain(s8.disposition);

    // S10 Trendline ORB Intraday
    const s10 = matrix.dispositionMatrix.find((s: any) => s.strategyId === "S10");
    expect(s10.strategyCode).toBe("S10_TRENDLINE_ORB");
    expect(s10.strategyName).toBe("15-Min Trendline ORB Intraday");
    expect(s10.disposition).toBe("DATA_INSUFFICIENT");
    expect(s10.cagrPct).toBe("N/A");
    expect(s10.sharpe).toBe("N/A");
    expect(s10.fdrPValue).toBe("N/A");

    // S14 Bearish Short Futures Hedge
    const s14 = matrix.dispositionMatrix.find((s: any) => s.strategyId === "S14");
    expect(s14.strategyCode).toBe("S14_BEARISH_HEDGE");
    expect(s14.strategyName).toBe("Bearish Short Futures Hedge");
    expect(s14.disposition).toBe("DATA_INSUFFICIENT");
    expect(s14.cagrPct).toBe("N/A");

    // S15 Option Credit Spreads Harvest
    const s15 = matrix.dispositionMatrix.find((s: any) => s.strategyId === "S15");
    expect(s15.strategyCode).toBe("S15_CREDIT_SPREADS");
    expect(s15.strategyName).toBe("Option Credit Spreads Harvest");
    expect(s15.disposition).toBe("DATA_INSUFFICIENT");
    expect(s15.cagrPct).toBe("N/A");
  });
});
