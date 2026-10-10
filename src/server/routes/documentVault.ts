import express, { Request, Response } from 'express';
import { dbAll, dbGet, dbRun, getDB } from '../database.js';
import { roleAllows, type FamilyPrincipal } from '../auth/familyRoleAuth.js';
import { validateStorageReference, validateSha256 } from '../documentVaultLifecycle.js';

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
  const rows=await dbAll(getDB(), 'SELECT *, CASE WHEN expires_on IS NULL THEN \'NO_EXPIRY\' WHEN expires_on < date(\'now\') THEN \'EXPIRED\' WHEN expires_on <= date(\'now\', \'+COALESCE(reminder_days,30) day\') THEN \'EXPIRING_SOON\' ELSE \'CURRENT\' END AS expiry_status FROM family_documents WHERE portfolio=? ORDER BY COALESCE(expires_on,\'9999-12-31\'),id',[portfolio]);
  res.json({success:true,data:rows});
});
router.post('/documents', writeAuth, async (req,res) => { const b=req.body||{}; const ref=validateStorageReference(b.storage_ref), hash=validateSha256(b.sha256); if(!b.portfolio||!b.title||!b.document_type||!ref|| (b.sha256&&!hash) || (b.issued_on&&!iso(b.issued_on)) || (b.expires_on&&!iso(b.expires_on)) || (b.size_bytes!=null && (!Number.isSafeInteger(b.size_bytes)||b.size_bytes<0)) || (b.reminder_days!=null && (!Number.isInteger(b.reminder_days)||b.reminder_days<0||b.reminder_days>3650))) return res.status(400).json({success:false,error:'INVALID_DOCUMENT_METADATA'}); const p=(req as any).actor; const r:any=await dbRun(getDB(),'INSERT INTO family_documents (portfolio,title,document_type,storage_ref,sha256,mime_type,size_bytes,issued_on,expires_on,status,notes,reminder_days,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[String(b.portfolio).trim(),String(b.title).trim(),String(b.document_type).trim(),ref,hash,b.mime_type||null,b.size_bytes??null,b.issued_on||null,b.expires_on||null,b.status||'ACTIVE',b.notes||null,b.reminder_days??30,p]); res.status(201).json({success:true,id:r.lastID}); });
router.patch('/documents/:id', writeAuth, async (req,res) => { const id=Number(req.params.id), b=req.body||{}; const old:any=await dbGet(getDB(),'SELECT * FROM family_documents WHERE id=?',[id]); if(!old)return res.status(404).json({success:false,error:'NOT_FOUND'}); const ref=b.storage_ref===undefined?old.storage_ref:validateStorageReference(b.storage_ref), hash=b.sha256===undefined?old.sha256:validateSha256(b.sha256); if(!ref||(b.sha256&& !hash)||(b.issued_on&&!iso(b.issued_on))||(b.expires_on&&!iso(b.expires_on))||(b.reminder_days!=null&&(!Number.isInteger(b.reminder_days)||b.reminder_days<0||b.reminder_days>3650)))return res.status(400).json({success:false,error:'INVALID_DOCUMENT_METADATA'}); const f=['title','document_type','storage_ref','sha256','mime_type','size_bytes','issued_on','expires_on','status','notes','reminder_days']; await dbRun(getDB(),`UPDATE family_documents SET ${f.map(x=>x+'=?').join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=?`,[...f.map(x=>x==='storage_ref'?ref:x==='sha256'?hash:b[x]===undefined?old[x]:b[x]),id]); res.json({success:true}); });
router.delete('/documents/:id', writeAuth, async (req,res) => { const r:any=await dbRun(getDB(),'UPDATE family_documents SET status=\'ARCHIVED\',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status!=\'ARCHIVED\'',[Number(req.params.id)]); if(!r.changes)return res.status(404).json({success:false,error:'NOT_FOUND'}); res.json({success:true}); });
router.get('/documents/reminders', readAuth, async (req,res) => { const portfolio=String(req.query.portfolio||'').trim(); if(!portfolio)return res.status(400).json({success:false,error:'PORTFOLIO_REQUIRED'}); const rows=await dbAll(getDB(), `SELECT id,title,document_type,expires_on,reminder_days,status FROM family_documents WHERE portfolio=? AND status='ACTIVE' AND expires_on IS NOT NULL AND expires_on <= date('now','+'||COALESCE(reminder_days,30)||' day') ORDER BY expires_on,id`, [portfolio]); res.json({success:true,data:rows}); });
router.get('/calendar', readAuth, async (req,res) => { const portfolio=String(req.query.portfolio||'').trim(); if(!portfolio)return res.status(400).json({success:false,error:'PORTFOLIO_REQUIRED'}); const rows=await dbAll(getDB(),`SELECT *, CASE WHEN status!='OPEN' THEN status WHEN due_on < date('now') THEN 'OVERDUE' WHEN due_on <= date('now','+30 day') THEN 'DUE_SOON' ELSE 'OPEN' END AS due_status FROM compliance_calendar WHERE portfolio=? ORDER BY due_on,id`,[portfolio]); res.json({success:true,data:rows}); });
router.post('/calendar', writeAuth, async(req,res)=>{const b=req.body||{};if(!b.portfolio||!b.title||!b.compliance_type||!iso(b.due_on))return res.status(400).json({success:false,error:'INVALID_COMPLIANCE_ITEM'});const r:any=await dbRun(getDB(),'INSERT INTO compliance_calendar (portfolio,title,compliance_type,due_on,recurrence,status,owner,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?)',[b.portfolio,b.title,b.compliance_type,b.due_on,b.recurrence||null,b.status||'OPEN',b.owner||null,b.notes||null,(req as any).actor]);res.status(201).json({success:true,id:r.lastID});});
router.patch('/calendar/:id',writeAuth,async(req,res)=>{const b=req.body||{}, id=Number(req.params.id);if(b.due_on&&!iso(b.due_on))return res.status(400).json({success:false,error:'INVALID_DATE'});const old:any=await dbGet(getDB(),'SELECT * FROM compliance_calendar WHERE id=?',[id]);if(!old)return res.status(404).json({success:false,error:'NOT_FOUND'});const f=['title','compliance_type','due_on','recurrence','status','owner','notes'];await dbRun(getDB(),`UPDATE compliance_calendar SET ${f.map(x=>x+'=?').join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=?`,[...f.map(x=>b[x]===undefined?old[x]:b[x]),id]);res.json({success:true});});
export default router;

