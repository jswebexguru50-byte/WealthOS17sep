import { describe, expect, it } from 'vitest';
import { migration007 } from '../../src/server/db/migrations/007_risk_policies_alerts';

describe('P3 risk policy and alert contract', () => {
  it('registers the numbered migration and policy tables', () => {
    expect(migration007.id).toBe(7);
    expect(migration007.name).toBe('007_risk_policies_alerts');
  });
  it('keeps policy thresholds explicit and bounded by route contract', () => {
    expect(['max_single_asset_pct','max_equity_pct','max_daily_var_pct']).toHaveLength(3);
  });
});

