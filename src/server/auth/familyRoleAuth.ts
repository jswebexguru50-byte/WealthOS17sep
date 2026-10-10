import crypto from 'node:crypto';

export type FamilyRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type FamilyPrincipal = { userId: string; role: FamilyRole; authMethod: 'family-role' | 'app-password' };
type FamilyUser = { userId: string; password: string; role: FamilyRole };
const validRoles = new Set<FamilyRole>(['owner', 'admin', 'editor', 'viewer']);

function usersFromEnvironment(): FamilyUser[] {
  const raw = process.env.FAMILY_AUTH_USERS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((u): u is FamilyUser =>
      u && typeof u.userId === 'string' && typeof u.password === 'string' && validRoles.has(u.role)
    ) : [];
  } catch { return []; }
}

function sameSecret(a: string, b: string): boolean {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export function authenticateFamily(headers: Record<string, unknown>, appPassword?: string): FamilyPrincipal | null {
  const password = String(headers['x-app-password'] || '');
  const requestedUser = String(headers['x-app-user'] || '').trim();
  const configured = usersFromEnvironment();
  if (configured.length) {
    const match = configured.find(u => (!requestedUser || u.userId === requestedUser) && sameSecret(password, u.password));
    return match ? { userId: match.userId, role: match.role, authMethod: 'family-role' } : null;
  }
  return appPassword && sameSecret(password, appPassword)
    ? { userId: requestedUser || 'app-password-owner', role: 'owner', authMethod: 'app-password' } : null;
}

export function roleAllows(principal: FamilyPrincipal, required: FamilyRole = 'admin'): boolean {
  const rank: Record<FamilyRole, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };
  return rank[principal.role] >= rank[required];
}

