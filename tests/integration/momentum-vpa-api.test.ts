import { describe, it, expect } from 'vitest';

describe('Momentum & VPA Trading API Endpoints (Integration)', () => {
  const baseUrl = 'http://localhost:3000';

  it('GET /api/momentum-vpa/scanner returns qualified setups categorized by stage', async () => {
    const res = await fetch(`${baseUrl}/api/momentum-vpa/scanner?symbols=RELIANCE,TCS,INFY`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.count).toBeGreaterThanOrEqual(1);

    const item = json.data[0];
    expect(item.symbol).toBeDefined();
    expect(item.currentPrice).toBeGreaterThan(0);
    expect(item.blendedVwap).toBeGreaterThan(0);
    expect(item.pointZeroStopLoss).toBeGreaterThan(0);
    expect(item.targetMinPrice).toBeGreaterThan(0);
    expect(item.targetMaxPrice).toBeGreaterThan(item.targetMinPrice);
    expect(item.probabilityScore).toBeGreaterThanOrEqual(0);
    expect(item.confidenceLevel).toBeDefined();
    expect(Array.isArray(item.rationale)).toBe(true);
    expect(item.rationale.length).toBeGreaterThanOrEqual(3);
    expect(item.tranches).toHaveLength(3);
  });

  it('GET /api/momentum-vpa/analysis returns single-scrip diagnostic breakdown', async () => {
    const res = await fetch(`${baseUrl}/api/momentum-vpa/analysis?symbol=RELIANCE`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
    expect(json.data.symbol).toBe('RELIANCE');
    expect(json.data.macroRegime).toBeDefined();
    expect(json.data.impulse).toBeDefined();
    expect(json.data.base).toBeDefined();
    expect(json.data.tranches).toHaveLength(3);
  });

  it('GET /api/momentum-vpa/alerts returns real-time alert feed', async () => {
    const res = await fetch(`${baseUrl}/api/momentum-vpa/alerts`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });

  it('POST /api/momentum-vpa/orders/arm-staggered creates bracket parent order in SQLite', async () => {
    const res = await fetch(`${baseUrl}/api/momentum-vpa/orders/arm-staggered`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: 'TCS',
        portfolio: 'Combined',
        totalCapital: 250000
      })
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toMatch(/^VPA-TCS-/);
    expect(json.data.symbol).toBe('TCS');
    expect(json.data.status).toBe('ARMED');
    expect(json.data.totalQuantity).toBeGreaterThan(0);
    expect(json.data.p0).toBeGreaterThan(0);
    expect(json.data.blendedVwap).toBeGreaterThan(0);
    expect(json.data.targetMinPrice).toBeGreaterThan(0);
  });
});
