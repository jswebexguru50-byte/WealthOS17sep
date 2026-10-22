import { describe, it, expect } from 'vitest';
import {
  checkRouteCollisions,
  normalizePath
} from '../../scripts/maintenance/check_route_collisions.js';

describe('Phase 6: Route Collision & Integrity Checker', () => {

  describe('1. Path Normalization Invariants', () => {
    it('normalizes paths with redundant slashes and trailing slashes', () => {
      expect(normalizePath('api/tickers/')).toBe('/api/tickers');
      expect(normalizePath('///api///dashboard//')).toBe('/api/dashboard');
      expect(normalizePath('/')).toBe('/');
      expect(normalizePath('/api/v1/quant')).toBe('/api/v1/quant');
    });
  });

  describe('2. Repository Route Audit & Diagnostics', () => {
    it('scans server.ts and routes directory returning structured audit metrics', () => {
      const result = checkRouteCollisions();

      expect(result).toBeDefined();
      expect(result.totalRoutes).toBeGreaterThan(100);
      expect(result.uniqueEndpoints).toBeGreaterThan(50);
      expect(Array.isArray(result.collisions)).toBe(true);
      expect(Array.isArray(result.routes)).toBe(true);
    });

    it('identifies known historical mount collisions diagnosed in Codex review when colliding routes exist', () => {
      // Test detection logic using a fixture directory simulating pre-remediation state
      const os = require('node:os');
      const fs = require('node:fs');
      const path = require('node:path');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'route-collision-test-'));
      try {
        fs.mkdirSync(path.join(tmpDir, 'src/server/routes'), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'server.ts'), `
import bankFdsRouter from './src/server/routes/bankFds.js';
import transactionsRouter from './src/server/routes/transactions.js';
app.use('/api', bankFdsRouter);
app.use('/api', transactionsRouter);
app.get('/api/tickers', (req, res) => res.json([]));
app.get('/api/tickers', (req, res) => res.json([]));
        `);
        fs.writeFileSync(path.join(tmpDir, 'src/server/routes/bankFds.ts'), `
router.get('/', (req, res) => res.json([]));
        `);
        fs.writeFileSync(path.join(tmpDir, 'src/server/routes/transactions.ts'), `
router.get('/', (req, res) => res.json([]));
        `);

        const result = checkRouteCollisions(tmpDir);
        const rootApiCollision = result.collisions.find(
          (c) => c.method === 'GET' && c.fullPath === '/api'
        );
        expect(rootApiCollision).toBeDefined();
        expect(rootApiCollision?.occurrences.length).toBeGreaterThanOrEqual(2);

        const tickersCollision = result.collisions.find(
          (c) => c.method === 'GET' && c.fullPath === '/api/tickers'
        );
        expect(tickersCollision).toBeDefined();
        expect(tickersCollision?.occurrences.length).toBeGreaterThanOrEqual(2);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('verifies that the active repository now has 0 unresolved route collisions', () => {
      const result = checkRouteCollisions();
      expect(result.collisionCount).toBe(0);
      expect(result.collisions).toEqual([]);
    });
  });

  describe('3. Collision Detection Logic Invariants', () => {
    it('accurately groups occurrences by (METHOD, canonicalPath)', () => {
      const result = checkRouteCollisions();
      for (const col of result.collisions) {
        expect(col.occurrences.length).toBeGreaterThan(1);
        col.occurrences.forEach((occ) => {
          expect(occ.sourceFile).toBeDefined();
          expect(occ.lineNumber).toBeGreaterThan(0);
        });
      }
    });
  });
});
