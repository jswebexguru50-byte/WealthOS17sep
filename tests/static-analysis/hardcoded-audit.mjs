#!/usr/bin/env node
/**
 * WealthOS Test Suite 14: Static Analysis — Hardcoded Values Audit
 *
 * This script performs a grep-based static analysis of the source code
 * to detect any hardcoded financial values, fake data, bypassed CSS
 * variables, or unverified assumptions.
 *
 * Run: node tests/static-analysis/hardcoded-audit.mjs
 * Expected output: PASS / FAIL report per check
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const SRC = path.join(ROOT, 'src');

let passCount = 0;
let failCount = 0;
const results = [];

function getAllFiles(targetPath, files = []) {
  if (!fs.existsSync(targetPath)) return files;
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    files.push(targetPath);
    return files;
  }
  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const fullPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      getAllFiles(fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function matchGlob(filename, patterns) {
  if (!patterns || patterns.length === 0) return true;
  return patterns.some(p => {
    const ext = p.replace(/^\*/, '');
    return filename.endsWith(ext);
  });
}

function grep(pattern, dir, includes = ['*.ts', '*.tsx'], excludes = []) {
  try {
    const jsPattern = pattern.replace(/\\\|/g, '|');
    const regex = new RegExp(jsPattern);
    const files = getAllFiles(dir);
    const matched = [];

    for (const file of files) {
      const base = path.basename(file);
      if (excludes.length && excludes.some(e => base.endsWith(e.replace(/^\*/, '')))) continue;
      if (includes.length && !matchGlob(base, includes)) continue;

      try {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            const relPath = path.relative(ROOT, file);
            matched.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
          }
        }
      } catch {
        // skip unreadable
      }
    }
    return matched;
  } catch (err) {
    return [];
  }
}

function check(id, description, matchesShouldBeEmpty, matches, warningOnly = false) {
  const status = matches.length === 0
    ? 'PASS'
    : (warningOnly ? 'WARN' : 'FAIL');
  const symbol = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
  console.log(`${symbol} ${id}: ${description}`);
  if (matches.length > 0 && matches.length <= 5) {
    matches.forEach(m => console.log(`     → ${m.substring(0, 120)}`));
  } else if (matches.length > 5) {
    matches.slice(0, 3).forEach(m => console.log(`     → ${m.substring(0, 120)}`));
    console.log(`     ... and ${matches.length - 3} more matches`);
  }
  results.push({ id, status, message: description, matches });
  if (status === 'PASS') passCount++;
  else if (status === 'FAIL') failCount++;
}

function info(id, description, matches) {
  const symbol = '📋';
  console.log(`${symbol} ${id}: ${description} (${matches.length} occurrences — expected)`);
  results.push({ id, status: 'INFO', message: description, matches });
}

// ---------------------------------------------------------------------------
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  WealthOS TS-14: Hardcoded Values Static Audit');
console.log('═══════════════════════════════════════════════════════════════\n');

// TS14-01: No hardcoded LTP / stock prices in production services
// (excluding test files, migration defaults like 0)
const ltpHardcoded = grep(
  'ltp\\s*[=:]\\s*[1-9][0-9]{2,}',
  path.join(SRC, 'server', 'services'),
  ['*.ts'],
  ['*.test.ts']
).filter(line =>
  !line.includes('DEFAULT 0') &&
  !line.includes('|| 0') &&
  !line.includes('?? 0') &&
  !line.includes('// ')
);
check(
  'TS14-01',
  'No hardcoded LTP/stock prices in production services',
  true,
  ltpHardcoded
);

// TS14-02: No hardcoded recommendation actions (static assignment without logic)
const staticRecs = grep(
  'actionDirective\\s*=\\s*["\']STRONG_BUY["\']',
  path.join(SRC, 'server', 'services'),
  ['*.ts']
).filter(line =>
  !line.includes('//') &&
  !line.includes('interface') &&
  !line.includes('type ') &&
  !line.includes('===') &&
  !line.includes('!==') &&
  !line.includes('test')
);
check(
  'TS14-02',
  'Recommendations not statically hardcoded (must be computed)',
  true,
  staticRecs
);

// TS14-03: No hardcoded conviction scores (should come from fusion formula)
const staticConviction = grep(
  'conviction_score\\s*=\\s*[0-9]{2,3}(?![\\.])',
  path.join(SRC, 'server', 'services'),
  ['*.ts']
).filter(line =>
  !line.includes('//') &&
  !line.includes('DEFAULT') &&
  !line.includes('MIN') &&
  !line.includes('MAX')
);
check(
  'TS14-03',
  'Conviction scores not statically hardcoded',
  true,
  staticConviction
);

// TS14-04: No hardcoded exchange rates (USD/INR ≈ 83-87 as literal)
const hardcodedFX = grep(
  '8[3-7]\\.[0-9]+.*INR\\|INR.*8[3-7]\\.[0-9]+',
  SRC,
  ['*.ts', '*.tsx']
).filter(line =>
  !line.includes('//') &&
  !line.includes('test') &&
  !line.includes('range') &&
  !line.includes('expect')
);
check(
  'TS14-04',
  'No hardcoded USD/INR exchange rates in source',
  true,
  hardcodedFX,
  true // warning only — may have fallback defaults
);

