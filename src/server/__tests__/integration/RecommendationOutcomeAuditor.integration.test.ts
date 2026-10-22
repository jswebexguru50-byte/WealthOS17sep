import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import axios from 'axios';
import { dbAll, dbGet, dbRun } from '../../database.js';

const API_BASE = 'http://localhost:3000/api';

describe('Integration: RecommendationOutcomeAuditor + CausalPostMortem', () => {
  const testSymbol = 'TEST_INT_AUDIT';

  afterAll(async () => {
    // Cleanup test records
    await dbRun(`DELETE FROM AutonomousRecommendationsLedger WHERE symbol = ?`, [testSymbol]);
    await dbRun(`DELETE FROM AutonomousPostMortems WHERE symbol = ?`, [testSymbol]);
    await dbRun(`DELETE FROM Prices WHERE symbol = ?`, [testSymbol]);
  });

  // I-ROA-01
  it('I-ROA-01: Stop-loss trigger via scan-now updates status to STOPPED_OUT and creates AutonomousPostMortems record', async () => {
    const nowIso = new Date().toISOString();
    
    // Seed recommendation
    const recResult = await dbRun(`
      INSERT INTO AutonomousRecommendationsLedger (
        symbol, company_name, sector, action, timeframe, entry_price, current_price,
        target_1, target_2, stop_loss, risk_reward_ratio, probability_pct,
        confidence_score, catalyst, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
    `, [
      testSymbol, 'Test Audit Corp', 'Technology', 'ENTER_LONG_BREAKOUT',
      'SWING_1_TO_2_WEEKS', 1000.0, 1000.0, 1100.0, 1200.0, 950.0,
      2.0, 75, 70, 'Technical Breakout', nowIso, nowIso
    ]);

    const recId = recResult.lastID;

    // Seed price that breaches stop-loss (940 <= 950)
    await dbRun(`
      INSERT OR REPLACE INTO Prices (symbol, date, open, high, low, close, volume)
      VALUES (?, ?, 960.0, 965.0, 935.0, 940.0, 500000)
    `, [testSymbol, new Date().toISOString().split('T')[0]]);

    // Trigger on-demand scan via API
    const scanRes = await axios.post(`${API_BASE}/v1/autonomous-agent/scan-now`, {});
    expect(scanRes.status).toBe(200);
    expect(scanRes.data.success).toBe(true);

    // Verify DB recommendation status changed to STOPPED_OUT
    const updatedRec = await dbGet<any>(`
      SELECT * FROM AutonomousRecommendationsLedger WHERE id = ?
    `, [recId]);

    expect(updatedRec).toBeDefined();
    expect(updatedRec.status).toBe('STOPPED_OUT');

    // Verify AutonomousPostMortems record exists
    const postMortem = await dbGet<any>(`
      SELECT * FROM AutonomousPostMortems WHERE symbol = ?
      ORDER BY id DESC LIMIT 1
    `, [testSymbol]);

    expect(postMortem).toBeDefined();
    expect(postMortem.primary_failure_category).toBeDefined();
    expect(postMortem.compound_causes_json).toBeDefined();
  });

  // I-ROA-02
  it('I-ROA-02: Target 1 hit updates status to TARGET_1_HIT and stop_loss to entry price', async () => {
    const symbolT1 = 'TEST_INT_T1';
    const nowIso = new Date().toISOString();

    const recResult = await dbRun(`
      INSERT INTO AutonomousRecommendationsLedger (
        symbol, company_name, sector, action, timeframe, entry_price, current_price,
        target_1, target_2, stop_loss, risk_reward_ratio, probability_pct,
        confidence_score, catalyst, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
    `, [
      symbolT1, 'Test T1 Corp', 'Auto', 'ENTER_LONG_PULLBACK',
      'DAILY_1_TO_3_DAYS', 500.0, 500.0, 530.0, 560.0, 480.0,
      1.5, 78, 72, 'Pullback', nowIso, nowIso
    ]);

    const recId = recResult.lastID;

    // Seed price that crosses target_1 (535 >= 530)
    await dbRun(`
      INSERT OR REPLACE INTO Prices (symbol, date, open, high, low, close, volume)
      VALUES (?, ?, 520.0, 540.0, 515.0, 535.0, 300000)
    `, [symbolT1, new Date().toISOString().split('T')[0]]);

    // Scan now
    const scanRes = await axios.post(`${API_BASE}/v1/autonomous-agent/scan-now`, {});
    expect(scanRes.status).toBe(200);

    const updatedRec = await dbGet<any>(`
      SELECT * FROM AutonomousRecommendationsLedger WHERE id = ?
    `, [recId]);

    expect(updatedRec.status).toBe('TARGET_1_HIT');
    expect(updatedRec.stop_loss).toBe(500.0); // moved to entry_price (break-even)

    // Cleanup
    await dbRun(`DELETE FROM AutonomousRecommendationsLedger WHERE id = ?`, [recId]);
    await dbRun(`DELETE FROM Prices WHERE symbol = ?`, [symbolT1]);
  });

  // I-ROA-03
  it('I-ROA-03: Price crosses target_2 updates status to TARGET_2_HIT', async () => {
    const symbolT2 = 'TEST_INT_T2';
    const nowIso = new Date().toISOString();

    const recResult = await dbRun(`
      INSERT INTO AutonomousRecommendationsLedger (
        symbol, company_name, sector, action, timeframe, entry_price, current_price,
        target_1, target_2, stop_loss, risk_reward_ratio, probability_pct,
        confidence_score, catalyst, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'TARGET_1_HIT', ?, ?)
    `, [
      symbolT2, 'Test T2 Corp', 'Pharma', 'ENTER_LONG_BREAKOUT',
      'SWING_1_TO_2_WEEKS', 800.0, 840.0, 840.0, 880.0, 800.0,
      2.0, 82, 75, 'Breakout', nowIso, nowIso
    ]);

    const recId = recResult.lastID;

    // Price hits target 2 (885 >= 880)
    await dbRun(`
      INSERT OR REPLACE INTO Prices (symbol, date, open, high, low, close, volume)
      VALUES (?, ?, 870.0, 890.0, 865.0, 885.0, 400000)
    `, [symbolT2, new Date().toISOString().split('T')[0]]);

    const scanRes = await axios.post(`${API_BASE}/v1/autonomous-agent/scan-now`, {});
    expect(scanRes.status).toBe(200);

    const updatedRec = await dbGet<any>(`
      SELECT * FROM AutonomousRecommendationsLedger WHERE id = ?
    `, [recId]);

    expect(updatedRec.status).toBe('TARGET_2_HIT');

    // Cleanup
    await dbRun(`DELETE FROM AutonomousRecommendationsLedger WHERE id = ?`, [recId]);
    await dbRun(`DELETE FROM Prices WHERE symbol = ?`, [symbolT2]);
  });
});
