#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import {
  CONTRACT_VERSION,
  FOCUSED_DOCUMENT_QUERIES,
  RESEARCH_QUESTIONS,
  TRENDLYNE_REQUIRED_VIEWS,
  validateContract,
} from './contract.mjs';
import { buildGapResolutionPlan } from './source_resolver.mjs';
import {
  EVIDENCE_POLICY_VERSION,
  SYNTHESIS_GUARDRAILS,
  buildFactIndex,
  buildTechnicalDiagnostics,
  detectFactConflicts,
  metricEvidence,
} from './evidence_policy.mjs';
import { buildSynthesisInstructions } from './synthesis_contract.mjs';

validateContract();

const root = process.cwd();
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const optionNames = new Set(['--out-dir', '--as-of', '--position-value', '--participation-rate']);
const symbols = args.filter((value, index) => {
  if (value.startsWith('--')) return false;
  return index === 0 || !optionNames.has(args[index - 1]);
}).flatMap(value => value.split(',')).map(value => value.trim().toUpperCase()).filter(Boolean);

if (!symbols.length || args.includes('--help')) {
  console.log('Usage: node scripts/fundamental/institutional29/build_bundle.mjs SYMBOL [SYMBOL...] [--as-of YYYY-MM-DD] [--out-dir path] [--position-value INR] [--participation-rate 0.10]');
  process.exit(symbols.length ? 0 : 2);
}

const asOf = option('--as-of') || new Date().toISOString().slice(0, 10);
const positionValue = Number(option('--position-value')) || null;
const participationRate = Number(option('--participation-rate')) || 0.10;
const outputRoot = path.resolve(root, option('--out-dir') || path.join('outputs', 'institutional29'));
const persistToDb = !args.includes('--no-persist');
const dbPath = (process.env.DATABASE_URL || path.join(root, 'portfolio.db')).replace(/^sqlite:\/\//, '');
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));

const safeAll = (sql, params = []) => {
  try { return db.prepare(sql).all(...params); } catch { return []; }
};
const safeGet = (sql, params = []) => {
  try { return db.prepare(sql).get(...params) || null; } catch { return null; }
};
const hasAlias = (factMap, aliases) => aliases.some(alias => (factMap.get(alias) || []).length > 0);

function queryOhlcvBatch(requestedSymbols) {
  const catalogHelper = path.join(root, 'scripts', 'fundamental', 'institutional29', 'query_adjusted_snapshot.py');
  const empty = () => new Map(requestedSymbols.map(symbol => [symbol, []]));
  if (!fs.existsSync(catalogHelper)) return empty();
  const candidates = [
    process.env.PYTHON_BIN,
    'C:\\Users\\gopal\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
    'python',
    'python3',
  ].filter(Boolean);
  for (const executable of candidates) {
    const result = spawnSync(executable, [
      '-u', catalogHelper,
      '--symbols', requestedSymbols.join(','),
      '--as-of', asOf,
      '--limit', '260',
    ], { cwd: root, encoding: 'utf8', timeout: 60_000 });
    if (result.status === 0 && result.stdout?.trim()) {
      try {
        const payload = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
        if (!payload.ok || !Array.isArray(payload.rows)) continue;
        const bySymbol = empty();
        for (const row of payload.rows) {
          const symbol = String(row.symbol || '').toUpperCase();
          if (bySymbol.has(symbol)) bySymbol.get(symbol).push(row);
        }
        return bySymbol;
      } catch { /* try the next configured Python executable */ }
    }
  }
  return empty();
}

function tableEvidence(symbol) {
  const count = (table, column = 'symbol') => tables.has(table)
    ? Number(safeGet(`SELECT COUNT(*) AS n FROM "${table}" WHERE UPPER("${column}")=?`, [symbol])?.n || 0)
    : 0;
  return {
    FINANCIAL_HISTORY: count('HistoricalFinancialStatements'),
    SHAREHOLDING: count('HistoricalShareholdingPattern'),
    FERE: count('FEREEnrichedLedger'),
    DEALS: count('InstitutionalDeals'),
    DOCUMENTS: count('source_documents'),
    EVENTS: count('company_events') + count('StatutoryEvents', 'scripCode'),
    PEERS: tables.has('MasterTickers') ? 1 : 0,
    SEGMENTS: 0,
    RPT: 0,
  };
}

