#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import {
  TRENDLYNE_MIRROR_SCHEMA_SQL,
  TRENDLYNE_PACKS_V1,
  TRENDLYNE_PARAMETER_CATALOG_SEED,
  TrendlyneMirrorService,
} from '../../src/server/services/trendlyne-mirror/TrendlyneMirrorService.js';

const root = process.cwd();
const dbPath = (process.env.DATABASE_URL || path.join(root, 'portfolio.db')).replace(/^sqlite:\/\//, '');
const reportsDir = path.join(root, 'reports', 'trendlyne_mirror');
const dossierRunId = valueAfter('--dossier-run') || 'DR-20261001-7D-B0A8466C';
const executeLive = process.argv.includes('--execute-live');
const importExisting = process.argv.includes('--import-existing');

function valueAfter(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] || null : null;
}

function writeJson(name: string, data: unknown) {
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(path.join(reportsDir, name), `${JSON.stringify(data, null, 2)}\n`);
}

function writeText(name: string, data: string) {
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(path.join(reportsDir, name), data);
}

function main() {
  const db = new Database(dbPath);
  try {
    db.exec(TRENDLYNE_MIRROR_SCHEMA_SQL);
    const service = new TrendlyneMirrorService(db as any);
    service.ensureSchemaCompatibility();
    service.seedCatalog();
    service.seedPacks();

    const preflight = service.buildPreflight(dossierRunId, 0);
    writeJson('PILOT_19_PREFLIGHT.json', preflight);

    let importedLegacySnapshots = 0;
    if (importExisting) {
      importedLegacySnapshots = service.importExistingTrendlyneSnapshots(preflight.symbols);
    }

    const coverage = buildCoverage(db, preflight.symbols);
    writeJson('PILOT_19_COVERAGE.json', coverage);
    writeText('PILOT_19_COVERAGE.md', renderCoverageMarkdown(coverage));

    const summary = {
      status: executeLive ? 'LIVE_EXECUTION_NOT_IMPLEMENTED_IN_THIS_SAFE_RUNNER' : 'PREFLIGHT_READY',
      dossierRunId,
      symbols: preflight.symbols,
      packs: preflight.packs,
      plannedParameterCalls: preflight.plannedParameterCalls,
      plannedRequestedCells: preflight.plannedRequestedCells,
      importedLegacySnapshots,
      networkCallsExecuted: 0,
      liveExecution: executeLive
        ? 'Use existing Trendlyne MCP client boundary after quota approval; this runner generated durable schema/preflight and reused stored evidence.'
        : 'Not requested. Add --execute-live only after preflight review.',
    };
    writeJson('PILOT_19_RUN_SUMMARY.json', summary);

    console.log(`M4 PREFLIGHT ${preflight.symbolCount} symbols, ${preflight.packCount} packs, ${preflight.plannedParameterCalls} parameter calls, ${preflight.plannedRequestedCells} requested cells.`);
    console.log(`Reports: ${path.relative(root, reportsDir)}`);
  } finally {
    db.close();
  }
}

