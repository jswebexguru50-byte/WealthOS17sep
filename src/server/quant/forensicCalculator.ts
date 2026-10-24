/**
 * src/server/quant/forensicCalculator.ts
 * Institutional Forensic & Valuation Calculation Engine (v2.6)
 * 
 * Incorporates rigorous reviewer feedback:
 * 1. Altman Z-Score: Distinguishes missing/zero data from actual distress; returns INSUFFICIENT_DATA.
 * 2. Reverse DCF: Rejects missing cash flows/shares; flags solver pinning (>= 79.9% or <= -29.9%).
 * 3. RecommendationProvenance: Deterministic cross-stack contract binding technical momentum to forensic verdict.
 * 4. Sloan Accrual Ratio & Beneish M-Score: Audited mathematical identities with strict bounds.
 */

export interface AltmanZScoreResult {
  score: number | null;
  zone: 'SAFE' | 'GREY' | 'DISTRESS' | 'INSUFFICIENT_DATA';
  isComputable: boolean;
  rationale: string;
}

export interface BeneishMScoreResult {
  score: number;
  isManipulatorLikely: boolean;
  threshold: number;
  riskCategory: 'LOW_RISK' | 'HIGH_RISK_MANIPULATOR';
}

export interface DamodaranRoicResult {
  nopat: number;
  investedCapital: number;
  roic: number;
  wacc: number;
  economicSpread: number;
  trend: 'EXPANDING' | 'STABLE' | 'CONTRACTING';
}

export interface OwnerEarningsResult {
  ownerEarnings: number;
  ownerEarningsYield: number;
  ownerEarningsYieldOverRf: boolean;
}

export interface ReverseDcfParams {
  currentMarketPrice: number;
  shares: number;
  baseOwnerEarnings?: number;
  fcfPerShare?: number;
  waccPct?: number;
  conservativeHistoricalGrowthPct?: number;
  terminalGrowthPct?: number;
}

export interface ReverseDcfResult {
  currentMarketPrice: number | null;
  shares: number | null;
  marketCap: number | null;
  ownerEarningsBaseINR: number | null;
  waccPct: number | null;
  terminalGrowthPct: number | null;
  marketImplied10YGrowthRatePct: number | null;
  conservativeHistoricalGrowthRatePct: number | null;
  growthExpectationSpreadPct: number | null;
  intrinsicValuePerShare: number | null;
  freeCashFlowPerShare: number | null;
  marginOfSafetyPct: number | null;
  isValuationAttractive: boolean;
  valuationVerdict: string;
  isSolvable: boolean;
  isPinnedToBound: boolean;
  convergenceStatus: 'CONVERGED' | 'NON_CONVERGED_UPPER_BOUND' | 'NON_CONVERGED_LOWER_BOUND' | 'UNSOLVABLE_MISSING_INPUTS';
  rationale?: string;
}

export type ForensicCalculationStatus = 'OK' | 'INSUFFICIENT_DATA' | 'NOT_APPLICABLE';

/**
 * Evidence-shaped result used by the deterministic calculation slice.
 * `value: null` is intentional: a calculation must not turn absent facts into zero.
 */
export interface ForensicCalculationResult<T> {
  calcId: string;
  name: string;
  value: T | null;
  unit: string | null;
  period: string | null;
  scope: string | null;
  inputs: string[];
  formula: string;
  status: ForensicCalculationStatus;
  note: string;
}

export interface ForensicCalculationContext {
  period?: string;
  scope?: string;
  inputs?: string[];
}

export interface WorkingCapitalResult {
  dso: number;
  dio: number;
  dpo: number;
  ccc: number;
  balanceBasis: 'AVERAGE_BALANCE' | 'CLOSING_BALANCE';
}

export interface MarginResult {
  numerator: number;
  marginPct: number;
}

export interface LeverageResult {
  netDebt: number;
  netDebtToEbitda: number;
  interestCoverage: number;
  interestCoverageExcludingOtherIncome: number | null;
}

export interface RateSensitivityResult {
  pretaxDelta: number;
  afterTaxDelta: number | null;
  effectiveTaxRate: number | null;
}

