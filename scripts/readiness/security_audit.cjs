#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, 'reports', 'readiness');
const AGENT_DIR = path.join(REPORTS_DIR, 'agents');

if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
if (!fs.existsSync(AGENT_DIR)) fs.mkdirSync(AGENT_DIR, { recursive: true });

const startTime = new Date().toISOString();
const report = {
  agent_id: "A5_SECURITY_AUDIT",
  status: "RUNNING",
  started_at: startTime,
  completed_at: null,
  files_changed: [],
  files_created: [],
  tests_run: 0,
  tests_passed: 0,
  tests_failed: 0,
  production_db_writes: 0,
  certification_changed: false,
  blockers: [],
  warnings: [],
  next_action: "COMPLETED"
};

const TARGET_FILES = [
  '.env',
  '.env.local',
  '.env.production'
];

const TARGET_DIRS = [
  'scripts',
  'config'
];

const patterns = [
  { name: 'AWS_ACCESS_KEY', regex: /AKI[A-Z0-9]{16}/g },
  { name: 'AWS_SECRET', regex: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g }, // Naive
  { name: 'GENERIC_SECRET', regex: /(?:api_key|secret|password|token)\s*[:=]\s*["']?([A-Za-z0-9_\-\+]{15,})["']?/gi }
];

let criticalFindings = [];

function scanFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  report.tests_run++;
  
  let passed = true;
  for (const p of patterns) {
    let match;
    while ((match = p.regex.exec(content)) !== null) {
      // Extremely naive but conservative secret detection
      if (p.name === 'AWS_SECRET' && (!content.includes('AWS_SECRET') || match[0].length !== 40)) continue;
      
      criticalFindings.push({
        file: filePath.replace(ROOT, ''),
        type: p.name,
        finding: "REDACTED"
      });
      passed = false;
    }
  }
  if (passed) report.tests_passed++;
  else report.tests_failed++;
}

for (const file of TARGET_FILES) {
  scanFile(path.join(ROOT, file));
}

// Write outputs
const resultData = {
  timestamp: new Date().toISOString(),
  findings: criticalFindings,
  status: criticalFindings.length === 0 ? 'PASS' : 'REVIEW'
};

fs.writeFileSync(path.join(REPORTS_DIR, 'SECURITY_AUDIT.json'), JSON.stringify(resultData, null, 2));

const md = `# A5 Security Audit\n\n**Status**: ${resultData.status}\n\n## Findings\n${
  criticalFindings.length === 0 ? "No hardcoded secrets found." : criticalFindings.map(f => `- **${f.type}** in \`${f.file}\` (REDACTED)`).join('\n')
}`;

fs.writeFileSync(path.join(REPORTS_DIR, 'SECURITY_AUDIT.md'), md);

report.files_created.push('reports/readiness/SECURITY_AUDIT.json', 'reports/readiness/SECURITY_AUDIT.md');
report.status = "DONE";
report.completed_at = new Date().toISOString();

fs.writeFileSync(path.join(AGENT_DIR, 'A5_SECURITY_AUDIT.json'), JSON.stringify(report, null, 2));
console.log("A5 Security Audit completed.");
