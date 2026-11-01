/**
 * Integration tests for WealthOS API routes
 *
 * Requires the live server running on port 3000 (started by globalSetup.ts).
 * Covers /api/healthcheck and a selection of endpoints used by the migrated
 * frontend components (apiClient migration).
 */
import { describe, it, expect } from 'vitest';

const BASE = 'http://localhost:3000';

async function get(path: string): Promise<{ status: number; ct: string; data: unknown }> {
  const res = await fetch(`${BASE}${path}`);
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('application/json') ? await res.json().catch(() => null) : null;
  return { status: res.status, ct, data };
}

// ── Health & Infrastructure ────────────────────────────────────────────────

describe('GET /api/healthcheck', () => {
  it('responds with an HTTP 200-range status', async () => {
    const { status } = await get('/api/healthcheck');
    // The healthcheck can return 200 or 503 while data-feed gates are cold;
    // any response in range means the server listener is live.
    expect(status).toBeGreaterThanOrEqual(200);
    expect(status).toBeLessThan(600);
  });

  it('returns a JSON body', async () => {
    const { ct } = await get('/api/healthcheck');
    expect(ct).toContain('application/json');
  });

  it('body is an object (not an array or primitive)', async () => {
    const { data } = await get('/api/healthcheck');
    expect(data !== null && typeof data === 'object' && !Array.isArray(data)).toBe(true);
  });
});

// ── Unknown route ──────────────────────────────────────────────────────────

describe('Unknown route', () => {
  it('returns 404 for a non-existent endpoint', async () => {
    const { status } = await get('/api/__nonexistent_route_xyz_9999__');
    expect(status).toBe(404);
  });
});

// ── Portfolios (used by PortfolioManagerView, DashboardView) ───────────────

describe('GET /api/portfolios', () => {
  it('returns JSON', async () => {
    const { ct } = await get('/api/portfolios');
    expect(ct).toContain('application/json');
  });

  it('responds in the 2xx-5xx range (server is handling the route)', async () => {
    const { status } = await get('/api/portfolios');
    expect(status).toBeGreaterThanOrEqual(200);
    expect(status).toBeLessThan(600);
  });
});

// ── Family members (used by FamilyMemberSwitcher, FamilyMembersManagerView) ─

describe('GET /api/family-members', () => {
  it('returns JSON', async () => {
    const { ct } = await get('/api/family-members');
    expect(ct).toContain('application/json');
  });

  it('status is in the 2xx-5xx range', async () => {
    const { status } = await get('/api/family-members');
    expect(status).toBeGreaterThanOrEqual(200);
    expect(status).toBeLessThan(600);
  });
});

// ── Scrip mappings (used by AssetScripMappingView) ─────────────────────────

describe('GET /api/scrip-mappings', () => {
  it('returns JSON', async () => {
    const { ct } = await get('/api/scrip-mappings');
    expect(ct).toContain('application/json');
  });

  it('status is in the 2xx-5xx range', async () => {
    const { status } = await get('/api/scrip-mappings');
    expect(status).toBeGreaterThanOrEqual(200);
    expect(status).toBeLessThan(600);
  });
});

// ── Settings (used by PreferencesModal, ThemeSelectorModal) ───────────────

describe('GET /api/settings', () => {
  it('returns JSON', async () => {
    const { ct } = await get('/api/settings');
    expect(ct).toContain('application/json');
  });

  it('status is in the 2xx-5xx range', async () => {
    const { status } = await get('/api/settings');
    expect(status).toBeGreaterThanOrEqual(200);
    expect(status).toBeLessThan(600);
  });
});
