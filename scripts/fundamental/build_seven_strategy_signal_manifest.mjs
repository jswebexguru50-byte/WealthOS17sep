#!/usr/bin/env node
/**
 * Build a standalone deterministic candidate manifest from one dated seven-
 * strategy run. It never changes the historical 179-symbol dossier manifest.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const cutoff = (() => {
  const i = process.argv.indexOf('--cutoff');
  return i >= 0 ? String(process.argv[i + 1] || '').trim() : '';
})();
if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) throw new Error('Usage: node build_seven_strategy_signal_manifest.mjs --cutoff YYYY-MM-DD');
const stamp = cutoff.replaceAll('-', '');
const reportDir = path.join(root, 'reports', 'readiness', 'vpa_three_leg');
const specs = [
  ['S1a', 'vpa_three_leg_full_universe_90_'],
  ['S1b', 's1b_full_universe_90_'],
  ['S2a', 's2a_full_universe_90_'],
  ['S3a', 's3a_full_universe_90_'],
  ['S4a', 's4a_full_universe_90_'],
  ['S4b', 's4b_full_universe_90_'],
  ['S5a', 's5a_full_universe_90_'],
];
const symbols = new Set();
const reportFiles = [];
const perStrategy = {};
for (const [strategy, prefix] of specs) {
  const files = fs.readdirSync(reportDir)
    .filter(file => file.startsWith(prefix) && file.endsWith('.json') && file.includes(stamp))
    .sort();
  const file = files.at(-1);
  if (!file) throw new Error(`No ${strategy} report found for cutoff ${cutoff}.`);
  const reportPath = path.join(reportDir, file);
  const raw = fs.readFileSync(reportPath, 'utf8').replace(/(^|[^A-Za-z0-9_])(-?Infinity|NaN)(?=\s*[,}\]])/g, '$1null');
  const matches = Array.isArray(JSON.parse(raw).matches) ? JSON.parse(raw).matches : [];
  const found = new Set();
  for (const match of matches) {
    const symbol = String(match?.symbol ?? match?.Symbol ?? '').trim().toUpperCase();
    if (/^[A-Z0-9&.-]+$/.test(symbol)) { symbols.add(symbol); found.add(symbol); }
  }
  perStrategy[strategy] = { report: path.relative(root, reportPath), matches: matches.length, uniqueSymbols: found.size };
  reportFiles.push(path.relative(root, reportPath));
}
const output = path.join(root, 'data', 'fundamental_enrichment', `seven_strategy_${stamp}_signal_manifest.json`);
const manifest = {
  generatedAt: new Date().toISOString(), cutoffDate: cutoff, source: 'FRESH_SEVEN_ALPHANUMERIC_STRATEGY_SCAN',
  strategyCodes: specs.map(([strategy]) => strategy), reportFiles, perStrategy,
  totalSymbols: symbols.size, symbols: [...symbols].sort(), llmCalls: 0,
};
fs.writeFileSync(output, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ output, totalSymbols: manifest.totalSymbols, perStrategy }, null, 2));
