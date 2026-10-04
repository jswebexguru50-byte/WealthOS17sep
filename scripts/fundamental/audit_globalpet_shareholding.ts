import { ShareholdingPatternIngestionService } from '../../src/server/services/ShareholdingPatternIngestionService.js';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const db = new Database(path.join(root, 'portfolio.db'));
const service = ShareholdingPatternIngestionService.getInstance();

console.log('[Audit] Auditing GLOBALPET shareholding pattern against raw provider snapshot...');
const auditReport = service.auditForSymbol('GLOBALPET', db);

console.log(`[Audit] Total Periods Audited: ${auditReport.totalPeriodsAudited}`);
console.log(`[Audit] Total Cells Audited: ${auditReport.totalCellsAudited}`);
console.log(`[Audit] Verified Cells: ${auditReport.verifiedCells}`);
console.log(`[Audit] Unsupported Cells: ${auditReport.unsupportedCells}`);
console.log(`[Audit] Missing Not Zero Cells: ${auditReport.missingNotZeroCells}`);

const outDir = path.join(root, 'reports', 'dossier');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'DR-20261001-7D-B0A8466C_GLOBALPET_SHAREHOLDING_AUDIT.json');
fs.writeFileSync(outPath, JSON.stringify(auditReport, null, 2));
console.log(`[Audit] Saved audit report to: ${outPath}`);

db.close();
