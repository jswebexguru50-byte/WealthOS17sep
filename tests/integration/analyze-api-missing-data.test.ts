import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server';

// Mock the dependent services to return empty/missing data
vi.mock('../../src/server/services/screenerService', () => {
  return {
    ScreenerService: {
      getInstance: vi.fn().mockReturnValue({
        fetchScreenerData: vi.fn().mockResolvedValue(null),
        scrapeScreenerRatios: vi.fn().mockResolvedValue(null)
      })
    }
  };
});

vi.mock('../../src/server/services/TrendlyneIntelligenceService', () => {
  return {
    TrendlyneIntelligenceService: {
      getInstance: vi.fn().mockReturnValue({
        getScripIntelligence: vi.fn().mockResolvedValue(null)
      })
    }
  };
});

vi.mock('../../src/server/services/MarketDataIngestorService', () => {
  return {
    MarketDataIngestorService: {
      getInstance: vi.fn().mockReturnValue({
        getMarketData: vi.fn().mockResolvedValue(null)
      })
    }
  };
});

describe('Analyze API - Missing Data Propagation (Phase 0 Contract)', () => {
  it('should not inject synthetic fallbacks for missing critical data and should return BLOCKED', async () => {
    // Make a request to the actual HTTP route that produces the dashboard output
    const res = await request(app).get('/api/scrip-intelligence/MISSINGDATA');
    
    // Assert response status code is 200 (graceful fail closed) or 500
    // Based on the user's requirement, it should gracefully return dataState = BLOCKED
    expect(res.body.success).toBe(true);
    
    // Assert the fail-closed states
    const data = res.body.data;
    expect(data.dataState).toBe('BLOCKED');
    expect(data.actionSignal.action).toBeNull();
    expect(data.actionSignal.compositeScore).toBeNull();
    expect(data.actionSignal.reason).toBe('Critical evidence is unavailable; no investment decision was computed.');
  });
});
