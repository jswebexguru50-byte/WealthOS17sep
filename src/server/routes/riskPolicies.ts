import express, { Request, Response } from 'express';
import { getServerConfig } from '../config.js';
import { authenticateFamily, roleAllows } from '../auth/familyRoleAuth.js';
import { evaluateRiskPolicies, listRiskPolicies, upsertRiskPolicy, persistAlerts, listAlerts, evaluateIpsSnapshot } from '../services/RiskPolicyAlertService.js';
const router=express.Router();
function principal(req: Request,res: Response, required:'viewer'|'admin'='viewer') { const p=authenticateFamily(req.headers as any,getServerConfig().APP_PASSWORD); if(!p||!roleAllows(p,required)) { res.status(p?403:401).json({success:false,error:p?'ROLE_FORBIDDEN':'UNAUTHORIZED'}); return null;} return p; }
router.get('/policies',(req,res)=>{ if(!principal(req,res))return; listRiskPolicies().then(data=>res.json({success:true,data})).catch(()=>res.status(500).json({success:false,error:'RISK_POLICY_READ_FAILED'})); });
router.put('/policies',(req,res)=>{ const p=principal(req,res,'admin'); if(!p)return; const b=req.body||{}; if(!String(b.portfolio||'').trim())return res.status(400).json({success:false,error:'PORTFOLIO_REQUIRED'}); upsertRiskPolicy({portfolio:String(b.portfolio).trim(),max_single_asset_pct:b.max_single_asset_pct,max_equity_pct:b.max_equity_pct,max_daily_var_pct:b.max_daily_var_pct},p.userId).then(data=>res.json({success:true,data})).catch(()=>res.status(400).json({success:false,error:'RISK_POLICY_INVALID'})); });
router.get('/alerts',(req,res)=>{ if(!principal(req,res))return; listAlerts(req.query.portfolio?String(req.query.portfolio):undefined).then(data=>res.json({success:true,data})).catch(()=>res.status(500).json({success:false,error:'ALERT_READ_FAILED'})); });
router.post('/evaluate',(req,res)=>{ if(!principal(req,res))return; const b=req.body||{}; const holdings=Array.isArray(b.holdings)?b.holdings:[]; if(!b.policy||!holdings.every((h:any)=>h&&typeof h.symbol==='string'&&Number.isFinite(Number(h.value)))) return res.status(400).json({success:false,error:'POLICY_AND_HOLDINGS_REQUIRED'}); res.json({success:true,data:evaluateIpsSnapshot(b.policy,holdings)}); });
router.post('/alerts/evaluate',(req,res)=>{ const p=principal(req,res,'admin'); if(!p)return; evaluateRiskPolicies(req.body?.portfolio).then(async alerts=>{await persistAlerts(alerts);res.json({success:true,data:alerts,count:alerts.length});}).catch(()=>res.status(500).json({success:false,error:'ALERT_EVALUATION_FAILED'})); });
export default router;

