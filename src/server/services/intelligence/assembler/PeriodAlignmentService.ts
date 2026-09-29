/**
 * PeriodAlignmentService.ts — P0.1 Integrity Fix
 *
 * Accurately aligns financial and operating metric periods across historical series.
 * Eliminates naive array index assumptions (e.g. items[2] !== year ago).
 *
 * Constitution invariants:
 * - C8: Strict Point-In-Time (PIT) boundary enforcement
 * - C5: Explicit period alignment — YoY must compare matching period types
 */

import { FundamentalMetricItem } from '../types/FundamentalPayload.js';
import { CanonicalFact } from './CanonicalFactService.js';

export interface AlignedPeriodMetrics {
  latestAnnual: FundamentalMetricItem | null;
  priorAnnual: FundamentalMetricItem | null;
  latestQuarter: FundamentalMetricItem | null;
  priorQuarter: FundamentalMetricItem | null;
  yearAgoQuarter: FundamentalMetricItem | null;
  yearAgoComparable: FundamentalMetricItem | null;
}

export class PeriodAlignmentService {
  private static instance: PeriodAlignmentService;

  public static getInstance(): PeriodAlignmentService {
    if (!PeriodAlignmentService.instance) {
      PeriodAlignmentService.instance = new PeriodAlignmentService();
    }
    return PeriodAlignmentService.instance;
  }

  /**
   * Parse a period string to an approximate sortable ISO date or fiscal representation.
   * Handles: "FY2024", "FY24", "2024-03-31", "Q3FY25", "Q3 FY2025", "2024-12-31"
   */
  public parsePeriod(periodStr: string): {
    periodType: 'ANNUAL' | 'QUARTERLY' | 'UNKNOWN';
    fiscalYear: number | null;
    quarter: number | null;
    estimatedEndDate: string;
  } {
    const raw = (periodStr || '').trim().toUpperCase();

    // 1. Quarterly pattern: e.g. "Q3FY25", "Q1 FY2024", "Q4-24"
    const qMatch = raw.match(/Q([1-4])\s*[-/]?\s*FY?(\d{2,4})/);
    if (qMatch) {
      const q = parseInt(qMatch[1], 10);
      let yr = parseInt(qMatch[2], 10);
      if (yr < 100) yr += 2000;
      // In Indian fiscal year (Apr-Mar):
      // Q1 = Apr-Jun (ends Jun 30 of yr-1)
      // Q2 = Jul-Sep (ends Sep 30 of yr-1)
      // Q3 = Oct-Dec (ends Dec 31 of yr-1)
      // Q4 = Jan-Mar (ends Mar 31 of yr)
      let endMonth = '03-31';
      let endYr = yr;
      if (q === 1) { endYr = yr - 1; endMonth = '06-30'; }
      else if (q === 2) { endYr = yr - 1; endMonth = '09-30'; }
      else if (q === 3) { endYr = yr - 1; endMonth = '12-31'; }
      else if (q === 4) { endYr = yr; endMonth = '03-31'; }

      return {
        periodType: 'QUARTERLY',
        fiscalYear: yr,
        quarter: q,
        estimatedEndDate: `${endYr}-${endMonth}`,
      };
    }

    // 2. Annual FY pattern: e.g. "FY2024", "FY24", "FY 2024"
    const fyMatch = raw.match(/^FY\s*(\d{2,4})$/);
    if (fyMatch) {
      let yr = parseInt(fyMatch[1], 10);
      if (yr < 100) yr += 2000;
      return {
        periodType: 'ANNUAL',
        fiscalYear: yr,
        quarter: null,
        estimatedEndDate: `${yr}-03-31`,
      };
    }

    // 3. ISO Date pattern: "YYYY-MM-DD"
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const yr = parseInt(isoMatch[1], 10);
      const mo = parseInt(isoMatch[2], 10);
      // If month is March (03), usually represents Annual if from annual tables, or Q4
      const isAnnual = mo === 3 && raw.length === 10;
      return {
        periodType: isAnnual ? 'ANNUAL' : 'QUARTERLY',
        fiscalYear: mo <= 3 ? yr : yr + 1,
        quarter: mo <= 3 ? 4 : mo <= 6 ? 1 : mo <= 9 ? 2 : 3,
        estimatedEndDate: raw.substring(0, 10),
      };
    }

    // 4. Fallback Year: "2024"
    const yrOnlyMatch = raw.match(/^(\d{4})$/);
    if (yrOnlyMatch) {
      const yr = parseInt(yrOnlyMatch[1], 10);
      return {
        periodType: 'ANNUAL',
        fiscalYear: yr,
        quarter: null,
        estimatedEndDate: `${yr}-03-31`,
      };
    }

