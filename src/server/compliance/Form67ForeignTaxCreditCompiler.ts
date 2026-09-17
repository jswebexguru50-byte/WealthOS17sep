/**
 * Form67ForeignTaxCreditCompiler.ts — v5.3.1
 * Target: NRI WealthOS Compliance & Statutory Tax Module
 * 
 * Statutory Framework:
 * - Section 90 / 90A / 91 of the Indian Income Tax Act, 1961
 * - Rule 128 of the Income Tax Rules, 1962 (Statement in Form 67)
 * - Rule 115: Conversion using State Bank of India (SBI) TT Buying Rate on specified dates
 * - Article 25 (Relief from Double Taxation) of the Indo-US DTAA
 */

import { roundINR } from '../../lib/decimalUtils.js';

export interface ForeignIncomeEntry {
  countryCode: string;          // e.g. 'USA', 'UAE', 'GBR', 'SGP'
  dtaaArticle: string;          // e.g. 'Article 10 (Dividends)', 'Article 13 (Capital Gains)'
  incomeCategory: 'CAPITAL_GAINS' | 'DIVIDENDS' | 'INTEREST' | 'OTHER';
  grossForeignCurrencyAmount: number;
  foreignTaxPaidFC: number;
  sbiTtBuyingRate: number;      // Rule 115 telegraphic transfer rate
  assessmentYear: string;       // e.g. '2026-27'
}

export interface Form67ScheduleEntry {
  countryName: string;
  countryCode: string;
  sourceOfIncome: string;
  incomeOutsideIndiaINR: number;
  taxPaidOutsideIndiaINR: number;
  taxPayableInIndiaINR: number;
  eligibleCreditSection90INR: number;
  isTreatyReliefApplicable: boolean;
  notes: string;
}

export interface Form67Report {
  pan: string;
  assessmentYear: string;
  entries: Form67ScheduleEntry[];
  totalForeignIncomeINR: number;
  totalForeignTaxPaidINR: number;
  totalAllowableFTCINR: number;
  filingDeadline: string;       // End of assessment year under amended Rule 128
}

export class Form67ForeignTaxCreditCompiler {
  /**
   * Compiles Form 67 Foreign Tax Credit Schedule with Rule 115 SBI TT Conversion
   */
  public static compileFTCSchedule(
    pan: string,
    assessmentYear: string,
    foreignIncomes: ForeignIncomeEntry[],
    applicableIndianTaxRatePct: number // e.g. 20.0 for LTCG or 12.5% post-Finance Act 2024
  ): Form67Report {
    const entries: Form67ScheduleEntry[] = [];
    let totalForeignIncomeINR = 0;
    let totalForeignTaxPaidINR = 0;
    let totalAllowableFTCINR = 0;

    for (const item of foreignIncomes) {
      // 1. Convert Foreign Amounts to INR via Rule 115 TT Buying Rate
      const incomeINR = roundINR(item.grossForeignCurrencyAmount * item.sbiTtBuyingRate);
      const taxPaidINR = roundINR(item.foreignTaxPaidFC * item.sbiTtBuyingRate);

      // 2. Compute Indian Tax Payable on the Foreign Sourced Income
      const indianTaxPayableINR = roundINR(incomeINR * (applicableIndianTaxRatePct / 100));

      // 3. Foreign Tax Credit Rule 128 Limitation:
      // FTC is strictly capped at the LOWER of (Foreign Tax Paid) or (Indian Tax Payable)
      const isTreatyApplicable = item.countryCode !== 'OTHER';
      const allowableCreditINR = Math.min(taxPaidINR, indianTaxPayableINR);

      const countryNameMap: Record<string, string> = {
        'USA': 'United States of America',
        'UAE': 'United Arab Emirates',
        'GBR': 'United Kingdom',
        'SGP': 'Singapore',
        'CAN': 'Canada'
      };

      entries.push({
        countryName: countryNameMap[item.countryCode] || item.countryCode,
        countryCode: item.countryCode,
        sourceOfIncome: item.incomeCategory,
        incomeOutsideIndiaINR: incomeINR,
        taxPaidOutsideIndiaINR: taxPaidINR,
        taxPayableInIndiaINR: indianTaxPayableINR,
        eligibleCreditSection90INR: allowableCreditINR,
        isTreatyReliefApplicable: isTreatyApplicable,
        notes: item.countryCode === 'UAE'
          ? 'UAE has zero domestic tax on capital gains; TRC required for DTAA Article 13 relief.'
          : `Credit claimed under ${item.dtaaArticle}. Capped at Indian tax liability.`
      });

      totalForeignIncomeINR += incomeINR;
      totalForeignTaxPaidINR += taxPaidINR;
      totalAllowableFTCINR += allowableCreditINR;
    }

    return {
      pan,
      assessmentYear,
      entries,
      totalForeignIncomeINR: roundINR(totalForeignIncomeINR),
      totalForeignTaxPaidINR: roundINR(totalForeignTaxPaidINR),
      totalAllowableFTCINR: roundINR(totalAllowableFTCINR),
      filingDeadline: `December 31 of Assessment Year ${assessmentYear}`
    };
  }
}
