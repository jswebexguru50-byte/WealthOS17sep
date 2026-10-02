import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportDir = path.join(root, 'reports', 'readiness', 'vpa_three_leg');

const cutoffDate = '2026-09-28';
const fromDate = '2026-09-14';

const specs = [
  ['S1a', 'vpa_three_leg_full_universe_90_'],
  ['S1b', 's1b_full_universe_90_'],
  ['S2a', 's2a_full_universe_90_'],
  ['S3a', 's3a_full_universe_90_'],
  ['S4a', 's4a_full_universe_90_'],
  ['S4b', 's4b_full_universe_90_'],
  ['S5a', 's5a_full_universe_90_'],
];

function sanitizeJson(raw) {
  return raw
    .replace(/(^|[^A-Za-z0-9_])(-?Infinity|NaN)(?=\s*[,}\]])/g, '$1null')
    .replace(/:\s*,/g, ': null,')
    .replace(/:\s*}/g, ': null}');
}

const dateOf = m => {
  for (const k of ['signal_date', 'Signal_Date', 'as_of_date', 'Data_Last_Date']) if (m?.[k]) return String(m[k]).slice(0, 10);
  return null;
};

const symbols = new Set();
const reportFiles = [];
const perStrategy = {};

for (const [strategy, prefix] of specs) {
  const files = fs.readdirSync(reportDir)
    .filter(file => file.startsWith(prefix) && file.endsWith('.json'))
    .sort();
  const file = files.at(-1);
  if (!file) throw new Error(`No ${strategy} report found.`);
  const reportPath = path.join(reportDir, file);
  const raw = fs.readFileSync(reportPath, 'utf8');
  const matches = (JSON.parse(sanitizeJson(raw)).matches || []).filter(m => {
    const d = dateOf(m);
    return d && d >= fromDate && d <= cutoffDate;
  });

  const found = new Set();
  for (const match of matches) {
    const symbol = String(match?.symbol ?? match?.Symbol ?? '').trim().toUpperCase();
    if (/^[A-Z0-9&.-]+$/.test(symbol)) {
      symbols.add(symbol);
      found.add(symbol);
    }
  }
  perStrategy[strategy] = {
    report: path.relative(root, reportPath),
    matches: matches.length,
    uniqueSymbols: found.size
  };
  reportFiles.push(path.relative(root, reportPath));
}

const sortedSymbols = [...symbols].sort();
const manifest = {
  generatedAt: new Date().toISOString(),
  cutoffDate,
  fromDate,
  source: 'LAST_15_DAYS_SEVEN_ALPHANUMERIC_STRATEGY_SCAN',
  strategyCodes: specs.map(([strategy]) => strategy),
  reportFiles,
  perStrategy,
  totalSymbols: sortedSymbols.length,
  symbols: sortedSymbols,
  llmCalls: 0
};

const output = path.join(root, 'data', 'fundamental_enrichment', 'seven_strategy_15d_signal_manifest.json');
fs.writeFileSync(output, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ output, totalSymbols: manifest.totalSymbols, perStrategy }, null, 2));
