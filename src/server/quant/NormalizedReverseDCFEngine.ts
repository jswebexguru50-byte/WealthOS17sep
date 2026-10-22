/**
 * NormalizedReverseDCFEngine.ts — v5.4.1 (Production Master)
 * Damodaran / Buffett Reverse DCF Engine:
 * Normalizes Owner Earnings to prevent the "Growth CapEx Trap" for expanding manufacturing/industrial compounders.
 */

export interface ReverseDcfInput {
  currentMarketCapINR: number;
  nopatINR: number;
  depreciationINR: number;
  maintenanceCapexINR: number;       // Discretionary growth capex excluded
  wacc: number;                      // e.g. 0.115 (11.5%)
  terminalGrowthRate: number;        // e.g. 0.055 (5.5%)
  conservativeGrowthBaseline: number;// e.g. 0.14 (14%)
  moatQualityScore: number;          // 0 - 100
}

export interface ReverseDcfOutput {
  implied10YGrowthRate: number;
  intrinsicValueMarketCapINR: number;
  marginOfSafetyPct: number;
  requiredMarginOfSafetyPct: number;
  isValuationAttractive: boolean;
  notes: string;
}

export class NormalizedReverseDCFEngine {
  /**
   * Calculates market-implied growth rate and checks valuation margin of safety
   */
  public static calculateImpliedGrowth(input: ReverseDcfInput): ReverseDcfOutput {
    const {
      currentMarketCapINR,
      nopatINR,
      depreciationINR,
      maintenanceCapexINR,
      wacc,
      terminalGrowthRate,
      conservativeGrowthBaseline,
      moatQualityScore
    } = input;

    // Buffett Owner Earnings = NOPAT + Depreciation - Maintenance CapEx
    // Floor at 70% of NOPAT to safeguard companies undergoing major expansion cycles
    const ownerEarnings = Math.max(
      nopatINR + depreciationINR - maintenanceCapexINR,
      nopatINR * 0.70
    );

    if (ownerEarnings <= 0 || wacc <= terminalGrowthRate) {
      return {
        implied10YGrowthRate: 0,
        intrinsicValueMarketCapINR: 0,
        marginOfSafetyPct: -100,
        requiredMarginOfSafetyPct: 20,
        isValuationAttractive: false,
        notes: 'Invalid earnings or discount rate parameters.'
      };
    }

    // Binary search for market-implied growth rate g over 10 years
    let low = -0.30;
    let high = 0.80;
    let impliedG = 0.12;

    for (let iter = 0; iter < 50; iter++) {
      impliedG = 0.5 * (low + high);
      const computedEV = this.computeEnterpriseValue(ownerEarnings, impliedG, wacc, terminalGrowthRate);

      if (Math.abs(computedEV - currentMarketCapINR) < currentMarketCapINR * 0.0005) {
        break;
      }

      if (computedEV > currentMarketCapINR) {
        high = impliedG;
      } else {
        low = impliedG;
      }
    }

    // Compute intrinsic enterprise valuation under conservative baseline growth
    const intrinsicValueEV = this.computeEnterpriseValue(ownerEarnings, conservativeGrowthBaseline, wacc, terminalGrowthRate);
    const marginOfSafetyPct = ((intrinsicValueEV - currentMarketCapINR) / intrinsicValueEV) * 100;

    // Dynamic Margin of Safety based on Moat Quality
    const requiredMarginOfSafetyPct = moatQualityScore >= 85 ? 12.0 : (moatQualityScore >= 70 ? 18.0 : 25.0);
    const isValuationAttractive = marginOfSafetyPct >= requiredMarginOfSafetyPct && impliedG <= conservativeGrowthBaseline * 1.10;

    return {
      implied10YGrowthRate: Math.round(impliedG * 1000) / 1000,
      intrinsicValueMarketCapINR: Math.round(intrinsicValueEV),
      marginOfSafetyPct: Math.round(marginOfSafetyPct * 10) / 10,
      requiredMarginOfSafetyPct,
      isValuationAttractive,
      notes: isValuationAttractive
        ? `Valuation Attractive: Market implies ${(impliedG * 100).toFixed(1)}% growth (Margin of Safety: ${marginOfSafetyPct.toFixed(1)}% vs required ${requiredMarginOfSafetyPct}%).`
        : `Demanding Valuation: Market implies ${(impliedG * 100).toFixed(1)}% growth (Margin of Safety: ${marginOfSafetyPct.toFixed(1)}% below required ${requiredMarginOfSafetyPct}%).`
    };
  }

  private static computeEnterpriseValue(cashFlow0: number, g: number, wacc: number, gn: number): number {
    let pv = 0;
    let cf = cashFlow0;

    for (let t = 1; t <= 10; t++) {
      cf *= (1 + g);
      pv += cf / Math.pow(1 + wacc, t);
    }

    // Gordon Growth Terminal Value
    const terminalValue = (cf * (1 + gn)) / (wacc - gn);
    const pvTerminal = terminalValue / Math.pow(1 + wacc, 10);

    return pv + pvTerminal;
  }
}
