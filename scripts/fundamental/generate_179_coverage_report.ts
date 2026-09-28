import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.DATABASE_URL?.replace(/^sqlite:\/\//, '') || path.join(process.cwd(), 'portfolio.db');

async function all<T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows as T[]));
  });
}

async function main() {
  const db = new sqlite3.Database(dbPath);

  const manifestPath = path.join(process.cwd(), 'data', 'fundamental_enrichment', 'excel_strategy_manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const population = manifest.symbols;
  if (!Array.isArray(population) || population.length !== 179) {
    throw new Error(`Manifest must contain exactly 179 symbols. Found ${population?.length}`);
  }
  
  // ensure exact set of unique 179 symbols
  const uniqueSymbols = new Set(population);
  if (uniqueSymbols.size !== 179) {
    throw new Error(`Manifest must contain exactly 179 unique symbols. Found ${uniqueSymbols.size}`);
  }

  let report = `# 179-Candidate Coverage Report\n\n`;
  report += `| Candidate Symbol | Fresh Traceable Snapshot Exists | Freshness Status | Snapshot FetchedAt | Available Verified Fields | Requested_Not_Returned Fields | Provider_Unavailable Fields | Not_Yet_Requested Fields | Stale Fields | Scope | Period Type | Period End | Source Document ID | Eligible for Current Snapshot Export | Eligible for Periodic History Analysis |\n`;
  report += `|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;

  for (const symbol of population) {
    // Get stats from company_facts using traceable canonical definition
    const facts = await all<any>(db, `
      SELECT * FROM company_facts 
      WHERE symbol = ? 
        AND provider = 'TRENDLYNE_MCP' 
        AND providerToken IS NOT NULL 
        AND exactProviderLabel IS NOT NULL 
        AND sourceDocumentId IS NOT NULL 
        AND fetchedAt IS NOT NULL
        AND factType IN ('REPORTED', 'MISSING')
    `, [symbol]);
    
    let available = 0;
    let reqNotRet = 0;
    let provUnavail = 0;
    let stale = 0;
    let notYetReq = 0;
    
    let scope = 'UNKNOWN';
    let periodType = 'UNKNOWN';
    let periodEnd = 'UNKNOWN';
    let snapshotTime = 'N/A';
    let sourceDocId = 'N/A';

    let eligibleSnapshot = false;
    let freshTraceableExists = false;
    let eligiblePeriodic = false;

    for (const f of facts) {
      if (f.availabilityStatus === 'AVAILABLE') available++;
      if (f.availabilityStatus === 'REQUESTED_NOT_RETURNED') reqNotRet++;
      if (f.availabilityStatus === 'UNAVAILABLE_FROM_PROVIDER') provUnavail++;
      if (f.availabilityStatus === 'STALE') stale++;
      if (f.availabilityStatus === 'NOT_YET_REQUESTED') notYetReq++;

      if (f.scope && f.scope !== 'UNKNOWN' && f.availabilityStatus === 'AVAILABLE') scope = f.scope;
      if (f.periodType && f.periodType !== 'UNKNOWN' && f.availabilityStatus === 'AVAILABLE') periodType = f.periodType;
      if (f.periodEnd && f.availabilityStatus === 'AVAILABLE') periodEnd = f.periodEnd;
      if (f.fetchedAt && f.availabilityStatus === 'AVAILABLE') snapshotTime = f.fetchedAt;
      if (f.sourceDocumentId && f.availabilityStatus === 'AVAILABLE') sourceDocId = f.sourceDocumentId;

      if (f.periodEnd === 'LATEST' && f.availabilityStatus === 'AVAILABLE') {
        eligibleSnapshot = true;
      }

      if (f.periodEnd !== 'LATEST' && f.availabilityStatus === 'AVAILABLE' && ['ANNUAL', 'QUARTER', 'TTM'].includes(f.periodType)) {
        eligiblePeriodic = true;
      }
      
      if (f.fetchedAt) {
        const fetched = new Date(f.fetchedAt).getTime();
        const now = Date.now();
        const diffDays = (now - fetched) / (1000 * 60 * 60 * 24);
        if (diffDays <= 15) {
          freshTraceableExists = true;
        }
      }
    }
    
    let freshnessStatus = 'NOT_YET_REQUESTED';
    if (snapshotTime !== 'N/A') {
      freshnessStatus = freshTraceableExists ? 'AVAILABLE' : 'STALE';
    }

    report += `| ${symbol} | ${freshTraceableExists ? 'YES' : 'NO'} | ${freshnessStatus} | ${snapshotTime} | ${available} | ${reqNotRet} | ${provUnavail} | ${notYetReq} | ${stale} | ${scope} | ${periodType} | ${periodEnd} | ${sourceDocId} | ${eligibleSnapshot ? 'YES' : 'NO'} | ${eligiblePeriodic ? 'YES' : 'NO'} |\n`;
  }

  fs.writeFileSync('179_CANDIDATE_COVERAGE.md', report);
  console.log('Report written to 179_CANDIDATE_COVERAGE.md');

  db.close();
}

main().catch(console.error);
