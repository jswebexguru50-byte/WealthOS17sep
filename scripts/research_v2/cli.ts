#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { QUESTIONS, allSubQuestions } from '../../src/server/research_v2/contract/questions.js';
import { validateClaims } from '../../src/server/research_v2/agents/claimValidator.js';
import { completenessGate } from '../../src/server/research_v2/agents/completenessGate.js';
import { renderReport } from '../../src/server/research_v2/report/render.js';
import { openForWrite, assertSafeWrite } from '../../src/server/research_v2/db/dbGuard.js';
import type { Bundle, SubAnswer } from '../../src/server/research_v2/domain/index.js';

type Input = { bundle: Bundle; answers: SubAnswer[] };
const args = process.argv.slice(2);
const command = args[0];
function flag(name: string): string | undefined { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }
function has(name: string): boolean { return args.includes(name); }
function usage(): never { console.error('Usage: research_v2 <validate|gate|render|persist> --input bundle.json [--out file]'); process.exit(2); }
function readInput(): Input { const file = flag('--input'); if (!file) usage(); const value = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) as Input | Bundle; return 'bundle' in value ? value : { bundle: value, answers: [] }; }
function verdict(v: { ok: boolean; defects: unknown[] }): object { return { ok: v.ok, defectCount: v.defects.length, defects: v.defects }; }
function write(value: unknown, out?: string): void { const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'; if (out) fs.writeFileSync(path.resolve(out), text); else process.stdout.write(text); }
function main(): void {
  if (!command || !['validate', 'gate', 'render', 'persist'].includes(command)) usage();
  const input = readInput();
  if (command === 'validate') { write(verdict(validateClaims(input.bundle, input.answers)), flag('--out')); return; }
  if (command === 'gate') { write(verdict(completenessGate(input.answers, allSubQuestions(), input.bundle)), flag('--out')); return; }
  if (command === 'render') {
    const rendered = renderReport(input.bundle, input.answers, { includeEvidenceIndex: !has('--no-evidence') });
    const format = flag('--format') ?? 'markdown'; write(format === 'json' ? rendered.json : rendered.markdown, flag('--out')); return;
  }
  const dbPath = flag('--db'); if (!dbPath) { console.error('persist requires --db; use --dry-run for validation only'); process.exit(2); }
  // Persistence is the terminal side effect of the pipeline.  Do not allow a
  // bundle that has not passed both independent gates to reach the database.
  const validation = validateClaims(input.bundle, input.answers);
  const completeness = completenessGate(input.answers, allSubQuestions(), input.bundle);
  const checks = { validation: verdict(validation), completeness: verdict(completeness) };
  if (!validation.ok || !completeness.ok) {
    if (has('--dry-run') || !has('--write')) {
      write({ mode: 'REHEARSAL_REJECTED', dbPath: path.resolve(dbPath), checks }, flag('--out'));
      return;
    }
    write({ mode: 'PERSIST_REJECTED', dbPath: path.resolve(dbPath), checks }, flag('--out'));
    process.exitCode = 1;
    return;
  }
  const payload = JSON.stringify(input.bundle);
  const hash = crypto.createHash('sha256').update(payload).digest('hex');
  const decision = assertSafeWrite({ dbPath, allowProduction: has('--allow-production'), backupPath: flag('--backup'), quickCheckBackup: has('--quick-check') });
  if (has('--dry-run') || !has('--write')) { write({ mode: 'REHEARSAL', dbPath: decision.dbPath, production: decision.production, bundleHash: hash, bytes: Buffer.byteLength(payload), checks }, flag('--out')); return; }
  openForWrite({ dbPath, allowProduction: has('--allow-production'), backupPath: flag('--backup'), quickCheckBackup: has('--quick-check') }, db => {
    db.exec('CREATE TABLE IF NOT EXISTS research_v2_bundles (bundle_hash TEXT PRIMARY KEY, symbol TEXT NOT NULL, isin TEXT NOT NULL, as_of TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL)');
    db.prepare('INSERT OR REPLACE INTO research_v2_bundles VALUES (?, ?, ?, ?, ?, ?)').run(hash, input.bundle.symbol, input.bundle.isin, input.bundle.asOf, payload, new Date().toISOString());
  });
  write({ mode: 'PERSISTED', dbPath: decision.dbPath, production: decision.production, bundleHash: hash, checks }, flag('--out'));
}
main();
