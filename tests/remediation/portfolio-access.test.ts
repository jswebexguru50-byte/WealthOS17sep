import test from 'node:test';
import assert from 'node:assert/strict';
import { permittedMemberIds, intersectPortfolios } from '../../src/server/auth/portfolioAccess.js';
import { authenticateFamily } from '../../src/server/auth/familyRoleAuth.js';
test('configured member grants survive authentication and reject impersonation', () => {
 const previous=process.env.FAMILY_AUTH_USERS;
 process.env.FAMILY_AUTH_USERS=JSON.stringify([{userId:'A',password:'fixture',role:'viewer',memberIds:[2]}]);
 try {
  const p=authenticateFamily({'x-app-user':'A','x-app-password':'fixture'});
  assert.deepEqual(permittedMemberIds(p),[2]);
  assert.throws(()=>permittedMemberIds(p,1),/MEMBER_FORBIDDEN/);
  assert.deepEqual(permittedMemberIds(p,'all'),[2]);
  assert.deepEqual(intersectPortfolios(['B portfolio','A portfolio'],['A portfolio']),['A portfolio']);
  assert.deepEqual(intersectPortfolios('B portfolio',['A portfolio']),[]);
 } finally { if(previous===undefined)delete process.env.FAMILY_AUTH_USERS;else process.env.FAMILY_AUTH_USERS=previous; }
});
test('ungranted users and anonymous requests fail closed',()=>{
 assert.throws(()=>permittedMemberIds(null),/UNAUTHORIZED/);
 assert.throws(()=>permittedMemberIds({userId:'A',role:'admin',authMethod:'family-role'}),/MEMBER_GRANT_REQUIRED/);
});
test('owner grants permit consolidated scope while explicit names still intersect',()=>{
 assert.equal(permittedMemberIds({userId:'owner',role:'owner',authMethod:'app-password'},'all'),null);
 assert.deepEqual(intersectPortfolios('a portfolio',['A portfolio']),['A portfolio']);
 assert.deepEqual(intersectPortfolios('none',['A portfolio']),[]);
});
