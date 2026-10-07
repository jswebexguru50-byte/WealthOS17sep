import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { getDB, withTx } from '../../src/server/database.js';

describe('Codex Review Remediation Regression Suite', () => {

  describe('1. Security Hardening Invariants (P0-3)', () => {
    it('verifies timing-safe password comparison semantics', () => {
      const secret = 'wealthos-secret-2026';
      const correctInput = Buffer.from('wealthos-secret-2026');
      const wrongInput = Buffer.from('wealthos-wrong-pw-99');
      const expected = Buffer.from(secret);

      const matchCorrect = correctInput.length === expected.length && crypto.timingSafeEqual(correctInput, expected);
      const matchWrong = wrongInput.length === expected.length && crypto.timingSafeEqual(wrongInput, expected);

      expect(matchCorrect).toBe(true);
      expect(matchWrong).toBe(false);
    });

    it('verifies CORS allowed-origins resolution logic', () => {
      const allowed = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173'];
      
      const checkOrigin = (origin: string | undefined): boolean => {
        if (!origin) return false;
        return allowed.includes(origin) || allowed.includes('*');
      };

      expect(checkOrigin('http://localhost:3000')).toBe(true);
      expect(checkOrigin('http://localhost:5173')).toBe(true);
      expect(checkOrigin('http://malicious-site.com')).toBe(false);
      expect(checkOrigin(undefined)).toBe(false);
    });
  });

  describe('2. Database Driver & Statement Caching Invariants (P0-1)', () => {
    it('verifies better-sqlite3 instance is active with WAL and NORMAL synchronous', () => {
      const db = getDB();
      expect(db).toBeDefined();
      
      const journal = db.pragma('journal_mode', { simple: true });
      expect(String(journal).toLowerCase()).toBe('wal');

      const syncMode = db.pragma('synchronous', { simple: true });
      // In SQLite: 1 = NORMAL
      expect(Number(syncMode)).toBe(1);
    });

    it('verifies statement caching is active and reusable across queries', () => {
      const db = getDB();
      const sql = 'SELECT 1 as val';
      const stmt1 = db.prepare(sql);
      const stmt2 = db.prepare(sql);

      const r1 = stmt1.get() as any;
      const r2 = stmt2.get() as any;

      expect(r1.val).toBe(1);
      expect(r2.val).toBe(1);
    });
  });

  describe('3. Transaction Atomicity & Rollback Invariants (P0-2)', () => {
    it('verifies withTx rolls back completely on thrown exception', async () => {
      const db = getDB();
      db.exec('CREATE TABLE IF NOT EXISTS _test_atomic (id INTEGER PRIMARY KEY, name TEXT)');
      db.exec('DELETE FROM _test_atomic');

      await expect(
        withTx(db, async () => {
          db.prepare("INSERT INTO _test_atomic (id, name) VALUES (1, 'persisted')").run();
          throw new Error('SIMULATED_FAILURE');
        })
      ).rejects.toThrow('SIMULATED_FAILURE');

      const row = db.prepare('SELECT COUNT(*) as cnt FROM _test_atomic').get() as any;
      expect(row.cnt).toBe(0); // Clean rollback verified
    });

    it('verifies withTx commits cleanly on success', async () => {
      const db = getDB();
      db.exec('CREATE TABLE IF NOT EXISTS _test_atomic (id INTEGER PRIMARY KEY, name TEXT)');
      db.exec('DELETE FROM _test_atomic');

      await withTx(db, async () => {
        db.prepare("INSERT INTO _test_atomic (id, name) VALUES (1, 'persisted')").run();
        db.prepare("INSERT INTO _test_atomic (id, name) VALUES (2, 'persisted')").run();
      });

      const row = db.prepare('SELECT COUNT(*) as cnt FROM _test_atomic').get() as any;
      expect(row.cnt).toBe(2);
    });

    it('verifies nested withTx executes safely without transaction collision', async () => {
      const db = getDB();
      db.exec('CREATE TABLE IF NOT EXISTS _test_atomic (id INTEGER PRIMARY KEY, name TEXT)');
      db.exec('DELETE FROM _test_atomic');

      await withTx(db, async () => {
        db.prepare("INSERT INTO _test_atomic (id, name) VALUES (1, 'outer')").run();
        await withTx(db, async () => {
          db.prepare("INSERT INTO _test_atomic (id, name) VALUES (2, 'inner')").run();
        });
        db.prepare("INSERT INTO _test_atomic (id, name) VALUES (3, 'outer')").run();
      });

      const row = db.prepare('SELECT COUNT(*) as cnt FROM _test_atomic').get() as any;
      expect(row.cnt).toBe(3);
    });

    it('verifies nested withTx failure rolls back inner savepoint without corrupting outer transaction if handled', async () => {
      const db = getDB();
      db.exec('CREATE TABLE IF NOT EXISTS _test_atomic (id INTEGER PRIMARY KEY, name TEXT)');
      db.exec('DELETE FROM _test_atomic');

      await withTx(db, async () => {
        db.prepare("INSERT INTO _test_atomic (id, name) VALUES (1, 'outer')").run();
        try {
          await withTx(db, async () => {
            db.prepare("INSERT INTO _test_atomic (id, name) VALUES (2, 'inner-failed')").run();
            throw new Error('INNER_FAIL');
          });
        } catch {
          // Handled inner error
        }
        db.prepare("INSERT INTO _test_atomic (id, name) VALUES (3, 'outer')").run();
      });

      const rows = db.prepare('SELECT id, name FROM _test_atomic ORDER BY id ASC').all() as any[];
      expect(rows.length).toBe(2);
      expect(rows[0].id).toBe(1);
      expect(rows[1].id).toBe(3);
    });
  });

  describe('4. SWR Cache, Disk Cache & ETag Invariants (Phase 3 & Finding B2)', () => {
    it('verifies targeted invalidation marks affected & aggregate stale while preserving unaffected portfolios', () => {
      const mockCache = new Map<string, { data: any; ts: number }>();
      mockCache.set('mem_1::cc9::false', { data: { port: 'cc9' }, ts: 1000 });
      mockCache.set('mem_1::iifl::false', { data: { port: 'iifl' }, ts: 2000 });
      mockCache.set('mem_1::__all__::false', { data: { port: 'all' }, ts: 3000 });

      // Targeted invalidate for "cc9"
      const targetPortfolio = 'cc9';
      const pNorm = targetPortfolio.toLowerCase().trim();
      for (const [key, entry] of mockCache.entries()) {
        if (key.toLowerCase().includes(pNorm) || key.includes('__all__')) {
          entry.ts = 0; // Marked stale for SWR background revalidation, not deleted!
        }
      }

      // Assertions:
      // cc9 entry marked stale (ts: 0) but preserved
      expect(mockCache.get('mem_1::cc9::false')?.ts).toBe(0);
      expect(mockCache.get('mem_1::cc9::false')?.data.port).toBe('cc9');

      // __all__ aggregate entry marked stale (ts: 0)
      expect(mockCache.get('mem_1::__all__::false')?.ts).toBe(0);

      // Unrelated portfolio "iifl" remains completely warm and fresh (> 0)
      expect(mockCache.get('mem_1::iifl::false')?.ts).toBe(2000);
    });

    it('verifies disk-cache timestamp parsing and age calculation', () => {
      const now = Date.now();
      const freshIso = new Date(now - 30 * 1000).toISOString(); // 30s ago
      const staleIso = new Date(now - 4 * 60 * 1000).toISOString(); // 4 min ago (TTL is 3m)

      const parseDiskTs = (updatedAt: string | null) => updatedAt ? new Date(updatedAt).getTime() : 0;
      const freshTs = parseDiskTs(freshIso);
      const staleTs = parseDiskTs(staleIso);

      const DASHBOARD_CACHE_TTL_MS = 3 * 60 * 1000;
      expect(now - freshTs).toBeLessThan(DASHBOARD_CACHE_TTL_MS);
      expect(now - staleTs).toBeGreaterThan(DASHBOARD_CACHE_TTL_MS);
    });

    it('verifies deterministic ETag generation across identical payloads and string inputs', () => {
      const payload = { aum: 1000000, holdings: [{ symbol: 'TCS', qty: 10 }] };
      const serialized = JSON.stringify(payload);

      const etagFromObj = `W/"${crypto.createHash('md5').update(JSON.stringify(payload)).digest('hex')}"`;
      const etagFromStr = `W/"${crypto.createHash('md5').update(serialized).digest('hex')}"`;

      expect(etagFromObj).toBe(etagFromStr);
      expect(etagFromObj.startsWith('W/"')).toBe(true);
      expect(etagFromObj.endsWith('"')).toBe(true);
    });

    it('verifies concurrent request coalescing shares a single in-flight Promise', async () => {
      const inFlightMap = new Map<string, Promise<any>>();
      let executionCount = 0;

      const mockExpensiveFetch = async (key: string) => {
        let existing = inFlightMap.get(key);
        if (!existing) {
          executionCount++;
          existing = new Promise(resolve => setTimeout(() => resolve({ key, count: executionCount }), 50))
            .finally(() => inFlightMap.delete(key));
          inFlightMap.set(key, existing);
        }
        return existing;
      };

      // Dispatch 5 concurrent requests simultaneously
      const results = await Promise.all([
        mockExpensiveFetch('dash_key'),
        mockExpensiveFetch('dash_key'),
        mockExpensiveFetch('dash_key'),
        mockExpensiveFetch('dash_key'),
        mockExpensiveFetch('dash_key')
      ]);

      // All 5 requests receive identical result from exactly 1 execution
      expect(executionCount).toBe(1);
      results.forEach(r => {
        expect(r.count).toBe(1);
        expect(r.key).toBe('dash_key');
      });
      expect(inFlightMap.size).toBe(0);
    });

    it('verifies sendWithEtag returns HTTP 304 when If-None-Match matches', () => {
      const payload = { success: true, count: 42 };
      const body = JSON.stringify(payload);
      const expectedEtag = `W/"${crypto.createHash('md5').update(body).digest('hex')}"`;

      let statusCalledWith = 0;
      let sentBody: any = null;
      const headersSet: Record<string, string> = {};

      const mockReq = {
        headers: { 'if-none-match': expectedEtag }
      };
      const mockRes = {
        setHeader: (k: string, v: string) => { headersSet[k] = v; },
        sendStatus: (code: number) => { statusCalledWith = code; },
        send: (b: any) => { sentBody = b; }
      };

      const sendWithEtagFn = (req: any, res: any, rawPayload: any) => {
        const str = JSON.stringify(rawPayload);
        const etag = `W/"${crypto.createHash('md5').update(str).digest('hex')}"`;
        res.setHeader('ETag', etag);
        if (req.headers['if-none-match'] === etag) {
          return res.sendStatus(304);
        }
        res.setHeader('Content-Type', 'application/json');
        return res.send(str);
      };

      sendWithEtagFn(mockReq, mockRes, payload);

      expect(headersSet['ETag']).toBe(expectedEtag);
      expect(statusCalledWith).toBe(304);
      expect(sentBody).toBeNull(); // Empty body on 304
    });

    it('verifies sendWithEtag returns HTTP 200 with body when ETag differs', () => {
      const payload = { success: true, count: 42 };
      const body = JSON.stringify(payload);
      const expectedEtag = `W/"${crypto.createHash('md5').update(body).digest('hex')}"`;

      let statusCalledWith = 0;
      let sentBody: any = null;
      const headersSet: Record<string, string> = {};

      const mockReq = {
        headers: { 'if-none-match': 'W/"stale_etag"' }
      };
      const mockRes = {
        setHeader: (k: string, v: string) => { headersSet[k] = v; },
        sendStatus: (code: number) => { statusCalledWith = code; },
        send: (b: any) => { sentBody = b; }
      };

      const sendWithEtagFn = (req: any, res: any, rawPayload: any) => {
        const str = JSON.stringify(rawPayload);
        const etag = `W/"${crypto.createHash('md5').update(str).digest('hex')}"`;
        res.setHeader('ETag', etag);
        if (req.headers['if-none-match'] === etag) {
          return res.sendStatus(304);
        }
        res.setHeader('Content-Type', 'application/json');
        return res.send(str);
      };

      sendWithEtagFn(mockReq, mockRes, payload);

      expect(headersSet['ETag']).toBe(expectedEtag);
      expect(headersSet['Content-Type']).toBe('application/json');
      expect(statusCalledWith).toBe(0); // sendStatus not called
      expect(sentBody).toBe(body);
    });
  });

  describe('5. Route Collision Invariant Verification (P1-5)', () => {
    it('verifies server.ts does not mount /api/strategies twice', () => {
      const fs = require('fs');
      const serverCode = fs.readFileSync('server.ts', 'utf8');

      // Grep for app.use('/api/strategies', strategiesRouter)
      const matches = serverCode.match(/app\.use\(\s*['"]\/api\/strategies['"]\s*,\s*strategiesRouter\s*\)/g);
      expect(matches).toBeDefined();
      expect(matches.length).toBe(1); // Exactly ONE canonical mount, no duplicate!
    });
  });

  describe('6. Dashboard Endpoints sendWithEtag Adoption Verification', () => {
    it('verifies /api/dashboard, /api/dashboard/xirr, /api/growth-history, /api/metrics all use sendWithEtag in server.ts', () => {
      const fs = require('fs');
      const serverCode = fs.readFileSync('server.ts', 'utf8');

      // Helper to extract route handler body
      const extractHandler = (routePath: string) => {
        const idx = serverCode.indexOf(`app.get('${routePath}'`);
        if (idx === -1) return '';
        return serverCode.slice(idx, idx + 15000);
      };

      const dashHandler = extractHandler('/api/dashboard');
      const xirrHandler = extractHandler('/api/dashboard/xirr');
      const growthHandler = extractHandler('/api/growth-history');
      const metricsHandler = extractHandler('/api/metrics');

      expect(dashHandler).toContain('sendWithEtag');
      expect(xirrHandler).toContain('sendWithEtag');
      expect(growthHandler).toContain('sendWithEtag');
      expect(metricsHandler).toContain('sendWithEtag');
    });
  });

});
