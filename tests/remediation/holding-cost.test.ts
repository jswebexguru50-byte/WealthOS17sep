import test from 'node:test';import assert from 'node:assert/strict';import {holdingCost} from '../../src/server/services/HoldingCost.js';
test('native cost does not undergo a second FX conversion; unknown historic FX remains unknown',()=>{
 const c=holdingCost({currency:'USD',quantity:1248.3672,native_total_cost:61375.24,total_cost:61375.24,acquisition_fx_rate:96.3});
 assert.ok(Math.abs(c.nativeAverage!-49.164412522)<.00001);assert.equal(c.costInINR,null);assert.equal(c.costQuality,'UNKNOWN_FX');
});
test('only evidenced historical FX determines foreign acquisition cost',()=>{
 const r={currency:'USD',quantity:2,native_total_cost:100,historic_fx_rate:75,historic_fx_source:'broker statement'};
 assert.equal(holdingCost(r).costInINR,7500);assert.equal(holdingCost({...r,current_fx_rate:99}).costInINR,7500);
 assert.equal(holdingCost({currency:'INR',quantity:100,total_cost:0}).costInINR,0);
});
