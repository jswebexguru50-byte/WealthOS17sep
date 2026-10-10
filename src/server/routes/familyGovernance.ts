import express, { Request, Response } from 'express';
import { getServerConfig, timingSafeMatch } from '../config.js';
import { dbAll, dbGet, dbRun, getDB } from '../database.js';

const router = express.Router();
const writeAuth = (req: Request, res: Response, next: express.NextFunction) => {
  const cfg = getServerConfig();
  if (!cfg.APP_PASSWORD || !timingSafeMatch(String(req.headers['x-app-password'] || ''), cfg.APP_PASSWORD)) return res.status(401).json({ success:false, error:'UNAUTHORIZED' });
  const role = String(req.headers['x-family-role'] || 'owner').toLowerCase();
  if (!['owner','admin'].includes(role)) return res.status(403).json({ success:false, error:'ROLE_FORBIDDEN' });
  (req as any).actor = String(req.headers['x-family-user'] || role);
  next();
};
const readAuth = (req: Request, res: Response, next: express.NextFunction) => {
  const cfg = getServerConfig();
  if (cfg.APP_PASSWORD && !timingSafeMatch(String(req.headers['x-app-password'] || ''), cfg.APP_PASSWORD)) return res.status(401).json({ success:false, error:'UNAUTHORIZED' });
  next();
};
router.get('/register', readAuth, async (req,res) => {
  const portfolio = String(req.query.portfolio || '').trim();
  if (!portfolio) return res.status(400).json({success:false,error:'PORTFOLIO_REQUIRED'});
  const rows = await dbAll(getDB(), 'SELECT * FROM family_governance_register WHERE portfolio = ? ORDER BY status, subject_type, id', [portfolio]);
  res.json({success:true, data:rows});
});
router.get('/register/:id/audit', readAuth, async (req,res) => {
  const rows = await dbAll(getDB(), 'SELECT * FROM family_governance_audit WHERE register_id = ? ORDER BY id', [Number(req.params.id)]);
  res.json({success:true, data:rows});
});
router.post('/register', writeAuth, async (req,res) => {
  const b=req.body||{}; const required=['portfolio','subject_type','subject_name','effective_from'];
  if (required.some(k=>!String(b[k]||'').trim()) || !['NOMINEE','JOINT_HOLDER','SUCCESSOR','TRUSTEE'].includes(String(b.subject_type).toUpperCase())) return res.status(400).json({success:false,error:'INVALID_REGISTER_ENTRY'});
  const db=getDB(); const type=String(b.subject_type).toUpperCase();
  const result=await dbRun(db, 'INSERT INTO family_governance_register (portfolio,subject_type,subject_name,relationship,contact_reference,allocation_percent,effective_from,effective_to,status,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [String(b.portfolio).trim(),type,String(b.subject_name).trim(),b.relationship||null,b.contact_reference||null,b.allocation_percent==null?null:Number(b.allocation_percent),b.effective_from,b.effective_to||null,b.status||'ACTIVE',b.notes||null,(req as any).actor]);
  const id=(result as any).lastID; await dbRun(db,'INSERT INTO family_governance_audit (register_id,action,actor,payload_json) VALUES (?,?,?,?)',[id,'CREATE',(req as any).actor,JSON.stringify(b)]);
  res.status(201).json({success:true,id});
});
router.patch('/register/:id', writeAuth, async (req,res) => {
  const id=Number(req.params.id), b=req.body||{}; const existing=await dbGet<any>(getDB(),'SELECT * FROM family_governance_register WHERE id = ?',[id]);
  if(!existing) return res.status(404).json({success:false,error:'NOT_FOUND'});
  const fields=['subject_name','relationship','contact_reference','allocation_percent','effective_from','effective_to','status','notes']; const vals=fields.map(f=>b[f]===undefined?existing[f]:b[f]);
  await dbRun(getDB(),`UPDATE family_governance_register SET ${fields.map(f=>`${f} = ?`).join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id = ?`,[...vals,id]);
  await dbRun(getDB(),'INSERT INTO family_governance_audit (register_id,action,actor,payload_json) VALUES (?,?,?,?)',[id,'UPDATE',(req as any).actor,JSON.stringify(b)]); res.json({success:true});
});
router.post('/register/:id/revoke', writeAuth, async (req,res) => { const id=Number(req.params.id); const r=await dbRun(getDB,"UPDATE family_governance_register SET status='REVOKED', effective_to=COALESCE(?,date('now')), updated_at=CURRENT_TIMESTAMP WHERE id=? AND status!='REVOKED'",[req.body?.effective_to||null,id]); if(!(r as any).changes)return res.status(404).json({success:false,error:'NOT_FOUND_OR_REVOKED'}); await dbRun(getDB,'INSERT INTO family_governance_audit (register_id,action,actor,payload_json) VALUES (?,?,?,?)',[id,'REVOKE',(req as any).actor,JSON.stringify(req.body||{})]); res.json({success:true}); });
export default router;

