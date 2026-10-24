import test from 'node:test';import assert from 'node:assert/strict';
import {canDisplayFinancialResult,COST_BASIS_LABELS,type FinancialResultContract} from '../../src/types/FinancialResultContract.js';
test('missing provenance suppresses financial results',()=>{
 const c:FinancialResultContract={portfolioIds:['cc9'],memberScope:'member:1',valuationAsOf:'2026-10-23',currency:'INR',costBasis:'pms_entry_market',costBasisLabel:COST_BASIS_LABELS.pms_entry_market,ledgerRevision:'fixture',dataQuality:'CERTIFIED',uncertifiedFields:[],computedAt:'2026-10-24T00:00:00Z'};
 assert.equal(canDisplayFinancialResult(c),true);assert.equal(canDisplayFinancialResult({...c,ledgerRevision:null}),false);assert.equal(canDisplayFinancialResult({...c,valuationAsOf:null}),false);
 assert.notEqual(COST_BASIS_LABELS.remaining_pms_cost,COST_BASIS_LABELS.remaining_original_cost);
});
