import { test, expect } from 'vitest';
import { authenticateFamily, roleAllows } from '../../src/server/auth/familyRoleAuth.ts';

test('family roles authenticate and enforce hierarchy', () => {
  const old = process.env.FAMILY_AUTH_USERS;
  process.env.FAMILY_AUTH_USERS = JSON.stringify([
    { userId: 'mom', password: 'mom-secret', role: 'owner' },
    { userId: 'advisor', password: 'advisor-secret', role: 'admin' },
    { userId: 'child', password: 'child-secret', role: 'viewer' }
  ]);
  try {
    const admin = authenticateFamily({ 'x-app-user': 'advisor', 'x-app-password': 'advisor-secret' });
    const viewer = authenticateFamily({ 'x-app-user': 'child', 'x-app-password': 'child-secret' });
    expect(admin?.role).toBe('admin');
    expect(roleAllows(admin!, 'admin')).toBe(true);
    expect(roleAllows(viewer!, 'admin')).toBe(false);
    expect(authenticateFamily({ 'x-app-user': 'advisor', 'x-app-password': 'wrong' })).toBeNull();
  } finally {
    if (old === undefined) delete process.env.FAMILY_AUTH_USERS;
    else process.env.FAMILY_AUTH_USERS = old;
  }
});

test('legacy APP_PASSWORD remains owner-compatible', () => {
  delete process.env.FAMILY_AUTH_USERS;
  const principal = authenticateFamily({ 'x-app-password': 'legacy' }, 'legacy');
  expect(principal?.role).toBe('owner');
});
