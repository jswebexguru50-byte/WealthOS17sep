/**
 * BSE Canonical Promotion Service
 * Converts XBRL facts to canonical financial metrics with validation
 */

import { Database } from 'sqlite3';
import type { XBRLFact } from './BseXbrlParserService.js';

export interface CanonicalFact {
  symbol: string;
  isin: string;
  metric_name: string;
  value: number;
  value_inr?: number;
  unit: string;
  currency: string;
  period_end_date: string; // ISO YYYY-MM-DD
  filing_date: string; // ISO YYYY-MM-DD
  fy: string; // YYYY-YYYY
  period_type: 'Q1' | 'Q2' | 'Q3' | 'FY' | 'INSTANT';
  source_filing_id: string;
  source_filing_url: string;
  promotion_quality: 'CERTIFIED' | 'UNVERIFIED' | 'ERROR';
  currency_quality: 'NATIVE' | 'CONVERTED' | 'UNKNOWN';
  xbrl_key?: string; // Original XBRL taxonomy key
  warnings?: string[];
}

// Field mapping from XBRL taxonomy keys to canonical metrics
const XBRL_CANONICAL_MAP: Record<string, string> = {
  'RevenueFromOperations': 'revenue',
  'ProfitLossForPeriod': 'pat',
  'Assets': 'total_assets',
  'Liabilities': 'total_liabilities',
  'Revenue': 'revenue',
  'NetProfit': 'pat',
  'TotalAssets': 'total_assets',
  'TotalLiabilities': 'total_liabilities'
};

// Metrics that should not be negative
const NON_NEGATIVE_METRICS = new Set([
  'revenue', 'total_assets', 'total_equity', 'cash'
]);

/**
 * Determine period type from date
 */
function determinePeriodType(periodEndDate: string, fy: string): 'Q1' | 'Q2' | 'Q3' | 'FY' | 'INSTANT' {
  // Parse month from date
  const month = parseInt(periodEndDate.split('-')[1]);

  if (month === 6) return 'Q1'; // June quarter
  if (month === 9) return 'Q2'; // September quarter
  if (month === 12) return 'Q3'; // December quarter
  if (month === 3) return 'FY'; // March quarter (full year)

  return 'INSTANT';
}

/**
 * Promote XBRL facts to canonical metrics
 * @param db Database instance
 * @param facts Array of XBRL facts
 * @returns Array of promoted canonical facts
 */
export async function promoteXBRLFacts(
  db: Database,
  facts: XBRLFact[]
): Promise<CanonicalFact[]> {
  const promoted: CanonicalFact[] = [];
  const warnings: string[] = [];

  for (const fact of facts) {
    // Skip facts with no value
    if (fact.value === null || fact.value === undefined) {
      warnings.push(`Skipped ${fact.metric_name}: no value`);
      continue;
    }

    // Map XBRL key to canonical metric
    const canonicalMetric = XBRL_CANONICAL_MAP[fact.metric_name] || fact.metric_name;

    // Validate value type
    if (typeof fact.value !== 'number') {
      warnings.push(`Skipped ${fact.metric_name}: non-numeric value`);
      continue;
    }

    // Validate negative values
    if (NON_NEGATIVE_METRICS.has(canonicalMetric) && fact.value < 0) {
      warnings.push(`Rejected ${canonicalMetric}: negative value for non-negative metric`);
      continue;
    }

    // Detect currency
    const currency = fact.unit.includes('USD') ? 'USD' : 'INR';
    let currencyQuality: 'NATIVE' | 'CONVERTED' | 'UNKNOWN' = 'NATIVE';
    let valueInr = fact.value;

    if (currency === 'USD') {
      // In real implementation, would look up historic FX rate
      // For now, mark as UNKNOWN
      currencyQuality = 'UNKNOWN';
      valueInr = undefined;
    }

    const promotedFact: CanonicalFact = {
      symbol: fact.symbol,
      isin: fact.isin,
      metric_name: canonicalMetric,
      value: fact.value,
      value_inr: valueInr,
      unit: currency,
      currency: currency,
      period_end_date: fact.period_end_date,
      filing_date: fact.filing_date,
      fy: fact.fy,
      period_type: determinePeriodType(fact.period_end_date, fact.fy),
      source_filing_id: fact.source_filing_id,
      source_filing_url: fact.source_filing_url,
      promotion_quality: Object.keys(XBRL_CANONICAL_MAP).includes(fact.metric_name) ? 'CERTIFIED' : 'UNVERIFIED',
      currency_quality: currencyQuality,
      xbrl_key: fact.metric_name,
      warnings: []
    };

    // Tag zero values with warnings
    if (fact.value === 0) {
      promotedFact.warnings!.push('zero_value');
      if (canonicalMetric === 'revenue') {
        promotedFact.warnings!.push('unusual_zero_revenue');
      }
    }

    promoted.push(promotedFact);
  }

  return promoted;
}
