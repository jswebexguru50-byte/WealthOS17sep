import { dbAll, dbGet, dbRun, getDB } from '../database.js';

export type RiskPolicy = { portfolio: string; max_single_asset_pct?: number|null; max_equity_pct?: number|null; max_daily_var_pct?: number|null; enabled?: number };
export async function listRiskPolicies() { return dbAll(getDB(), 'SELECT * FROM portfolio_risk_policies ORDER BY portfolio'); }
export async function upsertRiskPolicy(policy: RiskPolicy, actor: string) {
  const values = [policy.portfolio, policy.max_single_asset_pct ?? null, policy.max_equity_pct ?? null, policy.max_daily_var_pct ?? null, actor];
  await dbRun(getDB(), `INSERT INTO portfolio_risk_policies (portfolio,max_single_asset_pct,max_equity_pct,max_daily_var_pct,created_by) VALUES (?,?,?,?,?)
    ON CONFLICT(portfolio) DO UPDATE SET max_single_asset_pct=excluded.max_single_asset_pct,max_equity_pct=excluded.max_equity_pct,max_daily_var_pct=excluded.max_daily_var_pct,updated_at=CURRENT_TIMESTAMP`, values);
  return dbGet(getDB(), 'SELECT * FROM portfolio_risk_policies WHERE portfolio=?', [policy.portfolio]);
}
export async function evaluateRiskPolicies(portfolio?: string) {
  const policies: any[] = await dbAll(getDB(), portfolio ? 'SELECT * FROM portfolio_risk_policies WHERE enabled=1 AND portfolio=?' : 'SELECT * FROM portfolio_risk_policies WHERE enabled=1', portfolio ? [portfolio] : []);
  const alerts: any[] = [];
  for (const p of policies) {
    const hs: any[] = await dbAll(getDB(), 'SELECT symbol,current_value,total_cost FROM Holdings WHERE portfolio=? AND quantity>0', [p.portfolio]);
    const total = hs.reduce((s,h)=>s+Number(h.current_value||h.total_cost||0),0);
    for (const h of hs) {
      const value=Number(h.current_value||h.total_cost||0), weight=total ? value/total*100 : 0;
      if (p.max_single_asset_pct != null && weight > Number(p.max_single_asset_pct)) alerts.push({portfolio:p.portfolio,symbol:h.symbol,alert_type:'CONCENTRATION',severity:'WARNING',message:`${h.symbol} is ${weight.toFixed(2)}% of portfolio`,observed_value:weight,threshold_value:p.max_single_asset_pct});
    }
  }
  return alerts;
}
export async function persistAlerts(alerts: any[]) { for (const a of alerts) await dbRun(getDB(), 'INSERT INTO portfolio_alerts (portfolio,symbol,alert_type,severity,message,observed_value,threshold_value) VALUES (?,?,?,?,?,?,?)', [a.portfolio,a.symbol||null,a.alert_type,a.severity,a.message,a.observed_value??null,a.threshold_value??null]); return alerts.length; }
export async function listAlerts(portfolio?: string) { return dbAll(getDB(), portfolio ? 'SELECT * FROM portfolio_alerts WHERE portfolio=? ORDER BY id DESC LIMIT 100' : 'SELECT * FROM portfolio_alerts ORDER BY id DESC LIMIT 100', portfolio ? [portfolio] : []); }