function endpointEvidence(symbol) {
  if (!tables.has('fundamental_endpoint_snapshots')) return new Map();
  const rows = safeAll(`SELECT endpoint,status,fetched_at,source_url,error
    FROM fundamental_endpoint_snapshots WHERE UPPER(symbol)=? AND provider='TRENDLYNE_MCP'
    ORDER BY fetched_at DESC`, [symbol]);
  const map = new Map();
  for (const row of rows) if (!map.has(row.endpoint)) map.set(row.endpoint, row);
  return map;
}

function endpointAvailable(endpointMap, view) {
  const aliases = view === 'events' ? ['events', 'corporate_events'] : [view];
  return aliases.some(name => endpointMap.get(name)?.status === 'SUCCESS');
}

function buildQuestionStatus(question, factMap, domains, endpointMap, ohlcv) {
  const metricGroups = question.metrics || [];
  const metrics = metricGroups.map(aliases => ({ aliases, available: hasAlias(factMap, aliases), evidence: metricEvidence(factMap, aliases) }));
  const views = (question.trendlyneViews || []).map(view => ({ view, available: endpointAvailable(endpointMap, view) }));
  const local = (question.localDomains || []).map(domain => ({
    domain,
    available: domain === 'ADJUSTED_OHLCV' ? ohlcv.status === 'AVAILABLE' : Number(domains[domain] || 0) > 0,
    rows: domain === 'ADJUSTED_OHLCV' ? ohlcv.bars.length : Number(domains[domain] || 0),
  }));
  const checks = [...metrics.map(item => item.available), ...views.map(item => item.available), ...local.map(item => item.available)];
  const available = checks.filter(Boolean).length;
  const status = !checks.length ? 'REVIEW_REQUIRED' : available === checks.length ? 'READY_FOR_ANALYSIS' : available ? 'PARTIAL' : 'DATA_INSUFFICIENT';
  return {
    ...question,
    status,
    coverage: { available, required: checks.length, pct: checks.length ? Number((available * 100 / checks.length).toFixed(1)) : 0 },
    metricChecks: metrics,
    trendlyneViewChecks: views,
    localDomainChecks: local,
    missing: [
      ...metrics.filter(item => !item.available).map(item => `METRIC:${item.aliases.join('|')}`),
      ...views.filter(item => !item.available).map(item => `TRENDLYNE_VIEW:${item.view}`),
      ...local.filter(item => !item.available).map(item => `LOCAL_DOMAIN:${item.domain}`),
    ],
  };
}

function markdownFor(bundle) {
  const lines = [
    `# ${bundle.symbol} — institutional due-diligence working report`, '',
    `Contract: ${bundle.contractVersion}  `,
    `As of: ${bundle.asOf}  `,
    `Overall readiness: ${bundle.summary.ready}/${bundle.summary.total} questions ready; ${bundle.summary.partial} partial; ${bundle.summary.insufficient} insufficient.`, '',
    '> This is an evidence bundle and report shell. The final 150–250 word answer for each question must interpret the cited evidence, preserve conflicts and avoid invented figures.', '',
  ];
  for (const item of bundle.questions) {
    lines.push(`## ${item.id}. ${item.topic}`, '', `**Question:** ${item.question}`, '', `**Evidence status:** ${item.status} (${item.coverage.available}/${item.coverage.required})`, '');
    const evidence = item.metricChecks.flatMap(check => check.evidence).slice(0, 12);
    if (evidence.length) {
      lines.push('**Available canonical evidence:**', '');
      for (const fact of evidence) lines.push(`- ${fact.metric}: ${fact.value} ${fact.unit || ''} — ${fact.periodType || 'period type unspecified'} ending ${fact.periodEnd || fact.asOfDate || 'unspecified'}, scope ${fact.scope || 'UNKNOWN'}, provider ${fact.provider || 'unspecified'}, source ${fact.sourceType || 'unspecified'}, available ${fact.availableAt || fact.fetchedAt || 'unspecified'}, fact ${fact.factId || 'unspecified'}`);
      lines.push('');
    }
    if (item.id === 29 && bundle.technicalDiagnostics) lines.push(`**Technical integrity:** ${bundle.technicalDiagnostics.status}; MA state ${bundle.technicalDiagnostics.maAlignment}; close ${bundle.technicalDiagnostics.close}; SMA20 ${bundle.technicalDiagnostics.sma20}; SMA50 ${bundle.technicalDiagnostics.sma50}; SMA200 ${bundle.technicalDiagnostics.sma200}.`, '');
    if (item.missing.length) lines.push(`**Acquisition still required:** ${item.missing.join(', ')}`, '');
    lines.push('**Analysis (150–250 words):**', '', '_Pending evidence-bounded synthesis._', '');
  }
  return lines.join('\n');
}

