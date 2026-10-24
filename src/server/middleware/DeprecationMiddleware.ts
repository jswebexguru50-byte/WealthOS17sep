import { Request, Response, NextFunction } from 'express';
import { Database } from 'sqlite3';
import { dbRun } from '../database.js';
import { setDeprecationHeader, setSunsetHeader, setLinkHeader, setWealthOSLegacyPathHeader, setDeprecationInfoHeader, extractClientIp, extractBrowserUserAgent, formatHttpDate } from '../utils/deprecationUtils.js';

export interface LegacyPathMapping {
  old_path: string;
  canonical_path: string;
  sunset_date: string;
  param_mapping?: Record<string, string>;
  migration_guide_url?: string;
}

export interface DeprecationAuditLog {
  timestamp: string;
  route: string;
  user_id?: string;
  ip: string;
  browser_ua?: string;
  response_time_ms: number;
  canonical_path: string;
}

export const LEGACY_PARAM_MAPS: Record<string, Record<string, string>> = {
  '/api/audit': {
    ticker: 'symbol',
    strategy_id: 'strategy_key'
  },
  '/api/opportunities': {
    ticker: 'symbol'
  }
  // TODO: Add more mappings as needed
};

export const LEGACY_PATHS_REGISTRY: LegacyPathMapping[] = [
  {
    old_path: '/api/audit',
    canonical_path: '/api/reconciliation-audit',
    sunset_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    param_mapping: LEGACY_PARAM_MAPS['/api/audit'],
    migration_guide_url: '/docs/MIGRATION_GUIDE_AUDIT.md'
  }
  // TODO: Add more deprecated paths
];

export class DeprecationMiddleware {
  private static lastLoggedPaths: Map<string, number> = new Map();
  private static readonly DEDUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  static createDeprecationMiddleware(db: Database) {
    return async (req: Request, res: Response, next: NextFunction) => {
      // Check if path is in LEGACY_PATHS_REGISTRY
      const legacyMapping = LEGACY_PATHS_REGISTRY.find(m => req.path.startsWith(m.old_path));

      if (legacyMapping) {
        // Check if sunset date has passed
        if (this.isSunsetDatePassed(legacyMapping.sunset_date)) {
          return res.status(410).json({
            error: 'Gone',
            message: `This endpoint has been sunset. Use ${legacyMapping.canonical_path} instead.`,
            canonical_path: legacyMapping.canonical_path,
            migration_guide: legacyMapping.migration_guide_url
          });
        }

        // Emit deprecation headers
        this.setDeprecationHeaders(res, legacyMapping.old_path, legacyMapping.canonical_path, legacyMapping.sunset_date);

        // Log usage
        const startTime = Date.now();
        res.on('finish', () => {
          const responseTime = Date.now() - startTime;
          this.logLegacyPathUsage(db, {
            timestamp: new Date().toISOString(),
            route: req.path,
            user_id: (req as any).userId,
            ip: extractClientIp(req),
            browser_ua: extractBrowserUserAgent(req),
            response_time_ms: responseTime,
            canonical_path: legacyMapping.canonical_path
          }).catch(e => console.error('Error logging legacy path usage:', e));
        });
      }

      next();
    };
  }

  static mapLegacyParams(legacyPath: string, params: Record<string, any>): Record<string, any> {
    const mappings = LEGACY_PARAM_MAPS[legacyPath];
    if (!mappings) return params;

    const mapped = { ...params };

    // Map old param names to new ones
    for (const [oldName, newName] of Object.entries(mappings)) {
      if (oldName in params && !(newName in params)) {
        mapped[newName] = params[oldName];
      }
    }

    // If both old and new provided, canonical takes precedence (already handled above)
    return mapped;
  }

  static setDeprecationHeaders(res: Response, legacyPath: string, canonicalPath: string, sunset_date: string) {
    setDeprecationHeader(res);
    setSunsetHeader(res, sunset_date);
    setLinkHeader(res, canonicalPath);
    setDeprecationInfoHeader(res, canonicalPath, sunset_date);
    setWealthOSLegacyPathHeader(res);
  }

  static async logLegacyPathUsage(db: Database, auditLog: DeprecationAuditLog) {
    const dedupKey = `${auditLog.route}:${auditLog.ip}`;
    const now = Date.now();
    const lastLogged = this.lastLoggedPaths.get(dedupKey);

    // Deduplicate: don't log same path from same IP within 5 minutes
    if (lastLogged && (now - lastLogged) < this.DEDUP_INTERVAL_MS) {
      return;
    }

    this.lastLoggedPaths.set(dedupKey, now);

    // Log to audit table
    try {
      await dbRun(
        db,
        `INSERT OR IGNORE INTO audit_legacy_path_calls (timestamp, route, user_id, ip, browser_ua, response_time_ms, canonical_path)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          auditLog.timestamp,
          auditLog.route,
          auditLog.user_id || null,
          auditLog.ip,
          auditLog.browser_ua || null,
          auditLog.response_time_ms,
          auditLog.canonical_path
        ]
      );
    } catch (e) {
      // Table may not exist yet; log only
      console.warn('Could not log legacy path usage:', (e as any).message);
    }
  }

  static async transparentlyRedirect(db: Database, req: Request, res: Response, legacyPath: string, canonicalPath: string) {
    // Transparent redirect (server-side, no HTTP 301/302)
    // Map request parameters, preserve body, query, auth, cookies
    // This is typically handled by route-level logic, not middleware
  }

  static isSunsetDatePassed(sunsetDate: string): boolean {
    return new Date() >= new Date(sunsetDate);
  }
}
