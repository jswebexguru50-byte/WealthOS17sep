import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import axios from 'axios';
import { dbAll, dbGet, dbRun, setDbMockHooks } from '../../database.js';
import { RecommendationOutcomeAuditor } from '../../services/RecommendationOutcomeAuditor.js';
import { PaperTradingPotService } from '../../services/PaperTradingPotService.js';
import { LiveMarketStreamService } from '../../services/LiveMarketStreamService.js';

const API_BASE = 'http://localhost:3000/api';

describe('Negative & Fault-Injection Tests (Spec Section 5)', () => {

  afterEach(() => {
    setDbMockHooks({});
    jest.restoreAllMocks();
  });

  // N-DB-01: Delete / simulate missing AutonomousRecommendationsLedger table
  it('N-DB-01: Missing AutonomousRecommendationsLedger table is caught gracefully, returns { audited: 0, updated: 0 }', async () => {
    const auditor = RecommendationOutcomeAuditor.getInstance();

    // Hook dbAll to simulate missing table error (SQLITE_ERROR: no such table: AutonomousRecommendationsLedger)
    setDbMockHooks({
      dbAll: async (sql: string) => {
        if (sql.includes('AutonomousRecommendationsLedger')) {
          throw new Error('no such table: AutonomousRecommendationsLedger');
        }
        return [];
      }
    });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // auditActiveRecommendations must catch the error, log, and return { audited: 0, updated: 0 }
    const result = await auditor.auditActiveRecommendations();
    expect(result).toEqual({ audited: 0, updated: 0 });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[RecommendationOutcomeAuditor] auditActiveRecommendations error:'),
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });

  // N-DB-02: Corrupt PaperTradingPots row (negative cash)
  it('N-DB-02: Corrupt negative cash in PaperTradingPots is detected, logged, and blocks new entries', async () => {
    const potService = PaperTradingPotService.getInstance();
    const testPotId = 'pot_corrupt_test';

    // Seed corrupt pot with negative cash balance
    await dbRun(`
      INSERT OR REPLACE INTO PaperTradingPots (
        id, pot_name, strategy_type, initial_capital, cash_balance, current_portfolio_nav,
        risk_per_trade_pct, max_drawdown_pct, peak_nav, is_circuit_breaker_tripped
      ) VALUES (?, 'Corrupt Negative Pot', 'CONSERVATIVE', 1000000.0, -250000.0, 750000.0, 3.0, 0.0, 1000000.0, 0)
    `, [testPotId]);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // 1. Verify ensurePotsInitialized logs warning about corrupt negative cash
    await potService.ensurePotsInitialized();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Corrupt pot state detected: Negative cash balance')
    );

    // 2. Verify evaluateRecommendationForEntry blocks new position entry
    const mockRec = {
      symbol: 'TEST_NEG_CORRUPT',
      action: 'ENTER_LONG_BREAKOUT',
      entryPrice: 500.0,
      stopLoss: 475.0,
      target1: 550.0,
      target2: 600.0,
      probabilityPct: 85,
      confidenceScore: 80,
      timeframe: 'SWING_1_TO_2_WEEKS'
    };

    const entryAllowed = await potService.evaluateRecommendationForEntry(mockRec, testPotId);
    expect(entryAllowed).toBe(false);

    // Cleanup
    await dbRun(`DELETE FROM PaperTradingPots WHERE id = ?`, [testPotId]);
    warnSpy.mockRestore();
  });

  // N-API-01: Malformed JSON to /paper-pot/reset (missing initialCapital)
  it('N-API-01: Send malformed payload to /paper-pot/reset returns 400 Bad Request with descriptive error', async () => {
    try {
      await axios.post(`${API_BASE}/v1/autonomous-agent/paper-pot/reset`, {
        potId: 'pot_test'
        // missing initialCapital
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.response).toBeDefined();
      expect(err.response.status).toBe(400);
      expect(err.response.data.success).toBe(false);
      expect(err.response.data.error).toMatch(/initialCapital is required/i);
    }
  });

  // N-API-02: Unsupported format value to /paper-pot/export
  it('N-API-02: Provide unsupported format to export endpoint returns 400 with "Supported formats: csv, json"', async () => {
    try {
      await axios.get(`${API_BASE}/v1/autonomous-agent/paper-pot/export?format=xml`);
      // Should not reach here
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.response).toBeDefined();
      expect(err.response.status).toBe(400);
      expect(err.response.data.success).toBe(false);
      expect(err.response.data.error).toBe('Supported formats: csv, json');
    }
  });

  // N-SERVICE-01: Mock LiveMarketStreamService.broadcastAlert to throw
  it('N-SERVICE-01: Mock LiveMarketStreamService.broadcastAlert to throw does not abort audit operation', async () => {
    const auditor = RecommendationOutcomeAuditor.getInstance();
    const testSymbol = 'TEST_N_SERVICE_01';
    const nowIso = new Date().toISOString();

    // Insert active recommendation
    const recRes = await dbRun(`
      INSERT INTO AutonomousRecommendationsLedger (
        symbol, company_name, sector, action, timeframe, entry_price, current_price,
        target_1, target_2, stop_loss, risk_reward_ratio, probability_pct,
        confidence_score, catalyst, status, created_at, updated_at
      ) VALUES (?, 'Fault Corp', 'Defense', 'ENTER_LONG_BREAKOUT',
        'SWING_1_TO_2_WEEKS', 200.0, 200.0, 220.0, 240.0, 190.0,
        2.0, 80, 75, 'Fault Injection', 'ACTIVE', ?, ?)
    `, [testSymbol, nowIso, nowIso]);

    const recId = recRes.lastID;

    // Price breaches stop-loss (185 <= 190)
    await dbRun(`
      INSERT OR REPLACE INTO Prices (symbol, date, open, high, low, close, volume)
      VALUES (?, ?, 195.0, 198.0, 182.0, 185.0, 100000)
    `, [testSymbol, nowIso.split('T')[0]]);

    // Spy on broadcastAlert to throw an intentional Error
    const broadcastSpy = jest.spyOn(LiveMarketStreamService.getInstance(), 'broadcastAlert')
      .mockImplementation(() => {
        throw new Error('Simulated LiveMarketStream WebSocket failure!');
      });

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // auditActiveRecommendations must complete without throwing unhandled exception
    const auditRes = await auditor.auditActiveRecommendations();
    expect(auditRes).toBeDefined();
    expect(auditRes.updated).toBeGreaterThanOrEqual(1);

    // Verify DB was still updated to STOPPED_OUT despite broadcast failure
    const updated = await dbGet<any>(`
      SELECT status FROM AutonomousRecommendationsLedger WHERE id = ?
    `, [recId]);

    expect(updated.status).toBe('STOPPED_OUT');

    // Cleanup
    await dbRun(`DELETE FROM AutonomousRecommendationsLedger WHERE id = ?`, [recId]);
    await dbRun(`DELETE FROM AutonomousPostMortems WHERE symbol = ?`, [testSymbol]);
    await dbRun(`DELETE FROM Prices WHERE symbol = ?`, [testSymbol]);
    broadcastSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
