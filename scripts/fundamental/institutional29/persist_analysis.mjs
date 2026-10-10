#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const symbol = String(option('--symbol') || '').trim().toUpperCase().replace(/^NSE:/, '');
const file = option('--file');
const asOf = option('--as-of');
const kind = String(option('--kind') || 'LLM_ANALYSIS').toUpperCase();
const provider = option('--provider');
const model = option('--model');
const bundlePath = option('--bundle');
if (!/^[A-Z0-9&._-]{1,32}$/.test(symbol) || !file || !asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
  throw new Error('Usage: persist_analysis.mjs --symbol SYMBOL --file report.md --as-of YYYY-MM-DD [--kind LLM_ANALYSIS|DETERMINISTIC_ANALYSIS] [--provider NAME --model NAME --bundle research_bundle.json]');
}
if (kind === 'LLM_ANALYSIS' && (!provider || !model)) throw new Error('LLM analysis requires --provider and --model provenance');
const markdown = fs.readFileSync(path.resolve(file), 'utf8');
const bundle = bundlePath ? JSON.parse(fs.readFileSync(path.resolve(bundlePath), 'utf8')) : null;
const evidenceJson = bundle ? JSON.stringify(bundle) : null;
const evidenceHash = evidenceJson ? crypto.createHash('sha256').update(evidenceJson).digest('hex') : null;
const contentHash = crypto.createHash('sha256').update(JSON.stringify({ symbol, kind, asOf, markdown, evidenceHash, provider, model })).digest('hex');
const analysisId = `RA-${symbol}-${asOf.replaceAll('-', '')}-${contentHash.slice(0, 12).toUpperCase()}`;
const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || `${symbol} saved research analysis`;
const dbPath = (process.env.DATABASE_URL || path.join(process.cwd(), 'portfolio.db')).replace(/^sqlite:\/\//, '');
const db = new Database(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS ResearchAnalysisArchive (
  analysis_id TEXT PRIMARY KEY, symbol TEXT NOT NULL, analysis_kind TEXT NOT NULL, title TEXT NOT NULL,
  as_of_date TEXT NOT NULL, generated_at TEXT NOT NULL, persisted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  model_provider TEXT, model_name TEXT, prompt_version TEXT, contract_version TEXT, evidence_policy_version TEXT,
  validation_status TEXT NOT NULL, evidence_hash TEXT, content_hash TEXT NOT NULL, analysis_markdown TEXT,
  analysis_json TEXT, evidence_bundle_json TEXT, citations_json TEXT, source_job TEXT, metadata_json TEXT,
  parent_analysis_id TEXT, UNIQUE(symbol, analysis_kind, content_hash)
); CREATE INDEX IF NOT EXISTS idx_research_analysis_symbol_latest ON ResearchAnalysisArchive(symbol, persisted_at DESC);`);
const result = db.prepare(`INSERT OR IGNORE INTO ResearchAnalysisArchive (
  analysis_id,symbol,analysis_kind,title,as_of_date,generated_at,model_provider,model_name,prompt_version,
  contract_version,evidence_policy_version,validation_status,evidence_hash,content_hash,analysis_markdown,
  evidence_bundle_json,citations_json,source_job,metadata_json
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
  analysisId, symbol, kind, title, asOf, new Date().toISOString(), provider, model,
  'INSTITUTIONAL29_SYNTHESIS_V2', bundle?.contractVersion || null, bundle?.evidencePolicyVersion || null,
  kind === 'LLM_ANALYSIS' ? 'UNVALIDATED' : 'VALIDATED', evidenceHash, contentHash, markdown, evidenceJson,
  '[]', 'institutional29:persist_analysis', JSON.stringify({ sourceFile: path.resolve(file) })
);
db.close();
console.log(JSON.stringify({ analysisId, symbol, kind, created: result.changes > 0 }, null, 2));