fs.mkdirSync(outputRoot, { recursive: true });
const index = [];
const bundlesToPersist = [];
const ohlcvRowsBySymbol = queryOhlcvBatch(symbols);

for (const symbol of symbols) {
  const facts = tables.has('company_facts') ? safeAll(`SELECT factId,metric,value,unit,currency,periodType,periodStart,periodEnd,asOfDate,scope,provider,sourceType,sourceDocumentId,sourceUrl,evidenceText,evidencePage,verificationStatus,availabilityStatus,fetchedAt,availableAt,publishedAt,inputFactIds,derivationFormula
    FROM company_facts WHERE UPPER(symbol)=? ORDER BY COALESCE(availableAt,fetchedAt,publishedAt,periodEnd) DESC`, [symbol]) : [];
  const factMap = buildFactIndex(facts, { preferredScope: 'CONSOLIDATED', asOf });
  const domains = tableEvidence(symbol);
  const endpointMap = endpointEvidence(symbol);
  const bars = ohlcvRowsBySymbol.get(symbol) || [];
  const ohlcv = {
    status: bars.length ? 'AVAILABLE' : 'SOURCE_UNAVAILABLE',
    bars,
    reason: bars.length ? null : 'ADJUSTED_DUCKDB_SERIES_UNAVAILABLE',
  };
  const technicalDiagnostics = buildTechnicalDiagnostics(bars);
  const factConflicts = detectFactConflicts(facts);
  const questions = RESEARCH_QUESTIONS.map(question => buildQuestionStatus(question, factMap, domains, endpointMap, ohlcv));
  const summary = {
    total: questions.length,
    ready: questions.filter(item => item.status === 'READY_FOR_ANALYSIS').length,
    partial: questions.filter(item => item.status === 'PARTIAL').length,
    insufficient: questions.filter(item => item.status === 'DATA_INSUFFICIENT').length,
    reviewRequired: questions.filter(item => item.status === 'REVIEW_REQUIRED').length,
  };
  const missingViews = TRENDLYNE_REQUIRED_VIEWS.filter(view => !endpointAvailable(endpointMap, view));
  const missingDocumentQueries = FOCUSED_DOCUMENT_QUERIES.map((query, index) => ({ id: `DOC_${String(index + 1).padStart(2, '0')}`, query: `${symbol} ${query}`, endpoint: `documents:DOC_${String(index + 1).padStart(2, '0')}` }));
  const acquisitionPlan = {
    localFirst: ['company_facts', 'HistoricalFinancialStatements', 'HistoricalShareholdingPattern', 'FEREEnrichedLedger', 'source_documents', 'InstitutionalDeals', 'company_events', 'DuckDB adjusted OHLCV'],
    trendlyne: { missingViews, focusedDocumentQueries: missingDocumentQueries, parameterPolicy: 'Discover exact tokens, batch <=10 symbols and <=50 verified parameters, persist raw, then promote only period-anchored facts.' },
    statutory: ['FERE/XBRL statement and note gaps', 'NSE/BSE announcements, shareholding, corporate actions, SAST and filing timestamps'],
    market: ohlcv.status === 'AVAILABLE' ? [] : ['Kite/Upstox missing candles, then rebuild adjusted DuckDB series'],
    secondary: ['Screener peer and 10-year history cross-check; never override statutory facts silently'],
  };
  const gapResolutionPlan = buildGapResolutionPlan(symbol, questions);
  const bundle = {
    contractVersion: CONTRACT_VERSION,
    evidencePolicyVersion: EVIDENCE_POLICY_VERSION,
    generatedAt: new Date().toISOString(),
    symbol,
    asOf,
    userInputs: { positionValue, participationRate },
    summary,
    synthesisGuardrails: SYNTHESIS_GUARDRAILS,
    factConflicts,
    technicalDiagnostics,
    sourceState: { canonicalFactRows: facts.length, localDomains: domains, trendlyneEndpoints: [...endpointMap.entries()].map(([endpoint, row]) => ({ endpoint, ...row })), adjustedOhlcv: { status: ohlcv.status, bars: ohlcv.bars.length, latestDate: ohlcv.bars.at(-1)?.trade_date || null } },
    acquisitionPlan,
    gapResolutionPlan,
    questions,
  };
  const symbolDir = path.join(outputRoot, symbol);
  fs.mkdirSync(symbolDir, { recursive: true });
  fs.writeFileSync(path.join(symbolDir, 'research_bundle.json'), JSON.stringify(bundle, null, 2));
  fs.writeFileSync(path.join(symbolDir, 'acquisition_plan.json'), JSON.stringify(acquisitionPlan, null, 2));
  fs.writeFileSync(path.join(symbolDir, 'gap_resolution_plan.json'), JSON.stringify(gapResolutionPlan, null, 2));
  fs.writeFileSync(path.join(symbolDir, 'report_working.md'), markdownFor(bundle));
  fs.writeFileSync(path.join(symbolDir, 'synthesis_instructions.md'), buildSynthesisInstructions(bundle));
  bundlesToPersist.push(bundle);
  index.push({ symbol, ...summary, gapActions: gapResolutionPlan.summary.totalActions, p0GapActions: gapResolutionPlan.summary.p0, canonicalFactRows: facts.length, ohlcvStatus: ohlcv.status, latestOhlcvDate: ohlcv.bars.at(-1)?.trade_date || null, output: path.relative(root, symbolDir) });
}

