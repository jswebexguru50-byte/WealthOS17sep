import test from 'node:test';import assert from 'node:assert/strict';
import {sourcePeriodEnd} from '../../src/server/services/SourcePeriod.js';
test('fiscal dates come from source period, never retrieval date',()=>{
 assert.equal(sourcePeriodEnd('Q2FY2026'),'2025-09-30');assert.equal(sourcePeriodEnd('FY2026'),'2026-03-31');
 assert.equal(sourcePeriodEnd(undefined),null);assert.equal(sourcePeriodEnd('Q5FY2026'),null);
});
