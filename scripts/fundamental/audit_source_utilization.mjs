#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const root = process.cwd();
const dbPath = (process.env.DATABASE_URL || path.join(root, 'portfolio.db')).replace(/^sqlite:\/\//, '');
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
const tableSet = new Set(tables);
const q = (sql, params = []) => db.prepare(sql).all(...params);
const scalar = (sql, params = []) => db.prepare(sql).pluck().get(...params);
const safeCount = table => {
  try { return scalar(`SELECT COUNT(*) FROM \"${String(table).replaceAll('"', '""')}\"`) ?? 0; }
  catch { return null; }
};

const relevantPattern = /(fact|fundamental|financial|fere|xbrl|sharehold|ownership|event|deal|announce|document|news|ohlcv|price|ticker|audit|source|snapshot)/i;
const relevantTables = tables.filter(name => relevantPattern.test(name)).map(name => ({ table: name, rows: safeCount(name) }));

const endpointCoverage = tableSet.has('fundamental_endpoint_snapshots')
  ? q(`SELECT provider, endpoint, status, COUNT(*) AS rows, COUNT(DISTINCT symbol) AS symbols,
              MIN(fetched_at) AS oldest, MAX(fetched_at) AS newest
       FROM fundamental_endpoint_snapshots
       GROUP BY provider, endpoint, status
       ORDER BY provider, endpoint, status`)
  : [];

const sourceCoverage = tableSet.has('fundamental_source_snapshots')
  ? q(`SELECT provider, status, COUNT(*) AS rows, COUNT(DISTINCT symbol) AS symbols,
              MIN(fetched_at) AS oldest, MAX(fetched_at) AS newest
       FROM fundamental_source_snapshots
       GROUP BY provider, status
       ORDER BY provider, status`)
  : [];

const factCoverage = tableSet.has('company_facts')
  ? q(`SELECT metric, COUNT(*) AS rows, COUNT(DISTINCT symbol) AS symbols,
              SUM(CASE WHEN value IS NULL THEN 1 ELSE 0 END) AS null_values,
              SUM(CASE WHEN periodEnd IS NULL OR TRIM(periodEnd)='' THEN 1 ELSE 0 END) AS missing_period_end,
              SUM(CASE WHEN availableAt IS NULL OR TRIM(availableAt)='' THEN 1 ELSE 0 END) AS missing_available_at
       FROM company_facts
       GROUP BY metric
       ORDER BY symbols DESC, rows DESC, metric ASC`)
  : [];

const mappingCoverage = tableSet.has('field_mapping_catalog')
  ? q(`SELECT provider, mapping_status, COUNT(*) AS rows,
              COUNT(DISTINCT provider_token) AS distinct_tokens,
              COUNT(DISTINCT canonical_metric) AS canonical_fields
       FROM field_mapping_catalog
       GROUP BY provider, mapping_status
       ORDER BY provider, mapping_status`)
  : [];

const mdTable = (headers, rows) => {
  if (!rows.length) return '_No rows._\n';
  const esc = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
  return `| ${headers.join(' | ')} |\n|${headers.map(() => '---').join('|')}|\n${rows.map(row => `| ${headers.map(h => esc(row[h])).join(' | ')} |`).join('\n')}\n`;
};

const lines = [
  '# WealthOS source-utilization audit',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  'This is a read-only inventory. It measures what WealthOS currently stores; it does not treat the existence of a raw snapshot as canonical availability.',
  '',
  '## Relevant database tables',
  '',
  mdTable(['table', 'rows'], relevantTables),
  '## Provider endpoint snapshots',
  '',
  mdTable(['provider', 'endpoint', 'status', 'rows', 'symbols', 'oldest', 'newest'], endpointCoverage),
  '## Raw source snapshots',
  '',
  mdTable(['provider', 'status', 'rows', 'symbols', 'oldest', 'newest'], sourceCoverage),
  '## Field-mapping catalog',
  '',
  mdTable(['provider', 'mapping_status', 'rows', 'distinct_tokens', 'canonical_fields'], mappingCoverage),
  '## Canonical fact coverage',
  '',
  mdTable(['metric', 'rows', 'symbols', 'null_values', 'missing_period_end', 'missing_available_at'], factCoverage),
];

const outPath = path.join(root, 'reports', 'fundamental_source_utilization_audit.md');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, lines.join('\n'));
console.log(outPath);
db.close();
