#!/usr/bin/env tsx
/** Deterministic, resumable waterfall coordinator. MCP is opt-in and approval-gated. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
// npm scripts provide a safe default manifest, while operators may override it
// on the command line. Resolve the last occurrence so `--manifest pilot.json`
// actually controls every downstream phase (critical for deterministic pilots
// and resumable slices).
const arg = (flag: string) => {
  let value: string | undefined;
  for (let i = 0; i < process.argv.length - 1; i++) {
    if (process.argv[i] === flag) value = process.argv[i + 1];
  }
  return value;
};
const manifest = arg('--manifest');
if (!manifest) throw new Error('--manifest is required');
const resolvedManifest = path.resolve(manifest);
if (!fs.existsSync(resolvedManifest)) throw new Error(`Manifest not found: ${resolvedManifest}`);
const dryRun = process.argv.includes('--dry-run');
const allowMcp = process.argv.includes('--allow-mcp');
const offset = Math.max(0, Number(arg('--offset') || '0'));
const limitArg = Number(arg('--limit') || '0');
const reportDir = path.join(root, 'reports', 'non_mcp');
const checkpointPath = path.join(reportDir, 'waterfall_checkpoint.json');
fs.mkdirSync(reportDir, { recursive: true });
const rawManifest = JSON.parse(fs.readFileSync(resolvedManifest, 'utf8'));
const entries = Array.isArray(rawManifest) ? rawManifest : (rawManifest.entries || rawManifest.symbols || []);
const symbols = [...new Set(entries.map((e: any) => typeof e === 'string' ? e : e.symbol || e.ticker || e.listings?.[0]?.symbol).filter(Boolean).map((s: string) => s.toUpperCase()))]
  .slice(offset, limitArg > 0 ? offset + limitArg : undefined);
if (!symbols.length) throw new Error(`Manifest contains no symbols: ${resolvedManifest}`);
const existingCheckpoint = fs.existsSync(checkpointPath) ? JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) : null;
const checkpoint = existingCheckpoint?.manifestPath === resolvedManifest &&
  existingCheckpoint?.symbolCount === symbols.length &&
  existingCheckpoint?.offset === offset &&
  existingCheckpoint?.limit === limitArg && !dryRun
  ? existingCheckpoint
  : { manifestPath: resolvedManifest, symbolCount: symbols.length, offset, limit: limitArg, phases: {}, mcpUsed: false };
checkpoint.manifestPath = resolvedManifest;
checkpoint.symbolCount = symbols.length;
checkpoint.offset = offset;
checkpoint.limit = limitArg;
checkpoint.mcpUsed = allowMcp;
const upstoxManifest = path.join(reportDir, 'upstox_manifest.json');
fs.writeFileSync(upstoxManifest, JSON.stringify({ symbols }, null, 2) + '\n');
function phase(name: string, args: string[], extraEnv: Record<string,string> = {}, allowGaps = false, enableMcp = false) {
  if (dryRun) {
    checkpoint.phases[name] = { status: 'PLANNED', args, env: { MCP_DISABLED: enableMcp ? '0' : '1', ...extraEnv } };
    return;
  }
  if (['SUCCESS', 'COMPLETED_WITH_GAPS'].includes(checkpoint.phases[name]?.status)) return;
  checkpoint.phases[name] = { status: 'RUNNING', startedAt: new Date().toISOString() };
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2) + '\n');
  try {
    execFileSync('node', ['--import', 'tsx', ...args], { cwd: root, stdio: 'inherit', env: { ...process.env, ...extraEnv, MCP_DISABLED: enableMcp ? '0' : '1' } });
    checkpoint.phases[name] = { status: 'SUCCESS', completedAt: new Date().toISOString() };
  } catch (error) {
    checkpoint.phases[name] = { status: allowGaps ? 'COMPLETED_WITH_GAPS' : 'FAILED', completedAt: new Date().toISOString(), error: String(error) };
    fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2) + '\n');
    // Provider acquisition/promotion phases may continue with explicit gaps,
    // but planning, coverage, and acceptance phases are control-plane gates.
    // Never turn a failed control-plane phase into a misleading partial run.
    if (!allowGaps) throw error;
  }
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2) + '\n');
}
const preflightLedger = path.join(reportDir, 'preflight_coverage_ledger.json');
if (allowMcp) {
  phase('approved_mcp_enrichment', ['scripts/trendlyne-mirror/fetch_eight_packs.ts', '--manifest', resolvedManifest], {}, false, true);
}
phase('preflight_coverage', ['scripts/fundamental/build_non_mcp_coverage_ledger.ts', '--manifest', resolvedManifest, '--out', preflightLedger]);
phase('gap_plan', ['scripts/fundamental/plan_non_mcp_acquisition.ts', '--ledger', preflightLedger]);
phase('exchange_xbrl_mca', ['scripts/fere/run_combined_exchange_batch.mjs', '--manifest', resolvedManifest, '--apply', '--concurrency', arg('--exchange-concurrency') || '3', '--checkpoint-every', '50', '--retries', '2', '--timeout-ms', '90000'], {}, true);
phase('upstox_fundamentals', ['scripts/fundamental/run_upstox_fundamental_enrichment.ts', '--manifest', resolvedManifest, '--batch-size', '1', '--endpoint-delay-ms', '750', '--symbol-delay-ms', '1000'], { FUNDAMENTAL_MANIFEST_PATH: upstoxManifest }, true);
phase('upstox_canonical_promotion', ['scripts/fundamental/promote_upstox_snapshots.ts'], {}, true);
phase('cached_artifact_promotion', ['scripts/fere/promote_cached_artifacts_batch.mjs', '--manifest', resolvedManifest, '--apply', '--min-facts', '29'], {}, true);
phase('promotion_verification', ['scripts/fundamental/verify_non_mcp_promotion.ts', '--manifest', resolvedManifest, '--min-facts', '29'], {}, true);
phase('promotion_gap_manifest', ['scripts/fundamental/build_promotion_gap_manifest.ts', '--verification', path.join(reportDir, 'promotion_verification.json'), '--source-manifest', resolvedManifest], {}, true);
if (dryRun) {
  for (const name of ['coverage_ledger', 'acceptance_matrix']) {
    checkpoint.phases[name] = {
      status: 'PLANNED',
      args: name === 'coverage_ledger'
        ? ['scripts/fundamental/build_non_mcp_coverage_ledger.ts', '--manifest', resolvedManifest]
        : ['scripts/fundamental/build_readiness_acceptance_matrix.ts', '--manifest', resolvedManifest, '--ledger', path.join(reportDir, 'coverage_ledger.json')],
      env: { MCP_DISABLED: '1' },
    };
  }
  const plan = { generatedAt: new Date().toISOString(), dryRun: true, mcpUsed: allowMcp, symbolCount: symbols.length, offset, limit: limitArg, phases: checkpoint.phases, checkpoint: checkpointPath };
  fs.writeFileSync(path.join(reportDir, 'waterfall_plan.json'), JSON.stringify(plan, null, 2) + '\n');
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}
phase('coverage_ledger', ['scripts/fundamental/build_non_mcp_coverage_ledger.ts', '--manifest', resolvedManifest]);
phase('acceptance_matrix', ['scripts/fundamental/build_readiness_acceptance_matrix.ts', '--manifest', resolvedManifest, '--ledger', path.join(reportDir, 'coverage_ledger.json')]);
const ledger = JSON.parse(fs.readFileSync(path.join(reportDir, 'coverage_ledger.json'), 'utf8'));
const gapFields = ledger.rows.flatMap((row: any) => Object.entries(row.fields).filter(([, value]: any) => value.status === 'GAP').map(([field, value]) => ({ symbol: row.symbol, field, ...value as any })));
const result = { generatedAt: new Date().toISOString(), mcpUsed: allowMcp, symbolCount: ledger.symbolCount, offset, limit: limitArg, covered: ledger.covered, gaps: gapFields.length, gapFields, phases: checkpoint.phases, checkpoint: checkpointPath };
fs.writeFileSync(path.join(reportDir, 'waterfall_result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
