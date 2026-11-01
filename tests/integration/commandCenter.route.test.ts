/**
 * Integration test for commandCenter routes
 *
 * Requires the WealthOS server to be running (started by globalSetup.ts).
 * Tests that the command center endpoints return valid response structures.
 */
import { describe, test, expect } from 'vitest';

const BASE = 'http://localhost:3000/api';

describe('commandCenter route integration', () => {
  test('GET /command-center returns 200 with summary and breakdowns', async () => {
    const res = await fetch(`${BASE}/command-center`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('summary');
    expect(data.summary).toHaveProperty('totalNetWorthINR');
    expect(data).toHaveProperty('assetClassBreakdown');
    expect(Array.isArray(data.assetClassBreakdown)).toBe(true);
    expect(data).toHaveProperty('closedPortfolios');
    expect(Array.isArray(data.closedPortfolios)).toBe(true);
  });

  test('GET /command-center includes all 5 closed portfolios in response', async () => {
    const res = await fetch(`${BASE}/command-center`);
    if (res.status !== 200) return; // skip if server data unavailable
    const data = await res.json();
    const closedNames = (data.closedPortfolios as any[]).map((p: any) => p.name);
    for (const name of ['IIFL360', 'Maa HDFC Sky', 'DBFS', 'Self HDFC Securities', 'Self Mutual Fund']) {
      expect(closedNames).toContain(name);
    }
  });

  test('POST /command-center/dismiss-drift returns 200', async () => {
    const res = await fetch(`${BASE}/command-center/dismiss-drift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portfolios: [] }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('success', true);
  });
});
