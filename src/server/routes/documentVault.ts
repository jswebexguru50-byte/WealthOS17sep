import express, { Request, Response } from 'express';
import { dbAll, dbGet, dbRun, getDB } from '../database.js';
import { roleAllows, type FamilyPrincipal } from '../auth/familyRoleAuth.js';

const router = express.Router();
function principal(req: Request): FamilyPrincipal | null {
  const p = (req as any).auth as FamilyPrincipal | undefined;
  if (p) return p;
  const role = String(req.headers['x-family-role'] || 'owner').toLowerCase() as FamilyPrincipal['role'];
  const userId = String(req.headers['x-family-user'] || 'app-password-owner');
  return ['owner','admin'].includes(role) && req.headers['x-app-password'] ? { userId, role, authMethod: 'app-password' } : null;
}
function readAuth(req: Request, res: Response, next: express.NextFunction) {
  if (!principal(req)) return res.status(401).json({ success:false, error:'UNAUTHORIZED' });
  next();
}
function writeAuth(req: Request, res: Response, next: express.NextFunction) {
  const p = principal(req); if (!p || !roleAllows(p, 'admin')) return res.status(403).json({ success:false, error:'ROLE_FORBIDDEN' });
  (req as any).actor = p.userId; next();
}
const iso = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
router.get('/documents', readAuth, async (req,res) => {
  const portfolio=String(req.query.portfolio||'').trim(); if(!portfolio)return res.status(400).json({success:false,error:'PORTFOLIO_REQUIRED'});
  const rows=await dbAll(getDB(), 'SELECT id,portfolio,title,document_type,storage_ref,sha256,issued_on,expires_on,status,notes,created_by,created_at,updated_at, CASE WHEN expires_on IS NULL THEN \'NO_EXPIRY\' WHEN expires_on < date(\'now\') THEN \'EXPIRED\' WHEN expires_on <= date(\'now\', \'+30 day\') THEN \'EXPIRING_SOON\' ELSE \'CURRENT\' END AS expiry_status FROM family_documents WHERE portfolio=? ORDER BY COALESCE(expires_on,\'9999-12-31\'),id',[portfolio]);
  res.json({success:true,data:rows});
});
router.post('/documents', writeAuth, async (req,res) => { const b=req.body||{}; if(!b.portfolio||!b.title||!b.document_type||!b.storage_ref|| (b.issued_on&&!iso(b.issued_on)) || (b.expires_on&&!iso(b.expires_on))) return res.status(400).json({success:false,error:'INVALID_DOCUMENT_METADATA'}); const p=(req as any).actor; const r:any=await dbRun(getDB(),'INSERT INTO family_documents (portfolio,title,document_type,storage_ref,sha256,issued_on,expires_on,status,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)',[String(b.portfolio).trim(),String(b.title).trim(),String(b.document_type).trim(),String(b.storage_ref).trim(),b.sha256||null,b.issued_on||null,b.expires_on||null,b.status||'ACTIVE',b.notes||null,p]); res.status(201).json({success:true,id:r.lastID}); });
router.patch('/documents/:id', writeAuth, async (req,res) => { const id=Number(req.params.id), b=req.body||{}; const old:any=await dbGet(getDB(),'SELECT * FROM family_documents WHERE id=?',[id]); if(!old)return res.status(404).json({success:false,error:'NOT_FOUND'}); if((b.issued_on&&!iso(b.issued_on))||(b.expires_on&&!iso(b.expires_on)))return res.status(400).json({success:false,error:'INVALID_DATE'}); const f=['title','document_type','storage_ref','sha256','issued_on','expires_on','status','notes']; await dbRun(getDB(),`UPDATE family_documents SET ${f.map(x=>x+'=?').join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=?`,[...f.map(x=>b[x]===undefined?old[x]:b[x]),id]); res.json({success:true}); });
router.delete('/documents/:id', writeAuth, async (req,res) => { const r:any=await dbRun(getDB(),'UPDATE family_documents SET status=\'ARCHIVED\',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status!=\'ARCHIVED\'',[Number(req.params.id)]); if(!r.changes)return res.status(404).json({success:false,error:'NOT_FOUND'}); res.json({success:true}); });
router.get('/calendar', readAuth, async (req,res) => { const portfolio=String(req.query.portfolio||'').trim(); if(!portfolio)return res.status(400).json({success:false,error:'PORTFOLIO_REQUIRED'}); const rows=await dbAll(getDB(),`SELECT *, CASE WHEN status!='OPEN' THEN status WHEN due_on < date('now') THEN 'OVERDUE' WHEN due_on <= date('now','+30 day') THEN 'DUE_SOON' ELSE 'OPEN' END AS due_status FROM compliance_calendar WHERE portfolio=? ORDER BY due_on,id`,[portfolio]); res.json({success:true,data:rows}); });
router.post('/calendar', writeAuth, async(req,res)=>{const b=req.body||{};if(!b.portfolio||!b.title||!b.compliance_type||!iso(b.due_on))return res.status(400).json({success:false,error:'INVALID_COMPLIANCE_ITEM'});const r:any=await dbRun(getDB(),'INSERT INTO compliance_calendar (portfolio,title,compliance_type,due_on,recurrence,status,owner,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?)',[b.portfolio,b.title,b.compliance_type,b.due_on,b.recurrence||null,b.status||'OPEN',b.owner||null,b.notes||null,(req as any).actor]);res.status(201).json({success:true,id:r.lastID});});
router.patch('/calendar/:id',writeAuth,async(req,res)=>{const b=req.body||{}, id=Number(req.params.id);if(b.due_on&&!iso(b.due_on))return res.status(400).json({success:false,error:'INVALID_DATE'});const old:any=await dbGet(getDB(),'SELECT * FROM compliance_calendar WHERE id=?',[id]);if(!old)return res.status(404).json({success:false,error:'NOT_FOUND'});const f=['title','compliance_type','due_on','recurrence','status','owner','notes'];await dbRun(getDB(),`UPDATE compliance_calendar SET ${f.map(x=>x+'=?').join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=?`,[...f.map(x=>b[x]===undefined?old[x]:b[x]),id]);res.json({success:true});});
export default router;

