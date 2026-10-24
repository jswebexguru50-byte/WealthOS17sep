/**
 * src/server/routes/shared.ts
 * Shared utilities re-exported for route modules.
 * All routes import from here instead of directly from parent files.
 */
import type express from 'express';
import { getDB, dbAll, dbGet, dbRun } from '../database.js';
import { authenticateFamily } from '../auth/familyRoleAuth.js';
import { permittedMemberIds, intersectPortfolios } from '../auth/portfolioAccess.js';
import { getServerConfig } from '../config.js';

/** Returns the current database instance */
export function db() { return getDB(); }

/** Sanitize ISIN string */
export function sanitizeIsin(isin: string | null | undefined): string {
  if (!isin) return '';
  let cleaned = isin.trim().toUpperCase();
  if (cleaned.includes('[')) cleaned = cleaned.split('[')[0].trim();
  return cleaned;
}

/**
 * Resolve portfolios from request query/body.
 * - 'all' / 'combined' / missing → scoped to member allowed portfolios (default Member 1 / Gopal)
 * - 'none' → no portfolios (empty selection)
 * - comma-separated list → those specific portfolios
 */
export async function getSelectedPortfolios(req: express.Request): Promise<string[] | null> {
  return selectAuthorizedPortfolios(req, getDB());
}

export async function selectAuthorizedPortfolios(req: express.Request, database: any): Promise<string[]> {
  const config = getServerConfig();
  const principal = authenticateFamily(req.headers as any, config.APP_PASSWORD) ||
    (!config.APP_PASSWORD && !process.env.FAMILY_AUTH_USERS && config.NODE_ENV === 'development' && config.BIND_HOST === '127.0.0.1'
      ? { userId: 'local-development', role: 'owner' as const, authMethod: 'app-password' as const } : null);
  const ids = permittedMemberIds(principal, req.query.member_id || req.headers['x-member-id']);
  if (principal?.role !== 'owner' && ids?.length === 1) req.query.member_id = String(ids[0]);
  const members = ids ? ids.map(() => '?').join(',') : '';
  const rows = await dbAll(database, ids
    ? `SELECT DISTINCT name FROM Portfolios WHERE status != 'ARCHIVED' AND (member_id IN (${members}) OR name IN (SELECT portfolio_name FROM MemberPortfolioPermissions WHERE member_id IN (${members})))`
    : "SELECT DISTINCT name FROM Portfolios WHERE status != 'ARCHIVED'", ids ? [...ids,...ids] : []);
  const allowed = rows.map((r: any) => r.name);
  const requested = req.query.portfolios || req.body?.portfolios || req.query.portfolio || req.body?.portfolio;
  const selected = intersectPortfolios(requested, allowed);
  return selected.length ? selected : ['__NO_ACTIVE_PORTFOLIOS__'];
}

/** Standard async route error wrapper */
export function asyncRoute(
  fn: (req: express.Request, res: express.Response) => Promise<void>
): express.RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

export { dbAll, dbGet, dbRun };
