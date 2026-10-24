import type { FamilyPrincipal } from './familyRoleAuth.js';
export class PortfolioAccessError extends Error {
  constructor(message: string, readonly status = 403) { super(message); this.name = 'PortfolioAccessError'; }
}
/** Member grants come from trusted authentication configuration, never request headers. */
export function permittedMemberIds(principal: FamilyPrincipal | null, requested?: unknown): number[] | null {
  if (!principal) throw new PortfolioAccessError('UNAUTHORIZED', 401);
  const text = String(requested ?? '').trim().toLowerCase();
  const all = text === 'all' || text === 'consolidated';
  if (principal.role === 'owner') {
    if (all) return null;
    const id = text ? Number(text) : 1;
    if (!Number.isSafeInteger(id) || id < 1) throw new PortfolioAccessError('INVALID_MEMBER');
    return [id];
  }
  const grants = principal.memberIds || [];
  if (!grants.length) throw new PortfolioAccessError('MEMBER_GRANT_REQUIRED');
  if (all || !text) {
    if (grants.length !== 1) throw new PortfolioAccessError('EXPLICIT_MEMBER_SELECTION_REQUIRED');
    return [...grants];
  }
  const id = Number(text);
  if (!grants.includes(id)) throw new PortfolioAccessError('MEMBER_FORBIDDEN');
  return [id];
}
export function intersectPortfolios(requested: unknown, allowed: string[]): string[] {
  const text = String(requested ?? '').trim().toLowerCase();
  if (text === 'none') return [];
  if (!text || ['all','combined','__all__'].includes(text)) return [...allowed];
  const names = Array.isArray(requested) ? requested.map(String) : String(requested).split(',');
  const canonical = new Map(allowed.map(name => [name.toLowerCase(), name]));
  return [...new Set(names.map(name => canonical.get(name.trim().toLowerCase())).filter((v): v is string => v !== undefined))];
}
