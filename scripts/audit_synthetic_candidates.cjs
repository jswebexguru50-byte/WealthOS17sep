/** Deterministic static inventory; findings still require route/source review. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'reports', 'readiness', 'APP_SYNTHETIC_CANDIDATE_INVENTORY_2026-09-22.csv');
const inputs = [path.join(root, 'src', 'server'), path.join(root, 'src', 'components')];
const excluded = new Set(['node_modules', '__tests__', 'tests', 'dist', 'build']);
const rules = [
  ['SYNTHETIC_GENERATOR', /generateSynthetic|simulate.*(?:trade|candle)|mockData|demoData/i],
  ['EXPLICIT_MOCK_MARKER', /\b(?:mocked?|synthetic|fabricated)\b/i],
  ['NUMERIC_FALLBACK', /(?:\?\?|\|\|)\s*-?\d+(?:\.\d+)?\b/],
  ['RANDOM_VALUE', /Math\.random\s*\(/],
  ['FIXED_MARKET_METRIC', /(?:lastPrice|currentPrice|profitFactor|piotroskiFScore|deliveryPercentage|beneishMScore|altmanZScore)\s*:\s*-?\d+(?:\.\d+)?\b/],
];

function* walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (excluded.has(item.name)) continue;
    const target = path.join(dir, item.name);
    if (item.isDirectory()) yield* walk(target);
    else if (/\.(?:ts|tsx|js|cjs)$/.test(item.name)) yield target;
  }
}

function csv(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

const rows = [['path', 'line', 'category', 'source_line', 'triage']];
for (const input of inputs) {
  for (const file of walk(input)) {
    const rel = path.relative(root, file).replaceAll('\\', '/');
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') ||
          trimmed.startsWith('<!--') || trimmed.includes('placeholder=')) return;
      const matched = rules.find(([, regex]) => regex.test(trimmed));
      if (matched) rows.push([rel, index + 1, matched[0], trimmed.slice(0, 350), 'UNREVIEWED_CANDIDATE']);
    });
  }
}
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, rows.map(row => row.map(csv).join(',')).join('\n') + '\n');
console.log(JSON.stringify({ candidateLines: rows.length - 1, files: new Set(rows.slice(1).map(r => r[0])).size,
  output: path.relative(root, output) }));
