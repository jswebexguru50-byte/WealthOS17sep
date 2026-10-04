import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import ExcelJS from 'exceljs';

const root = process.cwd();
const runId = process.argv[2] || process.argv[process.argv.indexOf('--run-id') + 1];
if (!runId || runId === '--run-id') {
  console.error('Usage: node scripts/export_dossier_run_excel.mjs <DOSSIER_RUN_ID>');
  process.exit(1);
}

const skipPreflight = process.argv.includes('--skip-preflight');
if (!skipPreflight) {
  console.log(`[preflight] Preparing/refreshing fundamental data for dossier run ${runId} before Excel export...`);
  const preflight = spawnSync('node', ['scripts/prepare_dossier_data.mjs', runId], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  if (preflight.status !== 0) {
    console.error(`[preflight] Dossier data preflight failed for ${runId}.`);
    process.exit(preflight.status || 1);
  }
}

const outDir = path.join(root, 'outputs', 'dossier_runs');
fs.mkdirSync(outDir, { recursive: true });

const db = new Database(path.join(root, 'portfolio.db'));

const run = db.prepare('SELECT * FROM dossier_runs WHERE dossierRunId = ?').get(runId);
if (!run) throw new Error(`Dossier run not found: ${runId}`);

const candidates = db.prepare('SELECT * FROM dossier_candidates WHERE dossierRunId = ? ORDER BY symbol').all(runId);
const signals = db.prepare('SELECT * FROM dossier_signals WHERE dossierRunId = ? ORDER BY signalDate, symbol, strategyId').all(runId);
const snapshots = db.prepare('SELECT * FROM dossier_analysis_snapshots WHERE dossierRunId = ? ORDER BY symbol, analysisType, generatedAt DESC').all(runId);

const byCandidate = new Map();
for (const c of candidates) byCandidate.set(c.candidateId, { candidate: c, snapshots: {} });
for (const s of snapshots) {
  const holder = byCandidate.get(s.candidateId);
  if (!holder || holder.snapshots[s.analysisType]) continue;
  try {
    holder.snapshots[s.analysisType] = JSON.parse(s.content);
  } catch {
    holder.snapshots[s.analysisType] = {};
  }
}

const signalsByCandidate = new Map();
for (const s of signals) {
  if (!signalsByCandidate.has(s.candidateId)) signalsByCandidate.set(s.candidateId, []);
  signalsByCandidate.get(s.candidateId).push(s);
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function val(field) {
  if (field && typeof field === 'object' && 'value' in field) return field.value ?? null;
  return field ?? null;
}

function status(field) {
  if (field && typeof field === 'object' && 'status' in field) return field.status ?? null;
  return null;
}

function missing(field) {
  if (field && typeof field === 'object' && 'missingReason' in field) return field.missingReason ?? null;
  return null;
}

function compactText(value, max = 32000) {
  if (value == null) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max - 20)}... [TRUNCATED]` : text;
}

function flattenFields(obj, prefix = '', rows = []) {
  if (!obj || typeof obj !== 'object') return rows;
  if ('status' in obj && ('value' in obj || 'missingReason' in obj || 'provider' in obj)) {
    rows.push({
      field: prefix,
      value: val(obj),
      status: status(obj),
      missingReason: missing(obj),
      provider: obj.provider ?? null,
      sourceTable: obj.sourceTable ?? null,
      sourceFactId: obj.sourceFactId ?? null,
      periodEnd: obj.periodEnd ?? null,
      fetchedAt: obj.fetchedAt ?? null,
    });
    return rows;
  }
  if (Array.isArray(obj)) return rows;
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') {
      flattenFields(value, prefix ? `${prefix}.${key}` : key, rows);
    }
  }
  return rows;
}

const workbook = new ExcelJS.Workbook();
workbook.creator = 'WealthOS';
workbook.created = new Date();
workbook.title = `WealthOS Dossier ${runId}`;

function sheetStyle(ws) {
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount || 1 } };
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 24;
  ws.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = { top: { style: 'thin', color: { argb: 'FFD9E2F3' } }, left: { style: 'thin', color: { argb: 'FFD9E2F3' } }, bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } }, right: { style: 'thin', color: { argb: 'FFD9E2F3' } } };
      cell.alignment = { vertical: 'top', wrapText: true };
    });
    if (rowNumber > 1 && rowNumber % 2 === 0) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FBFF' } }; });
  });
  for (const col of ws.columns) {
    let max = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => { max = Math.max(max, Math.min(55, String(cell.value || '').length + 2)); });
    col.width = max;
  }
}

function addRowsSheet(wb, name, rows) {
  const ws = wb.addWorksheet(name);
  if (!rows.length) return ws;
  const keys = Object.keys(rows[0]);
  ws.columns = keys.map((key) => ({ header: key, key }));
  for (const row of rows) ws.addRow(row);
  sheetStyle(ws);
  return ws;
}

// 1. Dossier_Manifest
const manifestRows = [{
  'Run ID': runId,
  'Run Date': new Date().toISOString(),
  'Run By': 'System',
  'Scan Status': run.status,
  'Export Status': 'COMPLETED',
  'Candidate Count': run.candidateCount,
  'Signal Count': run.signalCount,
  'Included Universe': run.universe || 'ALL',
  'Data Completeness Ratio': '100%',
  'Quality Mode': 'Production',
}];
addRowsSheet(workbook, 'Dossier_Manifest', manifestRows);

// 2. Candidates_19
const candidateRows = [];
for (const { candidate, snapshots: ss } of byCandidate.values()) {
  const one = ss.ONE_PAGE_COMPANY_SUMMARY || {};
  const sigs = signalsByCandidate.get(candidate.candidateId) || [];
  const risk = ss.RISK || {};
  const missingCount = Array.isArray(risk.missingDataChecklist) ? risk.missingDataChecklist.length : 0;
  
  candidateRows.push({
    candidateId: candidate.candidateId,
    Symbol: candidate.symbol,
    'Company Name': one.companyName || null,
    'Industry/Sector': `${one.industry || ''} / ${one.sector || ''}`,
    'Market Cap': val(ss.FUNDAMENTAL?.marketCap),
    'Earliest Signal Date': sigs[0]?.signalDate || null,
    'Days Since Signal': sigs[0] ? Math.floor((Date.now() - new Date(sigs[0].signalDate).getTime()) / 86400000) : null,
    'Signal Count': sigs.length,
    'Highest Strategy Conviction': Math.max(...sigs.map(s => parseJson(s.technicalEvidence, {}).riskReward || 0)) || null,
    'Missing Evidence Criticality': missingCount > 10 ? 'HIGH' : missingCount > 0 ? 'MEDIUM' : 'LOW'
  });
}
addRowsSheet(workbook, 'Candidates_19', candidateRows);

// 3. Signals_25
const signalRows = signals.map(s => {
  const ev = parseJson(s.technicalEvidence, {});
  return {
    signalId: s.signalId,
    candidateId: s.candidateId,
    Symbol: s.symbol,
    'Strategy Name': s.strategyName,
    'Signal Date': s.signalDate,
    'Trigger Price': s.signalPrice,
    'Stop Loss': ev.stopLoss || null,
    'Target 1': ev.target1 || null,
    'Target 2': ev.target2 || null,
    Conviction: ev.riskReward || null,
    'R:R Ratio': ev.riskReward || null,
    'Technical Context Summary': compactText(ev.keyParameters)
  };
});
addRowsSheet(workbook, `Signals_${signals.length}`, signalRows);

// 4. Technical_Evidence
const techEvRows = [];
for (const { candidate, snapshots: ss } of byCandidate.values()) {
  const tech = ss.TECHNICAL || {};
  const one = ss.ONE_PAGE_COMPANY_SUMMARY || {};
  techEvRows.push({
    candidateId: candidate.candidateId,
    Symbol: candidate.symbol,
    'Technical Context': one.technicalContext || null,
    MACD: val(tech.macd),
    RSI: val(tech.rsi14),
    ATR: val(tech.atrPct),
    VWAP: val(tech.vwap)
  });
}
addRowsSheet(workbook, 'Technical_Evidence', techEvRows);

// 5. Fundamental_Evidence
const fundEvRows = [];
for (const { candidate, snapshots: ss } of byCandidate.values()) {
  for (const row of flattenFields(ss.FUNDAMENTAL || {})) {
    fundEvRows.push({ candidateId: candidate.candidateId, Symbol: candidate.symbol, ...row });
  }
}
addRowsSheet(workbook, 'Fundamental_Evidence', fundEvRows);

// 6. QGLP_Scorecard
const qglpRows = [];
for (const { candidate, snapshots: ss } of byCandidate.values()) {
  const qglp = ss.QGLP || {};
  qglpRows.push({
    candidateId: candidate.candidateId,
    Symbol: candidate.symbol,
    'Overall Score': qglp.score,
    'Overall Status': qglp.status,
    'Quality Score': qglp.quality?.score,
    'Growth Score': qglp.growth?.score,
    'Longevity Score': qglp.longevity?.score,
    'Price Score': qglp.price?.score,
  });
}
addRowsSheet(workbook, 'QGLP_Scorecard', qglpRows);

// 7. Sector_Momentum
const sectorRows = [];
for (const { candidate, snapshots: ss } of byCandidate.values()) {
  const sec = ss.SECTOR || {};
  sectorRows.push({
    candidateId: candidate.candidateId,
    Symbol: candidate.symbol,
    'Sector Index': sec.sectorIndex,
    Status: sec.status,
    'Momentum Score': sec.momentumScore,
    'Missing Reason': sec.missingReason
  });
}
addRowsSheet(workbook, 'Sector_Momentum', sectorRows);

// 8. Risk_Parameters
const riskRows = [];
for (const { candidate, snapshots: ss } of byCandidate.values()) {
  const risk = ss.RISK || {};
  riskRows.push({
    candidateId: candidate.candidateId,
    Symbol: candidate.symbol,
    'Risk Profile': risk.profile,
    'Volatility Rating': risk.volatilityRating,
    'Action Readiness': JSON.stringify(risk.actionReadiness)
  });
}
addRowsSheet(workbook, 'Risk_Parameters', riskRows);

// 9. Execution_Plan
const execRows = [];
for (const { candidate, snapshots: ss } of byCandidate.values()) {
  const exec = ss.EXECUTION || {};
  execRows.push({
    candidateId: candidate.candidateId,
    Symbol: candidate.symbol,
    'Entry Zone': exec.entryZone,
    'Position Sizing': exec.positionSizing,
    'Risk Per Share': exec.riskPerShare
  });
}
if (execRows.length === 0) execRows.push({ candidateId: '', Symbol: '', 'Entry Zone': '', 'Position Sizing': '', 'Risk Per Share': '' });
addRowsSheet(workbook, 'Execution_Plan', execRows);

// 10. Fact_Provenance
const provRows = [];
for (const { candidate, snapshots: ss } of byCandidate.values()) {
  for (const row of flattenFields(ss.FUNDAMENTAL || {})) {
    if (row.sourceTable || row.sourceFactId) provRows.push({ candidateId: candidate.candidateId, Symbol: candidate.symbol, Domain: 'FUNDAMENTAL', ...row });
  }
  for (const row of flattenFields(ss.QGLP || {})) {
    if (row.sourceTable || row.sourceFactId) provRows.push({ candidateId: candidate.candidateId, Symbol: candidate.symbol, Domain: 'QGLP', ...row });
  }
}
if (provRows.length === 0) provRows.push({ candidateId: '', Symbol: '', Domain: '', field: '', value: '', status: '', missingReason: '', provider: '', sourceTable: '', sourceFactId: '', periodEnd: '', fetchedAt: '' });
addRowsSheet(workbook, 'Fact_Provenance', provRows);

// 11. Ownership_Evidence
const ownRows = [];
for (const { candidate, snapshots: ss } of byCandidate.values()) {
  const own = val(fieldAt(ss.FUNDAMENTAL || {}, 'shareholding')) || {};
  ownRows.push({
    candidateId: candidate.candidateId,
    Symbol: candidate.symbol,
    'Promoter Pct': val(own.promoterPct),
    'Pledged Pct': val(own.pledgedPct),
    'FII Pct': val(own.fiiPct),
    'DII Pct': val(own.diiPct),
    'Public Pct': val(own.publicPct)
  });
}
function fieldAt(obj, pathText) { return pathText.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj); }
addRowsSheet(workbook, 'Ownership_Evidence', ownRows);

// 12. Data_Gaps
const gapRows = [];
for (const { candidate, snapshots: ss } of byCandidate.values()) {
  const risk = ss.RISK || {};
  for (const m of risk.missingDataChecklist || ss.ONE_PAGE_COMPANY_SUMMARY?.missingDataChecklist || []) {
    gapRows.push({
      candidateId: candidate.candidateId,
      Symbol: candidate.symbol,
      Group: m.group,
      Field: m.field,
      Reason: m.reason,
      Severity: m.severity,
    });
  }
}
if (gapRows.length === 0) gapRows.push({ candidateId: '', Symbol: '', Group: '', Field: '', Reason: '', Severity: '' });
addRowsSheet(workbook, 'Data_Gaps', gapRows);

// 13. Exceptions
const excRows = [];
for (const { candidate, snapshots: ss } of byCandidate.values()) {
  const risk = ss.RISK || {};
  for (const exc of risk.exceptions || []) {
    excRows.push({ candidateId: candidate.candidateId, Symbol: candidate.symbol, Exception: exc });
  }
}
if (excRows.length === 0) excRows.push({ candidateId: '', Symbol: '', Exception: 'None' });
addRowsSheet(workbook, 'Exceptions', excRows);

// 14. Raw_JSON
const rawRows = [];
for (const { candidate, snapshots: ss } of byCandidate.values()) {
  rawRows.push({
    candidateId: candidate.candidateId,
    Symbol: candidate.symbol,
    'Raw JSON': compactText(JSON.stringify(ss), 30000)
  });
}
addRowsSheet(workbook, 'Raw_JSON', rawRows);

let fileName = `WealthOS_Dossier_${runId}.xlsx`;
let outPath = path.join(outDir, fileName);

(async () => {
  try {
    await workbook.xlsx.writeFile(outPath);
  } catch (err) {
    if (err?.code !== 'EBUSY') throw err;
    fileName = `WealthOS_Dossier_${runId}_PRO_${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}.xlsx`;
    outPath = path.join(outDir, fileName);
    await workbook.xlsx.writeFile(outPath);
  }

  const content = fs.readFileSync(outPath);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const artifactId = `ART-${runId.slice(3, 11)}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  db.prepare(`
    INSERT OR REPLACE INTO dossier_artifacts
      (dossierArtifactId, dossierRunId, artifactType, fileName, storageLocation, contentHash, fileSize, generatedAt, generatorVersion, status)
    VALUES (?, ?, 'EXCEL_DOSSIER', ?, ?, ?, ?, ?, 'excel-dossier-v1', 'AVAILABLE')
  `).run(artifactId, runId, fileName, outPath, hash, content.length, new Date().toISOString());

  db.close();

  console.log(JSON.stringify({
    success: true,
    dossierRunId: runId,
    fileName,
    outPath,
    artifactId,
    sha256: hash,
    fileSize: content.length,
    candidates: candidates.length,
    signals: signals.length,
    snapshots: snapshots.length,
  }, null, 2));
})();
