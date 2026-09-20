const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../');
const REPORTS_DIR = path.join(ROOT, 'reports/market-data');

function reportProgress(msg, progress = null) {
  if (parentPort) parentPort.postMessage({ type: 'progress', phase: 'Phase 2', message: msg, progress });
}

function run() {
  reportProgress('Initializing Phase 2: Production Requirements...', 0);
  
  const SEARCH_DIRS = ['src', 'scripts', 'ingestion', 'pipeline', 'config'];
  const exts = ['.ts', '.tsx', '.js', '.cjs', '.mjs', '.json', '.md'];
  
  const discoveredIndices = new Set();
  const discoveredBenchmarks = new Set();
  let filesScanned = 0;

  function scanDir(dir) {
    try {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        const fp = path.join(dir, f);
        const stat = fs.statSync(fp);
        if (stat.isDirectory() && f !== 'node_modules' && f !== '.git' && f !== 'dist') {
          scanDir(fp);
        } else if (stat.isFile() && exts.includes(path.extname(f))) {
          filesScanned++;
          const content = fs.readFileSync(fp, 'utf8');
          if (/NIFTY.?500/i.test(content)) discoveredIndices.add('NIFTY_500');
          if (/NIFTY.?50\b/i.test(content)) discoveredIndices.add('NIFTY_50');
          if (/MICROCAP.?250/i.test(content)) discoveredIndices.add('NIFTY_MICROCAP_250');
          if (/NIFTY.?MIDCAP.?150/i.test(content)) discoveredIndices.add('NIFTY_MIDCAP_150');
          if (/NIFTY.?SMALLCAP.?250/i.test(content)) discoveredIndices.add('NIFTY_SMALLCAP_250');
          if (/S&P.?500.?TRI/i.test(content)) discoveredBenchmarks.add('SP500_TRI');
        }
      }
    } catch(e) {}
  }

  for (let i = 0; i < SEARCH_DIRS.length; i++) {
    const p = path.join(ROOT, SEARCH_DIRS[i]);
    if (fs.existsSync(p)) scanDir(p);
    reportProgress(`Scanned ${SEARCH_DIRS[i]}...`, 20 + (i / SEARCH_DIRS.length) * 60);
  }

  reportProgress('Generating PRODUCTION_DATA_REQUIREMENTS.json...', 90);
  
  const reqs = {
    total_files_scanned: filesScanned,
    required_indices: Array.from(discoveredIndices),
    required_benchmarks: Array.from(discoveredBenchmarks),
    sources: [
      { type: 'INDEX_CONSTITUENTS', identifier: 'NIFTY_500', requirement: 'HISTORICAL_MEMBERSHIP' },
      { type: 'INDEX_CONSTITUENTS', identifier: 'NIFTY_MICROCAP_250', requirement: 'HISTORICAL_MEMBERSHIP' }
    ]
  };

  fs.writeFileSync(path.join(REPORTS_DIR, 'PRODUCTION_DATA_REQUIREMENTS.json'), JSON.stringify(reqs, null, 2));

  reportProgress('Phase 2 Complete.', 100);
  if (parentPort) parentPort.postMessage({ type: 'done', phase: 'Phase 2' });
}

run();
