import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findUpstoxIndex } from '../../src/server/services/dataenrichment/DataAcquisitionContract.js';
const index={name:'Nifty 50',trading_symbol:'NIFTY',segment:'NSE_INDEX',exchange:'NSE',instrument_type:'INDEX',instrument_key:'NSE_INDEX|Nifty 50'};
test('matches index by case-insensitive name and trading symbol',()=>{
 assert.equal(findUpstoxIndex([index],'NIFTY 50')?.instrument_key,index.instrument_key);
 assert.equal(findUpstoxIndex([index],'nifty')?.instrument_key,index.instrument_key);
});
test('excludes other segments and rejects ambiguous identities',()=>{
 assert.equal(findUpstoxIndex([{...index,segment:'NSE_EQ'}],'Nifty 50'),null);
 assert.equal(findUpstoxIndex([{...index,instrument_key:1}],'Nifty 50'),null);
 assert.throws(()=>findUpstoxIndex([index,index],'Nifty 50'),/Ambiguous/);
 assert.throws(()=>findUpstoxIndex({},'Nifty 50'),/schema/);
});
