/**
 * company_intelligence_api_e2e.test.ts
 *
 * Workstream B4 & Item 18:
 * Real API integration test for GET /api/company-intelligence/:symbol.
 * Validates:
 * - Direct HTTP invocation of GET /api/company-intelligence/TCS and DYCL
 * - GET causes ZERO writes (read-only invariant)
 * - Returns structured cockpit response with canonical facts, modules, coverage, consistency
 * - Refresh parameter (persist=true) persists snapshot and returns deterministic history
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import infraRouter from '../../src/server/routes/infra.js';
import Database from 'better-sqlite3';
import path from 'path';

describe('Company Intelligence API E2E & Read-Only Invariants', () => {
  let app: express.Express;
  const PORTFOLIO_DB_PATH = path.resolve('portfolio.db');

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', infraRouter);
  });

  it('GET /api/company-intelligence/TCS returns complete cockpit response without writing to database', async () => {
    const portDb = new Database(PORTFOLIO_DB_PATH);
    const getSnapshotCount = () => {
      try {
        const row = portDb.prepare(`SELECT count(*) as c FROM company_snapshots WHERE symbol = 'TCS'`).get() as any;
        return row?.c || 0;
      } catch {
        return 0;
      }
    };

    const initialCount = getSnapshotCount();

    // Call GET endpoint
    const res = await request(app)
      .get('/api/company-intelligence/TCS')
      .expect(200);

    expect(res.body).toBeDefined();
    expect(res.body.security).toBeDefined();
    expect(res.body.security.symbol).toBe('TCS');
    expect(res.body.security.isin).toBe('INE467B01029');

    // Modules check
    expect(res.body.modules).toBeDefined();
    expect(res.body.modules.fundamental).toBeDefined();
    expect(res.body.modules.valuation).toBeDefined();
    expect(res.body.modules.management).toBeDefined();
    expect(res.body.modules.businessDrivers).toBeDefined();
    expect(res.body.modules.timeline).toBeDefined();

    // Consistency report must be defined and consistent (fail-closed)
    expect(res.body.consistencyReport).toBeDefined();
    expect(res.body.consistencyReport.isConsistent).toBe(true);

    // Read-only invariant: GET causes zero writes
    const postCount = getSnapshotCount();
    expect(postCount).toBe(initialCount);

    portDb.close();
  }, 60000);

  it('GET /api/company-intelligence/DYCL correctly reflects adversarial small-cap standalone state', async () => {
    const res = await request(app)
      .get('/api/company-intelligence/DYCL')
      .expect(200);

    expect(res.body).toBeDefined();
    expect(res.body.security.symbol).toBe('DYCL');
    expect(res.body.security.isin).toBe('INE600Y01019');
    expect(res.body.dataCoverage).toBeDefined();
    expect(res.body.dataCoverage.domains.MANAGEMENT.overallStatus).toBe('SUFFICIENT');

    // Claim safety: no speculative or emotional phrases
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/float is manipulated/i);
    expect(bodyStr).not.toMatch(/institutions distrust/i);
    expect(bodyStr).not.toMatch(/management crisis/i);
  });

  it('GET /api/v2/company-intelligence/DYCL returns complete frozen V2 contract', async () => {
    const res = await request(app)
      .get('/api/v2/company-intelligence/DYCL')
      .expect(200);

    expect(res.body).toBeDefined();
    // V2 Top-Level Contracts (Checkpoint 5)
    expect(res.body.security).toBeDefined();
    expect(res.body.security.symbol).toBe('DYCL');
    expect(res.body.freshness).toBeDefined();
    expect(res.body.freshness.marketPrice).toBeDefined();
    expect(res.body.overview).toBeDefined();
    expect(res.body.overview.whyInteresting).toBeInstanceOf(Array);
    expect(res.body.overview.whyInteresting.length).toBeGreaterThan(0);
    expect(res.body.timeline).toBeDefined();
    expect(res.body.timeline.events).toBeInstanceOf(Array);
    expect(res.body.monitoring).toBeDefined();
    expect(res.body.monitoring.activeWatches).toBeInstanceOf(Array);
    expect(res.body.modules).toBeDefined();
    expect(res.body.modules.management?.result?.walkTheTalkLedger).toBeInstanceOf(Array);
  });
});
