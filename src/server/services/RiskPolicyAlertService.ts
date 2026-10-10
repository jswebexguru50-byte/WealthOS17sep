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
    const hs: any[] = await dbAll(getDB(), `SELECT h.symbol,h.isin,h.current_value,h.total_cost,
      COALESCE(m.asset_class,'Unknown') AS asset_class, COALESCE(m.sector,'Unknown') AS sector
      FROM Holdings h LEFT JOIN MasterTickers m ON m.isin=h.isin
      WHERE h.portfolio=? AND h.quantity>0`, [p.portfolio]);
    const total = hs.reduce((s,h)=>s+Number(h.current_value||h.total_cost||0),0);
    if (!total) continue;
    const equityValue = hs.filter(h => String(h.asset_class).toLowerCase() === 'equity')
      .reduce((s,h)=>s+Number(h.current_value||h.total_cost||0),0);
    if (p.max_equity_pct != null) {
      const equityWeight = equityValue / total * 100;
      if (equityWeight > Number(p.max_equity_pct)) alerts.push({portfolio:p.portfolio,symbol:null,alert_type:'EQUITY_ALLOCATION',severity:severityFor(equityWeight, Number(p.max_equity_pct)),message:`Equity allocation is ${equityWeight.toFixed(2)}% of portfolio`,observed_value:equityWeight,threshold_value:p.max_equity_pct});
    }
    for (const h of hs) {
      const value=Number(h.current_value||h.total_cost||0), weight=total ? value/total*100 : 0;
      if (p.max_single_asset_pct != null && weight > Number(p.max_single_asset_pct)) alerts.push({portfolio:p.portfolio,symbol:h.symbol,alert_type:'CONCENTRATION',severity:severityFor(weight, Number(p.max_single_asset_pct)),message:`${h.symbol} is ${weight.toFixed(2)}% of portfolio`,observed_value:weight,threshold_value:p.max_single_asset_pct});
    }
    // No volatility/ADV inputs exist in Holdings. Never invent a VaR or liquidity result.
    if (p.max_daily_var_pct != null) alerts.push({portfolio:p.portfolio,symbol:null,alert_type:'VAR_UNASSESSED',severity:'INFO',message:'Daily VaR not assessed: no point-in-time return series was supplied',observed_value:null,threshold_value:p.max_daily_var_pct});
  }
  return alerts;
}
function severityFor(observed: number, threshold: number): 'WARNING'|'CRITICAL' { return observed > threshold * 1.25 ? 'CRITICAL' : 'WARNING'; }

/** Pure, deterministic IPS evaluation for API clients and tests. */
export function evaluateIpsSnapshot(policy: Pick<RiskPolicy,'max_single_asset_pct'|'max_equity_pct'|'max_daily_var_pct'>, holdings: Array<{symbol:string; value:number; assetClass?:string}>) {
  const total = holdings.reduce((s,h)=>s + Math.max(0, Number(h.value)||0), 0);
  if (!total) return { totalValue: 0, breaches: [], unassessed: ['equity','daily_var'] };
  const breaches: any[] = [];
  for (const h of holdings) { const weight = Math.max(0, Number(h.value)||0) / total * 100; if (policy.max_single_asset_pct != null && weight > Number(policy.max_single_asset_pct)) breaches.push({type:'CONCENTRATION',symbol:h.symbol,observed:weight,threshold:Number(policy.max_single_asset_pct),severity:severityFor(weight,Number(policy.max_single_asset_pct))}); }
  const equity = holdings.filter(h=>String(h.assetClass||'').toLowerCase()==='equity').reduce((s,h)=>s+Math.max(0,Number(h.value)||0),0)/total*100;
  if (policy.max_equity_pct != null && equity > Number(policy.max_equity_pct)) breaches.push({type:'EQUITY_ALLOCATION',observed:equity,threshold:Number(policy.max_equity_pct),severity:severityFor(equity,Number(policy.max_equity_pct))});
  return { totalValue: total, breaches, equityWeight: equity, unassessed: policy.max_daily_var_pct != null ? ['daily_var'] : [] };
}
export async function persistAlerts(alerts: any[]) { for (const a of alerts) await dbRun(getDB(), 'INSERT INTO portfolio_alerts (portfolio,symbol,alert_type,severity,message,observed_value,threshold_value) VALUES (?,?,?,?,?,?,?)', [a.portfolio,a.symbol||null,a.alert_type,a.severity,a.message,a.observed_value??null,a.threshold_value??null]); return alerts.length; }
export async function listAlerts(portfolio?: string) { return dbAll(getDB(), portfolio ? 'SELECT * FROM portfolio_alerts WHERE portfolio=? ORDER BY id DESC LIMIT 100' : 'SELECT * FROM portfolio_alerts ORDER BY id DESC LIMIT 100', portfolio ? [portfolio] : []); }