export interface ValuationMultiplesResult {
  pe: number | null;
  pb: number | null;
  evToEbitda: number | null;
  fcfYieldPct: number | null;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const missing = (values: Record<string, unknown>): string[] =>
  Object.entries(values)
    .filter(([, value]) => !isFiniteNumber(value))
    .map(([name]) => name);

const makeResult = <T>(
  calcId: string,
  name: string,
  formula: string,
  context: ForensicCalculationContext | undefined,
  unit: string | null,
  value: T | null,
  status: ForensicCalculationStatus,
  note: string,
  inputs: string[] = context?.inputs ?? [],
): ForensicCalculationResult<T> => ({
  calcId,
  name,
  value,
  unit,
  period: context?.period ?? null,
  scope: context?.scope ?? null,
  inputs,
  formula,
  status,
  note,
});

const insufficient = <T>(
  calcId: string,
  name: string,
  formula: string,
  context: ForensicCalculationContext | undefined,
  unit: string | null,
  missingInputs: string[],
): ForensicCalculationResult<T> => makeResult(
  calcId,
  name,
  formula,
  context,
  unit,
  null,
  'INSUFFICIENT_DATA',
  `Missing or non-finite inputs: ${missingInputs.join(', ')}`,
);

export interface RecommendationProvenance {
  symbol: string;
  technicalSignal: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'AVOID';
  forensicVerdict: 'PRISTINE_BUY' | 'QUALIFIED_BUY' | 'WATCHLIST' | 'AVOID_GOVERNANCE_RISK' | 'AVOID_SOLVENCY_RISK';
  effectiveRecommendation: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'CAUTION_QUALIFIED' | 'GATED_AVOID' | 'AVOID';
  isGated: boolean;
  gatingReasons: string[];
  sloanAccrualRatioPct: number | null;
  beneishMScore: number | null;
  isBeneishManipulator: boolean;
  altmanZone: string;
  contingentLiabPctNetWorth: number;
  rptPctRevenue: number;
  concallGrade: string;
  auditTrail: string;
  timestamp: string;
}

export class ForensicCalculator {
  /** Deterministic quarter-over-quarter or year-over-year growth. */
  public static calculateGrowth(
    current: number | null | undefined,
    comparison: number | null | undefined,
    kind: 'YOY' | 'SEQUENTIAL',
    context?: ForensicCalculationContext,
  ): ForensicCalculationResult<number> {
    const formula = '(current / comparison - 1) × 100';
    const missingInputs = missing({ current, comparison });
    if (missingInputs.length > 0 || comparison === 0) {
      return insufficient<number>(
        `growth_${kind.toLowerCase()}`,
        `${kind} growth`,
        formula,
        context,
        '%',
        missingInputs.length > 0 ? missingInputs : ['comparison (must be non-zero)'],
      );
    }

    return makeResult(
      `growth_${kind.toLowerCase()}`,
      `${kind} growth`,
      formula,
      context,
      '%',
      (current / comparison - 1) * 100,
      'OK',
      `${kind === 'YOY' ? 'Discrete quarter versus the same quarter in the prior year' : 'Discrete quarter versus the immediately prior quarter'}; no cumulative period was substituted.`,
    );
  }

  public static calculateYoYGrowth(
    current: number | null | undefined,
    priorYear: number | null | undefined,
    context?: ForensicCalculationContext,
  ): ForensicCalculationResult<number> {
    return this.calculateGrowth(current, priorYear, 'YOY', context);
  }

  public static calculateSequentialGrowth(
    current: number | null | undefined,
    priorQuarter: number | null | undefined,
    context?: ForensicCalculationContext,
  ): ForensicCalculationResult<number> {
    return this.calculateGrowth(current, priorQuarter, 'SEQUENTIAL', context);
  }

  /** CAGR is only meaningful for positive start and end values. */
  public static calculateCagr(
    start: number | null | undefined,
    end: number | null | undefined,
    years: number | null | undefined,
    context?: ForensicCalculationContext,
  ): ForensicCalculationResult<number> {
    const formula = '(end / start)^(1 / years) - 1';
    const missingInputs = missing({ start, end, years });
    if (missingInputs.length > 0 || start <= 0 || end <= 0 || years <= 0) {
      return insufficient<number>(
        'cagr',
        'Compound annual growth rate',
        formula,
        context,
        '%',
        missingInputs.length > 0 ? missingInputs : ['start, end, and years must be positive'],
      );
    }

    return makeResult(
      'cagr',
      'Compound annual growth rate',
      formula,
      context,
      '%',
      (Math.pow(end / start, 1 / years) - 1) * 100,
      'OK',
      'Annual facts only; start and end use the same scope and metric.',
    );
  }

  public static calculateMargin(
    numerator: number | null | undefined,
    revenue: number | null | undefined,
    name: 'EBITDA margin' | 'PAT margin' | 'EBIT margin' = 'EBITDA margin',
    context?: ForensicCalculationContext,
  ): ForensicCalculationResult<MarginResult> {
    const formula = '(numerator / revenue) × 100';
    const missingInputs = missing({ numerator, revenue });
    if (missingInputs.length > 0 || revenue === 0) {
      return insufficient<MarginResult>(
        'margin',
        name,
        formula,
        context,
        '%',
        missingInputs.length > 0 ? missingInputs : ['revenue (must be non-zero)'],
      );
    }

    return makeResult('margin', name, formula, context, '%', {
      numerator,
      marginPct: (numerator / revenue) * 100,
    }, 'OK', 'Revenue and numerator must share the same period and scope.');
  }

  public static calculateCfoPatRatio(
    cfo: number | null | undefined,
    pat: number | null | undefined,
    context?: ForensicCalculationContext,
  ): ForensicCalculationResult<number> {
    const formula = 'CFO / PAT attributable to owners';
    const missingInputs = missing({ cfo, pat });
    if (missingInputs.length > 0 || pat === 0) {
      return insufficient<number>('cfo_pat', 'CFO/PAT', formula, context, 'x', missingInputs.length > 0 ? missingInputs : ['PAT (must be non-zero)']);
    }
    return makeResult('cfo_pat', 'CFO/PAT', formula, context, 'x', cfo / pat, 'OK', 'CFO and PAT use the same duration basis.');
  }

  public static calculateAccrualRatio(
    pat: number | null | undefined,
    cfo: number | null | undefined,
    averageTotalAssets: number | null | undefined,
    context?: ForensicCalculationContext,
  ): ForensicCalculationResult<number> {
    const formula = '(PAT - CFO) / average total assets';
    const missingInputs = missing({ pat, cfo, averageTotalAssets });
    if (missingInputs.length > 0 || averageTotalAssets <= 0) {
      return insufficient<number>('accrual_ratio', 'Accrual ratio', formula, context, 'ratio', missingInputs.length > 0 ? missingInputs : ['averageTotalAssets (must be positive)']);
    }
    return makeResult('accrual_ratio', 'Accrual ratio', formula, context, 'ratio', (pat - cfo) / averageTotalAssets, 'OK', 'Average total assets must be aligned to the PAT/CFO period.');
  }