// TS14-05: Statutory tax rates exist ONLY in decimalUtils.ts (correct)
const taxRatesInUtils = grep(
  '0\\.15|0\\.20|0\\.125|0\\.10',
  path.join(SRC, 'lib', 'decimalUtils.ts'),
  ['*.ts']
);
info(
  'TS14-05',
  'Statutory tax rates in decimalUtils.ts (correct — statutory constants)',
  taxRatesInUtils
);

// Check tax rates NOT duplicated elsewhere outside decimalUtils
const taxRatesElsewhere = grep(
  'stcgRate.*=.*0\\.20\\|ltcgRate.*=.*0\\.125',
  SRC,
  ['*.ts', '*.tsx']
).filter(line =>
  !line.includes('decimalUtils') &&
  !line.includes('test') &&
  !line.includes('//') &&
  !line.includes('stcgRate(') &&
  !line.includes('ltcgRate(')
);
check(
  'TS14-05b',
  'Tax rates not duplicated outside decimalUtils.ts',
  true,
  taxRatesElsewhere
);

// TS14-06: No fake/demo company names in production code
const fakeTickers = grep(
  'ACME\\|FAKECORP\\|TESTCORP\\|DEMOCOMPANY\\|PLACEHOLDER',
  path.join(SRC, 'server'),
  ['*.ts']
).filter(line =>
  !line.includes('//') &&
  !line.includes('test') &&
  !line.includes('mock')
);
check(
  'TS14-06',
  'No fake/demo company names in production server code',
  true,
  fakeTickers
);

// TS14-07: Finance Act cutover date exists exactly in decimalUtils.ts
const cutoverInUtils = grep(
  '2024-07-23',
  path.join(SRC, 'lib', 'decimalUtils.ts'),
  ['*.ts']
);
const cutoverElsewhere = grep(
  '2024-07-23',
  SRC,
  ['*.ts', '*.tsx']
).filter(line => !line.includes('decimalUtils'));
info('TS14-07a', 'Finance Act cutover date in decimalUtils.ts', cutoverInUtils);
check(
  'TS14-07b',
  'Finance Act cutover date not duplicated outside decimalUtils.ts',
  true,
  cutoverElsewhere.filter(l =>
    !l.includes('test') &&
    !l.includes('spec') &&
    !l.includes('comment') &&
    !l.includes('//')
  ),
  true // warning — UI display of date is OK
);

// TS14-08: No raw hardcoded hex colors bypassing CSS variables in component files
const rawHexInComponents = grep(
  '#[0-9A-Fa-f]{6}',
  path.join(SRC, 'components'),
  ['*.tsx']
).filter(line =>
  !line.includes('//') &&
  !line.includes('/*') &&
  !line.includes("'#") === false && // only flag string literals
  line.includes('style=') || line.includes('fill=') || line.includes('stroke=') ||
  line.includes('color:') || line.includes('background:')
).filter(line =>
  !line.includes('var(--') &&
  !line.includes('theme')
);
check(
  'TS14-08',
  'No raw hex colors bypassing CSS variables in component tsx files',
  true,
  rawHexInComponents.slice(0, 20),
  true // warning — some chart colors are legitimately hardcoded
);

// TS14-09: CSS files use CSS variables (--var-name) for color tokens
const directColorsInCSS = grep(
  'color:\\s*#[0-9A-Fa-f]{3,6}',
  path.join(SRC, 'index.css'),
  ['*.css']
).filter(line =>
  !line.includes('var(--') &&
  !line.includes('/*') &&
  !line.includes('scrollbar') &&
  !line.includes('webkit')
);
check(
  'TS14-09',
  'CSS uses CSS variables (not raw hex) for semantic colors',
  true,
  directColorsInCSS,
  true
);

// TS14-10: No hardcoded API keys or secrets in source
const apiKeyPatterns = [
  'api_key\\s*=\\s*["\'][A-Za-z0-9]{20,}',
  'apiKey:\\s*["\'][A-Za-z0-9]{20,}',
  'secret\\s*=\\s*["\'][A-Za-z0-9]{20,}',
];
let hardcodedSecrets = [];
for (const pat of apiKeyPatterns) {
  hardcodedSecrets = [...hardcodedSecrets, ...grep(pat, SRC, ['*.ts', '*.tsx']).filter(l => !l.includes('//') && !l.includes('process.env'))];
}
check(
  'TS14-10',
  'No hardcoded API keys or secrets in source files',
  true,
  hardcodedSecrets
);

// TS14-11: process.env used for all environment configuration
const envUsage = grep(
  'process\\.env\\.',
  SRC,
  ['*.ts', '*.tsx']
);
info('TS14-11', 'Environment variables used via process.env (correct)', envUsage.slice(0, 5));

// ---------------------------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------------------------
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  AUDIT SUMMARY');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  ✅ PASSED:  ${passCount}`);
console.log(`  ❌ FAILED:  ${failCount}`);
console.log(`  ⚠️  WARNS:  ${results.filter(r => r.status === 'WARN').length}`);
console.log(`  📋 INFO:   ${results.filter(r => r.status === 'INFO').length}`);
console.log('═══════════════════════════════════════════════════════════════\n');

// Write JSON report
const reportPath = path.join(ROOT, 'tests', 'static-analysis', 'audit-report.json');
fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), results, passCount, failCount }, null, 2));
console.log(`📄 Full report written to: ${reportPath}`);

if (failCount > 0) {
  console.error(`\n⛔ STATIC AUDIT FAILED with ${failCount} critical checks. Fix before testing.\n`);
  process.exit(1);
} else {
  console.log(`\n🎉 Static audit PASSED. No hardcoded financial values detected.\n`);
}