function buildCoverage(db: Database.Database, symbols: string[]) {
  const domains = [
    'Growth',
    'Profitability',
    'Margins',
    'Balance Sheet',
    'Leverage',
    'Cash Flow',
    'Capital Allocation',
    'Working Capital',
    'Returns/Efficiency',
    'Valuation',
    'Ownership',
    'Smart Money',
    'Management Evidence',
  ];
  const placeholders = symbols.map(() => '?').join(',');
  const canonicalRows = db.prepare(`
    SELECT metric, provider, COUNT(*) AS factCount, COUNT(DISTINCT symbol) AS symbolCount
    FROM company_facts
    WHERE UPPER(symbol) IN (${placeholders})
    GROUP BY metric, provider
  `).all(...symbols) as any[];
  const trendlyneSnapshotRows = db.prepare(`
    SELECT endpoint, COUNT(DISTINCT symbol) AS symbolCount, COUNT(*) AS rowCount
    FROM fundamental_endpoint_snapshots
    WHERE provider='TRENDLYNE_MCP' AND UPPER(symbol) IN (${placeholders})
    GROUP BY endpoint
  `).all(...symbols) as any[];
  const fereFactRows = db.prepare(`
    SELECT metric, COUNT(*) AS factCount, COUNT(DISTINCT symbol) AS symbolCount
    FROM company_facts
    WHERE UPPER(symbol) IN (${placeholders}) AND UPPER(COALESCE(provider,'')) LIKE '%FERE%'
    GROUP BY metric
  `).all(...symbols) as any[];
  const mirrorRows = db.prepare(`
    SELECT canonicalMetric, COUNT(*) AS observationCount, COUNT(DISTINCT symbol) AS symbolCount
    FROM trendlyne_mirror_observations
    WHERE UPPER(symbol) IN (${placeholders})
    GROUP BY canonicalMetric
  `).all(...symbols) as any[];
  const packEfficiency = TRENDLYNE_PACKS_V1.map(pack => ({
    PACK_ID: pack.packId,
    TOKEN_COUNT: pack.tokens.length,
    SYMBOL_COUNT: symbols.length,
    CALLS: Math.ceil(symbols.length / 10),
    REQUESTED_CELLS: pack.tokens.length * symbols.length,
    NON_NULL_CELLS: null,
    NULL_CELLS: null,
    USEFUL_CELLS: null,
    CANONICALIZED_CELLS: null,
    DENSITY: null,
    USEFUL_DENSITY: null,
  }));
  return {
    generatedAt: new Date().toISOString(),
    symbols,
    domains: domains.map(domain => {
      const providerTokens = TRENDLYNE_PARAMETER_CATALOG_SEED.filter(t => t.domain === domain && t.trustState === 'VERIFIED');
      const canonicalMetrics = [...new Set(providerTokens.map(t => t.canonicalMetric).filter(Boolean))];
      const canonicalFactCount = canonicalRows
        .filter(r => canonicalMetrics.includes(r.metric))
        .reduce((sum, r) => sum + Number(r.factCount || 0), 0);
      const trendlyneMirrorObservations = mirrorRows
        .filter(r => canonicalMetrics.includes(r.canonicalMetric))
        .reduce((sum, r) => sum + Number(r.observationCount || 0), 0);
      return {
        domain,
        WealthOSRequirements: canonicalMetrics,
        TrendlyneSupported: providerTokens.length,
        TrendlyneReturned: trendlyneMirrorObservations,
        CanonicallyPromotable: canonicalMetrics.length,
        FereSupported: fereFactRows.filter(r => canonicalMetrics.includes(r.metric)).length,
        XbrlSupported: domain !== 'Ownership' && domain !== 'Smart Money' && domain !== 'Management Evidence',
        BothCrossVerified: null,
        Contradictions: 0,
        Neither: providerTokens.length === 0,
        CanonicalFactsInPilot: canonicalFactCount,
      };
    }),
    trendlyneSnapshotCoverage: trendlyneSnapshotRows,
    canonicalRows,
    fereFactRows,
    mirrorRows,
    packEfficiency,
  };
}

function renderCoverageMarkdown(coverage: any): string {
  const lines = [
    '# Trendlyne Mirror Pilot Coverage',
    '',
    `Generated: ${coverage.generatedAt}`,
    '',
    `Symbols: ${coverage.symbols.join(', ')}`,
    '',
    '| Domain | Trendlyne Supported | Trendlyne Returned | Canonically Promotable | FERE Supported | XBRL Supported | Contradictions |',
    '|---|---:|---:|---:|---:|---|---:|',
  ];
  for (const d of coverage.domains) {
    lines.push(`| ${d.domain} | ${d.TrendlyneSupported} | ${d.TrendlyneReturned} | ${d.CanonicallyPromotable} | ${d.FereSupported} | ${d.XbrlSupported} | ${d.Contradictions} |`);
  }
  lines.push('', '## Pack Efficiency', '');
  lines.push('| Pack | Tokens | Symbols | Calls | Requested Cells |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const p of coverage.packEfficiency) {
    lines.push(`| ${p.PACK_ID} | ${p.TOKEN_COUNT} | ${p.SYMBOL_COUNT} | ${p.CALLS} | ${p.REQUESTED_CELLS} |`);
  }
  return `${lines.join('\n')}\n`;
}

main();
