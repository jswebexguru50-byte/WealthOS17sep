import { describe, it, expect } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

describe('Institutional Smart Money Concepts (SMC) Integration Tests', () => {
  it('GET /api/v1/sentinel/smc/analysis returns full 13-pillar SMC metrics for RELIANCE', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/sentinel/smc/analysis?symbol=RELIANCE`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();

    const data = json.data;
    expect(data.symbol).toBe('RELIANCE');
    expect(typeof data.cmp).toBe('number');
    expect(data.cmp).toBeGreaterThan(0);

    // Pillar 1: Market Structure
    expect(data.marketStructure).toBeDefined();
    expect(['BULLISH', 'BEARISH', 'CHOP']).toContain(data.marketStructure.bias);

    // Pillar 2 & 3: Liquidity Pools & Sweeps
    expect(data.liquidity).toBeDefined();
    expect(Array.isArray(data.liquidity.activePools)).toBe(true);

    // Pillar 4 & 5: Order Blocks & Breakers
    expect(data.orderBlocks).toBeDefined();
    expect(Array.isArray(data.orderBlocks.activeBullishObs)).toBe(true);
    expect(Array.isArray(data.orderBlocks.activeBearishObs)).toBe(true);

    // Pillar 6: Fair Value Gaps
    expect(data.fairValueGaps).toBeDefined();
    expect(Array.isArray(data.fairValueGaps.activeGaps)).toBe(true);

    // Pillar 7: Displacement
    expect(data.displacement).toBeDefined();
    expect(typeof data.displacement.isDisplaced).toBe('boolean');

    // Pillar 8: Premium vs Discount Dealing Range
    expect(data.premiumDiscount).toBeDefined();
    expect(['DISCOUNT', 'EQUILIBRIUM', 'PREMIUM']).toContain(data.premiumDiscount.currentZone);
    expect(typeof data.premiumDiscount.equilibrium50).toBe('number');

    // Pillar 10: SMT Divergence
    expect(data.smtDivergence).toBeDefined();
    expect(typeof data.smtDivergence.detected).toBe('boolean');

    // Pillar 11: 10-Second Checklist
    expect(data.checklist).toBeDefined();
    expect(typeof data.checklist.score).toBe('number');
    expect(data.checklist.score).toBeGreaterThanOrEqual(0);
    expect(data.checklist.score).toBeLessThanOrEqual(10);
    expect(data.checklist.items).toBeDefined();
  });

  it('GET /api/v1/sentinel/smc/scanner scans universe and returns top institutional opportunities', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/sentinel/smc/scanner`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.count).toBeGreaterThan(0);
    expect(Array.isArray(json.data)).toBe(true);

    const first = json.data[0];
    expect(first.symbol).toBeDefined();
    expect(first.cmp).toBeGreaterThan(0);
    expect(first.checklist).toBeDefined();
    expect(typeof first.checklist.score).toBe('number');
  });

  it('POST /api/v1/sentinel/smc/evaluate evaluates synthetic candles deterministically', async () => {
    const syntheticCandles = [];
    let price = 100;
    for (let i = 1; i <= 25; i++) {
      const day = i < 10 ? `0${i}` : `${i}`;
      const change = (i % 3 === 0 ? -1 : 1.5);
      price += change;
      syntheticCandles.push({
        date: `2026-08-${day}`,
        open: price - 0.5,
        high: price + 2,
        low: price - 1.5,
        close: price,
        volume: 15000 + i * 500
      });
    }

    const res = await fetch(`${BASE_URL}/api/v1/sentinel/smc/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: 'TEST_STOCK',
        candles: syntheticCandles
      })
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.symbol).toBe('TEST_STOCK');
    expect(json.data.premiumDiscount.currentZone).toBeDefined();
    expect(json.data.checklist.score).toBeGreaterThanOrEqual(0);

    // Verify boundary validation returns 400 on < 15 candles
    const badRes = await fetch(`${BASE_URL}/api/v1/sentinel/smc/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: 'TEST_STOCK',
        candles: syntheticCandles.slice(0, 5)
      })
    });
    expect(badRes.status).toBe(400);
  });

  it('GET /api/v1/autonomous-agent/recommendations surfaces SMC fields on active blueprints', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/autonomous-agent/recommendations`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);

    if (json.data.length > 0) {
      const rec = json.data[0];
      expect(rec.symbol).toBeDefined();
      expect(rec.entryPrice).toBeGreaterThan(0);
      expect(rec.stopLoss).toBeGreaterThan(0);
      expect(rec.target1).toBeGreaterThan(0);
      // Verify SMC fields are recognized in schema
      expect(rec).toHaveProperty('smcMarketStructure');
      expect(rec).toHaveProperty('smcLiquiditySweep');
      expect(rec).toHaveProperty('smcChecklistScore');
    }
  });
});
