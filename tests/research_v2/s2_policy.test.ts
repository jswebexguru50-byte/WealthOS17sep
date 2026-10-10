import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleFact, readFacts } from '../../src/server/research_v2/facts/readPolicy.js';
const base:any={factId:'1',isin:'I',symbol:'S',scope:'CONSOLIDATED',metric:'pat_total',periodType:'DISCRETE_Q',periodStart:'2025-01-01',periodEnd:'2025-03-31',valueCr:1,unit:'INR_CR',sourceTier:'STATUTORY',source:'x',sourceRef:'x',availableAt:'2025-04-01T00:00:00Z',vintage:1,qualityFlags:[],quarantined:false};
test('read policy rejects quarantine, simulated, future and reconciliation failures',()=>{assert.equal(eligibleFact(base,'2025-05-01T00:00:00Z'),true); for(const change of [{quarantined:true},{sourceTier:'SIMULATED'},{availableAt:'2026-01-01T00:00:00Z'},{qualityFlags:['PERIOD_RECON_FAIL']}]) assert.equal(eligibleFact({...base,...change},'2025-05-01T00:00:00Z'),false);});
test('read policy excludes missing values and latest-only periods',()=>{assert.equal(eligibleFact({...base,valueCr:null},'2025-05-01T00:00:00Z'),false); assert.equal(eligibleFact({...base,periodType:'LATEST'},'2025-05-01T00:00:00Z'),false);});
test('read facts returns only eligible facts ordered by period',()=>{const rows=[{...base,periodEnd:'2025-03-31'},{...base,factId:'2',periodEnd:'2024-03-31'},{...base,factId:'3',quarantined:true}]; assert.deepEqual(readFacts(rows,'2025-05-01T00:00:00Z').map(f=>f.factId),['2','1']);});
