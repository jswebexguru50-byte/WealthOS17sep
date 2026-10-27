#!/usr/bin/env tsx
/** Deterministic, resumable, MCP-free promotion and coverage coordinator. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const arg = (flag: string) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };
const manifest = arg('--manifest');
if (!manifest) throw new Error('--manifest is required');
const resolvedManifest = path.resolve(manifest);
if (!fs.existsSync(resolvedManifest)) throw new Error(`Manifest not found: ${resolvedManifest}`);
const dryRun = process.argv.includes('--dry-run');
const reportDir = path.join(root, 'reports', 'non_mcp');
const checkpointPath = path.join(reportDir, 'waterfall_checkpoint.json');
fs.mkdirSync(reportDir, { recursive: true });
const checkpoint = fs.existsSync(checkpointPath) ? JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) : { phases: {}, mcpUsed: false };
checkpoint.mcpUsed = false;
const rawManifest = JSON.parse(fs.readFileSync(resolvedManifest, 'utf8'));
const entries = Array.isArray(rawManifest) ? rawManifest : (rawManifest.entries || rawManifest.symbols || []);
const symbols = [...new Set(entries.map((e: any) => typeof e === 'string' ? e : e.symbol || e.ticker || e.listings?.[0]?.symbol).filter(Boolean).map((s: string) => s.toUpperCase()))];
if (!symbols.length) throw new Error(`Manifest contains no symbols: ${resolvedManifest}`);
const upstoxManifest = path.join(reportDir, 'upstox_manifest.json');
fs.writeFileSync(upstoxManifest, JSON.stringify({ symbols }, null, 2) + '\n');
function phase(name: string, args: string[], extraEnv: Record<string,string> = {}) {
  if (dryRun) {
    checkpoint.phases[name] = { status: 'PLANNED', args, env: { MCP_DISABLED: '1', ...extraEnv } };
    return;
  }
  if (checkpoint.phases[name]?.status === 'SUCCESS') return;
  checkpoint.phases[name] = { status: 'RUNNING', startedAt: new Date().toISOString() };
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2) + '\n');
  try {
    execFileSync('node', ['--import', 'tsx', ...args], { cwd: root, stdio: 'inherit', env: { ...process.env, ...extraEnv, MCP_DISABLED: '1' } });
    checkpoint.phases[name] = { status: 'SUCCESS', completedAt: new Date().toISOString() };
  } catch (error) {
    checkpoint.phases[name] = { status: 'FAILED', completedAt: new Date().toISOString(), error: String(error) };
    fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2) + '\n');
    // Continue the waterfall after a provider outage; the failure is checkpointed
    // and remains visible for a later deterministic retry.
  }
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2) + '\n');
}
const preflightLedger = path.join(reportDir, 'preflight_coverage_ledger.json');
phase('preflight_coverage', ['scripts/fundamental/build_non_mcp_coverage_ledger.ts', '--manifest', resolvedManifest, '--out', preflightLedger]);
phase('gap_plan', ['scripts/fundamental/plan_non_mcp_acquisition.ts', '--ledger', preflightLedger]);
phase('exchange_xbrl_mca', ['scripts/fere/run_combined_exchange_batch.mjs', '--manifest', resolvedManifest, '--apply', '--concurrency', arg('--exchange-concurrency') || '3', '--checkpoint-every', '50', '--retries', '2', '--timeout-ms', '90000']);
phase('upstox_fundamentals', ['scripts/fundamental/run_upstox_fundamental_enrichment.ts', '--group', 'excelStrategyMatches', '--batch-size', '1', '--endpoint-delay-ms', '750', '--symbol-delay-ms', '1000'], { FUNDAMENTAL_MANIFEST_PATH: upstoxManifest });
phase('cached_artifact_promotion', ['scripts/fere/promote_cached_artifacts_batch.mjs', '--manifest', resolvedManifest, '--apply', '--min-facts', '29']);
phase('promotion_verification', ['scripts/fundamental/verify_non_mcp_promotion.ts', '--manifest', resolvedManifest, '--min-facts', '29']);
if (dryRun) {
  const plan = { generatedAt: new Date().toISOString(), dryRun: true, mcpUsed: false, symbolCount: symbols.length, phases: checkpoint.phases, checkpoint: checkpointPath };
  fs.writeFileSync(path.join(reportDir, 'waterfall_plan.json'), JSON.stringify(plan, null, 2) + '\n');
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}
phase('coverage_ledger', ['scripts/fundamental/build_non_mcp_coverage_ledger.ts', '--manifest', resolvedManifest]);
const ledger = JSON.parse(fs.readFileSync(path.join(reportDir, 'coverage_ledger.json'), 'utf8'));
const gapFields = ledger.rows.flatMap((row: any) => Object.entries(row.fields).filter(([, value]: any) => value.status === 'GAP').map(([field, value]) => ({ symbol: row.symbol, field, ...value as any })));
const result = { generatedAt: new Date().toISOString(), mcpUsed: false, symbolCount: ledger.symbolCount, covered: ledger.covered, gaps: gapFields.length, gapFields, phases: checkpoint.phases, checkpoint: checkpointPath };
fs.writeFileSync(path.join(reportDir, 'waterfall_result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
