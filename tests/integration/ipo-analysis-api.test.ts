import { describe, it, expect } from 'vitest';

describe('Greenfield IPO Analysis & Simulation API Endpoints (Integration)', () => {
  const baseUrl = 'http://localhost:3000';

  it('GET /api/greenfield/ipos returns active & upcoming IPO candidates with valuations and GMP', async () => {
    const res = await fetch(`${baseUrl}/api/greenfield/ipos`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.count).toBeGreaterThanOrEqual(6);

    const first = json.data[0];
    expect(first.id).toBeDefined();
    expect(first.companyName).toBeDefined();
    expect(first.priceBand).toBeDefined();
    expect(first.gmp).toBeDefined();
    expect(first.financials).toBeDefined();
    expect(first.verdict).toBeDefined();
    expect(['APPLY_HIGH_CONVICTION', 'APPLY_LISTING_GAINS', 'WATCH', 'AVOID']).toContain(first.verdict.action);
  });

  it('GET /api/greenfield/ipos?filter=APPLY_ONLY returns only recommended IPOs', async () => {
    const res = await fetch(`${baseUrl}/api/greenfield/ipos?filter=APPLY_ONLY`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(2);

    json.data.forEach((item: any) => {
      expect(['APPLY_HIGH_CONVICTION', 'APPLY_LISTING_GAINS']).toContain(item.verdict.action);
    });
  });

  it('GET /api/greenfield/ipos/:id returns single IPO 360-degree forensic dossier', async () => {
    const res = await fetch(`${baseUrl}/api/greenfield/ipos/ipo_waaree_energies`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
    expect(json.data.symbol).toBe('WAAREEENER');
    expect(json.data.verdict.action).toBe('APPLY_HIGH_CONVICTION');
    expect(json.data.peerComparison.length).toBeGreaterThanOrEqual(2);
  });

  it('POST /api/greenfield/simulate-ipo-bid places a virtual IPO bid into the paper sandbox', async () => {
    const res = await fetch(`${baseUrl}/api/greenfield/simulate-ipo-bid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ipoId: 'ipo_waaree_energies',
        potId: 'pot_conservative',
        bidCategory: 'RETAIL',
        lotsCount: 1
      })
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
    expect(json.data.lotsApplied).toBe(1);
    expect(json.data.sharesApplied).toBe(9);
    expect(json.data.bidPrice).toBe(1503);
    expect(json.data.estimatedListingGain).toBe(9 * 1450);
  });
});
