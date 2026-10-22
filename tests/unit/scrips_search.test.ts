/**
 * tests/unit/scrips_search.test.ts
 *
 * Unit tests for GET /api/scrips/search:
 * 1. Default top-cap symbols when query is empty.
 * 2. Exact symbol matching prioritized first.
 * 3. Search by company name.
 * 4. Search by ISIN.
 * 5. Search by sector.
 * 6. Limit clamping: default 20, max 50, min 1.
 * 7. Compact row schema integrity.
 * 8. Wrapped/envelope format response.
 * 9. Non-existent ticker handling.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import infraRouter, { ScripSearchResult } from '../../src/server/routes/infra.js';
import { getDB, dbGet } from '../../src/server/database.js';

const app = express();
app.use(express.json());
app.use('/api', infraRouter);

describe('GET /api/scrips/search', () => {
  it('returns default top market cap scrips when query is empty', async () => {
    const res = await request(app).get('/api/scrips/search');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.length).toBeLessThanOrEqual(20);

    const first: ScripSearchResult = res.body[0];
    expect(first).toHaveProperty('symbol');
    expect(first).toHaveProperty('companyName');
    expect(first).toHaveProperty('isin');
    expect(first).toHaveProperty('sector');
    expect(first).toHaveProperty('industry');
    expect(first).toHaveProperty('exchange');
    expect(first).toHaveProperty('marketCapCr');
  });

  it('prioritizes exact symbol match as the first result', async () => {
    const res = await request(app).get('/api/scrips/search?q=TCS');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].symbol).toBe('TCS');
    expect(res.body[0].companyName).toContain('Tata Consultancy Services');
    expect(res.body[0].isin).toBe('INE467B01029');
    expect(res.body[0].exchange).toBe('NSE');
  });

  it('matches securities by company name', async () => {
    const res = await request(app).get('/api/scrips/search?q=Reliance');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].symbol).toBe('RELIANCE');
    expect(res.body[0].companyName).toContain('Reliance');
  });

  it('matches securities by ISIN', async () => {
    const res = await request(app).get('/api/scrips/search?q=INE467B01029');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].symbol).toBe('TCS');
    expect(res.body[0].isin).toBe('INE467B01029');
  });

  it('matches securities by sector', async () => {
    const res = await request(app).get('/api/scrips/search?q=Energy&limit=5');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const hasEnergy = res.body.some((r: ScripSearchResult) => (r.sector || '').includes('Energy'));
    expect(hasEnergy).toBe(true);
  });

  it('clamps custom limit between 1 and 50', async () => {
    // Limit 5
    const res5 = await request(app).get('/api/scrips/search?limit=5');
    expect(res5.status).toBe(200);
    expect(res5.body.length).toBe(5);

    // Limit 100 clamped to 50
    const res100 = await request(app).get('/api/scrips/search?limit=100');
    expect(res100.status).toBe(200);
    expect(res100.body.length).toBeLessThanOrEqual(50);

    // Limit -1 clamped to 1
    const resMin = await request(app).get('/api/scrips/search?limit=-1');
    expect(resMin.status).toBe(200);
    expect(resMin.body.length).toBe(1);
  });

  it('returns empty array when no symbols match', async () => {
    const res = await request(app).get('/api/scrips/search?q=XYZNONEXISTENT9999');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  it('supports wrapped envelope format via query param', async () => {
    const res = await request(app).get('/api/scrips/search?q=TCS&wrapped=true');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('count');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].symbol).toBe('TCS');
  });
});
