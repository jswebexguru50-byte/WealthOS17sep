import test from 'node:test';import assert from 'node:assert/strict';
import {credentialMetadata,isCredentialConfigKey} from '../../src/server/auth/credentialMetadata.js';
test('secret reads return metadata only',()=>{
 const token='x.'+Buffer.from(JSON.stringify({exp:1800000000})).toString('base64url')+'.secret';
 const m=credentialMetadata(token);assert.equal(m.status,'SET');assert.ok(m.expiresAt);assert.ok(!JSON.stringify(m).includes(token));
 assert.deepEqual(credentialMetadata(''),{status:'NOT_SET',expiresAt:null});
 assert.deepEqual(credentialMetadata('opaque-secret'),{status:'SET',expiresAt:null});
});
test('generic config cannot expose alternate secret keys',()=>{
 for(const key of ['Access_Token','Upstox_Client_Secret','ALPACA_API_KEY','app_password'])assert.ok(isCredentialConfigKey(key));
 assert.equal(isCredentialConfigKey('dividend_cc9'),false);
});