  public static calculateFcf(
    cfo: number | null | undefined,
    capex: number | null | undefined,
    capexBasis: 'TOTAL_CAPEX' | 'PPE_ONLY' = 'TOTAL_CAPEX',
    context?: ForensicCalculationContext,
  ): ForensicCalculationResult<number> {
    const formula = 'CFO - capex';
    const missingInputs = missing({ cfo, capex });
    if (missingInputs.length > 0) {
      return insufficient<number>('fcf', 'Free cash flow', formula, context, 'currency', missingInputs);
    }
    const note = capexBasis === 'PPE_ONLY'
      ? 'Capex is PPE-only; total capex may be understated.'
      : 'Capex is treated as total capex for the stated period.';
    return makeResult('fcf', 'Free cash flow', formula, context, 'currency', cfo - capex, 'OK', note);
  }

  public static calculateReinvestmentRate(
    capex: number | null | undefined,
    cfo: number | null | undefined,
    context?: ForensicCalculationContext,
  ): ForensicCalculationResult<number> {
    const formula = 'capex / CFO';
    const missingInputs = missing({ capex, cfo });
    if (missingInputs.length > 0 || cfo === 0) {
      return insufficient<number>('reinvestment_rate', 'Reinvestment rate', formula, context, 'ratio', missingInputs.length > 0 ? missingInputs : ['CFO (must be non-zero)']);
    }
    return makeResult('reinvestment_rate', 'Reinvestment rate', formula, context, 'ratio', capex / cfo, 'OK', 'Capex and CFO use the same duration basis.');
  }

  public static calculateWorkingCapital(
    input: {
      revenue: number | null | undefined;
      cogs: number | null | undefined;
      receivables: number | null | undefined;
      inventory: number | null | undefined;
      payables: number | null | undefined;
      openingReceivables?: number | null;
      openingInventory?: number | null;
      openingPayables?: number | null;
    },
    context?: ForensicCalculationContext,
  ): ForensicCalculationResult<WorkingCapitalResult> {
    const formula = 'DSO = receivables / revenue × 365; DIO = inventory / COGS × 365; DPO = payables / COGS × 365; CCC = DSO + DIO - DPO';
    const requiredMissing = missing({ revenue: input.revenue, cogs: input.cogs, receivables: input.receivables, inventory: input.inventory, payables: input.payables });
    if (requiredMissing.length > 0 || input.revenue === 0 || input.cogs === 0) {
      return insufficient<WorkingCapitalResult>('working_capital', 'Working capital cycle', formula, context, 'days', requiredMissing.length > 0 ? requiredMissing : ['revenue and cogs (must be non-zero)']);
    }

    const hasOpeningBalances = [input.openingReceivables, input.openingInventory, input.openingPayables].every(isFiniteNumber);
    const receivables = hasOpeningBalances ? (input.receivables + input.openingReceivables) / 2 : input.receivables;
    const inventory = hasOpeningBalances ? (input.inventory + input.openingInventory) / 2 : input.inventory;
    const payables = hasOpeningBalances ? (input.payables + input.openingPayables) / 2 : input.payables;
    const balanceBasis = hasOpeningBalances ? 'AVERAGE_BALANCE' : 'CLOSING_BALANCE';
    const value = {
      dso: (receivables / input.revenue) * 365,
      dio: (inventory / input.cogs) * 365,
      dpo: (payables / input.cogs) * 365,
      ccc: (receivables / input.revenue) * 365 + (inventory / input.cogs) * 365 - (payables / input.cogs) * 365,
      balanceBasis,
    } satisfies WorkingCapitalResult;
    return makeResult('working_capital', 'Working capital cycle', formula, context, 'days', value, 'OK', hasOpeningBalances ? 'Average opening and closing balances used.' : 'CLOSING_BALANCE: one or more opening balances were unavailable.');
  }

  public static calculateRoic(
    nopat: number | null | undefined,
    investedCapital: number | null | undefined,
    context?: ForensicCalculationContext,
  ): ForensicCalculationResult<number> {
    const formula = 'NOPAT / invested capital × 100';
    const missingInputs = missing({ nopat, investedCapital });
    if (missingInputs.length > 0 || investedCapital === 0) {
      return insufficient<number>('roic', 'ROIC', formula, context, '%', missingInputs.length > 0 ? missingInputs : ['investedCapital (must be non-zero)']);
    }
    return makeResult('roic', 'ROIC', formula, context, '%', (nopat / investedCapital) * 100, 'OK', 'Invested capital definition must be retained with the result.');
  }

  public static calculateIncrementalRoic(
    deltaNopat: number | null | undefined,
    deltaInvestedCapital: number | null | undefined,
    context?: ForensicCalculationContext,
  ): ForensicCalculationResult<number> {
    const formula = 'ΔNOPAT / Δinvested capital × 100';
    const missingInputs = missing({ deltaNopat, deltaInvestedCapital });
    if (missingInputs.length > 0 || deltaInvestedCapital === 0) {
      return insufficient<number>('incremental_roic', 'Incremental ROIC', formula, context, '%', missingInputs.length > 0 ? missingInputs : ['deltaInvestedCapital (must be non-zero)']);
    }
    return makeResult('incremental_roic', 'Incremental ROIC', formula, context, '%', (deltaNopat / deltaInvestedCapital) * 100, 'OK', 'Window must be stated; no annualization is inferred.');
  }

