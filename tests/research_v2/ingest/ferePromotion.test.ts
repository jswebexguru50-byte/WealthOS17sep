import test from 'node:test'; import assert from 'node:assert/strict';
import { promoteVerifiedMetrics } from '../../../src/server/research_v2/ingest/ferePromotion.js';
const base = { isin:'INE849B01010', symbol:'YUKEN', metric:'beneish_m', value:1.2, periodStart:'2024-04-01', periodEnd:'2025-03-31', scope:'CONSOLIDATED', availableAt:'2026-10-10T10:00:00Z', inputFactIds:['f1'], filingHashes:['h1'] };
test('promotes only fully evidenced verified metric rows', () => { const r=promoteVerifiedMetrics([base]); assert.equal(r.facts.length,1); assert.equal(r.facts[0].sourceTier,'PROVIDER_VERIFIED'); assert.equal(r.facts[0].unit,'RATIO'); assert.deepEqual(r.rejected,[]); });
test('rejects rows without period or provenance instead of inventing facts', () => { const r=promoteVerifiedMetrics([{...base, periodStart:null}, {...base, inputFactIds:[]}]); assert.equal(r.facts.length,0); assert.deepEqual(r.rejected.map(x=>x.reason),['MISSING_PERIOD_START','MISSING_PROVENANCE']); });