    return {
      periodType: 'UNKNOWN',
      fiscalYear: null,
      quarter: null,
      estimatedEndDate: '1970-01-01',
    };
  }

  /**
   * Sorts and aligns items in a metric series with strict PIT boundary.
   */
  public alignSeries(
    items: FundamentalMetricItem[],
    asOfDate?: string | null
  ): AlignedPeriodMetrics {
    if (!items || items.length === 0) {
      return {
        latestAnnual: null,
        priorAnnual: null,
        latestQuarter: null,
        priorQuarter: null,
        yearAgoQuarter: null,
        yearAgoComparable: null,
      };
    }

    // Filter by PIT if asOfDate provided
    const filtered = items.filter(item => {
      if (!asOfDate) return true;
      // Check provenance / availability date
      const availDate = item.provenance?.[0]?.asOfDate || item.provenance?.[0]?.timestamp;
      // A reporting period is not proof of when the information became
      // available.  Historical/PIT requests therefore require source
      // availability metadata; current analysis can still use the fact.
      if (!availDate) {
        return false;
      }
      if (availDate.substring(0, 10) > asOfDate.substring(0, 10)) {
        return false;
      }
      return true;
    });

    // Parse and categorize all items
    const parsedItems = filtered.map(item => ({
      item,
      parsed: this.parsePeriod(item.period),
    }));

    // Separate annual and quarterly series
    const annualItems = parsedItems
      .filter(p => p.parsed.periodType === 'ANNUAL')
      .sort((a, b) => b.parsed.estimatedEndDate.localeCompare(a.parsed.estimatedEndDate));

    const quarterlyItems = parsedItems
      .filter(p => p.parsed.periodType === 'QUARTERLY')
      .sort((a, b) => b.parsed.estimatedEndDate.localeCompare(a.parsed.estimatedEndDate));

    // Resolve annual alignment
    let latestAnnual: FundamentalMetricItem | null = null;
    let priorAnnual: FundamentalMetricItem | null = null;

    if (annualItems.length > 0) {
      latestAnnual = annualItems[0].item;
      // Do not assume that the next stored annual value is comparable.  A
      // missing financial year must leave the comparison unavailable rather
      // than turning (for example) FY24 versus FY22 into a YoY result.
      const targetFiscalYear = (annualItems[0].parsed.fiscalYear ?? 0) - 1;
      priorAnnual = annualItems.find(item => item.parsed.fiscalYear === targetFiscalYear)?.item ?? null;
    }

    // Resolve quarterly alignment
    let latestQuarter: FundamentalMetricItem | null = null;
    let priorQuarter: FundamentalMetricItem | null = null;
    let yearAgoQuarter: FundamentalMetricItem | null = null;

    if (quarterlyItems.length > 0) {
      latestQuarter = quarterlyItems[0].item;
      if (quarterlyItems.length > 1) {
        priorQuarter = quarterlyItems[1].item;
      }
      // Year-ago quarter is matching quarter 1 fiscal year prior (usually index 4 if sequential quarters)
      const targetQuarter = quarterlyItems[0].parsed.quarter;
      const targetYear = (quarterlyItems[0].parsed.fiscalYear || 2024) - 1;

      const matchedYoY = quarterlyItems.find(
        q => q.parsed.quarter === targetQuarter && q.parsed.fiscalYear === targetYear
      );
      if (matchedYoY) {
        yearAgoQuarter = matchedYoY.item;
      }
    }

    // If only one general series exists (e.g., standard annual data table)
    if (!latestAnnual && annualItems.length === 0 && quarterlyItems.length === 0 && parsedItems.length > 0) {
      // Treat fallback items as sequential annual
      parsedItems.sort((a, b) => b.parsed.estimatedEndDate.localeCompare(a.parsed.estimatedEndDate));
      latestAnnual = parsedItems[0].item;
      if (parsedItems.length > 1) {
        priorAnnual = parsedItems[1].item;
      }
    }

    // yearAgoComparable: For annual series, it is priorAnnual (1 yr ago).
    // For quarterly series, it is yearAgoQuarter (same quarter 1 yr ago).
    const yearAgoComparable = yearAgoQuarter || priorAnnual;

    return {
      latestAnnual,
      priorAnnual,
      latestQuarter,
      priorQuarter,
      yearAgoQuarter,
      yearAgoComparable,
    };
  }
}
