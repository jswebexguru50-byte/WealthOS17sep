#!/usr/bin/env node
/**
 * Static guard for the canonical promotion boundary.
 * Direct provider calls are allowed only in acquisition/reconciliation
 * boundaries; analytical consumers must use canonical services.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const serviceRoot = path.join(root, 'src', 'server', 'services');
const reportDir = path.join(root, 'reports', 'audit');
const reportPath = path.join(reportDir, 'canonical_consumer_audit.json');
const directPatterns = [
  /ScreenerService\.getInstance\(\)\.fetchScreenerData/g,
  /YahooFinance/g,
];
const allowlisted = new Map([
  ['FundamentalDataService.ts', 'provider implementation behind BatchFundamentalProvider'],
  ['DualSourceReconciliationEngine.ts', 'explicit cross-source reconciliation'],
  ['UniverseDataAuditService.ts', 'official universe audit ingestion'],
  ['UniverseOfficialReingestionService.ts', 'official universe reingestion'],
  ['AutonomousSmartMoneyAgent.ts', 'acquisition agent boundary'],
  ['ConsolidatedOpportunityEngine.ts', 'legacy enrichment boundary under migration'],
  ['ScripIntelligenceDossierService.ts', 'canonical-first compatibility fallback'],
]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const findings = [];
for (const file of walk(serviceRoot)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const pattern of directPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source))) {
      const line = source.slice(0, match.index).split('\n').length;
      const name = path.basename(file);
      findings.push({ file: path.relative(root, file), line, pattern: pattern.source, allowed: allowlisted.has(name), reason: allowlisted.get(name) ?? null });
    }
  }
}

const violations = findings.filter((finding) => !finding.allowed);
const report = { generatedAt: new Date().toISOString(), scannedRoot: path.relative(root, serviceRoot), findings, violations, status: violations.length ? 'FAIL' : 'PASS' };
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, findings: findings.length, violations: violations.length, reportPath }, null, 2));
if (violations.length) process.exitCode = 1;