fs.writeFileSync(path.join(outputRoot, 'index.json'), JSON.stringify({ contractVersion: CONTRACT_VERSION, generatedAt: new Date().toISOString(), asOf, symbols: index }, null, 2));
console.log(JSON.stringify({ contractVersion: CONTRACT_VERSION, outputRoot, symbols: index }, null, 2));
db.close();

if (persistToDb) {
  const writeDb = new Database(dbPath);
  writeDb.exec(`CREATE TABLE IF NOT EXISTS ResearchAnalysisArchive (
    analysis_id TEXT PRIMARY KEY, symbol TEXT NOT NULL, analysis_kind TEXT NOT NULL,
    title TEXT NOT NULL, as_of_date TEXT NOT NULL, generated_at TEXT NOT NULL,
    persisted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, model_provider TEXT, model_name TEXT,
    prompt_version TEXT, contract_version TEXT, evidence_policy_version TEXT,
    validation_status TEXT NOT NULL, evidence_hash TEXT, content_hash TEXT NOT NULL,
    analysis_markdown TEXT, analysis_json TEXT, evidence_bundle_json TEXT, citations_json TEXT,
    source_job TEXT, metadata_json TEXT, parent_analysis_id TEXT,
    UNIQUE(symbol, analysis_kind, content_hash)
  );
  CREATE INDEX IF NOT EXISTS idx_research_analysis_symbol_latest ON ResearchAnalysisArchive(symbol, persisted_at DESC);
  CREATE INDEX IF NOT EXISTS idx_research_analysis_kind_latest ON ResearchAnalysisArchive(analysis_kind, persisted_at DESC);`);
  const insert = writeDb.prepare(`INSERT OR IGNORE INTO ResearchAnalysisArchive (
    analysis_id,symbol,analysis_kind,title,as_of_date,generated_at,contract_version,evidence_policy_version,
    validation_status,evidence_hash,content_hash,evidence_bundle_json,citations_json,source_job,metadata_json
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const persist = writeDb.transaction(items => {
    for (const bundle of items) {
      const evidenceJson = JSON.stringify(bundle);
      const evidenceHash = crypto.createHash('sha256').update(evidenceJson).digest('hex');
      const contentHash = crypto.createHash('sha256').update(JSON.stringify({ symbol: bundle.symbol, kind: 'EVIDENCE_BUNDLE', asOfDate: bundle.asOf, evidenceHash })).digest('hex');
      const analysisId = `RA-${bundle.symbol}-${bundle.asOf.replaceAll('-', '')}-${contentHash.slice(0, 12).toUpperCase()}`;
      insert.run(analysisId, bundle.symbol, 'EVIDENCE_BUNDLE', `${bundle.symbol} Institutional-29 evidence bundle`, bundle.asOf,
        bundle.generatedAt, bundle.contractVersion, bundle.evidencePolicyVersion, 'EVIDENCE_READY', evidenceHash,
        contentHash, evidenceJson, '[]', 'institutional29:build_bundle', JSON.stringify({ summary: bundle.summary }));
    }
  });
  persist(bundlesToPersist);
  writeDb.close();
}
