import * as fs from 'fs';
import * as path from 'path';

function main() {
  const statusPath = path.resolve('reports/data-acquisition/DAEMON_STATUS.json');
  const queuePath = path.resolve('reports/data-acquisition/QUEUE_STATE.json');

  console.log('================================================================');
  console.log(' WEALTHOS DATA ACQUISITION DAEMON TELEMETRY MONITOR');
  console.log('================================================================');

  if (!fs.existsSync(statusPath)) {
    console.log(`[Status] Daemon status file not found at: ${statusPath}`);
    console.log(`[Status] Daemon may not be running yet.`);
    return;
  }

  try {
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    console.log(`State:                 ${status.daemonState}`);
    console.log(`Uptime:                ${status.uptimeSeconds} seconds`);
    console.log(`Timestamp:             ${status.timestamp}`);
    console.log(`Active Workers:        ${status.activeWorkersCount}`);
    console.log(`Queue Depth:           ${status.queueDepth}`);
    console.log(`Completed Tasks:       ${status.completedTasksCount}`);
    console.log(`Failed Tasks:          ${status.failedTasksCount}`);
    console.log(`Records Acquired:      ${status.recordsAcquiredTotal}`);
    console.log(`Production Promotion:  ${status.productionPromotionAuthorization}`);
    console.log(`Live Trading:          ${status.liveTrading}`);

    console.log('\n--- Domain Coverage ---');
    for (const [domain, pct] of Object.entries(status.coverageByDomain || {})) {
      const numPct = typeof pct === 'number' ? pct : 0;
      console.log(`  ${domain.padEnd(25)} : ${numPct.toFixed(2)}%`);
    }

    console.log('\n--- Data Source Health ---');
    for (const [src, health] of Object.entries(status.sourceHealth || {})) {
      const h: any = health;
      console.log(`  ${src.padEnd(28)} : Status=${h.status}, Req=${h.requestsCount}, Err=${h.errorsCount}`);
    }

    if (fs.existsSync(queuePath)) {
      const queueStat = fs.statSync(queuePath);
      console.log(`\nQueue State File Size: ${(queueStat.size / 1024).toFixed(1)} KB`);
    }

    console.log('================================================================');
  } catch (err: any) {
    console.error('[Status] Error reading status:', err.message);
  }
}

main();
