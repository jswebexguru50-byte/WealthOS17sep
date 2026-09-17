import { describe, it, expect } from 'vitest';

describe('Greenfield Portfolio Rebalancing & Switch API Endpoints (Integration)', () => {
  const baseUrl = 'http://localhost:3000';

  it('GET /api/greenfield/rebalance-switches returns comprehensive rebalance report', async () => {
    const res = await fetch(`${baseUrl}/api/greenfield/rebalance-switches`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
    expect(json.data.summary).toBeDefined();
    expect(json.data.summary.totalTrappedInLaggardsInr).toBeGreaterThan(0);
    expect(json.data.summary.totalPotentialTaxSavingsInr).toBeGreaterThan(0);
    expect(json.data.summary.avgAlphaUpliftPct).toBeGreaterThan(0);

    expect(Array.isArray(json.data.diagnostics)).toBe(true);
    expect(json.data.diagnostics.length).toBeGreaterThan(0);

    expect(Array.isArray(json.data.switches)).toBe(true);
    expect(json.data.switches.length).toBeGreaterThanOrEqual(3);

    const switch1 = json.data.switches[0];
    expect(switch1.id).toBeDefined();
    expect(switch1.sourceHolding).toBeDefined();
    expect(switch1.destinationCandidate).toBeDefined();
    expect(switch1.financialMetrics).toBeDefined();
    expect(switch1.financialMetrics.capitalFreedInr).toBeGreaterThan(0);
    expect(switch1.financialMetrics.taxHarvestingSavingsInr).toBeGreaterThan(0);
  });

  it('GET /api/v1/greenfield/rebalance-switches?portfolio=Papa filters for Papa portfolio', async () => {
    const res = await fetch(`${baseUrl}/api/v1/greenfield/rebalance-switches?portfolio=Papa`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.portfolioFilter).toBe('Papa');
    expect(json.data.diagnostics.length).toBeGreaterThan(0);
    json.data.diagnostics.forEach((d: any) => {
      expect(d.portfolio.toLowerCase()).toContain('papa');
    });
  });

  it('POST /api/greenfield/simulate-rebalance-switch executes a switch inside the paper sandbox', async () => {
    const res = await fetch(`${baseUrl}/api/greenfield/simulate-rebalance-switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        switchId: 'SWITCH_ORIANA_WAAREE',
        potId: 'pot_conservative'
      })
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toContain('Successfully executed simulated switch');
    expect(json.data).toBeDefined();
    expect(json.data.sourceSymbol).toBe('ORIANA');
    expect(json.data.destinationSymbol).toBe('WAAREEENER');
    expect(json.data.taxSavingsInr).toBeGreaterThan(0);
  });

  it('POST /api/greenfield/simulate-rebalance-switch returns error when switchId is missing', async () => {
    const res = await fetch(`${baseUrl}/api/greenfield/simulate-rebalance-switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('switchId is required');
  });
});
