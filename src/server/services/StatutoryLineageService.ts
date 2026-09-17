/**
 * src/server/services/StatutoryLineageService.ts
 * Audited Statutory Financial Statement Lineage Service
 * 
 * Provides an inspectable, audited pipeline from Balance Sheet, Income Statement,
 * and Cash Flow filings into Sloan, Beneish, and Altman deterministic ratios.
 */

import { ForensicCacheService } from './ForensicCacheService.js';
import { ForensicCalculator } from '../quant/forensicCalculator.js';

export interface StatutoryFilingInfo {
  fiscalYear: string;
  statutoryAuditor: string;
  auditorTenureYears: number;
  auditorOpinion: string;
  bseXbrlFilingDate: string;
  statutoryFilingUrl: string;
  annualReportUrl: string;
}

export interface IncomeStatementItems {
  revenue_FY26: number;
  revenue_FY25: number;
  cogs_FY26: number;
  cogs_FY25: number;
  ebit_FY26: number;
  ebit_FY25: number;
  sgna_FY26: number;
  sgna_FY25: number;
  depreciation_FY26: number;
  depreciation_FY25: number;
  netIncome_FY26: number;
  netIncome_FY25: number;
}

export interface BalanceSheetItems {
  receivables_FY26: number;
  receivables_FY25: number;
  currentAssets_FY26: number;
  currentAssets_FY25: number;
  ppe_FY26: number;
  ppe_FY25: number;
  securitiesAndCash_FY26: number;
  securitiesAndCash_FY25: number;
  totalAssets_FY26: number;
  totalAssets_FY25: number;
  currentLiabilities_FY26: number;
  currentLiabilities_FY25: number;
  workingCapital_FY26: number;
  workingCapital_FY25: number;
  longTermDebt_FY26: number;
  longTermDebt_FY25: number;
  totalLiabilities_FY26: number;
  totalLiabilities_FY25: number;
  retainedEarnings_FY26: number;
  retainedEarnings_FY25: number;
  totalEquity_FY26: number;
  totalEquity_FY25: number;
}

export interface CashFlowItems {
  cfo_FY26: number;
  cfi_FY26: number;
  actualAccruals_FY26: number;
}

export interface StatutoryLineageRecord {
  symbol: string;
  companyName: string;
  sector: string;
  filingSource: StatutoryFilingInfo;
  rawFinancialStatements: {
    incomeStatementCr: IncomeStatementItems;
    balanceSheetCr: BalanceSheetItems;
    cashFlowCr: CashFlowItems;
  };
  stepByStepLineage: {
    sloanAccrual: {
      formula: string;
      numeratorCr: number;
      denominatorCr: number;
      sloanRatioPct: number;
      threshold: number;
      verdict: string;
      explanation: string;
    };
    beneishVariables: {
      formula: string;
      ratios: {
        dsri: number;
        gmi: number;
        aqi: number;
        sgi: number;
        depi: number;
        sgai: number;
        tata: number;
        lvgi: number;
      };
      score: number;
      threshold: number;
      isManipulatorLikely: boolean;
      explanation: string;
    };
    altmanZ: {
      formula: string;
      components: {
        x1_workingCapital_TotalAssets: number;
        x2_retainedEarnings_TotalAssets: number;
        x3_ebit_TotalAssets: number;
        x4_mcap_TotalLiabilities: number;
        x5_sales_TotalAssets: number;
      };
      zScore: number;
      zone: string;
      isComputable: boolean;
      explanation: string;
    };
  };
}

export class StatutoryLineageService {
  /**
   * Retrieves statutory lineage audit record for a given symbol.
   */
  public static getLineage(symbol: string): StatutoryLineageRecord | null {
    return ForensicCacheService.getStatutoryLineage(symbol);
  }

  /**
   * Retrieves all available statutory lineages.
   */
  public static getAllLineages(): Record<string, StatutoryLineageRecord> {
    return ForensicCacheService.getAllStatutoryLineages();
  }

  /**
   * Computes ratios on demand from raw user-supplied or updated financial line items.
   */
  public static computeOnDemand(
    income: IncomeStatementItems,
    balance: BalanceSheetItems,
    cashFlow: CashFlowItems,
    marketCapCr: number
  ) {
    const dsri = (balance.receivables_FY26 / income.revenue_FY26) / (balance.receivables_FY25 / income.revenue_FY25);
    const gmi = ((income.revenue_FY25 - income.cogs_FY25) / income.revenue_FY25) /
                ((income.revenue_FY26 - income.cogs_FY26) / income.revenue_FY26);
    const aqi = (1 - (balance.currentAssets_FY26 + balance.ppe_FY26 + balance.securitiesAndCash_FY26) / balance.totalAssets_FY26) /
                Math.max(0.001, (1 - (balance.currentAssets_FY25 + balance.ppe_FY25 + balance.securitiesAndCash_FY25) / balance.totalAssets_FY25));
    const sgi = income.revenue_FY26 / income.revenue_FY25;
    const depi = (income.depreciation_FY25 / (balance.ppe_FY25 + income.depreciation_FY25)) /
                 (income.depreciation_FY26 / (balance.ppe_FY26 + income.depreciation_FY26));
    const sgai = (income.sgna_FY26 / income.revenue_FY26) / (income.sgna_FY25 / income.revenue_FY25);
    const tata = (income.netIncome_FY26 - cashFlow.cfo_FY26) / balance.totalAssets_FY26;
    const lvgi = (balance.longTermDebt_FY26 / balance.totalAssets_FY26) / (balance.longTermDebt_FY25 / balance.totalAssets_FY25);

    const beneish = ForensicCalculator.computeBeneishMScore({
      dsri: Math.round(dsri * 10000) / 10000,
      gmi: Math.round(gmi * 10000) / 10000,
      aqi: Math.round(aqi * 10000) / 10000,
      sgi: Math.round(sgi * 10000) / 10000,
      depi: Math.round(depi * 10000) / 10000,
      sgai: Math.round(sgai * 10000) / 10000,
      tata: Math.round(tata * 10000) / 10000,
      lvgi: Math.round(lvgi * 10000) / 10000
    });

    const sloan = ForensicCalculator.computeSloanAccrualRatio(
      income.netIncome_FY26,
      cashFlow.cfo_FY26,
      cashFlow.cfi_FY26,
      balance.totalAssets_FY26
    );

    const altman = ForensicCalculator.computeAltmanZScore(
      balance.workingCapital_FY26,
      balance.retainedEarnings_FY26,
      income.ebit_FY26,
      marketCapCr,
      balance.totalLiabilities_FY26,
      income.revenue_FY26,
      balance.totalAssets_FY26
    );

    return {
      beneish,
      sloan,
      altman
    };
  }
}
export default StatutoryLineageService;
