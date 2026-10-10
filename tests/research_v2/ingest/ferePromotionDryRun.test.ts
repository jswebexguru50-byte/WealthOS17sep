import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRows } from '../../../scripts/research_v2/fere_promotion_dry_run.js';
test('FERE promotion dry-run reports complete verified rows and rejects incomplete DB rows', () => {
    const r=auditRows([{isin:'INE000A01001',symbol:'YUKEN',metric:'beneish_m',value:1.2,periodStart:'2025-04-01',periodEnd:'2026-03-31',scope:'CONSOLIDATED',inputFactIds:['f1'],filingHashes:['h1'],availableAt:'2026-10-10T00:00:00Z'},{isin:'INE000A01001',symbol:'YUKEN',metric:'beneish_m',value:1.1,periodEnd:'2026-03-31'}]);
    assert.deepEqual(r.totals,{rows:2,promoted:1,rejected:1}); assert.ok(r.symbols.find(s=>s.symbol==='YUKEN')?.rejectionReasons.includes('INVALID_SCOPE'));
});
test('FERE promotion dry-run keeps all six symbols visible when the DB has no verified rows', () => { const r=auditRows([]); assert.equal(r.symbols.length,6); assert.equal(r.totals.promoted,0); });
