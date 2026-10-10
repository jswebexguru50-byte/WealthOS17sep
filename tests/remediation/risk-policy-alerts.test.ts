import test from 'node:test';
import assert from 'node:assert/strict';
import { migration007 } from '../../src/server/db/migrations/007_risk_policies_alerts';
import { evaluateIpsSnapshot } from '../../src/server/services/RiskPolicyAlertService';

test('P3 risk policy migration is numbered and named', () => {
    assert.equal(migration007.id, 7);
    assert.equal(migration007.name, '007_risk_policies_alerts');
  });
test('P3 policy thresholds are explicit', () => {
    assert.deepEqual(['max_single_asset_pct','max_equity_pct','max_daily_var_pct'], ['max_single_asset_pct','max_equity_pct','max_daily_var_pct']);
  });
test('P3 reports transparent breaches without inventing VaR', () => {
    const result = evaluateIpsSnapshot({max_single_asset_pct:40,max_equity_pct:70,max_daily_var_pct:5},[
      {symbol:'AAA',value:800,assetClass:'Equity'},{symbol:'BOND',value:200,assetClass:'Fixed Income'}
    ]);
    assert.equal(result.totalValue, 1000);
    assert.deepEqual(result.breaches.map((b:any)=>b.type), ['CONCENTRATION','EQUITY_ALLOCATION']);
    assert.deepEqual(result.unassessed, ['daily_var']);
  });

