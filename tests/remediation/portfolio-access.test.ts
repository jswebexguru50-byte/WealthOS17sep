import { test, expect } from 'vitest';
import { permittedMemberIds, intersectPortfolios } from '../../src/server/auth/portfolioAccess.js';
import { authenticateFamily } from '../../src/server/auth/familyRoleAuth.js';

test('configured member grants survive authentication and reject impersonation', () => {
  const previous = process.env.FAMILY_AUTH_USERS;
  process.env.FAMILY_AUTH_USERS = JSON.stringify([{ userId: 'A', password: 'fixture', role: 'viewer', memberIds: [2] }]);
  try {
    const p = authenticateFamily({ 'x-app-user': 'A', 'x-app-password': 'fixture' });
    expect(permittedMemberIds(p)).toEqual([2]);
    expect(() => permittedMemberIds(p, 1)).toThrow(/MEMBER_FORBIDDEN/);
    expect(permittedMemberIds(p, 'all')).toEqual([2]);
    expect(intersectPortfolios(['B portfolio', 'A portfolio'], ['A portfolio'])).toEqual(['A portfolio']);
    expect(intersectPortfolios('B portfolio', ['A portfolio'])).toEqual([]);
  } finally {
    if (previous === undefined) delete process.env.FAMILY_AUTH_USERS;
    else process.env.FAMILY_AUTH_USERS = previous;
  }
});

test('ungranted users and anonymous requests fail closed', () => {
  expect(() => permittedMemberIds(null)).toThrow(/UNAUTHORIZED/);
  expect(() => permittedMemberIds({ userId: 'A', role: 'admin', authMethod: 'family-role' })).toThrow(/MEMBER_GRANT_REQUIRED/);
});

test('owner grants permit consolidated scope while explicit names still intersect', () => {
  expect(permittedMemberIds({ userId: 'owner', role: 'owner', authMethod: 'app-password' }, 'all')).toBeNull();
  expect(intersectPortfolios('a portfolio', ['A portfolio'])).toEqual(['A portfolio']);
  expect(intersectPortfolios('none', ['A portfolio'])).toEqual([]);
});
