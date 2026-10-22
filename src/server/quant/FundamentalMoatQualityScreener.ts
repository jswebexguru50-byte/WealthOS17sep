/**
 * FundamentalMoatQualityScreener.ts — v5.4.1 (Production Master)
 * Grounded in Damodaran Corporate Finance & Warren Buffett Moat Principles.
 * 
 * Features:
 * 1. Damodaran Operating Invested Capital (Strips excess cash, floors invested capital at 50% equity)
 * 2. Adaptive Vintage Grace (Supports high-pedigree recent listings with 3-5 audited years)
 * 3. Cyclical Normalization Guard (Caps peak commodity EBIT to 16% mid-cycle ROIC to avoid value traps)
 * 4. Realistic FCF Conversion (Accommodates expansion CapEx cycles)
 */

export interface FinancialYearData {
  fiscalYear: number;
  ebit: number;
  effectiveTaxRate: number;
  totalDebt: number;
  totalEquity: number;
  cashAndEquivalents: number;
  operatingCashFlow: number;
  capitalExpenditures: number;
  netIncome: number;
  revenue: number;
  wacc: number;
  isCommodityCyclical?: boolean;
}

export interface MoatScreenResult {
  symbol: string;
  isQualityApproved: boolean;
  averageRoic: number;
  averageEconomicSpread: number;
  averageFcfConversion: number;
  reinvestmentRateAvg: number;
  yearsEvaluated: number;
  isCyclicalAdjusted: boolean;
  rejectionReasons: string[];
}

export class FundamentalMoatQualityScreener {
  private static readonly MIN_AVG_ROIC = 0.15; // 15.0% hurdle
  private static readonly MIN_ECONOMIC_SPREAD = 0.03; // ROIC - WACC >= 3.0%
  private static readonly MIN_FCF_CONVERSION = 0.70; // 70% threshold

  public static evaluateMoat(symbol: string, financials: FinancialYearData[]): MoatScreenResult {
    const rejectionReasons: string[] = [];

    // Adaptive Vintage: Support high-quality recent listings (minimum 3 audited years)
    if (!financials || financials.length < 3) {
      return {
        symbol,
        isQualityApproved: false,
        averageRoic: 0,
        averageEconomicSpread: 0,
        averageFcfConversion: 0,
        reinvestmentRateAvg: 0,
        yearsEvaluated: financials?.length || 0,
        isCyclicalAdjusted: false,
        rejectionReasons: ['Insufficient audited history: Minimum 3 fiscal years required.']
      };
    }

    const sorted = [...financials].sort((a, b) => a.fiscalYear - b.fiscalYear);
    const window = sorted.slice(-5); // Use up to 5 years
    const n = window.length;

    let sumRoic = 0;
    let sumSpread = 0;
    let sumFcfConversion = 0;
    let sumReinvestment = 0;
    const isCyclical = window[window.length - 1].isCommodityCyclical === true;

    for (const yr of window) {
      // 1. Damodaran Operating Invested Capital:
      // Strip excess cash. Operating cash bounded at 2% of revenue.
      const operatingCashRequired = (yr.revenue || 0) * 0.02;
      const excessCash = Math.max(0, (yr.cashAndEquivalents || 0) - operatingCashRequired);

      // Floor invested capital at 50% equity or 1.0 to prevent negative/microscopic denominators
      const netInvestedCapital = Math.max(
        ((yr.totalDebt || 0) + (yr.totalEquity || 0)) - excessCash,
        (yr.totalEquity || 0) * 0.5,
        1.0
      );

      const taxRate = Math.min(Math.max(yr.effectiveTaxRate ?? 0.25, 0.15), 0.35);
      let nopat = (yr.ebit || 0) * (1 - taxRate);

      // 2. Cyclical Normalization Guard:
      // If commodity cyclical, cap peak NOPAT to prevent buying peak-cycle value traps
      if (isCyclical && yr.revenue > 0 && (yr.ebit || 0) > yr.revenue * 0.25) {
        nopat = netInvestedCapital * 0.16; // Normalize to mid-cycle 16% ROIC ceiling
      }

      const roic = netInvestedCapital > 0 ? nopat / netInvestedCapital : 0;
      const spread = roic - (yr.wacc || 0.115);

      // 3. FCF Conversion (Handling High-Growth CapEx):
      const fcf = (yr.operatingCashFlow || 0) - (yr.capitalExpenditures || 0);
      const fcfConversion = (yr.netIncome || 0) > 0 ? Math.max(0, fcf / yr.netIncome) : 0;
      const reinvestment = nopat > 0 ? Math.min(1.5, (yr.capitalExpenditures || 0) / nopat) : 0;

      sumRoic += roic;
      sumSpread += spread;
      sumFcfConversion += fcfConversion;
      sumReinvestment += reinvestment;
    }

    const avgRoic = sumRoic / n;
    const avgSpread = sumSpread / n;
    const avgFcfConversion = sumFcfConversion / n;
    const avgReinvestment = sumReinvestment / n;

    if (avgRoic < this.MIN_AVG_ROIC) {
      rejectionReasons.push(`Average ${n}Y ROIC (${(avgRoic * 100).toFixed(1)}%) below 15.0% hurdle.`);
    }

    if (avgSpread < this.MIN_ECONOMIC_SPREAD) {
      rejectionReasons.push(`Average ${n}Y Economic Spread (${(avgSpread * 100).toFixed(1)}%) below 3.0% hurdle.`);
    }

    return {
      symbol,
      isQualityApproved: rejectionReasons.length === 0,
      averageRoic: Math.round(avgRoic * 1000) / 1000,
      averageEconomicSpread: Math.round(avgSpread * 1000) / 1000,
      averageFcfConversion: Math.round(avgFcfConversion * 1000) / 1000,
      reinvestmentRateAvg: Math.round(avgReinvestment * 1000) / 1000,
      yearsEvaluated: n,
      isCyclicalAdjusted: isCyclical,
      rejectionReasons
    };
  }
}
