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
const load = () => JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const save = (manifest) => { const tmp = `${manifestPath}.tmp`; fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n'); fs.renameSync(tmp, manifestPath); };
function run(symbol, route) {
  return new Promise((resolve, reject) => {
    const args = ['scripts/fundamental/institutional29/acquire_exchange_data.mjs', symbol];
    if (dryRun) args.push('--dry-run');
    const child = spawn(process.execPath, args, { cwd: process.cwd(), env: { ...process.env, FERE_ROUTE: route }, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = ''; child.stderr.on('data', (b) => { err += b; });
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('TIMEOUT')); }, timeoutMs);
    child.on('error', reject); child.on('exit', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`EXIT_${code}:${err.slice(-500)}`)); });
  });
}
const manifest = load();
const pending = manifest.entries.filter((e) => e.status === 'pending' || e.status === 'retryable').slice(0, limit || undefined);
let cursor = 0; let completed = 0;
async function worker() {
  while (cursor < pending.length) {
    const entry = pending[cursor++]; const listing = entry.listings[0]; entry.attempts = (entry.attempts || 0) + 1; entry.status = 'acquiring'; save(manifest);
    try { await run(listing.symbol, listing.route); entry.status = dryRun ? 'dry_run' : 'acquired'; entry.lastError = null; completed++; }
    catch (error) { entry.status = entry.attempts <= retries ? 'retryable' : 'failed'; entry.lastError = String(error.message || error); }
    save(manifest);
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));
console.log(JSON.stringify({ manifest: manifestPath, mode: dryRun ? 'dry-run' : 'apply', selected: pending.length, completed, concurrency }));
