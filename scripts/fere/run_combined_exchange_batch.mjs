#!/usr/bin/env node
/** Resumable bounded NSE/BSE exchange acquisition. Default is dry-run. */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const manifestPath = path.resolve(arg('--manifest', 'outputs/fere/combined_exchange_manifest.json'));
const concurrency = Math.max(1, Math.min(8, Number(arg('--concurrency', '3'))));
const limit = Math.max(0, Number(arg('--limit', '0')));
const retries = Math.max(0, Number(arg('--retries', '2')));
const dryRun = !process.argv.includes('--apply');
const timeoutMs = Math.max(5000, Number(arg('--timeout-ms', '90000')));
const checkpointEvery = Math.max(1, Number(arg('--checkpoint-every', '50')));
const load = () => JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const save = (manifest) => { const tmp = `${manifestPath}.tmp`; fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n'); fs.renameSync(tmp, manifestPath); };
function run(symbol, route, isin) {
  return new Promise((resolve, reject) => {
    const args = ['scripts/fundamental/institutional29/acquire_exchange_data.mjs', symbol];
    // The acquisition script requires an explicit exchange identifier.  Passing
    // only FERE_ROUTE left NSE symbols with a null BSE code and generated
    // requests such as `scripcode=null`, which can never return facts.
    if (route === 'BSE') args.push('--bse-code', symbol);
    else args.push('--nse-code', symbol);
    if (isin) args.push('--isin', isin);
    if (dryRun) args.push('--dry-run');
    const child = spawn(process.execPath, args, { cwd: process.cwd(), env: { ...process.env, FERE_ROUTE: route }, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = ''; child.stderr.on('data', (b) => { err += b; });
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('TIMEOUT')); }, timeoutMs);
    child.on('error', reject); child.on('exit', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`EXIT_${code}:${err.slice(-500)}`)); });
  });
}
function runSupplementary(symbol, route) {
  const scripts = [
    ['scripts/fundamental/institutional29/acquire_xbrl_financials.mjs', symbol],
    ['scripts/fundamental/institutional29/acquire_mca_company_data.mjs', symbol],
  ];
  if (route === 'BSE') scripts.splice(1, 0, ['scripts/fundamental/institutional29/acquire_bse_xbrl.mjs', symbol, '--bse-code', symbol]);
  return scripts.reduce((chain, args) => chain.then(() => new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; let error = '';
    child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { error += b; });
    child.on('error', err => { console.error(`SUPPLEMENTARY ${args[0]} ${symbol}: ${err.message}`); resolve(); });
    child.on('exit', code => { if (code !== 0) console.error(`SUPPLEMENTARY ${args[0]} ${symbol} exit ${code}: ${(error || output).slice(-300)}`); resolve(); });
  })), Promise.resolve());
}
function promote(symbol) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/fere/promote_exchange_artifact.mjs', symbol], { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; let error = '';
    child.stdout.on('data', (b) => { output += b; }); child.stderr.on('data', (b) => { error += b; });
    child.on('error', reject); child.on('exit', (code) => {
      if (code !== 0) return reject(new Error(`PROMOTION_${code}:${error || output}`));
      try {
        const report = JSON.parse(output.trim().split(/\n/).pop());
        if (report.status !== 'promoted' || !report.factsAvailable) return reject(new Error('PROMOTION_READINESS_MISSING'));
        resolve(report);
      } catch { reject(new Error('PROMOTION_READINESS_REPORT_INVALID')); }
    });
  });
}
const manifest = load();
const pending = manifest.entries.filter((e) => e.status === 'pending' || e.status === 'retryable').slice(0, limit || undefined);
let completed = 0;
const startedAt = Date.now();
function progress(symbol, status, detail = '') {
  const done = manifest.entries.filter(e => ['promoted', 'source_exhausted', 'failed'].includes(e.status)).length;
  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log(`[FERE] ${done}/${manifest.entries.length} terminal | ${symbol} -> ${status}${detail ? ` | ${detail}` : ''} | ${elapsed}s`);
}
async function processEntry(entry) {
    const listing = entry.listings[0]; entry.attempts = (entry.attempts || 0) + 1; entry.status = 'acquiring'; save(manifest);
    try {
      await run(listing.symbol, listing.route, entry.isin);
      if (dryRun) { entry.status = 'dry_run'; entry.lastError = null; completed++; progress(listing.symbol, entry.status); }
      else {
        await runSupplementary(listing.symbol, listing.route);
        await promote(listing.symbol); entry.status = 'promoted'; entry.lastError = null; completed++; progress(listing.symbol, entry.status);
      }
    }
    catch (error) {
      const message = String(error.message || error);
      // Promotion_2 means every configured acquisition stage completed but
      // produced no canonical numeric fact. Retrying immediately cannot change
      // that evidence state; retain it as an explicit source-exhausted gap.
      entry.status = message.startsWith('PROMOTION_2:') ? 'source_exhausted' : (entry.attempts <= retries ? 'retryable' : 'failed');
      entry.lastError = message;
      progress(listing.symbol, entry.status, message.slice(0, 160));
    }
}
for (let offset = 0; offset < pending.length; offset += checkpointEvery) {
  const checkpoint = pending.slice(offset, offset + checkpointEvery);
  let cursor = 0;
  async function worker() { while (cursor < checkpoint.length) await processEntry(checkpoint[cursor++]); }
  await Promise.all(Array.from({ length: Math.min(concurrency, checkpoint.length) }, worker));
  save(manifest);
  const counts = {};
  for (const e of manifest.entries) counts[e.status] = (counts[e.status] || 0) + 1;
  console.log(`[FERE CHECKPOINT] ${Math.min(offset + checkpoint.length, pending.length)}/${pending.length} selected processed`, JSON.stringify(counts));
}
console.log(JSON.stringify({ manifest: manifestPath, mode: dryRun ? 'dry-run' : 'apply', selected: pending.length, completed, concurrency, checkpointEvery }));
