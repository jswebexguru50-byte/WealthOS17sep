import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  parseServerConfig,
  getServerConfig,
  timingSafeMatch,
  createRateLimiter,
  validateRequest,
  requireAppPassword
} from '../../src/server/config.js';

describe('Phase 5: Security Hardening & Server Config', () => {

  describe('1. Server Environment Configuration Schema', () => {
    it('applies secure defaults when environment is minimal', () => {
      const config = parseServerConfig({});
      expect(config.NODE_ENV).toBe('development');
      expect(config.PORT).toBe(3000);
      expect(config.BIND_HOST).toBe('127.0.0.1');
      expect(config.READ_ONLY_RUNTIME).toBe(false);
      expect(config.ENABLE_DUCKDB_WARMUP).toBe(true);
      expect(config.allowedOriginsList).toContain('http://localhost:3000');
      expect(config.allowedOriginsList).toContain('http://localhost:5173');
    });

    it('parses valid custom environment overrides', () => {
      const config = parseServerConfig({
        NODE_ENV: 'production',
        PORT: '8080',
        BIND_HOST: '0.0.0.0',
        ALLOWED_ORIGINS: 'https://app.wealthos.internal,https://admin.wealthos.internal',
        READ_ONLY_RUNTIME: 'true',
        ENABLE_DUCKDB_WARMUP: 'false',
        APP_PASSWORD: 'super-secure-password-123'
      });

      expect(config.NODE_ENV).toBe('production');
      expect(config.PORT).toBe(8080);
      expect(config.BIND_HOST).toBe('0.0.0.0');
      expect(config.READ_ONLY_RUNTIME).toBe(true);
      expect(config.ENABLE_DUCKDB_WARMUP).toBe(false);
      expect(config.APP_PASSWORD).toBe('super-secure-password-123');
      expect(config.isOriginAllowed('https://app.wealthos.internal')).toBe(true);
      expect(config.isOriginAllowed('http://evil.com')).toBe(false);
    });

    it('throws validation error when port or environment mode is invalid', () => {
      expect(() => {
        parseServerConfig({ PORT: 'not-a-port' });
      }).toThrow('[WealthOS Config Error]');

      expect(() => {
        parseServerConfig({ PORT: '999999' }); // exceeds 65535
      }).toThrow('[WealthOS Config Error]');

      expect(() => {
        parseServerConfig({ NODE_ENV: 'invalid_mode' });
      }).toThrow('[WealthOS Config Error]');
    });

    it('getServerConfig singleton caches and reloads correctly', () => {
      const c1 = getServerConfig(true);
      expect(c1).toBeDefined();
      const c2 = getServerConfig(false);
      expect(c1).toBe(c2);
    });
  });

  describe('2. Constant-Time Password Matching (timingSafeMatch)', () => {
    it('returns true for identical strings', () => {
      expect(timingSafeMatch('wealthos-secure-pass', 'wealthos-secure-pass')).toBe(true);
    });

    it('returns false for mismatched strings of same length', () => {
      expect(timingSafeMatch('wealthos-secure-pass1', 'wealthos-secure-pass2')).toBe(false);
    });

    it('returns false safely for mismatched lengths without throwing', () => {
      expect(timingSafeMatch('short', 'much-longer-expected-secret')).toBe(false);
    });

    it('returns false when either input is null or undefined', () => {
      expect(timingSafeMatch(undefined, 'secret')).toBe(false);
      expect(timingSafeMatch('secret', undefined)).toBe(false);
      expect(timingSafeMatch(null, null)).toBe(false);
    });
  });

  describe('3. In-Memory Sliding-Window Rate Limiter', () => {
    let rateLimiter: ReturnType<typeof createRateLimiter>;

    beforeEach(() => {
      rateLimiter = createRateLimiter({
        windowMs: 1000,
        maxRequests: 3
      });
    });

    it('allows requests within limit and sets rate limit headers', () => {
      const headers: Record<string, any> = {};
      const req: any = { ip: '127.0.0.1', socket: {} };
      const res: any = {
        setHeader: (k: string, v: any) => { headers[k] = v; }
      };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      rateLimiter(req, res, next);
      expect(nextCalled).toBe(true);
      expect(headers['X-RateLimit-Limit']).toBe(3);
      expect(headers['X-RateLimit-Remaining']).toBe(2);

      rateLimiter(req, res, next);
      expect(headers['X-RateLimit-Remaining']).toBe(1);

      rateLimiter(req, res, next);
      expect(headers['X-RateLimit-Remaining']).toBe(0);
    });

    it('blocks requests exceeding limit with 429 status and Retry-After header', () => {
      const headers: Record<string, any> = {};
      let statusCode = 200;
      let jsonBody: any = null;
      const req: any = { ip: '192.168.1.100', socket: {} };
      const res: any = {
        setHeader: (k: string, v: any) => { headers[k] = v; },
        status: (code: number) => {
          statusCode = code;
          return {
            json: (body: any) => { jsonBody = body; }
          };
        }
      };

      // 3 allowed requests
      rateLimiter(req, res, () => {});
      rateLimiter(req, res, () => {});
      rateLimiter(req, res, () => {});

      // 4th request should trigger 429
      rateLimiter(req, res, () => {});
      expect(statusCode).toBe(429);
      expect(jsonBody.error).toBe('RATE_LIMIT_EXCEEDED');
      expect(headers['Retry-After']).toBeGreaterThanOrEqual(1);
    });

    it('resets counts cleanly when reset() is called', () => {
      const req: any = { ip: '10.0.0.1', socket: {} };
      const res: any = { setHeader: () => {} };
      rateLimiter(req, res, () => {});
      rateLimiter(req, res, () => {});
      expect(rateLimiter.getCounts().get('10.0.0.1')?.count).toBe(2);

      rateLimiter.reset();
      expect(rateLimiter.getCounts().size).toBe(0);
    });
  });

  describe('4. Zod Request Validation Middleware', () => {
    const testSchema = z.object({
      symbol: z.string().min(1),
      limit: z.coerce.number().min(1).max(500)
    });

    const validator = validateRequest(testSchema, 'query');

    it('passes valid request and sets coerced parsed data on req', () => {
      const req: any = { query: { symbol: 'RELIANCE', limit: '50' } };
      let nextCalled = false;
      const res: any = {};
      const next = () => { nextCalled = true; };

      validator(req, res, next);
      expect(nextCalled).toBe(true);
      expect(req.query.limit).toBe(50); // coerced number
    });

    it('returns 400 validation error for invalid request', () => {
      const req: any = { query: { symbol: '', limit: '1000' } };
      let statusCode = 200;
      let jsonBody: any = null;
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return {
            json: (body: any) => { jsonBody = body; }
          };
        }
      };

      validator(req, res, () => {});
      expect(statusCode).toBe(400);
      expect(jsonBody.error).toBe('VALIDATION_ERROR');
      expect(jsonBody.issues.length).toBeGreaterThan(0);
    });
  });

  describe('5. Application Password Authentication Middleware', () => {
    it('passes through if no password is configured', () => {
      const middleware = requireAppPassword(undefined);
      const req: any = { headers: {} };
      let nextCalled = false;
      middleware(req, {} as any, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });

    it('rejects with 401 when password mismatch occurs', () => {
      const middleware = requireAppPassword('secret-token-pass');
      const req: any = { headers: { 'x-app-password': 'wrong-password' }, query: {} };
      let statusCode = 200;
      let jsonBody: any = null;
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return {
            json: (body: any) => { jsonBody = body; }
          };
        }
      };

      middleware(req, res, () => {});
      expect(statusCode).toBe(401);
      expect(jsonBody.error).toBe('UNAUTHORIZED');
    });

    it('passes through when correct header credentials provided', () => {
      const middleware = requireAppPassword('secret-token-pass');
      const req: any = { headers: { 'x-app-password': 'secret-token-pass' }, query: {} };
      let nextCalled = false;
      middleware(req, {} as any, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });
  });
});
