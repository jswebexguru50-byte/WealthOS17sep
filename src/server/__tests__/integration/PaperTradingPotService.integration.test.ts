import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import axios from 'axios';
import { dbAll, dbGet, dbRun } from '../../database.js';

const API_BASE = 'http://localhost:3000/api';

describe('Integration: PaperTradingPotService End-to-End Flow', () => {
  const testPotId = 'pot_integration_test';

  beforeAll(async () => {
    // Initialize test pot
    await dbRun(`
      INSERT OR REPLACE INTO PaperTradingPots (
        id, pot_name, strategy_type, initial_capital, cash_balance,
        current_portfolio_nav, risk_per_trade_pct, max_drawdown_pct, peak_nav
      ) VALUES (?, 'Integration Test Pot', 'CONSERVATIVE', 500000.0, 500000.0, 500000.0, 3.0, 0.0, 500000.0)
    `, [testPotId]);
  });

  afterAll(async () => {
    await dbRun(`DELETE FROM PaperTradingPositions WHERE pot_id = ?`, [testPotId]);
    await dbRun(`DELETE FROM PaperTradingNAVHistory WHERE pot_id = ?`, [testPotId]);
    await dbRun(`DELETE FROM PaperTradingPots WHERE id = ?`, [testPotId]);
  });

  // I-PT-01
  it('I-PT-01: POST /v1/autonomous-agent/paper-pot/sync synchronizes positions and returns accurate counts', async () => {
    const nowIso = new Date().toISOString();
    // Seed an open position in the test pot
    await dbRun(`
      INSERT INTO PaperTradingPositions (
        pot_id, symbol, company_name, sector, action, timeframe,
        quantity, initial_quantity, entry_price, invested_capital, current_price,
        stop_loss, trailing_stop_loss, target_1, target_2, partial_exit_done,
        friction_costs, status, entry_date
      ) VALUES (?, 'INT_SYNC_STOCK', 'Sync Corp', 'Banking', 'BUY', 'SWING', 10, 10, 100.0, 1000.0, 100.0, 90.0, 90.0, 110.0, 120.0, 0, 24.60, 'OPEN', ?)
    `, [testPotId, nowIso]);

    const res = await axios.post(`${API_BASE}/v1/autonomous-agent/paper-pot/sync`, {});
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(typeof res.data.data.checked).toBe('number');
    expect(typeof res.data.data.updated).toBe('number');
    expect(typeof res.data.data.closed).toBe('number');
    expect(res.data.data.checked).toBeGreaterThanOrEqual(1);
  });

  // I-PT-02
  it('I-PT-02: POST /v1/autonomous-agent/paper-pot/reset with custom capital resets cash, clears positions, and clears circuit breaker', async () => {
    const customCapital = 750000.0;

    const res = await axios.post(`${API_BASE}/v1/autonomous-agent/paper-pot/reset`, {
      potId: testPotId,
      initialCapital: customCapital
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    // Verify DB state
    const pot = await dbGet<any>(`SELECT * FROM PaperTradingPots WHERE id = ?`, [testPotId]);
    expect(pot).toBeDefined();
    expect(pot.cash_balance).toBe(customCapital);
    expect(pot.current_portfolio_nav).toBe(customCapital);
    expect(pot.is_circuit_breaker_tripped).toBe(0);

    const positions = await dbAll<any>(`SELECT * FROM PaperTradingPositions WHERE pot_id = ?`, [testPotId]);
    expect(positions.length).toBe(0);
  });

  // I-PT-03
  it('I-PT-03: GET /v1/autonomous-agent/paper-pot/export?format=csv returns valid CSV with correct headers', async () => {
    const res = await axios.get(`${API_BASE}/v1/autonomous-agent/paper-pot/export?potId=${testPotId}&format=csv`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');

    const csvLines = (res.data as string).split('\n');
    expect(csvLines.length).toBeGreaterThanOrEqual(1);

    const header = csvLines[0];
    expect(header).toContain('ID');
    expect(header).toContain('Symbol');
    expect(header).toContain('Company');
    expect(header).toContain('EntryPrice');
    expect(header).toContain('Status');
    expect(header).toContain('RealizedPnL');
  });

  // I-PT-04
  it('I-PT-04: GET /v1/autonomous-agent/paper-pot/equity-curve validates that points contain nav, cash, benchmarkNiftyNav, alphaVsBenchmarkPct, timestamp', async () => {
    const res = await axios.get(`${API_BASE}/v1/autonomous-agent/paper-pot/equity-curve?potId=${testPotId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.data.length).toBeGreaterThan(0);

    const point = res.data.data[0];
    expect(point).toHaveProperty('nav');
    expect(point).toHaveProperty('cash');
    expect(point).toHaveProperty('benchmarkNiftyNav');
    expect(point).toHaveProperty('alphaVsBenchmarkPct');
    expect(point).toHaveProperty('timestamp');
  });
});
