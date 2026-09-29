/**
 * read_refresh_pit_adversarial.test.ts — Agent D Workstream Deliverable
 *
 * Requirements:
 * 1. PIT Test: Construct fact with periodEnd=FY2025, availableAt=2025-05-15.
 *    - asOfDate=2025-04-30: Fact MUST be excluded.
 *    - asOfDate=2025-05-16: Fact MAY be included.
 * 2. Period Alignment:
 *    - FY2025 -> FY2024
 *    - Q2 FY2026 -> Q1 FY2026
 *    - Q2 FY2026 -> Q2 FY2025 (YoY comparable)
 * 3. Exact non-contiguous alignment check:
 *    - Missing FY2024 leaves priorAnnual as null (does not naively pick FY2023)
 */

import { describe, it, expect } from 'vitest';
import { PeriodAlignmentService } from '../../src/server/services/intelligence/assembler/PeriodAlignmentService.js';
import { FundamentalMetricItem } from '../../src/server/services/intelligence/types/FundamentalPayload.js';

describe('Agent D: Read/Refresh + PIT Adversarial Validation', () => {
  const alignmentService = PeriodAlignmentService.getInstance();

  it('PIT Test: excludes facts where availableAt > asOfDate even if periodEnd <= asOfDate', () => {
    const rawFacts: FundamentalMetricItem[] = [
      {
        period: 'FY2025',
        value: 10000,
        unit: 'INR_CR',
        provenance: [
          {
            sourceType: 'FILING',
            provider: 'ANNUAL_REPORT_XBRL',
            asOfDate: '2025-05-15',
            timestamp: '2025-05-15T00:00:00Z',
          }
        ]
      }
    ];

    // Case 1: asOfDate is April 30, 2025 (BEFORE filing available date)
    const pitCutoffBefore = '2025-04-30';
    const seriesBefore = alignmentService.alignSeries(rawFacts, pitCutoffBefore);
    expect(seriesBefore.latestAnnual).toBeNull();

    // Case 2: asOfDate is May 16, 2025 (AFTER filing available date)
    const pitCutoffAfter = '2025-05-16';
    const seriesAfter = alignmentService.alignSeries(rawFacts, pitCutoffAfter);
    expect(seriesAfter.latestAnnual).not.toBeNull();
    expect(seriesAfter.latestAnnual?.value).toBe(10000);
  });

  it('Period Alignment: accurately aligns FY2025 -> FY2024 and avoids array-position assumptions', () => {
    const rawFacts: FundamentalMetricItem[] = [
      {
        period: 'FY2023',
        value: 1200,
        unit: 'INR_CR',
        provenance: [
          {
            sourceType: 'FILING',
            provider: 'ANNUAL_REPORT_XBRL',
            asOfDate: '2023-05-15',
          }
        ]
      },
      {
        period: 'FY2025',
        value: 2000,
        unit: 'INR_CR',
        provenance: [
          {
            sourceType: 'FILING',
            provider: 'ANNUAL_REPORT_XBRL',
            asOfDate: '2025-05-15',
          }
        ]
      }
      // Note: FY2024 is intentionally missing!
    ];

    const aligned = alignmentService.alignSeries(rawFacts, '2025-06-01');
    expect(aligned.latestAnnual?.period).toBe('FY2025');
    
    // FY2024 is missing — PeriodAlignmentService must NOT naively pick FY2023 as priorAnnual
    expect(aligned.priorAnnual).toBeNull();
    expect(aligned.yearAgoComparable).toBeNull();
  });

  it('Period Alignment: accurately aligns Q2 FY2026 -> Q1 FY2026 and Q2 FY2026 -> Q2 FY2025 (YoY comparable)', () => {
    const rawFacts: FundamentalMetricItem[] = [
      {
        period: 'Q2 FY2025',
        value: 500,
        unit: 'INR_CR',
        provenance: [
          {
            sourceType: 'FILING',
            provider: 'FINANCIAL_RESULTS_XBRL',
            asOfDate: '2024-10-20',
          }
        ]
      },
      {
        period: 'Q1 FY2026',
        value: 600,
        unit: 'INR_CR',
        provenance: [
          {
            sourceType: 'FILING',
            provider: 'FINANCIAL_RESULTS_XBRL',
            asOfDate: '2025-07-20',
          }
        ]
      },
      {
        period: 'Q2 FY2026',
        value: 650,
        unit: 'INR_CR',
        provenance: [
          {
            sourceType: 'FILING',
            provider: 'FINANCIAL_RESULTS_XBRL',
            asOfDate: '2025-10-20',
          }
        ]
      }
    ];

    const aligned = alignmentService.alignSeries(rawFacts, '2025-11-01');
    expect(aligned.latestQuarter?.period).toBe('Q2 FY2026');
    expect(aligned.priorQuarter?.period).toBe('Q1 FY2026');
    expect(aligned.yearAgoQuarter?.period).toBe('Q2 FY2025');

    // Growth assertions
    expect(aligned.latestQuarter?.value).toBe(650);
    expect(aligned.priorQuarter?.value).toBe(600);
    expect(aligned.yearAgoQuarter?.value).toBe(500);
  });
});