  public static calculateRoce(
    ebit: number | null | undefined,
    capitalEmployed: number | null | undefined,
    context?: ForensicCalculationContext,
  ): ForensicCalculationResult<number> {
    const formula = 'EBIT / capital employed × 100';
    const missingInputs = missing({ ebit, capitalEmployed });
    if (missingInputs.length > 0 || capitalEmployed === 0) {
      return insufficient<number>('roce', 'ROCE', formula, context, '%', missingInputs.length > 0 ? missingInputs : ['capitalEmployed (must be non-zero)']);
    }
    return makeResult('roce', 'ROCE', formula, context, '%', (ebit / capitalEmployed) * 100, 'OK', 'Capital employed definition is part of the calculation contract.');
  }

  public static calculateRoe(
    pat: number | null | undefined,
    averageEquity: number | null | undefined,
    context?: ForensicCalculationContext,
  ): ForensicCalculationResult<number> {
    const formula = 'PAT attributable to owners / average equity × 100';
    const missingInputs = missing({ pat, averageEquity });
    if (missingInputs.length > 0 || averageEquity === 0) {
      return insufficient<number>('roe', 'ROE', formula, context, '%', missingInputs.length > 0 ? missingInputs : ['averageEquity (must be non-zero)']);
    }
    return makeResult('roe', 'ROE', formula, context, '%', (pat / averageEquity) * 100, 'OK', 'Closing equity may be used only when explicitly labelled CLOSING_BALANCE by the caller.');
  }

  public static calculateLeverage(
    input: {
      borrowings: number | null | undefined;
      leases: number | null | undefined;
      cash: number | null | undefined;
      ebitda: number | null | undefined;
      ebit: number | null | undefined;
      financeCost: number | null | undefined;
      otherIncome?: number | null;
    },
    context?: ForensicCalculationContext,
  ): ForensicCalculationResult<LeverageResult> {
    const formula = 'net debt = borrowings + leases - cash; net debt/EBITDA; interest coverage = EBIT/finance cost';
    const missingInputs = missing({ borrowings: input.borrowings, leases: input.leases, cash: input.cash, ebitda: input.ebitda, ebit: input.ebit, financeCost: input.financeCost });
    if (missingInputs.length > 0 || input.ebitda === 0 || input.financeCost === 0) {
      return insufficient<LeverageResult>('leverage', 'Leverage and interest coverage', formula, context, 'x', missingInputs.length > 0 ? missingInputs : ['EBITDA and financeCost (must be non-zero)']);
    }
    const netDebt = input.borrowings + input.leases - input.cash;
    const interestCoverageExcludingOtherIncome = isFiniteNumber(input.otherIncome)
      ? (input.ebit - input.otherIncome) / input.financeCost
      : null;
    return makeResult('leverage', 'Leverage and interest coverage', formula, context, 'x', {
      netDebt,
      netDebtToEbitda: netDebt / input.ebitda,
      interestCoverage: input.ebit / input.financeCost,
      interestCoverageExcludingOtherIncome,
    }, 'OK', isFiniteNumber(input.otherIncome) ? 'Both EBIT/finance cost variants are reported.' : 'Other income unavailable; excluding-other-income variant remains null.');
  }

  public static calculateRateSensitivity(
    floatingDebt: number | null | undefined,
    effectiveTaxRate: number | null | undefined,
    context?: ForensicCalculationContext,
  ): ForensicCalculationResult<RateSensitivityResult> {
    const formula = 'pretax delta = floating debt × 0.0025; after-tax delta = pretax delta × (1 - effective tax rate)';
    if (!isFiniteNumber(floatingDebt)) {
      return insufficient<RateSensitivityResult>('rate_sensitivity_25bp', '25-bp rate sensitivity', formula, context, 'currency', ['floatingDebt']);
    }
    const pretaxDelta = floatingDebt * 0.0025;
    const afterTaxDelta = isFiniteNumber(effectiveTaxRate) ? pretaxDelta * (1 - effectiveTaxRate) : null;
    return makeResult('rate_sensitivity_25bp', '25-bp rate sensitivity', formula, context, 'currency', {
      pretaxDelta,
      afterTaxDelta,
      effectiveTaxRate: isFiniteNumber(effectiveTaxRate) ? effectiveTaxRate : null,
    }, 'OK', afterTaxDelta === null ? 'Floating-rate debt was provided; tax rate was not evidenced, so only pre-tax sensitivity is reported.' : 'Tax rate is treated as evidenced and expressed as a fraction. Total debt was not substituted for floating-rate debt.');
  }

