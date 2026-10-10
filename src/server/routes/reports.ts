/**
 * src/server/routes/reports.ts
 * Institutional Reports Engine routes
 */
import { Router } from 'express';
import { ReportsService } from '../services/ReportsService.js';
import { authenticateFamily, roleAllows } from '../auth/familyRoleAuth.js';
import { getServerConfig } from '../config.js';
import { dbAll, dbRun, getDB } from '../database.js';

const router = Router();

const REPORT_TYPES = new Set([
  'CAPITAL_GAINS', 'TRADE_BOOK', 'DIVIDEND_INCOME', 'DIVIDEND_STATEMENT',
  'ASSET_XIRR', 'ASSET_ALLOCATION', 'PERFORMANCE_SUMMARY', 'HOLDING_STATEMENT'
]);
const isIsoDate = (value: unknown): boolean => value == null || value === '' ||
  (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
const auth = (write = false) => (req: any, res: any, next: any) => {
  const principal = authenticateFamily(req.headers, getServerConfig().APP_PASSWORD);
  if (!principal) return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
  if (write && !roleAllows(principal, 'editor')) return res.status(403).json({ success: false, error: 'ROLE_FORBIDDEN' });
  req.familyPrincipal = principal; next();
};

router.get('/catalog', auth(), (_req, res) => {
  res.json({ success: true, reports: Array.from(REPORT_TYPES).map(reportType => ({ reportType })) });
});
router.get('/history', auth(), async (req: any, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
  const rows = await dbAll(getDB(), 'SELECT id,report_type,portfolio,financial_year,start_date,end_date,status,created_by,created_at FROM report_runs ORDER BY id DESC LIMIT ?', [limit]);
  res.json({ success: true, reports: rows });
});

// POST /api/reports/generate
router.post('/generate', auth(true), async (req: any, res) => {
  try {
    const { reportType, portfolio, financialYear, startDate, endDate, assetClass, includeGrandfathering } = req.body;
    const normalizedType = String(reportType || 'HOLDING_STATEMENT').toUpperCase();
    if (!REPORT_TYPES.has(normalizedType)) {
      return res.status(400).json({ success: false, error: 'INVALID_REPORT_TYPE' });
    }
    if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
      return res.status(400).json({ success: false, error: 'INVALID_TRADE_DATE' });
    }
    const svc = ReportsService.getInstance();
    let data: any;

    switch (normalizedType) {
      case 'CAPITAL_GAINS':
        data = await svc.generateCapitalGainsReport({ reportType: normalizedType, portfolio, financialYear, startDate, endDate, includeGrandfathering });
        break;
      case 'TRADE_BOOK':
        data = await svc.generateTradeBook({ reportType: normalizedType, portfolio, financialYear, startDate, endDate });
        break;
      case 'DIVIDEND_INCOME':
      case 'DIVIDEND_STATEMENT':
        data = await svc.generateDividendReport({ reportType: 'DIVIDEND_STATEMENT', portfolio, financialYear, startDate, endDate });
        break;
      case 'ASSET_XIRR':
        data = await svc.generateAssetWiseXirrReport({ reportType: 'ASSET_XIRR', portfolio, financialYear, startDate, endDate });
        break;
      case 'ASSET_ALLOCATION':
      case 'PERFORMANCE_SUMMARY':
        data = await svc.generateAssetAllocationReport({ reportType: 'PERFORMANCE_SUMMARY', portfolio, financialYear, startDate, endDate });
        break;
      default:
        data = await svc.generateHoldingsStatement({ reportType: 'HOLDING_STATEMENT', portfolio, assetClass });
    }

    await dbRun(getDB(), 'INSERT INTO report_runs (report_type,portfolio,financial_year,start_date,end_date,request_json,created_by) VALUES (?,?,?,?,?,?,?)', [normalizedType, portfolio || null, financialYear || null, startDate || null, endDate || null, JSON.stringify({ reportType: normalizedType, assetClass: assetClass || null }), req.familyPrincipal.userId]);
    res.json(data);
  } catch (err: any) {
    console.error('Reports generation failed:', err);
    const status = String(err?.message || '').startsWith('INVALID_FINANCIAL_YEAR') ||
      String(err?.message || '').startsWith('INVALID_TRADE_DATE') ? 400 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

export default router;

const FREQUENCIES = new Set(['DAILY', 'WEEKLY', 'MONTHLY']);
const DELIVERY_MODES = new Set(['DOWNLOAD_ONLY', 'EMAIL_PENDING']);
const scheduleIso = (v: unknown): boolean => typeof v === 'string' && !Number.isNaN(Date.parse(v));
function scheduleBody(body: any) {
  const reportType = String(body?.reportType || '').toUpperCase();
  const frequency = String(body?.frequency || '').toUpperCase();
  const deliveryMode = String(body?.deliveryMode || 'DOWNLOAD_ONLY').toUpperCase();
  const nextRunAt = body?.nextRunAt;
  if (!REPORT_TYPES.has(reportType)) return { error: 'INVALID_REPORT_TYPE' };
  if (!FREQUENCIES.has(frequency)) return { error: 'INVALID_FREQUENCY' };
  if (!DELIVERY_MODES.has(deliveryMode)) return { error: 'INVALID_DELIVERY_MODE' };
  if (!scheduleIso(nextRunAt)) return { error: 'INVALID_NEXT_RUN_AT' };
  if (deliveryMode === 'EMAIL_PENDING' && (!body?.recipientRef || String(body.recipientRef).length > 200)) return { error: 'INVALID_RECIPIENT_REFERENCE' };
  return { value: { reportType, frequency, deliveryMode, nextRunAt: new Date(nextRunAt).toISOString(), portfolio: body?.portfolio ? String(body.portfolio).slice(0, 200) : null, timezone: String(body?.timezone || 'UTC').slice(0, 64), recipientRef: body?.recipientRef ? String(body.recipientRef).slice(0, 200) : null } };
}
router.get('/schedules', auth(), async (req: any, res) => {
  const rows = await dbAll(getDB(), 'SELECT * FROM report_schedules WHERE created_by = ? OR ? >= 2 ORDER BY next_run_at ASC', [req.familyPrincipal.userId, req.familyPrincipal.role === 'admin' || req.familyPrincipal.role === 'owner' ? 2 : 0]);
  res.json({ success: true, schedules: rows.map((r: any) => ({ ...r, due: r.status === 'ACTIVE' && Date.parse(r.next_run_at) <= Date.now() })) });
});
router.post('/schedules', auth(true), async (req: any, res) => {
  if (!roleAllows(req.familyPrincipal, 'admin')) return res.status(403).json({ success: false, error: 'ROLE_FORBIDDEN' });
  const parsed = scheduleBody(req.body); if (parsed.error) return res.status(400).json({ success: false, error: parsed.error });
  const v = parsed.value!;
  const result: any = await dbRun(getDB(), 'INSERT INTO report_schedules (report_type,portfolio,frequency,timezone,next_run_at,delivery_mode,recipient_ref,created_by) VALUES (?,?,?,?,?,?,?,?)', [v.reportType,v.portfolio,v.frequency,v.timezone,v.nextRunAt,v.deliveryMode,v.recipientRef,req.familyPrincipal.userId]);
  res.status(201).json({ success: true, id: result.lastID });
});
router.patch('/schedules/:id', auth(true), async (req: any, res) => {
  if (!roleAllows(req.familyPrincipal, 'admin')) return res.status(403).json({ success: false, error: 'ROLE_FORBIDDEN' });
  const id = Number(req.params.id); if (!Number.isInteger(id)) return res.status(400).json({ success: false, error: 'INVALID_ID' });
  const current: any = await (await import('../database.js')).dbGet(getDB(), 'SELECT * FROM report_schedules WHERE id = ?', [id]);
  if (!current) return res.status(404).json({ success: false, error: 'NOT_FOUND' });
  const merged = { ...current, ...req.body, reportType: req.body.reportType || current.report_type, frequency: req.body.frequency || current.frequency, nextRunAt: req.body.nextRunAt || current.next_run_at, deliveryMode: req.body.deliveryMode || current.delivery_mode, recipientRef: req.body.recipientRef ?? current.recipient_ref, portfolio: req.body.portfolio ?? current.portfolio, timezone: req.body.timezone || current.timezone };
  const parsed = scheduleBody(merged); if (parsed.error) return res.status(400).json({ success: false, error: parsed.error }); const v=parsed.value!;
  const status = req.body.status ? String(req.body.status).toUpperCase() : current.status; if (!['ACTIVE','PAUSED'].includes(status)) return res.status(400).json({success:false,error:'INVALID_STATUS'});
  await dbRun(getDB(), 'UPDATE report_schedules SET report_type=?,portfolio=?,frequency=?,timezone=?,next_run_at=?,delivery_mode=?,recipient_ref=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', [v.reportType,v.portfolio,v.frequency,v.timezone,v.nextRunAt,v.deliveryMode,v.recipientRef,status,id]);
  res.json({ success: true });
});
router.delete('/schedules/:id', auth(true), async (req: any, res) => {
  if (!roleAllows(req.familyPrincipal, 'admin')) return res.status(403).json({ success: false, error: 'ROLE_FORBIDDEN' });
  const id=Number(req.params.id); const result:any=await dbRun(getDB(),'DELETE FROM report_schedules WHERE id=?',[id]); if(!result.changes)return res.status(404).json({success:false,error:'NOT_FOUND'}); res.json({success:true});
});
router.post('/schedules/:id/run', auth(true), async (req: any, res) => {
  if (!roleAllows(req.familyPrincipal, 'admin')) return res.status(403).json({ success: false, error: 'ROLE_FORBIDDEN' });
  const id=Number(req.params.id); const row:any=await (await import('../database.js')).dbGet(getDB(),'SELECT * FROM report_schedules WHERE id=?',[id]); if(!row)return res.status(404).json({success:false,error:'NOT_FOUND'}); if(row.status!=='ACTIVE')return res.status(409).json({success:false,error:'SCHEDULE_PAUSED'});
  await dbRun(getDB(),'UPDATE report_schedules SET last_run_at=CURRENT_TIMESTAMP,last_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',['QUEUED_NO_EXTERNAL_DELIVERY',id]);
  res.status(202).json({success:true,status:'QUEUED_NO_EXTERNAL_DELIVERY',message:'Report generation is queued; external email delivery is disabled by policy.'});
});

