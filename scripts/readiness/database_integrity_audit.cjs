#!/usr/bin/env node
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DB_PATH = path.join(ROOT, 'portfolio.db');
const REPORTS_DIR = path.join(ROOT, 'reports', 'readiness');
const AGENT_DIR = path.join(REPORTS_DIR, 'agents');

if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
if (!fs.existsSync(AGENT_DIR)) fs.mkdirSync(AGENT_DIR, { recursive: true });

const startTime = new Date().toISOString();
const report = {
  agent_id: "A1_DATABASE_INTEGRITY",
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

const results = {
  timestamp: startTime,
  database_ready: false,
  checks: []
};

let db;
try {
  // READ ONLY connection
  db = new Database(DB_PATH, { readonly: true });
  
  function runCheck(name, query, expected, isCritical = true) {
    report.tests_run++;
    try {
      const res = db.prepare(query).get();
      const val = Object.values(res)[0];
      const passed = val === expected;
      
      results.checks.push({
        name,
        expected,
        actual: val,
        status: passed ? "PASS" : (isCritical ? "FAIL" : "REVIEW")
      });
      
      if (passed) report.tests_passed++;
      else {
        report.tests_failed++;
        if (isCritical) report.blockers.push(`${name} failed. Actual: ${val}`);
      }
    } catch (e) {
      report.tests_failed++;
      results.checks.push({ name, status: "ERROR", message: e.message });
      report.blockers.push(`Check ${name} threw error: ${e.message}`);
    }
  }

  // Schema checks depending on whether DailyOHLCV exists
  const hasDailyOHLCV = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='DailyOHLCV'").get();
  
  if (hasDailyOHLCV) {
    runCheck("duplicate symbol/date", "SELECT COUNT(*) FROM (SELECT symbol, trade_date FROM DailyOHLCV GROUP BY symbol, trade_date HAVING COUNT(*) > 1)", 0);
    runCheck("NULL symbol", "SELECT COUNT(*) FROM DailyOHLCV WHERE symbol IS NULL", 0);
    runCheck("NULL date", "SELECT COUNT(*) FROM DailyOHLCV WHERE trade_date IS NULL", 0);
    runCheck("NULL OHLC", "SELECT COUNT(*) FROM DailyOHLCV WHERE open IS NULL OR high IS NULL OR low IS NULL OR close IS NULL", 0);
    runCheck("non-positive prices", "SELECT COUNT(*) FROM DailyOHLCV WHERE open <= 0 OR high <= 0 OR low <= 0 OR close <= 0", 0);
    runCheck("high < low", "SELECT COUNT(*) FROM DailyOHLCV WHERE high < low", 0);
    runCheck("open > high", "SELECT COUNT(*) FROM DailyOHLCV WHERE open > high", 0);
    runCheck("open < low", "SELECT COUNT(*) FROM DailyOHLCV WHERE open < low", 0);
    runCheck("close > high", "SELECT COUNT(*) FROM DailyOHLCV WHERE close > high", 0);
    runCheck("close < low", "SELECT COUNT(*) FROM DailyOHLCV WHERE close < low", 0);
    runCheck("orphan rows", "SELECT COUNT(*) FROM DailyOHLCV d LEFT JOIN MasterTickers m ON d.symbol = m.symbol WHERE m.symbol IS NULL", 0, false);
  } else {
    report.warnings.push("DailyOHLCV table not found.");
  }
  
  const hasMasterTickers = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='MasterTickers'").get();
  if (hasMasterTickers) {
    runCheck("MasterTickers duplicate symbols", "SELECT COUNT(*) FROM (SELECT symbol FROM MasterTickers GROUP BY symbol HAVING COUNT(*) > 1)", 0);
  }

  results.database_ready = report.blockers.length === 0;

} catch (e) {
  report.blockers.push("Failed to open database: " + e.message);
} finally {
  if (db) db.close();
}

fs.writeFileSync(path.join(REPORTS_DIR, 'DATABASE_INTEGRITY_AUDIT.json'), JSON.stringify(results, null, 2));

const md = `# A1 Database Integrity Audit\n\n**Database Ready**: ${results.database_ready}\n\n## Checks\n` + 
  results.checks.map(c => `- **${c.name}**: ${c.status} (Expected: ${c.expected}, Actual: ${c.actual || c.message})`).join('\n');
fs.writeFileSync(path.join(REPORTS_DIR, 'DATABASE_INTEGRITY_AUDIT.md'), md);

report.files_created.push('reports/readiness/DATABASE_INTEGRITY_AUDIT.json', 'reports/readiness/DATABASE_INTEGRITY_AUDIT.md');
report.status = "DONE";
report.completed_at = new Date().toISOString();

fs.writeFileSync(path.join(AGENT_DIR, 'A1_DATABASE_INTEGRITY.json'), JSON.stringify(report, null, 2));
console.log("A1 Database Integrity Audit completed.");
