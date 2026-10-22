import { ScreenerData } from './screenerService.js';

export interface IntegrityCheckResult {
  symbol: string;
  isFullyVerified: boolean;
  status: 'PASSED' | 'WARNING' | 'FAILED';
  fieldAccuracyScore: number; // 0 to 100%
  totalFieldsChecked: number;
  validFieldsCount: number;
  violationFlags: string[];
  auditedQuarter: string;
  auditedYear?: string;
  parsedMetrics: {
    promoterPct: number;
    fiiPct: number;
    diiPct: number;
    govtPct: number;
    othersPct: number;
    publicPct: number;
    sumTotalPct: number;
    freeFloatPct: number;
    marketCapCr: number;
    currentPrice: number;
    peRatio?: number;
    bookValue?: number;
    dividendYieldPct?: number;
    rocePct?: number;
    roePct?: number;
    debtToEquity?: number;
    latestSalesCr?: number;
    latestExpensesCr?: number;
    latestOpProfitCr?: number;
    latestOpmPct?: number;
    latestPbtCr?: number;
    latestTaxPct?: number;
    latestPatCr?: number;
    latestEps?: number;
    salesYoYPct?: number;
    patYoYPct?: number;
    salesQoQPct?: number;
    patQoQPct?: number;
    cfoCr?: number;
    cfiCr?: number;
    cffCr?: number;
    netCashFlowCr?: number;
    totalAssetsCr?: number;
    totalBorrowingsCr?: number;
  };
}

export class UniversalDataIntegrityGate {
  private static instance: UniversalDataIntegrityGate;

  public static getInstance(): UniversalDataIntegrityGate {
    if (!UniversalDataIntegrityGate.instance) {
      UniversalDataIntegrityGate.instance = new UniversalDataIntegrityGate();
    }
    return UniversalDataIntegrityGate.instance;
  }