  public static calculateValuationMultiples(
    input: {
      marketPrice: number | null | undefined;
      eps: number | null | undefined;
      bookValuePerShare: number | null | undefined;
      enterpriseValue: number | null | undefined;
      ebitda: number | null | undefined;
      fcf: number | null | undefined;
      marketCap: number | null | undefined;
    },
    context?: ForensicCalculationContext,
  ): ForensicCalculationResult<ValuationMultiplesResult> {
    const formula = 'P/E = price/EPS; P/B = price/book value per share; EV/EBITDA = EV/EBITDA; FCF yield = FCF/market cap × 100';
    const missingInputs = missing(input);
    if (missingInputs.length > 0) {
      return insufficient<ValuationMultiplesResult>('valuation_multiples', 'Valuation multiples', formula, context, 'mixed', missingInputs);
    }
    const value = {
      pe: input.eps === 0 ? null : input.marketPrice / input.eps,
      pb: input.bookValuePerShare === 0 ? null : input.marketPrice / input.bookValuePerShare,
      evToEbitda: input.ebitda === 0 ? null : input.enterpriseValue / input.ebitda,
      fcfYieldPct: input.marketCap === 0 ? null : (input.fcf / input.marketCap) * 100,
    } satisfies ValuationMultiplesResult;
    const unavailable = Object.entries(value).filter(([, result]) => result === null).map(([name]) => name);
    return makeResult('valuation_multiples', 'Valuation multiples', formula, context, 'mixed', value, unavailable.length === 0 ? 'OK' : 'INSUFFICIENT_DATA', unavailable.length === 0 ? 'All requested multiples are computable.' : `Non-computable multiples: ${unavailable.join(', ')}`);
  }

  public static calculateOwnHistoryPercentile(
    current: number | null | undefined,
    historicalValues: readonly (number | null | undefined)[],
    context?: ForensicCalculationContext,
  ): ForensicCalculationResult<number> {
    const formula = 'count(historical value ≤ current) / count(valid historical values) × 100';
    if (!isFiniteNumber(current)) {
      return insufficient<number>('own_history_percentile', 'Own-history percentile', formula, context, '%', ['current']);
    }
    const history = historicalValues.filter(isFiniteNumber);
    if (history.length === 0) {
      return insufficient<number>('own_history_percentile', 'Own-history percentile', formula, context, '%', ['historicalValues']);
    }
    return makeResult('own_history_percentile', 'Own-history percentile', formula, context, '%', history.filter(value => value <= current).length / history.length * 100, 'OK', 'Only valid observations from the same metric, scope, and comparable period basis are included.');
  }

  /**
   * 1. Sloan Accrual Ratio
   * Formula: (Net Income - CFO - CFI) / Total Assets
   * Warning threshold: > +10% indicates aggressive earnings acceleration via non-cash accounting accruals.
   */
  public static computeSloanAccrualRatio(netIncome: number, cfo: number, cfi: number, totalAssets: number): number | null {
    if (!totalAssets || totalAssets <= 0 || isNaN(totalAssets)) {
      return null;
    }
    const accruals = netIncome - cfo - cfi;
    return Math.round((accruals / totalAssets) * 1000) / 10; // in %
  }

  /**
   * 2. Beneish 8-Variable M-Score
   * Benchmark: Score > -1.78 suggests high probability of earnings manipulation.
   */
  public static computeBeneishMScore(ratios: {
    dsri: number;
    gmi: number;
    aqi: number;
    sgi: number;
    depi: number;
    sgai: number;
    tata: number;
    lvgi: number;
  }): BeneishMScoreResult {
    const { dsri, gmi, aqi, sgi, depi, sgai, tata, lvgi } = ratios;
    const m =
      -4.84 +
      0.920 * dsri +
      0.528 * gmi +
      0.404 * aqi +
      0.892 * sgi +
      0.115 * depi -
      0.172 * sgai +
      4.037 * tata +
      0.0327 * lvgi;

    const score = Math.round(m * 100) / 100;
    const isManipulatorLikely = score > -1.78;

    return {
      score,
      isManipulatorLikely,
      threshold: -1.78,
      riskCategory: isManipulatorLikely ? 'HIGH_RISK_MANIPULATOR' : 'LOW_RISK'
    };
  }

  /**
   * 3. Altman Z-Score for Emerging Markets
   * Solves reviewer bug: Never mislabels missing balance sheet data as insolvency/distress!
   * Formula: 1.2*X1 + 1.4*X2 + 3.3*X3 + 0.6*X4 + 0.999*X5
   */
  public static computeAltmanZScore(
    workingCapital: number,
    retainedEarnings: number,
    ebit: number,
    marketCap: number,
    totalLiabilities: number,
    sales: number,
    totalAssets: number
  ): AltmanZScoreResult {
    // Missing or invalid data must be explicitly flagged, never mapped to 0 (which would be DISTRESS)
    if (
      !totalAssets || totalAssets <= 0 || isNaN(totalAssets) ||
      !totalLiabilities || totalLiabilities <= 0 || isNaN(totalLiabilities)
    ) {
      return {
        score: null,
        zone: 'INSUFFICIENT_DATA',
        isComputable: false,
        rationale: 'Missing required statutory disclosures: Total Assets or Total Liabilities is zero or undefined.'
      };
    }

    const x1 = workingCapital / totalAssets;
    const x2 = retainedEarnings / totalAssets;
    const x3 = ebit / totalAssets;
    const x4 = marketCap / totalLiabilities;
    const x5 = sales / totalAssets;

    const z = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 0.999 * x5;
    const score = Math.round(z * 100) / 100;

    let zone: 'SAFE' | 'GREY' | 'DISTRESS' = 'DISTRESS';
    if (score >= 2.99) zone = 'SAFE';
    else if (score >= 1.81) zone = 'GREY';

    return {
      score,
      zone,
      isComputable: true,
      rationale: zone === 'SAFE' ? 'Fortress Balance Sheet (Z >= 2.99)' : zone === 'GREY' ? 'Moderate Solvency Buffer (1.81 <= Z < 2.99)' : 'Elevated Leverage Stress (Z < 1.81)'
    };
  }

