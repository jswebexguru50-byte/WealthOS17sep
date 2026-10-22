const fs = require('fs');
const path = require('path');
const ROOT = 'c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release';

// ── Search for Nifty 500 / NSE SME / benchmark references in all code files ──
const results = {
  nifty500_refs: [],
  sme_refs: [],
  benchmark_index_refs: [],
  universe_config_refs: [],
  server_db_path: [],
  ingestion_sources: [],
};

const SEARCH_DIRS = ['src', 'scripts', 'ingestion', 'pipeline', 'config'];
const SEARCH_EXTS = ['.ts', '.tsx', '.js', '.cjs', '.mjs', '.json', '.md'];

const NIFTY500_PATS = [/nifty.?500/i, /NIFTY500/i, /nifty_500/i, /n500/i];
const SME_PATS = [/nse.?sme/i, /sme.?emerge/i, /SME_/i, /emerge/i];
const BENCHMARK_PATS = [/nifty.?50[^0]/i, /benchmark_index/i, /index_symbol/i, /^NIFTY/];
const UNIVERSE_PATS = [/investable_universe/i, /stock_universe/i, /universe_config/i, /UNIVERSE/];
const DB_PATH_PATS = [/portfolio\.db/i, /database\.db/i, /DB_PATH/i];

function searchFile(fp, rel) {
  try {
    const content = fs.readFileSync(fp, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (NIFTY500_PATS.some(p => p.test(line))) results.nifty500_refs.push({ file: rel, line: i+1, text: line.trim().substring(0,120) });
      if (SME_PATS.some(p => p.test(line))) results.sme_refs.push({ file: rel, line: i+1, text: line.trim().substring(0,120) });
      if (BENCHMARK_PATS.some(p => p.test(line))) results.benchmark_index_refs.push({ file: rel, line: i+1, text: line.trim().substring(0,120) });
      if (UNIVERSE_PATS.some(p => p.test(line))) results.universe_config_refs.push({ file: rel, line: i+1, text: line.trim().substring(0,120) });
      if (DB_PATH_PATS.some(p => p.test(line))) results.server_db_path.push({ file: rel, line: i+1, text: line.trim().substring(0,120) });
    });
  } catch(e) {}
}

function walk(dir) {
  try {
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      const rel = path.relative(ROOT, fp);
      try {
        const stat = fs.statSync(fp);
        if (stat.isDirectory() && f !== 'node_modules' && f !== '.git' && f !== 'dist') walk(fp);
        else if (stat.isFile() && SEARCH_EXTS.includes(path.extname(f))) searchFile(fp, rel);
      } catch(e) {}
    }
  } catch(e) {}
}

for (const d of SEARCH_DIRS) {
  const full = path.join(ROOT, d);
  if (fs.existsSync(full)) walk(full);
}

// Also scan stk.json for universe size and tags
const stkPath = path.join(ROOT, 'stk.json');
if (fs.existsSync(stkPath)) {
  try {
    const stk = JSON.parse(fs.readFileSync(stkPath, 'utf8'));
    const keys = Object.keys(stk);
    results.stk_json = {
      totalSymbols: keys.length,
      sampleSymbols: keys.slice(0, 20),
      fields: stk[keys[0]] ? Object.keys(stk[keys[0]]) : [],
      sampleEntry: stk[keys[0]],
    };
  } catch(e) { results.stk_json = { error: e.message }; }
}

// Check AUDIT_DATA_SOURCES.md
const auditSrcPath = path.join(ROOT, 'AUDIT_DATA_SOURCES.md');
if (fs.existsSync(auditSrcPath)) {
  results.AUDIT_DATA_SOURCES_excerpt = fs.readFileSync(auditSrcPath, 'utf8').substring(0, 4000);
}

// Check ingestion dir
const ingDir = path.join(ROOT, 'ingestion');
if (fs.existsSync(ingDir)) {
  results.ingestion_files = fs.readdirSync(ingDir);
}

// Truncate large arrays
for (const key of Object.keys(results)) {
  if (Array.isArray(results[key]) && results[key].length > 50) {
    results[key + '_total'] = results[key].length;
    results[key] = results[key].slice(0, 50);
  }
}

const outPath = path.join(ROOT, 'reports/MARKET_DATA_CODE_REFERENCES.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
