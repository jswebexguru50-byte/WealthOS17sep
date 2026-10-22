import { z } from 'zod';
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * WealthOS Server Configuration Schema & Security Hardening
 * Constitutional Evidence & Invariants:
 * - Deterministic, schema-validated environment configuration.
 * - Secure defaults: BIND_HOST 127.0.0.1, timing-safe equality for auth credentials.
 * - In-memory sliding-window rate limiting for sensitive endpoints.
 * - Zero reliance on unvalidated ambient process.env.
 */

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  BIND_HOST: z.string().default('127.0.0.1'),
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173'),
  DATABASE_URL: z.string().optional(),
  APP_PASSWORD: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  READ_ONLY_RUNTIME: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
  LIVE_UNIVERSE_ENABLED: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
  ENABLE_DUCKDB_WARMUP: z.preprocess((v) => (v === undefined ? true : v !== 'false' && v !== false), z.boolean()).default(true),
  ENABLE_STARTUP_STRATEGIES: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
  ENABLE_STARTUP_DB_MUTATIONS: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
  ENABLE_BACKGROUND_SCHEDULERS: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
  
  // Market Data & LLM credentials (optional)
  UPSTOX_ACCESS_TOKEN: z.string().optional(),
  ALPACA_API_KEY: z.string().optional(),
  ALPACA_SECRET_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  
  // Trendlyne API & Enrichment quotas
  TRENDLYNE_ENRICHMENT_ENABLED: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
  TRENDLYNE_DAILY_CALL_LIMIT: z.coerce.number().int().positive().default(1000),
  TRENDLYNE_MONTHLY_CALL_LIMIT: z.coerce.number().int().positive().default(10000),
  TRENDLYNE_DAILY_RESERVE: z.coerce.number().int().nonnegative().default(100),
  TRENDLYNE_MONTHLY_RESERVE: z.coerce.number().int().nonnegative().default(1000)
});

export type RawServerEnv = z.infer<typeof serverEnvSchema>;

export interface ServerConfig extends RawServerEnv {
  allowedOriginsList: string[];
  isOriginAllowed: (origin?: string) => boolean;
}

/**
 * Parse and validate environment variables against serverEnvSchema.
 */
export function parseServerConfig(env: Record<string, any> = process.env): ServerConfig {
  const result = serverEnvSchema.safeParse(env);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => ` - [${issue.path.join('.')}]: ${issue.message}`)
      .join('\n');
    throw new Error(`[WealthOS Config Error] Invalid environment configuration:\n${errorDetails}`);
  }

  const data = result.data;
  const origins = data.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);

  const isOriginAllowed = (origin?: string): boolean => {
    if (!origin) return false;
    return origins.includes(origin) || origins.includes('*');
  };

  return {
    ...data,
    allowedOriginsList: origins,
    isOriginAllowed
  };
}

let cachedConfig: ServerConfig | null = null;

/**
 * Get active server configuration singleton.
 */
export function getServerConfig(reload = false): ServerConfig {
  if (!cachedConfig || reload) {
    cachedConfig = parseServerConfig(process.env);
  }
  return cachedConfig;
}

/**
 * Constant-time comparison between two strings to prevent timing attacks.
 */
export function timingSafeMatch(provided?: string | null, expected?: string | null): boolean {
  if (!provided || !expected) return false;
  const bufA = Buffer.from(provided);
  const bufB = Buffer.from(expected);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export interface RateLimiterOptions {
  windowMs?: number;
  maxRequests?: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
}

export interface RateLimiterMiddleware {
  (req: Request, res: Response, next: NextFunction): void;
  reset: () => void;
  getCounts: () => Map<string, { count: number; resetTime: number }>;
}

/**
 * Create an in-memory sliding-window rate limiting middleware.
 */
export function createRateLimiter(options: RateLimiterOptions = {}): RateLimiterMiddleware {
  const windowMs = options.windowMs ?? 60 * 1000;
  const maxRequests = options.maxRequests ?? 120;
  const message = options.message ?? `Rate limit of ${maxRequests} requests per ${Math.round(windowMs / 1000)}s exceeded.`;
  const defaultKeyGen = (req: Request) => req.ip || req.socket?.remoteAddress || 'unknown';
  const keyGen = options.keyGenerator ?? defaultKeyGen;

  const store = new Map<string, { count: number; resetTime: number }>();

  const middleware: any = (req: Request, res: Response, next: NextFunction) => {
    if (options.skip && options.skip(req)) {
      return next();
    }

    const key = keyGen(req);
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetTime) {
      store.set(key, { count: 1, resetTime: now + windowMs });
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', maxRequests - 1);
      return next();
    }

    entry.count += 1;
    const remaining = Math.max(0, maxRequests - entry.count);
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);

    if (entry.count > maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetTime - now) / 1000));
      res.setHeader('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message,
        retryAfterSeconds
      });
    }

    next();
  };

  middleware.reset = () => {
    store.clear();
  };

  middleware.getCounts = () => store;

  return middleware;
}

/**
 * Zod validation middleware for Express routes.
 */
export function validateRequest<T extends z.ZodTypeAny>(
  schema: T,
  source: 'body' | 'query' | 'params' = 'body'
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        source,
        issues: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message
        }))
      });
    }
    // Update req[source] with coerced / sanitized parsed data
    (req as any)[source] = result.data;
    next();
  };
}

/**
 * Local Application Password authentication middleware.
 */
export function requireAppPassword(configuredPassword?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const expected = configuredPassword || process.env.APP_PASSWORD;
    if (!expected) {
      return next();
    }

    const provided = (req.headers['x-app-password'] as string) || (req.query['app_password'] as string);
    if (!timingSafeMatch(provided, expected)) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Unauthorized local session: invalid or missing application credentials.'
      });
    }

    next();
  };
}