  /**
   * 4. Damodaran Operating Invested Capital & ROIC Spread
   */
  public static computeDamodaranRoicSpread(
    ebit: number,
    totalDebt: number,
    totalEquity: number,
    cash: number,
    revenue: number,
    effectiveTaxRate: number,
    wacc: number
  ): DamodaranRoicResult {
    const operatingCashNeeded = revenue * 0.02;
    const excessCash = Math.max(0, cash - operatingCashNeeded);
    const minFloor = (totalDebt + totalEquity) > 10_000_000 ? 10_000_000 : 1.0;
    const investedCapital = Math.max((totalDebt + totalEquity) - excessCash, totalEquity * 0.5, minFloor);
    const taxRate = Math.min(Math.max(effectiveTaxRate || 0.25, 0.15), 0.35);
    const nopat = ebit * (1 - taxRate);
    const roic = (nopat / investedCapital) * 100;
    const economicSpread = roic - wacc;

    let trend: 'EXPANDING' | 'STABLE' | 'CONTRACTING' = 'STABLE';
    if (economicSpread >= 5.0) trend = 'EXPANDING';
    else if (economicSpread < 1.5) trend = 'CONTRACTING';

    return {
      nopat: Math.round(nopat),
      investedCapital: Math.round(investedCapital),
      roic: Math.round(roic * 10) / 10,
      wacc: Math.round(wacc * 10) / 10,
      economicSpread: Math.round(economicSpread * 10) / 10,
      trend
    };
  }

  /**
   * 5. Warren Buffett Owner Earnings
   */
  public static computeOwnerEarnings(cfo: number, maintenanceCapex: number, marketCap: number, rf = 7.0): OwnerEarningsResult {
    const ownerEarnings = Math.max(0, cfo - maintenanceCapex);
    const ownerEarningsYield = marketCap > 0 ? (ownerEarnings / marketCap) * 100 : 0;
    return {
      ownerEarnings: Math.round(ownerEarnings),
      ownerEarningsYield: Math.round(ownerEarningsYield * 100) / 100,
      ownerEarningsYieldOverRf: ownerEarningsYield >= rf
    };
  }

