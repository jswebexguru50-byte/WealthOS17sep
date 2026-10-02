/** Deterministic 194-company fundamental report; never calls an LLM. */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { FundamentalExperienceBuilder } from '../../src/server/services/intelligence/modules/FundamentalExperienceBuilder.js';

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/fundamental_enrichment/excel_strategy_manifest.json'), 'utf8'));
const strategySymbols = [...new Set((manifest.symbols || []).map((x: unknown) => String(x).trim().toUpperCase()))];
const db = new Database(path.join(root, 'portfolio.db'), { readonly: true });
const placeholders = strategySymbols.map(() => '?').join(',') || "''";
const controls = db.prepare(`SELECT symbol FROM fundamental_endpoint_snapshots WHERE provider='TRENDLYNE_MCP' AND status='SUCCESS' AND fetched_at >= datetime('now','-15 days') AND endpoint IN ('parameters','overview','corporate_events','shareholding') AND symbol NOT IN (${placeholders}) GROUP BY symbol HAVING COUNT(DISTINCT endpoint)=4 ORDER BY symbol LIMIT 15`).all(...strategySymbols) as Array<{symbol:string}>;

function statusOf(field: any) { return field?.status || 'DATA_INSUFFICIENT'; }
function valueOf(field: any) { return field?.value ?? null; }
function evidenceState(payload: any) {
  const critical = [payload.growthTrajectory?.pat, payload.cashFlowWorkingCapital?.cfo, payload.financialStrength?.debtToEquity, payload.ownershipTrend?.promoterPct];
  if (critical.some((f: any) => statusOf(f) === 'CONFLICTING')) return { label: '⚪ Missing/Conflicting', reason: 'At least one critical fact conflicts across sources.' };
  const pat = valueOf(payload.growthTrajectory?.pat); const cfo = valueOf(payload.cashFlowWorkingCapital?.cfo);
  if ((typeof pat === 'number' && pat < 0) || (typeof cfo === 'number' && cfo < 0)) return { label: '🔴 Concern', reason: 'Reported PAT or operating cash flow is negative; this is a factual watch flag, not a recommendation.' };
  const backed = critical.filter((f: any) => ['VERIFIED','VERIFIED_CANONICAL','VERIFIED_PARTIAL'].includes(statusOf(f)) && valueOf(f) !== null).length;
  if (backed < 3) return { label: '⚪ Missing/Conflicting', reason: 'Critical evidence is incomplete; no investment interpretation is emitted.' };
  return { label: '🟠 Mixed-Watch', reason: 'Core facts are available, but sufficient dated history/peer context for a supportive conclusion is not yet present.' };
}
function gaps(payload: any) {
  const fields: Record<string, any> = {
    revenueGrowth: payload.growthTrajectory?.revenueGrowthYoY, revenueCagr3Y: payload.growthTrajectory?.revenueCAGR3Y,
    operatingMargin: payload.growthTrajectory?.operatingMarginPct, pat: payload.growthTrajectory?.pat,
    cfo: payload.cashFlowWorkingCapital?.cfo, cfoToPat: payload.cashFlowWorkingCapital?.cfoToPat,
    debtToEquity: payload.financialStrength?.debtToEquity, interestCoverage: payload.financialStrength?.interestCoverage,
    promoter: payload.ownershipTrend?.promoterPct, pledge: payload.ownershipTrend?.promoterPledgePct,
    fii: payload.ownershipTrend?.fiiPct, dii: payload.ownershipTrend?.diiPct,
    roe: payload.capitalEfficiency?.roe, roce: payload.capitalEfficiency?.roce,
  };
  return Object.entries(fields).filter(([, f]) => !['VERIFIED','VERIFIED_CANONICAL','VERIFIED_PARTIAL'].includes(statusOf(f)) || valueOf(f) === null).map(([name, f]) => ({ field: name, status: statusOf(f), reason: f?.reason || null }));
}
async function main() {
  const builder = FundamentalExperienceBuilder.getInstance();
  const rows: any[] = [];
  for (const symbol of [...strategySymbols, ...controls.map(x => x.symbol)]) {
    const payload = await builder.buildExperience(symbol, db);
    rows.push({ symbol, cohort: strategySymbols.includes(symbol) ? 'SEVEN_STRATEGY' : 'FRESH_CONTROL', evidenceState: evidenceState(payload), snapshot: payload.executiveBrief, detailedAnalysis: payload, missingData: gaps(payload) });
  }
  db.close();
  const dir = path.join(root, 'reports/fundamental-review'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'STRATEGY_194_FUNDAMENTAL_ANALYSIS.json'), JSON.stringify({ generatedAt: new Date().toISOString(), mode: 'DETERMINISTIC_EVIDENCE_BACKED_NO_LLM', total: rows.length, rows }, null, 2));
  const markdown = ['# Strategy 194 Fundamental Analysis', '', '> Deterministic evidence-backed report. Missing data is stated, never estimated.', ''];
  for (const row of rows) markdown.push(`## ${row.symbol}`, '', `**Evidence state:** ${row.evidenceState.label} — ${row.evidenceState.reason}`, '', row.snapshot?.text || 'No evidence-backed summary is available.', '', `**Still missing:** ${row.missingData.map((x:any) => x.field).join(', ') || 'None in template scope.'}`, '');
  fs.writeFileSync(path.join(dir, 'STRATEGY_194_FUNDAMENTAL_ANALYSIS.md'), markdown.join('\n'));
  console.log(JSON.stringify({ generated: rows.length, controls: controls.length }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
