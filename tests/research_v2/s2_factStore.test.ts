import test from 'node:test';
import assert from 'node:assert/strict';
import { CanonicalFactStore } from '../../src/server/research_v2/facts/factStore.js';
const fact:any=(id:string,value:number,availableAt='2025-04-01T00:00:00Z')=>({factId:id,isin:'I',symbol:'S',scope:'CONSOLIDATED',metric:'pat_total',periodType:'DISCRETE_Q',periodStart:'2025-01-01',periodEnd:'2025-03-31',valueCr:value,unit:'INR_CR',sourceTier:'STATUTORY',source:'XBRL',sourceRef:id,availableAt,vintage:1,qualityFlags:[],quarantined:false});
test('new values create immutable vintages and retain conflicts',()=>{const s=new CanonicalFactStore(); assert.equal(s.add(fact('a',1)).vintage,1); const b=s.add(fact('b',2,'2025-05-01T00:00:00Z')); assert.equal(b.vintage,2); assert.deepEqual(s.allConflicts()[0].facts,['a','b']);});
test('as-of reads return the latest available vintage',()=>{const s=new CanonicalFactStore(); s.add(fact('a',1)); s.add(fact('b',2,'2025-05-01T00:00:00Z')); assert.equal(s.read('I','2025-04-15T00:00:00Z')[0].valueCr,1); assert.equal(s.read('I','2025-06-01T00:00:00Z')[0].valueCr,2);});
