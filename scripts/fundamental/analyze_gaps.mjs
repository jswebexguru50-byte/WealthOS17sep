import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const db = new Database('portfolio.db');
const runId = 'DR-20261001-7D-B0A8466C';

const snaps = db.prepare('SELECT candidateId, symbol, analysisType, content FROM dossier_analysis_snapshots WHERE dossierRunId = ?').all(runId);

let rawGaps = 0;
const gapRows = [];

for (const s of snaps) {
  let parsed;
  try { parsed = JSON.parse(s.content); } catch (e) { continue; }
  
  const checklist = parsed.missingDataChecklist || [];
  for (const m of checklist) {
    rawGaps++;
    gapRows.push({
      dossierRunId: runId,
      candidateId: s.candidateId,
      symbol: s.symbol,
      group: m.group,
      field: m.field,
      reason: m.reason,
      severity: m.severity,
      analysisType: s.analysisType
    });
  }
}

// Write the raw gaps out for analysis
fs.mkdirSync('reports/dossier', { recursive: true });
fs.writeFileSync('reports/dossier/DR-20261001-7D-B0A8466C_RAW_GAPS.json', JSON.stringify(gapRows, null, 2));

// Normalize
const logicalGaps = new Set();
const canonicalMetrics = new Set();
const fieldFreq = {};
let missingNotApplicable = 0;

for (const row of gapRows) {
  const logicalKey = `${row.symbol}::${row.group}::${row.field}`;
  logicalGaps.add(logicalKey);
  
  if (row.reason && row.reason.includes('NOT_APPLICABLE')) {
    missingNotApplicable++;
  }
  
  fieldFreq[row.field] = (fieldFreq[row.field] || 0) + 1;
}

const top50 = Object.entries(fieldFreq).sort((a,b) => b[1] - a[1]).slice(0, 50).map(([k,v]) => `${k}: ${v}/19`);

console.log('INITIAL_RAW_GAPS:', rawGaps);
console.log('UNIQUE_LOGICAL_GAPS:', logicalGaps.size);
console.log('UNIQUE_CANONICAL_REQUIREMENTS: TBD');
console.log('TOP 50 SYSTEMIC GAPS:\n' + top50.join('\n'));
