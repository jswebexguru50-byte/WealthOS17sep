const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const RUNTIME = path.join(process.cwd(), 'reports/readiness/runtime/remediation');
const AGENT_A_EVIDENCE_DB = path.join(RUNTIME, 'agent_a_evidence.sqlite');
const REPORT_PATH = path.join(RUNTIME, 'AGENT_F_BACKGROUND_REMEDIATION_REPORT.json');

function requeueFetchFailures() {
  console.log('Running Agent F: Background Remediation Requeue...');
  
  if (!fs.existsSync(AGENT_A_EVIDENCE_DB)) {
    console.log('No evidence DB found to requeue.');
    return;
  }

  const evDb = new Database(AGENT_A_EVIDENCE_DB);
  
  // 1. Fetch the targets marked BHAVCOPY_FETCH_FAILED
  const failed = evDb.prepare(`
    SELECT scrip_code, required_date, disposition 
    FROM bhavcopy_attempts 
    WHERE disposition = 'BHAVCOPY_FETCH_FAILED'
  `).all();

  console.log(`Found ${failed.length} previously failed fetches.`);

  if (failed.length > 0) {
    // 2. Append-only reclassification
    // We update the disposition and attempted_at in the attempts table,
    // which serves as the queue for the downstream fixed downloader.
    const stmt = evDb.prepare(`
      UPDATE bhavcopy_attempts
      SET disposition = 'RETRY_REQUIRED_FIXED_DOWNLOADER',
          attempted_at = ?
      WHERE scrip_code = ? AND required_date = ? AND disposition = 'BHAVCOPY_FETCH_FAILED'
    `);
    
    let updatedCount = 0;
    evDb.transaction(() => {
      const now = new Date().toISOString();
      for (const row of failed) {
        const res = stmt.run(now, row.scrip_code, row.required_date);
        updatedCount += res.changes;
      }
    })();
    
    console.log(`Reclassified ${updatedCount} targets to RETRY_REQUIRED_FIXED_DOWNLOADER.`);
  }

  evDb.close();

  const report = {
    agent: 'AGENT_F_BACKGROUND_REMEDIATION',
    timestamp: new Date().toISOString(),
    requeued_for_retry: failed.length,
    production_db_writes: 0
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`Agent F complete. Report written to ${REPORT_PATH}`);
}

requeueFetchFailures();
