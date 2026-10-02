/**
 * Deterministic, read-only calibration for the active strategy universe.
 *
 * This is an evaluation harness, not model training. It reads canonical facts
 * only and records whether the fundamental experience remains evidence-backed
 * and fail-closed for the 179 strategy symbols plus 15 independently fresh
 * Trendlyne-covered symbols.
 */
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FundamentalExperienceBuilder } from '../../src/server/services/intelligence/modules/FundamentalExperienceBuilder.js';

type EvidenceField = { status?: string; value?: unknown; provider?: string; fetchedAt?: string | null } | null | undefined;

const root = process.cwd();
const dbPath = path.join(root, 'portfolio.db');
const strategyManifestPath = path.join(root, 'data', 'fundamental_enrichment', 'excel_strategy_manifest.json');
const reportPath = path.join(root, 'reports', 'fundamental-review', 'STRATEGY_194_CALIBRATION.json');

function hashFile(file: string): string {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.alloc(64 * 1024);
  let read = 0;
  while ((read = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, read));
  fs.closeSync(fd);
  return hash.digest('hex');
}

function summarize(field: EvidenceField) {
  return {
    status: field?.status ?? 'DATA_INSUFFICIENT',
    hasValue: field?.value !== null && field?.value !== undefined,
    provider: field?.provider ?? null,
    fetchedAt: field?.fetchedAt ?? null,
  };
}

function isEvidenceBacked(field: EvidenceField): boolean {
  return Boolean(field && ['VERIFIED', 'VERIFIED_CANONICAL', 'VERIFIED_PARTIAL'].includes(field.status || '') && field.value !== null && field.value !== undefined);
}

async function main() {
  const beforeHash = hashFile(dbPath);
  const manifest = JSON.parse(fs.readFileSync(strategyManifestPath, 'utf8')) as { symbols?: unknown[] };
  const strategySymbols = [...new Set((manifest.symbols || []).map(value => String(value).trim().toUpperCase()))]
    .filter(symbol => /^[A-Z0-9&.-]+$/.test(symbol));

  // Select symbols only where each source profile is successful and within its
  // own TTL. This deliberately excludes the strategy universe to add coverage.
  const db = new Database(dbPath, { readonly: true });
  const placeholders = strategySymbols.map(() => '?').join(',') || "''";
  const extras = db.prepare(`
    SELECT symbol
    FROM fundamental_endpoint_snapshots
    WHERE provider = 'TRENDLYNE_MCP'
      AND status = 'SUCCESS'
      AND fetched_at >= datetime('now', '-15 days')
      AND endpoint IN ('parameters', 'overview', 'corporate_events', 'shareholding')
      AND symbol NOT IN (${placeholders})
    GROUP BY symbol
    HAVING COUNT(DISTINCT endpoint) = 4
    ORDER BY symbol
    LIMIT 15
  `).all(...strategySymbols) as Array<{ symbol: string }>;

  const symbols = [...strategySymbols, ...extras.map(row => row.symbol)];
  const builder = FundamentalExperienceBuilder.getInstance();
  const results: Array<Record<string, unknown>> = [];
  const counts: Record<string, number> = { READY: 0, PARTIAL: 0, DATA_INSUFFICIENT: 0, DEFECT: 0 };

  for (const [index, symbol] of symbols.entries()) {
    try {
      const payload = await builder.buildExperience(symbol, db);
      const fields = {
        revenueGrowthYoY: payload.growthTrajectory?.revenueGrowthYoY,
        pat: payload.growthTrajectory?.pat,
        cfo: payload.cashFlowWorkingCapital?.cfo,
        cfoToPat: payload.cashFlowWorkingCapital?.cfoToPat,
        debtToEquity: payload.financialStrength?.debtToEquity,
        interestCoverage: payload.financialStrength?.interestCoverage,
        promoterPct: payload.ownershipTrend?.promoterPct,
        promoterPledgePct: payload.ownershipTrend?.promoterPledgePct,
      };
      const values = Object.values(fields);
      const backed = values.filter(isEvidenceBacked).length;
      const serialized = JSON.stringify(payload);
      const defect = serialized.includes('NaN') || serialized.includes('undefined');
      const verdict = defect ? 'DEFECT' : backed === 0 ? 'DATA_INSUFFICIENT' : backed === values.length ? 'READY' : 'PARTIAL';
      counts[verdict]++;
      results.push({
        symbol,
        cohort: strategySymbols.includes(symbol) ? 'SEVEN_STRATEGY' : 'FRESH_CONTROL',
        verdict,
        evidenceBackedFieldCount: backed,
        totalCheckedFields: values.length,
        businessModel: payload.businessModel ?? 'UNKNOWN',
        fields: Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, summarize(field)])),
        sourcesUsed: payload.sourcesUsed?.length ?? 0,
        defectReason: defect ? 'Invalid numeric/string serialization' : null,
      });
    } catch (error) {
      counts.DEFECT++;
      results.push({ symbol, cohort: strategySymbols.includes(symbol) ? 'SEVEN_STRATEGY' : 'FRESH_CONTROL', verdict: 'DEFECT', defectReason: error instanceof Error ? error.message : String(error) });
    }
    if ((index + 1) % 25 === 0 || index + 1 === symbols.length) console.log(`Evaluated ${index + 1}/${symbols.length}`);
  }
  db.close();

  const afterHash = hashFile(dbPath);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({
    reviewId: 'STRATEGY_194_FUNDAMENTAL_CALIBRATION',
    mode: 'DETERMINISTIC_READ_ONLY_EVALUATION_NOT_MODEL_TRAINING',
    evaluatedAt: new Date().toISOString(),
    strategySymbolCount: strategySymbols.length,
    freshControlSymbolCount: extras.length,
    evaluatedSymbolCount: symbols.length,
    counts,
    productionDatabaseHashBefore: beforeHash,
    productionDatabaseHashAfter: afterHash,
    productionDatabaseUnchangedByEvaluator: beforeHash === afterHash,
    note: 'A concurrent Trendlyne acquisition may independently update production data. This evaluator opens SQLite read-only and performs no mutations.',
    results,
  }, null, 2));
  console.log(`Wrote ${reportPath}`);
  console.log(JSON.stringify({ evaluated: symbols.length, counts, evaluatorDidNotChangeProductionDb: beforeHash === afterHash }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