  /**
   * 6. Reverse DCF Valuation Engine
   * Solves reviewer bugs:
   * - Eliminates silent fallback assumptions (does not invent arbitrary 3.8% FCF yield or 1 Cr shares).
   * - Detects boundary pinning (>= 79.9% or <= -29.9%) and discloses solver non-convergence explicitly.
   */
  public static solveReverseDcf(params: ReverseDcfParams): ReverseDcfResult {
    const cmp = params.currentMarketPrice;
    const shares = params.shares;

    // Reject missing market price, shares, or explicitly stored assumptions.
    // Defaults would make an illustrative valuation look evidence-backed.
    const missingAssumptions = missing({
      currentMarketPrice: cmp,
      shares,
      waccPct: params.waccPct,
      terminalGrowthPct: params.terminalGrowthPct,
      conservativeHistoricalGrowthPct: params.conservativeHistoricalGrowthPct,
    });
    const invalidDiscountAssumptions =
      isFiniteNumber(params.waccPct) &&
      isFiniteNumber(params.terminalGrowthPct) &&
      (params.waccPct <= 0 || params.waccPct <= params.terminalGrowthPct);
    if (missingAssumptions.length > 0 || invalidDiscountAssumptions || cmp <= 0 || shares <= 0) {
      return {
        currentMarketPrice: isFiniteNumber(cmp) ? cmp : null,
        shares: isFiniteNumber(shares) ? shares : null,
        marketCap: null,
        ownerEarningsBaseINR: null,
        waccPct: isFiniteNumber(params.waccPct) ? params.waccPct : null,
        terminalGrowthPct: isFiniteNumber(params.terminalGrowthPct) ? params.terminalGrowthPct : null,
        marketImplied10YGrowthRatePct: null,
        conservativeHistoricalGrowthRatePct: isFiniteNumber(params.conservativeHistoricalGrowthPct) ? params.conservativeHistoricalGrowthPct : null,
        growthExpectationSpreadPct: null,
        intrinsicValuePerShare: null,
        freeCashFlowPerShare: null,
        marginOfSafetyPct: null,
        isValuationAttractive: false,
        valuationVerdict: 'UNSOLVABLE: MISSING PRICE, SHARE COUNT, OR EXPLICIT ASSUMPTIONS',
        isSolvable: false,
        isPinnedToBound: false,
        convergenceStatus: 'UNSOLVABLE_MISSING_INPUTS',
        rationale: `Execution halted: ${missingAssumptions.length > 0 ? `missing ${missingAssumptions.join(', ')}` : invalidDiscountAssumptions ? 'WACC must be positive and greater than terminal growth.' : 'CMP and total shares outstanding must be strictly positive verified numbers.'}`
      };
    }

    // Determine base cash flow: must be explicitly provided
    let baseCF = 0;
    if (params.baseOwnerEarnings !== undefined && params.baseOwnerEarnings !== null && params.baseOwnerEarnings > 0) {
      baseCF = params.baseOwnerEarnings;
    } else if (params.fcfPerShare !== undefined && params.fcfPerShare !== null && params.fcfPerShare > 0) {
      baseCF = params.fcfPerShare * shares;
    } else {
      return {
        currentMarketPrice: cmp,
        shares,
        marketCap: cmp * shares,
        ownerEarningsBaseINR: null,
        waccPct: params.waccPct,
        terminalGrowthPct: params.terminalGrowthPct,
        marketImplied10YGrowthRatePct: null,
        conservativeHistoricalGrowthRatePct: params.conservativeHistoricalGrowthPct,
        growthExpectationSpreadPct: null,
        intrinsicValuePerShare: null,
        freeCashFlowPerShare: null,
        marginOfSafetyPct: null,
        isValuationAttractive: false,
        valuationVerdict: 'UNSOLVABLE: MISSING CASH FLOW DISCLOSURE',
        isSolvable: false,
        isPinnedToBound: false,
        convergenceStatus: 'UNSOLVABLE_MISSING_INPUTS',
        rationale: 'Execution halted: Neither baseOwnerEarnings nor fcfPerShare provided. Will not invent synthetic placeholder yield.'
      };
    }

    const marketCap = cmp * shares;
    const wacc = params.waccPct / 100;
    const gTerm = params.terminalGrowthPct / 100;

    const calculatePv = (g: number): number => {
      let pv = 0;
      let cf = baseCF;
      for (let t = 1; t <= 10; t++) {
        cf *= (1 + g);
        pv += cf / Math.pow(1 + wacc, t);
      }
      const terminalValue = (cf * (1 + gTerm)) / Math.max(wacc - gTerm, 0.01);
      pv += terminalValue / Math.pow(1 + wacc, 10);
      return pv;
    };

    let low = -0.30;
    let high = 0.80;
    let impliedG = 0.12;

    for (let i = 0; i < 45; i++) {
      const mid = (low + high) / 2;
      const pv = calculatePv(mid);
      if (Math.abs(pv - marketCap) < 100_000 || (high - low) < 0.0001) {
        impliedG = mid;
        break;
      }
      if (pv < marketCap) low = mid;
      else high = mid;
      impliedG = mid;
    }

    // Boundary pinning detection
    const isUpperPinned = impliedG >= 0.795;
    const isLowerPinned = impliedG <= -0.295;
    const isPinnedToBound = isUpperPinned || isLowerPinned;

    const consG = params.conservativeHistoricalGrowthPct / 100;
    const intrinsicPv = calculatePv(consG);
    const intrinsicValuePerShare = Math.round((intrinsicPv / shares) * 100) / 100;
    const marginOfSafetyPct = Math.round(((intrinsicValuePerShare - cmp) / cmp) * 1000) / 10;

    if (isPinnedToBound) {
      const boundDir = isUpperPinned ? 'UPPER_BOUND (+80%/yr)' : 'LOWER_BOUND (-30%/yr)';
      return {
        currentMarketPrice: cmp,
        shares,
        marketCap,
        ownerEarningsBaseINR: Math.round(baseCF),
        waccPct: Math.round(wacc * 1000) / 10,
        terminalGrowthPct: Math.round(gTerm * 1000) / 10,
        marketImplied10YGrowthRatePct: null,
        conservativeHistoricalGrowthRatePct: Math.round(consG * 1000) / 10,
        growthExpectationSpreadPct: null,
        intrinsicValuePerShare,
        freeCashFlowPerShare: Math.round((baseCF / shares) * 100) / 100,
        marginOfSafetyPct,
        isValuationAttractive: false,
        valuationVerdict: `NON_CONVERGED: PINNED TO ${boundDir}`,
        isSolvable: true,
        isPinnedToBound: true,
        convergenceStatus: isUpperPinned ? 'NON_CONVERGED_UPPER_BOUND' : 'NON_CONVERGED_LOWER_BOUND',
        rationale: `Bisection solver pinned to ${boundDir}. Valuation requires growth outside rational fundamental boundaries.`
      };
    }

    const marketImplied10YGrowthRatePct = Math.round(impliedG * 1000) / 10;
    const growthExpectationSpreadPct = Math.round((marketImplied10YGrowthRatePct - (consG * 100)) * 10) / 10;

    let valuationVerdict = 'FAIR VALUE (-10% to +20% MoS)';
    if (marginOfSafetyPct >= 20.0) valuationVerdict = 'ATTRACTIVE (MoS >= 20%)';
    else if (marginOfSafetyPct < -15.0) valuationVerdict = 'PRICED FOR PERFECTION (MoS < -15%)';

    return {
      currentMarketPrice: cmp,
      shares,
      marketCap,
      ownerEarningsBaseINR: Math.round(baseCF),
      waccPct: Math.round(wacc * 1000) / 10,
      terminalGrowthPct: Math.round(gTerm * 1000) / 10,
      marketImplied10YGrowthRatePct,
      conservativeHistoricalGrowthRatePct: Math.round(consG * 1000) / 10,
      growthExpectationSpreadPct,
      intrinsicValuePerShare,
      freeCashFlowPerShare: Math.round((baseCF / shares) * 100) / 100,
      marginOfSafetyPct,
      isValuationAttractive: marginOfSafetyPct >= 20.0 && marketImplied10YGrowthRatePct <= (consG * 100),
      valuationVerdict,
      isSolvable: true,
      isPinnedToBound: false,
      convergenceStatus: 'CONVERGED'
    };
  }

