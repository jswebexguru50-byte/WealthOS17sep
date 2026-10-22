import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Analyze360Service } from '../../src/server/services/Analyze360Service.js';
import * as db from '../../src/server/database.js';
import * as fere from '../../src/server/services/FereEvidenceService.js';
import { SevenStrategiesCandidateEnrichmentService } from '../../src/server/services/SevenStrategiesCandidateEnrichmentService.js';

vi.mock('../../src/server/database.js', () => ({
  getDB: vi.fn(),
  dbGet: vi.fn(),
  dbAll: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/server/services/FereEvidenceService.js', () => ({
  readFereEvidence: vi.fn(),
}));

describe('Analyze360Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('correctly sets 3Y growth to null and maps 5Y growth correctly', async () => {
    const mockDbGet = db.dbGet as any;
    mockDbGet.mockResolvedValue({
      isin: 'INE123456789',
      company_name: 'Test Corp',
      sector: 'Technology',
      sales_growth_5y_pct: 15.5,
      profit_growth_5y_pct: 20.0,
      audited_at: '2023-12-31T00:00:00.000Z',
      as_of_quarter: 'Q4',
      as_of_year: '2023'
    });

    const mockFere = fere.readFereEvidence as any;
    mockFere.mockResolvedValue({
      status: 'AVAILABLE',
      verifiedFactCount: 0,
      verifiedMetricCount: 0,
      documents: [],
      missingFields: []
    });

    const mockEnrichment = vi.spyOn(SevenStrategiesCandidateEnrichmentService.getInstance(), 'bulkEnrich');
    mockEnrichment.mockResolvedValue(new Map([
      ['TEST', {
        symbol: 'TEST',
        latestClose: 100,
        latestOhlcvDate: '2023-12-31',
        technicalFreshnessStatus: 'VALID',
        ohlcvStatus: 'AVAILABLE',
        canBacktest: true,
        canPaperTrade: true,
        canCreateAlert: true,
        fundamentalEvidenceState: 'SUPPORTIVE'
      }] as any
    ]));

    const service = Analyze360Service.getInstance();
    const result = await service.getAnalyze360View('TEST', 'cand-123', ['sig-456'], '2026-10-01', ['S1a']);

    expect(result.candidateId).toBe('cand-123');
    expect(result.signalIds).toEqual(['sig-456']);
    
    // 3Y growth should be null/missing
    expect(result.fundamental.revenueGrowth.value).toBeNull();
    expect(result.fundamental.revenueGrowth.missingReason).toBe('NO_TRUE_3Y_CAGR_AVAILABLE');

    // 5Y growth should be explicitly available
    expect(result.fundamental.revenueGrowth.fiveYearCagr.value).toBe(15.5);
    expect(result.fundamental.revenueGrowth.fiveYearCagr.status).toBe('AVAILABLE');
    expect(result.fundamental.revenueGrowth.fiveYearCagr.periodEnd).toBe('Q4 2023');

    // Missing fields should have null for keys, not omitted
    expect(result.fundamental.revenueGrowth.value).toBeNull();
    expect(result.fundamental.revenueGrowth.sourceFactId).toBeNull();
    expect(result.fundamental.revenueGrowth.fetchedAt).toBeNull();
    expect(result.fundamental.revenueGrowth.note).toBeNull();

    // Summary Text
    expect(result.summarySnapshot.summaryText).toBeDefined();
    expect(typeof result.summarySnapshot.summaryText).toBe('string');
    const wordCount = result.summarySnapshot.summaryText.split(' ').length;
    // Enforce length roughly between 50 and 125 words for UI readability
    expect(wordCount).toBeGreaterThanOrEqual(50);
    expect(wordCount).toBeLessThanOrEqual(125);

    // No buy/sell/target language
    const lowerSummary = result.summarySnapshot.summaryText.toLowerCase();
    expect(lowerSummary).not.toContain('buy');
    expect(lowerSummary).not.toContain('sell');
    expect(lowerSummary).not.toContain('target');
    expect(lowerSummary).not.toContain('probability');

    // Missing Data Checklist
    expect(Array.isArray(result.missingDataChecklist)).toBe(true);
    const hasQglpMissing = result.missingDataChecklist.some(m => m.group === 'QGLP');
    const hasFundamentalMissing = result.missingDataChecklist.some(m => m.group === 'fundamentals');
    expect(hasQglpMissing).toBe(true);
    expect(hasFundamentalMissing).toBe(true);

    // FERE labels
    expect(result.fere.topEvidenceLabels).toEqual([]);
    expect(result.fere.evidenceLabelStatus).toBe('NO_FERE_LABELS_AVAILABLE');
  });
});
