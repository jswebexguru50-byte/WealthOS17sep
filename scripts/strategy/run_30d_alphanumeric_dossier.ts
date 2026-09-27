/** Deterministic 30-day master dossier from the seven saved strategy reports. */
import fs from 'node:fs';
import path from 'node:path';
import { getDB, dbRun } from '../../src/server/database.js';
import { ExcelExportService } from '../../src/server/services/ExcelExportService.js';

type Spec = { key: string; reportPrefix: string; cacheId: string };
const SPECS: Spec[] = [
  { key: 'S1a', reportPrefix: 'vpa_three_leg_full_universe_90_', cacheId: 'S1A_VPA_3_LEG_RECLAIM' },
  { key: 'S1b', reportPrefix: 's1b_full_universe_90_', cacheId: 'S1B_VPA_TROUGH_REVERSAL' },
  { key: 'S2a', reportPrefix: 's2a_full_universe_90_', cacheId: 'S2_INSTITUTIONAL_FVG_CE' },
  { key: 'S3a', reportPrefix: 's3a_full_universe_90_', cacheId: 'S3A_HH_HL_ATR_COMPRESSION' },
  { key: 'S4a', reportPrefix: 's4a_full_universe_90_', cacheId: 'S4A_GAP_RUNNING_STOCKS' },
  { key: 'S4b', reportPrefix: 's4b_full_universe_90_', cacheId: 'S4B_GAP_RSI_SUPPORT' },
  { key: 'S5a', reportPrefix: 's5a_full_universe_90_', cacheId: 'S5A_MINERVINI_WINNING_STOCKS' },
];
const reportDir = path.resolve('reports', 'readiness', 'vpa_three_leg');
const latestReport = (prefix: string): string => {
  const files = fs.readdirSync(reportDir).filter(f => f.startsWith(prefix) && f.endsWith('.json')).sort();
  if (!files.length) throw new Error(`Missing saved report: ${prefix}`);
  return path.join(reportDir, files[files.length - 1]);
};
const dateOf = (m: any): string | null => {
  for (const k of ['signal_date', 'Signal_Date', 'as_of_date', 'Data_Last_Date']) if (m?.[k]) return String(m[k]).slice(0, 10);
  return null;
};
const symbolOf = (m: any): string | null => m?.symbol ?? m?.Symbol ?? null;
const numberOf = (m: any, keys: string[]): number | null => {
  for (const k of keys) { const n = Number(m?.[k]); if (Number.isFinite(n)) return n; }
  return null;
};
const addDays = (iso: string, days: number): string => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

const loaded = SPECS.map(spec => {
  const file = latestReport(spec.reportPrefix);
  // Some legacy report writers emitted bare NaN/Infinity. They mean unavailable,
  // never zero; normalize only those JSON tokens before parsing.
  const raw = fs.readFileSync(file, 'utf8').replace(/(^|[^A-Za-z0-9_])(-?Infinity|NaN)(?=\s*[,}\]])/g, '$1null');
  const json = JSON.parse(raw);
  return { spec, file, json, matches: Array.isArray(json.matches) ? json.matches : [] };
});
const allDates = loaded.flatMap(x => x.matches.map(dateOf).filter(Boolean) as string[]);
const toDate = loaded.map(x => String(x.json.as_of_date_requested || '')).filter(Boolean).sort().at(-1) || allDates.sort().at(-1);
if (!toDate) throw new Error('Saved reports contain no dated matches.');
const fromDate = addDays(toDate, -29);
const universeCount = Math.max(...loaded.map(x => Number(x.json.symbols_requested || x.json.symbols_covered || 0)));
const selected: Array<{ spec: Spec; match: any; signalDate: string; symbol: string }> = [];
for (const item of loaded) for (const match of item.matches) {
  const signalDate = dateOf(match); const symbol = symbolOf(match);
  if (signalDate && symbol && signalDate >= fromDate && signalDate <= toDate) selected.push({ spec: item.spec, match, signalDate, symbol: String(symbol).toUpperCase() });
}

const db = getDB(); const scanId = `scan_alpha_30d_${Date.now()}`; const started = new Date().toISOString();
await dbRun(db, `INSERT INTO strategy_scan_metadata (id, scan_id, strategy_ids_json, status, scan_started_at) VALUES (?, ?, ?, 'RUNNING', ?)`, [`meta_${scanId}`, scanId, JSON.stringify(SPECS.map(s => s.cacheId)), started]);
for (const row of selected) {
  const m = row.match;
  await dbRun(db, `INSERT OR REPLACE INTO strategy_scan_cache (id, scan_id, strategy_id, symbol, qualified, entry_price, target1, target2, stop_loss, rr_ratio, confidence_pct, rule_checks_json, scan_date) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    `cache_${scanId}_${row.signalDate}_${row.spec.cacheId}_${row.symbol}`, scanId, row.spec.cacheId, row.symbol,
    numberOf(m, ['entry', 'Entry', 'Entry_Price', 'Signal_Price']), numberOf(m, ['target_1', 'Target_1', 'target1']), numberOf(m, ['target_2', 'Target_2', 'target2']), numberOf(m, ['stop', 'Stop', 'Stop_Loss', 'stop_loss']), numberOf(m, ['rr_target_1', 'RR_Target_1', 'riskReward']), numberOf(m, ['confidence_pct', 'Confidence_Pct']), JSON.stringify(m.Rule_Checks ?? m.rule_checks ?? m.rule_checks_and_measured_values ?? null), row.signalDate
  ]);
}
await dbRun(db, `UPDATE strategy_scan_metadata SET status='COMPLETE', scan_completed_at=?, duration_seconds=?, stocks_qualified_total=?, universe_count=? WHERE scan_id=?`, [new Date().toISOString(), 0, selected.length, universeCount, scanId]);
const buffer = await ExcelExportService.getInstance().generateComprehensiveExport(scanId, db, { fromDate, toDate });
const outputDir = path.resolve('exports'); fs.mkdirSync(outputDir, { recursive: true });
const output = path.join(outputDir, `wealthos_alphanumeric_30d_${fromDate}_${toDate}_${scanId}.xlsx`); fs.writeFileSync(output, buffer);
console.log(JSON.stringify({ scanId, strategies: SPECS.map(s => s.key), fromDate, toDate, universeCount, reportFiles: loaded.map(x => x.file), matches: selected.length, output }, null, 2));
