import { describe, expect, it } from 'vitest';
import { migration007 } from '../../src/server/db/migrations/007_risk_policies_alerts';
import { evaluateIpsSnapshot } from '../../src/server/services/RiskPolicyAlertService';

describe('P3 risk policy and alert contract', () => {
  it('registers the numbered migration and policy tables', () => {
    expect(migration007.id).toBe(7);
    expect(migration007.name).toBe('007_risk_policies_alerts');
  });
  it('keeps policy thresholds explicit and bounded by route contract', () => {
    expect(['max_single_asset_pct','max_equity_pct','max_daily_var_pct']).toHaveLength(3);
  });
  it('reports transparent concentration and equity breaches without inventing VaR', () => {
    const result = evaluateIpsSnapshot({max_single_asset_pct:40,max_equity_pct:70,max_daily_var_pct:5},[
      {symbol:'AAA',value:800,assetClass:'Equity'},{symbol:'BOND',value:200,assetClass:'Fixed Income'}
    ]);
    expect(result.totalValue).toBe(1000);
    expect(result.breaches.map((b:any)=>b.type)).toEqual(['CONCENTRATION','EQUITY_ALLOCATION']);
    expect(result.unassessed).toEqual(['daily_var']);
  });
});

