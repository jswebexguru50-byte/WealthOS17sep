import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { RecommendationOutcomeAuditor } from '../../services/RecommendationOutcomeAuditor.js';
import { setDbMockHooks } from '../../database.js';
import { CausalPostMortemService } from '../../services/CausalPostMortemService.js';
import { LiveMarketStreamService } from '../../services/LiveMarketStreamService.js';

describe('Unit: RecommendationOutcomeAuditor', () => {
  let auditor: RecommendationOutcomeAuditor;

  beforeEach(() => {
    jest.clearAllMocks();
    auditor = RecommendationOutcomeAuditor.getInstance();
    jest.spyOn(LiveMarketStreamService.getInstance(), 'broadcastAlert').mockImplementation(() => {});
  });

  afterEach(() => {
    setDbMockHooks({});
  });

  // U-ROA-01
  it('U-ROA-01: auditActiveRecommendations with empty ledger returns { audited: 0, updated: 0 } with no DB writes', async () => {
    let dbRunCalled = false;
    setDbMockHooks({
      dbAll: async () => [],
      dbRun: async () => { dbRunCalled = true; return { lastID: 1, changes: 0 }; }
    });

    const result = await auditor.auditActiveRecommendations();

    expect(result).toEqual({ audited: 0, updated: 0 });
    expect(dbRunCalled).toBe(false);
  });

  // U-ROA-02
  it('U-ROA-02: Single ACTIVE LONG recommendation where price >= target_1 updates status to TARGET_1_HIT and stop_loss to entry_price', async () => {
    const mockRec = {
      id: 101,
      symbol: 'INFY',
      action: 'ENTER_LONG_BREAKOUT',
      status: 'ACTIVE',
      entry_price: 1500,
      current_price: 1500,
      target_1: 1550,
      target_2: 1600,
      stop_loss: 1460,
      created_at: new Date().toISOString()
    };

    let capturedRun: { sql: string; params: any[] } | null = null;
    setDbMockHooks({
      dbAll: async () => [mockRec],
      dbGet: async () => ({ close: 1560 }), // price >= target_1
      dbRun: async (sql, params) => {
        capturedRun = { sql, params };
        return { lastID: 101, changes: 1 };
      }
    });

    const result = await auditor.auditActiveRecommendations();

    expect(result).toEqual({ audited: 1, updated: 1 });
    expect(capturedRun).not.toBeNull();
    expect(capturedRun!.params[0]).toBe('TARGET_1_HIT'); // new status
    expect(capturedRun!.params[1]).toBe(1560); // current price
    expect(capturedRun!.params[2]).toBe(1500); // stop_loss adjusted to break-even entry_price
    expect(capturedRun!.params[4]).toBe(101); // rec id
  });

  // U-ROA-03
  it('U-ROA-03: STOP-LOSS breach triggers CausalPostMortemService.conductPostMortem exactly once with correct context', async () => {
    const mockRec = {
      id: 202,
      symbol: 'TCS',
      company_name: 'Tata Consultancy Services Ltd',
      action: 'BUY_MOMENTUM',
      status: 'ACTIVE',
      entry_price: 3800,
      current_price: 3800,
      target_1: 4000,
      target_2: 4200,
      stop_loss: 3700,
      volume_surge_ratio: 1.25,
      sector: 'IT',
      timeframe: 'SWING_1_TO_2_WEEKS',
      created_at: new Date().toISOString()
    };

    setDbMockHooks({
      dbAll: async () => [mockRec],
      dbGet: async () => ({ close: 3680 }), // below SL 3700
      dbRun: async () => ({ lastID: 202, changes: 1 })
    });

    const conductPostMortemSpy = jest.spyOn(CausalPostMortemService.getInstance(), 'conductPostMortem')
      .mockResolvedValue({} as any);

    const result = await auditor.auditActiveRecommendations();

    expect(result).toEqual({ audited: 1, updated: 1 });
    expect(conductPostMortemSpy).toHaveBeenCalledTimes(1);
    expect(conductPostMortemSpy).toHaveBeenCalledWith(expect.objectContaining({
      recommendationId: 202,
      symbol: 'TCS',
      entryPrice: 3800,
      exitPrice: 3680,
      stopLossPrice: 3700
    }));
  });

  // U-ROA-04
  it('U-ROA-04: Recommendation with missing price in Prices table uses fallback current_price and leaves status unchanged', async () => {
    const mockRec = {
      id: 303,
      symbol: 'UNPRICED',
      action: 'ENTER_LONG',
      status: 'ACTIVE',
      entry_price: 500,
      current_price: 500,
      target_1: 550,
      target_2: 600,
      stop_loss: 480,
      created_at: new Date().toISOString()
    };

    let dbRunCalled = false;
    setDbMockHooks({
      dbAll: async () => [mockRec],
      dbGet: async () => null, // Missing price in DB
      dbRun: async () => { dbRunCalled = true; return { changes: 0 }; }
    });

    const result = await auditor.auditActiveRecommendations();

    expect(result).toEqual({ audited: 1, updated: 0 });
    // Since fallback current_price equals rec.current_price (500 == 500), no DB mutation occurs
    expect(dbRunCalled).toBe(false);
  });

  // U-ROA-05
  it('U-ROA-05: Invalid action string (e.g. HOLD) is skipped without error and without DB mutation', async () => {
    const mockRec = {
      id: 404,
      symbol: 'STAY_STOCK',
      action: 'HOLD',
      status: 'ACTIVE',
      entry_price: 100,
      current_price: 100,
      target_1: 120,
      target_2: 140,
      stop_loss: 90,
      created_at: new Date().toISOString()
    };

    let dbRunCalled = false;
    setDbMockHooks({
      dbAll: async () => [mockRec],
      dbGet: async () => ({ close: 150 }),
      dbRun: async () => { dbRunCalled = true; return { changes: 0 }; }
    });

    const result = await auditor.auditActiveRecommendations();

    expect(result.audited).toBe(1);
    expect(result.updated).toBe(0);
    expect(dbRunCalled).toBe(false);
  });

  // U-ROA-06
  it('U-ROA-06: Simulated DB error on dbAll is caught, logged with console.error, and returns { audited: 0, updated: 0 }', async () => {
    const dbError = new Error('SQLITE_IOERR: disk I/O error');
    setDbMockHooks({
      dbAll: async () => { throw dbError; }
    });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await auditor.auditActiveRecommendations();

    expect(result).toEqual({ audited: 0, updated: 0 });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[RecommendationOutcomeAuditor] auditActiveRecommendations error:'),
      dbError
    );
  });
});
