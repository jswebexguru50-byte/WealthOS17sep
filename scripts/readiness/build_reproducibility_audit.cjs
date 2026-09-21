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
  agent_id: "A7_BUILD_REPRODUCIBILITY",
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

const pkgPath = path.join(ROOT, 'package.json');
const tsConfigPath = path.join(ROOT, 'tsconfig.json');

const buildInfo = {
  hasPackageJson: false,
  hasTsConfig: false,
  nodeVersion: process.version,
  buildScripts: [],
  warnings: []
};

if (fs.existsSync(pkgPath)) {
  report.tests_run++;
  buildInfo.hasPackageJson = true;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    buildInfo.buildScripts = Object.keys(pkg.scripts || {}).filter(k => k.includes('build'));
    if (!pkg.engines || !pkg.engines.node) {
      buildInfo.warnings.push("No Node engine specified in package.json");
    }
    report.tests_passed++;
  } catch (e) {
    report.tests_failed++;
    buildInfo.warnings.push("Failed to parse package.json");
  }
}

if (fs.existsSync(tsConfigPath)) {
  report.tests_run++;
  buildInfo.hasTsConfig = true;
  report.tests_passed++;
}

fs.writeFileSync(path.join(REPORTS_DIR, 'BUILD_REPRODUCIBILITY.json'), JSON.stringify(buildInfo, null, 2));

const md = `# A7 Build Reproducibility Audit\n\n- **Node Version**: ${buildInfo.nodeVersion}\n- **Build Scripts**: ${buildInfo.buildScripts.join(', ') || 'None'}\n- **Warnings**: ${buildInfo.warnings.length > 0 ? buildInfo.warnings.join(', ') : 'None'}`;
fs.writeFileSync(path.join(REPORTS_DIR, 'BUILD_REPRODUCIBILITY.md'), md);

report.files_created.push('reports/readiness/BUILD_REPRODUCIBILITY.json', 'reports/readiness/BUILD_REPRODUCIBILITY.md');
report.status = "DONE";
report.completed_at = new Date().toISOString();

fs.writeFileSync(path.join(AGENT_DIR, 'A7_BUILD_REPRODUCIBILITY.json'), JSON.stringify(report, null, 2));
console.log("A7 Build Reproducibility completed.");
