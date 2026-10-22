#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, 'reports', 'market-data');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

const report = {
  timestamp: new Date().toISOString(),
  input_count: 0,
  validated_count: 0,
  blocked_count: 0,
  unaccounted_count: 0,
  block_reasons: {}
};

const inputFile = path.join(REPORTS_DIR, 'PHASE10RM3_7_PROPOSED_INSERTS.jsonl');
if (!fs.existsSync(inputFile)) {
  console.error("Input file missing");
  process.exit(1);
}

const lines = fs.readFileSync(inputFile, 'utf8').split('\n').filter(l => l.trim() !== '');
report.input_count = lines.length;

const validLines = [];
const seenIds = new Set();

let sum = 0;

for (const l of lines) {
  let c;
  try { c = JSON.parse(l); } catch(e) { continue; }
  
  let valid = true;
  let reason = null;

  // Synthesize providerKey if missing
  const pKey = c.provider_key || c.providerKey || (c.exchange && c.segment && c.ISIN ? `${c.exchange}_${c.segment}|${c.ISIN}` : null);
  const tradeDate = c.trade_date || c.date;

  // Key validation
  const key = `${pKey}_${tradeDate}`;
  if (!pKey) { valid = false; reason = "UNRESOLVED_PROVIDER_KEY"; }
  else if (seenIds.has(key)) { valid = false; reason = "DUPLICATE_PROVIDER_KEY_DATE"; }
  seenIds.add(key);

  // Values exist and positive
  if (valid && (c.open == null || c.high == null || c.low == null || c.close == null || c.volume == null)) {
    valid = false; reason = "NULL_OHLCV";
  }
  if (valid && (isNaN(c.open) || isNaN(c.high) || isNaN(c.low) || isNaN(c.close))) {
    valid = false; reason = "NAN_OHLC";
  }
  if (valid && (!isFinite(c.open) || !isFinite(c.high) || !isFinite(c.low) || !isFinite(c.close))) {
    valid = false; reason = "INFINITY_OHLC";
  }
  if (valid && (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0)) {
    valid = false; reason = "NON_POSITIVE_PRICE";
  }
  
  // OHLC invariants
  if (valid && (c.high < c.open || c.high < c.close || c.low > c.open || c.low > c.close || c.high < c.low)) {
    valid = false; reason = "OHLC_INVARIANT_VIOLATION";
  }
  
  // Identify mismatch
  if (valid && (!c.ISIN || !c.symbol || !c.exchange || !c.segment)) {
    valid = false; reason = "UNRESOLVED_IDENTITY";
  }

  // Date valid
  if (valid && isNaN(Date.parse(tradeDate))) {
    valid = false; reason = "INVALID_DATE";
  }

  if (valid) {
    report.validated_count++;
    validLines.push(c);
  } else {
    report.blocked_count++;
    report.block_reasons[reason] = (report.block_reasons[reason] || 0) + 1;
  }
  sum++;
}

report.unaccounted_count = report.input_count - sum;

fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM5Y_PROMOTION_MANIFEST.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM5Y_PROMOTION_MANIFEST.jsonl'), validLines.map(v => JSON.stringify(v)).join('\n') + '\n');

const md = `# Phase 10R-M.5.y Promotion Preparation

- **Input Candidates**: ${report.input_count}
- **Validated**: ${report.validated_count}
- **Blocked**: ${report.blocked_count}
- **Unaccounted**: ${report.unaccounted_count}

### Block Reasons
${Object.entries(report.block_reasons).map(([k, v]) => `- **${k}**: ${v}`).join('\n')}

The zero-unaccounted invariant holds: \`${report.unaccounted_count === 0}\``;

fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM5Y_PROMOTION_READINESS.md'), md);
console.log(`P1 Promotion Preparation completed. Validated: ${report.validated_count}, Blocked: ${report.blocked_count}, Unaccounted: ${report.unaccounted_count}`);
