#!/usr/bin/env node
/**
 * run_comprehensive_dossier.mjs — Master orchestrator for the full dossier pipeline
 *
 * Runs all acquisition and synthesis steps in order, skipping any already completed
 * (idempotent / resumable). Set TRENDLYNE_MCP_URL from .agents/mcp_config.json before Step 1.
 *
 * Usage:
 *   node run_comprehensive_dossier.mjs SYMBOL[,SYMBOL,...] [options]
 *
 * Options:
 *   --as-of YYYY-MM-DD   Override report date (default: today)
 *   --bse-code XXXXXX    Pass BSE scrip code to acquisition scripts (6-digit numeric)
 *   --nse-code SYMBOL    Alias for --bse-code when you only have the NSE symbol; the
 *                        exchange step will auto-resolve the BSE code via Screener.in
 *   --force              Re-run all steps even if already logged
 *   --dry-run            Pass --dry-run to all steps (no Bedrock call, no file writes)
 *   --skip-mcp           Skip Step 1
 *   --skip-parse         Skip Step 2
 *   --skip-exchange      Skip Step 3
 *   --skip-xbrl          Skip Step 4
 *   --skip-docs          Skip Step 5
 *   --skip-mca           Skip Step 6
 *   --skip-build         Skip Step 7
 *   --skip-promote       Skip Step 7b raw-evidence promotion
 *   --skip-qa            Skip Step 8 (QA gap filler)
 *   --skip-draft         Skip Step 9
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import 'dotenv/config';

// ─── CLI ──────────────────────────────────────────────────────────────────────
const cliArgs = process.argv.slice(2);

const symbolsArg = cliArgs.find(a => !a.startsWith('--'));
if (!symbolsArg) {
  console.error('Usage: node run_comprehensive_dossier.mjs SYMBOL[,SYMBOL,...] [options]');
  process.exit(1);
}
const symbols = symbolsArg.toUpperCase().split(',').map(s => s.trim()).filter(Boolean);

const asOfIdx = cliArgs.indexOf('--as-of');
const asOf = asOfIdx >= 0 ? cliArgs[asOfIdx + 1] : new Date().toISOString().slice(0, 10);

const bseIdx = cliArgs.indexOf('--bse-code');
const nseIdx = cliArgs.indexOf('--nse-code');
// --nse-code is an alias accepted for convenience; the exchange step resolves BSE code from NSE symbol via Screener
const bseCode = bseIdx >= 0 ? cliArgs[bseIdx + 1] : (nseIdx >= 0 ? cliArgs[nseIdx + 1] : null);
const exchangeCodeType = bseIdx >= 0 ? 'bse' : (nseIdx >= 0 ? 'nse' : null);

const FORCE   = cliArgs.includes('--force');
const DRY_RUN = cliArgs.includes('--dry-run');

const SKIPS = {
  mcp:      cliArgs.includes('--skip-mcp'),
  parse:    cliArgs.includes('--skip-parse'),
  exchange: cliArgs.includes('--skip-exchange'),
  xbrl:     cliArgs.includes('--skip-xbrl'),
  bse_xbrl: cliArgs.includes('--skip-bse_xbrl'),
  docs:     cliArgs.includes('--skip-docs'),
  mca:      cliArgs.includes('--skip-mca'),
  build:    cliArgs.includes('--skip-build'),
  promote:  cliArgs.includes('--skip-promote'),
  qa:       cliArgs.includes('--skip-qa'),
  draft:    cliArgs.includes('--skip-draft'),
};

const root      = process.cwd();
const scriptsDir = path.resolve(root, 'scripts', 'fundamental', 'institutional29');

// ─── Steps definition ─────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, name: 'Trendlyne MCP fetch',        key: 'mcp',      script: 'fetch_trendlyne_mcp.mjs',       skipKey: 'mcp'      },
  { id: 2, name: 'Parse MCP responses',         key: 'parse',    script: 'parse_mcp_responses.mjs',       skipKey: 'parse'    },
  { id: 3, name: 'BSE/NSE Exchange data',       key: 'exchange', script: 'acquire_exchange_data.mjs',     skipKey: 'exchange' },
  { id: 4, name: 'XBRL financials',             key: 'xbrl',     script: 'acquire_xbrl_financials.mjs',   skipKey: 'xbrl'     },
  { id: '4b', name: 'BSE XBRL (numeric scrip)', key: 'bseXbrl', script: 'acquire_bse_xbrl.mjs',          skipKey: 'bse_xbrl' },
  { id: 5, name: 'Document download + parse',   key: 'docs',     script: 'acquire_documents.mjs',         skipKey: 'docs'     },
  { id: 6, name: 'MCA company data',            key: 'mca',      script: 'acquire_mca_company_data.mjs',  skipKey: 'mca'      },
  { id: 7, name: 'Build unified evidence',      key: 'build',    script: 'build_unified_evidence.mjs',    skipKey: 'build'    },
  { id: '7b', name: 'Promote verified raw evidence', key: 'promote', script: 'promote_trendlyne_raw.mjs', skipKey: 'promote' },
  { id: 8, name: 'QA gap filler',              key: 'qa',       script: 'qa_gap_filler.mjs',             skipKey: 'qa'       },
  { id: 9, name: 'Draft investment dossier',   key: 'draft',    script: 'draft_investment_dossier.mjs',  skipKey: 'draft'    },
];
const TOTAL = STEPS.length;

// ─── Environment setup: read MCP URL without printing it ─────────────────────
function setupMcpEnv() {
  if (process.env.TRENDLYNE_MCP_URL?.trim()) return;
  const cfgPath = path.resolve(root, '.agents', 'mcp_config.json');
  if (!fs.existsSync(cfgPath)) {
    console.error('[dossier] WARNING: .agents/mcp_config.json not found — TRENDLYNE_MCP_URL not set');
    return;
  }
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const url = cfg?.mcpServers?.trendlyne?.serverUrl;
    if (url) {
      process.env.TRENDLYNE_MCP_URL = url;
      // Intentionally do NOT log the URL
    } else {
      console.error('[dossier] WARNING: mcpServers.trendlyne.serverUrl not found in mcp_config.json');
    }
  } catch {
    console.error('[dossier] WARNING: Could not parse .agents/mcp_config.json');
  }
}

// ─── Raw file path for a symbol ───────────────────────────────────────────────
function rawPath(sym) {
  return path.resolve(root, 'outputs', 'institutional29', sym, 'trendlyne_raw.json');
}

// ─── Read acquisitionLog from raw file ───────────────────────────────────────
function readLog(sym) {
  const rp = rawPath(sym);
  if (!fs.existsSync(rp)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(rp, 'utf8'));
    return raw.acquisitionLog ?? {};
  } catch {
    return {};
  }
}

// ─── Run a single step ────────────────────────────────────────────────────────
function runStep(sym, step, extraArgs) {
  const scriptPath = path.resolve(scriptsDir, step.script);
  if (!fs.existsSync(scriptPath)) {
    console.error(`[dossier] ${sym} — Step ${step.id}/${TOTAL}: WARNING: script not found: ${scriptPath} — skipping`);
    return { skipped: true, reason: 'script_not_found' };
  }

  const args = [sym, '--as-of', asOf, ...extraArgs];
  if (DRY_RUN) args.push('--dry-run');

  const t0 = Date.now();
  try {
    execFileSync(process.execPath, [scriptPath, ...args], { stdio: 'inherit', env: process.env });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    return { elapsed };
  } catch (err) {
    return { error: err.message ?? 'non-zero exit' };
  }
}

// ─── Dossier path for summary ─────────────────────────────────────────────────
function dossierPath(sym) {
  const dir = path.resolve(root, 'reports', 'fundamental');
  const report = path.join(dir, `${sym}_investment_dossier_${asOf}.md`);
  const handoff = path.join(dir, `${sym}_investment_dossier_${asOf}_chat_handoff.md`);
  if (fs.existsSync(report)) return { path: report, mode: 'REPORT' };
  if (fs.existsSync(handoff)) return { path: handoff, mode: 'CHAT_LLM_HANDOFF' };
  return { path: null, mode: 'MISSING' };
}

function wordCount(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  return fs.readFileSync(filePath, 'utf8').split(/\s+/).filter(Boolean).length;
}

// ─── Process one symbol ───────────────────────────────────────────────────────
async function processSymbol(sym) {
  const sessionStart = Date.now();
  console.error(`\n[dossier] ══════════════════════════════════════`);
  console.error(`[dossier] ${sym} — starting pipeline (asOf ${asOf})`);

  const extraArgs = bseCode
    ? (exchangeCodeType === 'nse' ? ['--nse-code', bseCode] : ['--bse-code', bseCode])
    : [];
  let stepsCompleted = 0;
  const stepResults = {};

  for (const step of STEPS) {
    if (SKIPS[step.skipKey]) {
      console.error(`[dossier] ${sym} — Step ${step.id}/${TOTAL}: ${step.name} [SKIPPED via --skip-${step.skipKey}]`);
      continue;
    }

    // Resume: check acquisitionLog unless --force
    if (!FORCE) {
      const log = readLog(sym);
      // evidence_bundle and dossier don't write to acquisitionLog — always run them
      if (step.id <= 6 && log[step.key]) {
        console.error(`[dossier] ${sym} — Step ${step.id}/${TOTAL}: ${step.name} [already done at ${log[step.key]}]`);
        stepsCompleted++;
        continue;
      }
    }

    // Step 4b only runs when the symbol is a numeric BSE scrip code.
    // Alphabetic symbols are NSE-listed and already handled by acquire_xbrl_financials.mjs.
    if (step.id === '4b' && !/^\d+$/.test(sym)) {
      console.error(`[dossier] ${sym} — Step ${step.id}/${TOTAL}: ${step.name} [SKIPPED: alphabetic NSE symbol]`);
      continue;
    }

    console.error(`[dossier] ${sym} — Step ${step.id}/${TOTAL}: ${step.name}`);
    const result = runStep(sym, step, extraArgs);

    if (result.error) {
      console.error(`[dossier] ${sym} — Step ${step.id}/${TOTAL}: ✗ FAILED — ${result.error}`);
      stepResults[step.key] = { status: 'failed', error: result.error };
      // Continue pipeline rather than abort — downstream steps may still produce partial output
    } else if (result.skipped) {
      console.error(`[dossier] ${sym} — Step ${step.id}/${TOTAL}: ✗ ${result.reason}`);
      stepResults[step.key] = { status: 'skipped', reason: result.reason };
    } else {
      console.error(`[dossier] ${sym} — Step ${step.id}/${TOTAL}: ✓ done (${result.elapsed}s)`);
      stepResults[step.key] = { status: 'done', elapsedS: result.elapsed };
      stepsCompleted++;
    }
  }

  const dossier = dossierPath(sym);
  const wc = dossier.path ? wordCount(dossier.path) : 0;
  const elapsedMs = Date.now() - sessionStart;

  const metaPath = path.resolve(root, 'outputs', 'institutional29', sym, 'trendlyne_raw.json');
  let dataSources = {};
  try {
    const raw = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    dataSources = {
      trendlyneMCP: !!(raw.pages && Object.keys(raw.pages).length),
      exchangeAPI:  !!(raw.exchange?.companyMaster || raw.exchange?.quarterlyPL),
      xbrl:         (raw.xbrl?.facts ?? []).length,
      documents:    (raw.documents ?? []).length,
      mca:          !!(raw.mca?.cin || raw.mca?.directors?.length),
    };
  } catch { /* raw file may not exist on dry run */ }

  const summary = {
    symbol: sym,
    asOf,
    dossierPath: dossier.path,
    dossierMode: dossier.mode,
    wordCount: wc,
    dataSources,
    stepsCompleted,
    stepResults,
    elapsedMs,
  };

  if (dossier.path) {
    console.error(`[dossier] ${sym} — dossier ${dossier.mode} written → ${dossier.path} (${wc} words)`);
  }

  return summary;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
setupMcpEnv();

const allResults = [];
for (const sym of symbols) {
  const result = await processSymbol(sym);
  allResults.push(result);
}

console.error('\n[dossier] ══════════════════════════════════════');
console.error(`[dossier] Pipeline complete for ${symbols.join(', ')}`);

// Single-symbol: emit the summary directly; multi-symbol: emit array
const output = allResults.length === 1 ? allResults[0] : allResults;
console.log(JSON.stringify(output, null, 2));