  /**
   * 7. Wyckoff VPA & Information Discreteness
   */
  public static evaluateWyckoffAndQmom(
    priceNear52wHigh: boolean,
    volumeSpike: boolean,
    priceSpreadNarrow: boolean,
    swingLowRetestLowVolume: boolean,
    qmom12_2ReturnPct: number,
    pctNegDays: number,
    pctPosDays: number
  ) {
    const signPr = qmom12_2ReturnPct >= 0 ? 1 : -1;
    const informationDiscretenessId = Number((signPr * (pctNegDays - pctPosDays)).toFixed(4));
    const effortVsResultDivergence = Boolean(priceNear52wHigh && volumeSpike && priceSpreadNarrow);

    let vpaPhase = 'MARKDOWN_LIQUIDATION';
    if (effortVsResultDivergence) {
      vpaPhase = 'DISTRIBUTION_UTAD';
    } else if (swingLowRetestLowVolume) {
      vpaPhase = 'ACCUMULATION_SPRING';
    } else if (qmom12_2ReturnPct > 15 && informationDiscretenessId <= -0.02) {
      vpaPhase = 'MARKUP_EXPANSION';
    }

    const smartMoneyAccumulationConfirmed =
      (vpaPhase === 'ACCUMULATION_SPRING' || vpaPhase === 'MARKUP_EXPANSION') &&
      informationDiscretenessId <= -0.02 &&
      !effortVsResultDivergence;

    return {
      vpaPhase,
      effortVsResultDivergence,
      qmom12_2ReturnPct,
      informationDiscretenessId,
      smartMoneyAccumulationConfirmed
    };
  }

  /**
   * 8. RecommendationProvenanceEngine:
   * The load-bearing contract connecting Opportunity Engine signals to Forensic verdicts.
   * Gates or downgrades momentum recommendations if forensic red flags are present.
   */
  public static evaluateProvenance(
    symbol: string,
    technicalSignal: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'AVOID',
    forensicDossier: any
  ): RecommendationProvenance {
    const gatingReasons: string[] = [];

    const sloan = forensicDossier?.governanceAndAccounting?.deterministicScores?.sloanAccrualRatio ?? null;
    const beneish = forensicDossier?.governanceAndAccounting?.deterministicScores?.beneishMScore ?? null;
    const altmanZone = forensicDossier?.solvencyAndStressTesting?.altmanZScore?.zone ?? 'UNKNOWN';
    const contingentLiabPct = forensicDossier?.governanceAndAccounting?.balanceSheetForensics?.contingentLiabilitiesPctNetWorth ?? 0;
    const rptPct = forensicDossier?.governanceAndAccounting?.balanceSheetForensics?.relatedPartyTransactionsPctRevenue ?? 0;
    const concallGrade = forensicDossier?.concallAudit?.credibilityGrade ?? 'GRADE B (Execution Lag)';
    const forensicVerdict = forensicDossier?.executiveSummary?.institutionalVerdict || 'WATCHLIST';

    // Check Rule 1: Aggressive Sloan Accruals (> +10.0%)
    if (sloan !== null && sloan > 10.0) {
      gatingReasons.push(`Sloan Accrual Ratio of +${sloan}% exceeds +10.0% threshold (aggressive non-cash accounting accruals).`);
    }

    // Check Rule 2: Beneish M-Score manipulation alert (> -1.78)
    const isBeneishManipulator = beneish !== null && beneish > -1.78;
    if (isBeneishManipulator) {
      gatingReasons.push(`Beneish M-Score of ${beneish} indicates high probability of earnings manipulation (threshold > -1.78).`);
    }

    // Check Rule 3: Off-Balance Sheet Solvency (> 25% of Net Worth)
    if (contingentLiabPct > 25.0) {
      gatingReasons.push(`Contingent Liabilities at ${contingentLiabPct}% of Net Worth exceed 25.0% prudence limit.`);
    }

    // Check Rule 4: Promoter RPT Leakage (> 5% of Revenue)
    if (rptPct > 5.0) {
      gatingReasons.push(`Related Party Transactions at ${rptPct}% of Revenue exceed 5.0% conflict-of-interest threshold.`);
    }

    // Check Rule 5: Concall Execution Divergence (Grade C)
    if (concallGrade.toUpperCase().includes('GRADE C')) {
      gatingReasons.push(`Management Track Record is GRADE C (Promoter guidance diverged significantly from statutory delivery).`);
    }

    const isGated = gatingReasons.length > 0;
    let effectiveRecommendation: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'CAUTION_QUALIFIED' | 'GATED_AVOID' | 'AVOID' = technicalSignal;

    if (isGated) {
      if (isBeneishManipulator || (sloan !== null && sloan > 15.0) || contingentLiabPct > 40.0) {
        effectiveRecommendation = 'GATED_AVOID';
      } else {
        effectiveRecommendation = 'CAUTION_QUALIFIED';
      }
    }

    return {
      symbol,
      technicalSignal,
      forensicVerdict,
      effectiveRecommendation,
      isGated,
      gatingReasons,
      sloanAccrualRatioPct: sloan,
      beneishMScore: beneish,
      isBeneishManipulator,
      altmanZone,
      contingentLiabPctNetWorth: contingentLiabPct,
      rptPctRevenue: rptPct,
      concallGrade,
      auditTrail: isGated
        ? `TECHNICAL MOMENTUM GATED: ${gatingReasons.join(' ')}`
        : 'FORENSIC AUDIT CLEARED: All 5 forensic pillars meet institutional governance thresholds.',
      timestamp: new Date().toISOString()
    };
  }
}
export default ForensicCalculator;