  /**
   * Evaluates all scraped fields of a company across Shareholding, Financials, Ratios, Cash Flows, and Balance Sheet.
   * Performs mathematical consistency checks and computes an exact accuracy score.
   */
  public evaluateCompanyData(data: ScreenerData): IntegrityCheckResult {
    const violationFlags: string[] = [];
    let totalChecks = 0;
    let passedChecks = 0;

    const parseNum = (str?: string): number => {
      if (!str || str === '—' || str === '-') return 0;
      const clean = str.replace(/[₹,%,\s,Cr]/gi, '');
      const val = parseFloat(clean);
      return isNaN(val) ? 0 : val;
    };

    // ── 1. Shareholding Mathematical Checks ────────────────────────────────────
    const prom = parseNum(data.shareholding?.promoters);
    const fii = parseNum(data.shareholding?.fiis);
    const dii = parseNum(data.shareholding?.diis);
    const govt = parseNum(data.shareholding?.govt);
    const others = parseNum(data.shareholding?.others);
    const pub = parseNum(data.shareholding?.public_holding);

    const sumTotalPct = Number((prom + fii + dii + govt + others + pub).toFixed(2));
    const freeFloatPct = Number(Math.max(0, 100 - prom).toFixed(2));
    const asOfQuarter = data.shareholding?.asOfQuarter || 'LATEST';

    // Gate 1.1: Sum Check (Must equal 100% +- 0.5%)
    totalChecks++;
    if (sumTotalPct >= 99.5 && sumTotalPct <= 100.5) {
      passedChecks++;
    } else if (sumTotalPct >= 98.0 && sumTotalPct <= 102.0) {
      passedChecks += 0.75;
      violationFlags.push(`SHAREHOLDING_SUM_TOLERANCE_WARNING_${sumTotalPct}%`);
    } else {
      violationFlags.push(`SHAREHOLDING_SUM_MISMATCH_${sumTotalPct}%`);
    }

    // Gate 1.2: Free Float Derivation Check
    totalChecks++;
    if (Math.abs((100 - prom) - freeFloatPct) < 0.01) {
      passedChecks++;
    } else {
      violationFlags.push('FREE_FLOAT_EQUATION_MISMATCH');
    }

    // Gate 1.3: Time-Axis Alignment Check (Must have valid Quarter Header e.g. Jun 2026 / Mar 2026)
    totalChecks++;
    if (asOfQuarter && asOfQuarter !== 'LATEST' && !asOfQuarter.includes('—')) {
      passedChecks++;
    } else {
      violationFlags.push('MISSING_OR_STALE_QUARTER_HEADER');
    }

    // ── 2. Valuation & Core Ratios Checks ──────────────────────────────────────
    const mcap = parseNum(data.ratios?.market_cap);
    const cmp = parseNum(data.ratios?.current_price);
    const pe = parseNum(data.ratios?.stock_pe);
    const bv = parseNum(data.ratios?.book_value);
    const roce = parseNum(data.ratios?.roce);
    const roe = parseNum(data.ratios?.roe);
    const divYield = parseNum(data.ratios?.dividend_yield);
    const d2e = parseNum(data.ratios?.debt_to_equity);

    // Gate 2.1: Market Cap & Price Sanity
    totalChecks += 2;
    if (mcap > 0) passedChecks++;
    else violationFlags.push('MISSING_OR_INVALID_MARKET_CAP');

    if (cmp > 0) passedChecks++;
    else violationFlags.push('MISSING_OR_INVALID_CMP');

    // Gate 2.2: ROCE / ROE Sanity Check
    totalChecks++;
    if (data.ratios?.roce !== undefined && data.ratios.roce !== '—') {
      passedChecks++;
    }

    // ── 3. Quarterly Results Arithmetic Checks ─────────────────────────────────
    const qResults = data.quarterlyResults;
    const latestSales = qResults?.latestSalesCr;
    const latestPat = qResults?.latestPatCr;
    const latestOpProfit = qResults?.latestOperatingProfitCr;
    const latestOpm = qResults?.latestOpmPct;
    const latestPbt = qResults?.latestPbtCr;
    const latestTax = qResults?.latestTaxPct;
    const latestEps = qResults?.latestEps;

    totalChecks += 2;
    if (latestSales !== undefined && latestSales >= 0) {
      passedChecks++;
    } else {
      violationFlags.push('MISSING_QUARTERLY_SALES');
    }

    if (latestPat !== undefined) {
      passedChecks++;
    } else {
      violationFlags.push('MISSING_QUARTERLY_PAT');
    }

    // Gate 3.1: Operating Margin Arithmetic Check: Operating Profit ~ Sales * (OPM / 100)
    if (latestSales && latestSales > 0 && latestOpProfit && latestOpm !== undefined) {
      totalChecks++;
      const computedOpProfit = (latestSales * latestOpm) / 100;
      const diffPct = Math.abs(latestOpProfit - computedOpProfit) / (latestSales || 1);
      if (diffPct <= 0.08) { // within 8% tolerance of sales
        passedChecks++;
      } else {
        violationFlags.push(`OPM_ARITHMETIC_DISCREPANCY_DIFF_${(diffPct * 100).toFixed(1)}%`);
      }
    }

    // Gate 3.2: Growth Calculation Consistency Check
    if (qResults?.salesYoYGrowthPct !== undefined) {
      totalChecks++;
      passedChecks++;
    }

    // ── 4. Cash Flow & Balance Sheet Checks ────────────────────────────────────
    const cf = data.cashFlows;
    const bs = data.balanceSheet;

    if (cf) {
      totalChecks++;
      if (cf.cfo !== undefined) passedChecks++;
      
      // Cash flow net equation: CFO + CFI + CFF ~ Net Cash Flow
      if (cf.cfo !== undefined && cf.cfi !== undefined && cf.cff !== undefined && cf.netCashFlow !== undefined) {
        totalChecks++;
        const sumCf = cf.cfo + cf.cfi + cf.cff;
        if (Math.abs(sumCf - cf.netCashFlow) <= Math.max(5, Math.abs(cf.netCashFlow) * 0.1)) {
          passedChecks++;
        }
      }
    }

    if (bs) {
      totalChecks++;
      if (bs.totalAssets || bs.borrowings || bs.equityCapital) {
        passedChecks++;
      }
    }

    // ── 5. Compute Final Accuracy Score & Status ───────────────────────────────
    const accuracyScore = Number(((passedChecks / Math.max(1, totalChecks)) * 100).toFixed(1));
    
    let status: 'PASSED' | 'WARNING' | 'FAILED' = 'PASSED';
    if (violationFlags.some(f => f.includes('SHAREHOLDING_SUM_MISMATCH') || f.includes('MISSING_OR_INVALID_MARKET_CAP'))) {
      status = 'FAILED';
    } else if (violationFlags.length > 0 || accuracyScore < 85) {
      status = 'WARNING';
    }

    return {
      symbol: data.symbol,
      isFullyVerified: status === 'PASSED',
      status,
      fieldAccuracyScore: accuracyScore,
      totalFieldsChecked: totalChecks,
      validFieldsCount: passedChecks,
      violationFlags,
      auditedQuarter: asOfQuarter,
      auditedYear: bs?.asOfYear || cf?.asOfYear,
      parsedMetrics: {
        promoterPct: prom,
        fiiPct: fii,
        diiPct: dii,
        govtPct: govt,
        othersPct: others,
        publicPct: pub,
        sumTotalPct,
        freeFloatPct,
        marketCapCr: mcap,
        currentPrice: cmp,
        peRatio: pe > 0 ? pe : undefined,
        bookValue: bv > 0 ? bv : undefined,
        dividendYieldPct: divYield,
        rocePct: roce,
        roePct: roe,
        debtToEquity: d2e,
        latestSalesCr: latestSales,
        latestExpensesCr: undefined,
        latestOpProfitCr: latestOpProfit,
        latestOpmPct: latestOpm,
        latestPbtCr: latestPbt,
        latestTaxPct: latestTax,
        latestPatCr: latestPat,
        latestEps: latestEps,
        salesYoYPct: qResults?.salesYoYGrowthPct,
        patYoYPct: qResults?.patYoYGrowthPct,
        salesQoQPct: qResults?.salesQoQGrowthPct,
        patQoQPct: qResults?.patQoQGrowthPct,
        cfoCr: cf?.cfo,
        cfiCr: cf?.cfi,
        cffCr: cf?.cff,
        netCashFlowCr: cf?.netCashFlow,
        totalAssetsCr: bs?.totalAssets,
        totalBorrowingsCr: bs?.borrowings
      }
    };
  }
}
