import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';

const root = process.cwd();
const args = process.argv.slice(2);
const runId = args[0] && !args[0].startsWith('--') ? args[0] : args[args.indexOf('--run-id') + 1];
const skipTrendlyne = args.includes('--skip-trendlyne');
const skipRecompute = args.includes('--skip-recompute');

if (!runId || runId === '--run-id') {
  console.error('Usage: node scripts/prepare_dossier_data.mjs <DOSSIER_RUN_ID> [--skip-trendlyne] [--skip-recompute]');
  process.exit(1);
}

const outDir = path.join(root, 'outputs', 'dossier_runs');
fs.mkdirSync(outDir, { recursive: true });
const reportPath = path.join(outDir, `${runId}_data_preflight_report.json`);
const manifestPath = path.join(outDir, `${runId}_data_refresh_manifest.json`);

function runStep(name, command, commandArgs) {
  const startedAt = new Date().toISOString();
  const fallbackRequire = '--require=./scripts/node_userinfo_fallback.cjs';
  const systemCa = '--use-system-ca';
  const existingNodeOptions = process.env.NODE_OPTIONS || '';
  let nodeOptions = existingNodeOptions.includes('node_userinfo_fallback.cjs')
    ? existingNodeOptions
    : `${fallbackRequire} ${existingNodeOptions}`.trim();
  if (!nodeOptions.includes('--use-system-ca')) {
    nodeOptions = `${systemCa} ${nodeOptions}`.trim();
  }
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, NODE_OPTIONS: nodeOptions },
  });
  const completedAt = new Date().toISOString();
  return {
    name,
    command: [command, ...commandArgs].join(' '),
    exitCode: result.status,
    signal: result.signal,
    startedAt,
    completedAt,
    success: result.status === 0,
  };
}

function latestSnapshotCoverage(db, dossierRunId) {
  const rows = db.prepare(`
    SELECT dc.symbol, das.analysisType, das.content
    FROM dossier_candidates dc
    LEFT JOIN dossier_analysis_snapshots das
      ON das.candidateId = dc.candidateId
     AND das.dossierRunId = dc.dossierRunId
    WHERE dc.dossierRunId = ?
    ORDER BY dc.symbol, das.analysisType, das.generatedAt DESC
  `).all(dossierRunId);

  const seen = new Set();
  const bySymbol = new Map();
  for (const row of rows) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, { symbol: row.symbol, snapshots: {}, missingItems: 0 });
    if (!row.analysisType || !row.content) continue;
    const key = `${row.symbol}|${row.analysisType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const holder = bySymbol.get(row.symbol);
    try {
      const parsed = JSON.parse(row.content);
      holder.snapshots[row.analysisType] = true;
      if (Array.isArray(parsed?.missingDataChecklist)) holder.missingItems += parsed.missingDataChecklist.length;
      if (Array.isArray(parsed?.RISK?.missingDataChecklist)) holder.missingItems += parsed.RISK.missingDataChecklist.length;
      if (Array.isArray(parsed?.ONE_PAGE_COMPANY_SUMMARY?.missingDataChecklist)) holder.missingItems += parsed.ONE_PAGE_COMPANY_SUMMARY.missingDataChecklist.length;
    } catch {}
  }
  return [...bySymbol.values()].map((row) => ({
    symbol: row.symbol,
    snapshotTypes: Object.keys(row.snapshots).sort(),
    missingItems: row.missingItems,
  }));
}

const db = new Database(path.join(root, 'portfolio.db'));
const run = db.prepare('SELECT * FROM dossier_runs WHERE dossierRunId = ?').get(runId);
if (!run) {
  db.close();
  throw new Error(`Dossier run not found: ${runId}`);
}

const symbols = db.prepare('SELECT DISTINCT symbol FROM dossier_candidates WHERE dossierRunId = ? ORDER BY symbol').all(runId).map((r) => r.symbol);
const roundedTrendlyneTarget = Math.max(10, Math.ceil(symbols.length / 10) * 10);

fs.writeFileSync(manifestPath, JSON.stringify({
  runId,
  generatedAt: new Date().toISOString(),
  symbols,
}, null, 2));

const before = latestSnapshotCoverage(db, runId);
db.close();

const steps = [];

steps.push(runStep('financial_history_backfill', 'npx', ['tsx', 'scripts/data_quality/jobs/financial_history_backfill.ts']));
steps.push(runStep('shareholding_history_backfill', 'npx', ['tsx', 'scripts/data_quality/jobs/shareholding_history_backfill.ts']));

steps.push(runStep('promote_trendlyne_statement_history_parameters_before_refresh', 'npx', [
  'tsx',
  'scripts/fundamental/promote_trendlyne_statement_history_parameters.ts',
  '--manifest',
  path.relative(root, manifestPath),
  '--apply',
]));

steps.push(runStep('promote_trendlyne_shareholding_history_before_refresh', 'npx', [
  'tsx',
  'scripts/fundamental/promote_trendlyne_shareholding_history.ts',
  '--manifest',
  path.relative(root, manifestPath),
  '--apply',
]));

if (!skipTrendlyne) {
  steps.push(runStep('trendlyne_dossier_force_refresh', 'npx', [
    'tsx',
    'scripts/fundamental/trendlyne_metric_pack_planner.ts',
    '--execute',
    '--symbols',
    symbols.join(','),
    '--max-symbols',
    String(roundedTrendlyneTarget),
    '--batch-size',
    '10',
    '--allow-partial-final-batch',
    '--force-refresh',
  ]));
}

steps.push(runStep('canonical_fact_ingestion', 'npx', [
  'tsx',
  'scripts/fundamental/canonical_fact_ingestion.ts',
  '--manifest',
  path.relative(root, manifestPath),
]));

steps.push(runStep('promote_trendlyne_statement_history_parameters_after_refresh', 'npx', [
  'tsx',
  'scripts/fundamental/promote_trendlyne_statement_history_parameters.ts',
  '--manifest',
  path.relative(root, manifestPath),
  '--apply',
]));

steps.push(runStep('promote_trendlyne_shareholding_history_after_refresh', 'npx', [
  'tsx',
  'scripts/fundamental/promote_trendlyne_shareholding_history.ts',
  '--manifest',
  path.relative(root, manifestPath),
  '--apply',
]));

if (!skipRecompute) {
  steps.push(runStep('recompute_dossier_run_analysis', 'npx', [
    'tsx',
    'scripts/recompute_dossier_run_analysis.ts',
    runId,
  ]));
}

const dbAfter = new Database(path.join(root, 'portfolio.db'), { readonly: true });
const after = latestSnapshotCoverage(dbAfter, runId);
const factCounts = dbAfter.prepare(`
  SELECT symbol, COUNT(*) AS facts
  FROM company_facts
  WHERE symbol IN (${symbols.map(() => '?').join(',')})
  GROUP BY symbol
  ORDER BY symbol
`).all(...symbols);
dbAfter.close();

const report = {
  success: steps.every((s) => s.success),
  runId,
  generatedAt: new Date().toISOString(),
  symbols,
  roundedTrendlyneTarget,
  manifestPath,
  steps,
  before,
  after,
  factCounts,
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  success: report.success,
  runId,
  reportPath,
  symbols: symbols.length,
  roundedTrendlyneTarget,
  failedSteps: steps.filter((s) => !s.success).map((s) => s.name),
}, null, 2));

if (!report.success) process.exit(1);
