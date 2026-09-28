import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.DATABASE_URL?.replace(/^sqlite:\/\//, '') || path.join(process.cwd(), 'portfolio.db');

async function all<T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows as T[]));
  });
}

async function run(db: sqlite3.Database, sql: string, params: unknown[] = []) {
  return new Promise<void>((resolve, reject) => db.run(sql, params, err => err ? reject(err) : resolve()));
}

async function main() {
  const db = new sqlite3.Database(dbPath);

  // Fetch all mappings from catalog
  const mappings = await all<any>(db, `SELECT * FROM field_mapping_catalog WHERE provider = 'TRENDLYNE_MCP'`);

  // Fetch up to 10 latest snapshots for parameters
  const snapshots = await all<any>(db, `
    SELECT symbol, fetched_at, response_json 
    FROM fundamental_endpoint_snapshots 
    WHERE provider='TRENDLYNE_MCP' AND endpoint='parameters'
    ORDER BY fetched_at DESC 
    LIMIT 10
  `);

  // Collect all exact labels seen in the 10 snapshots
  const observedLabels = new Set<string>();
  const labelToSnapshotInfo = new Map<string, { symbol: string, fetchedAt: string }>();

  for (const snap of snapshots) {
    const payload = JSON.parse(snap.response_json);
    let textContent = '';
    try {
        const parsedText = JSON.parse(payload.content[0].text);
        textContent = parsedText.data || '';
    } catch {
        textContent = typeof payload.content?.[0]?.text === 'string' ? payload.content[0].text : '';
    }
    const blocks = textContent.split('\n---\n');
    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 2) continue;
      const title = lines[0].trim(); // Exact label
      observedLabels.add(title);
      if (!labelToSnapshotInfo.has(title)) {
        labelToSnapshotInfo.set(title, { symbol: snap.symbol, fetchedAt: snap.fetched_at });
      }
    }
  }

  let report = `# Catalog Audit Result\n\n`;
  report += `| Provider Token | Configured Label | Verification Result | Sample Symbol | Source Snapshot Timestamp |\n`;
  report += `|---|---|---|---|---|\n`;

  for (const m of mappings) {
    const configuredLabel = m.provider_label ? m.provider_label.trim() : '';
    let verificationResult = 'PENDING_MAPPING';
    let sampleSymbol = 'N/A';
    let snapshotTimestamp = 'N/A';

    if (observedLabels.has(configuredLabel)) {
      verificationResult = 'VERIFIED';
      const info = labelToSnapshotInfo.get(configuredLabel);
      if (info) {
        sampleSymbol = info.symbol;
        snapshotTimestamp = info.fetchedAt;
      }
    }

    report += `| ${m.provider_token} | ${configuredLabel} | ${verificationResult} | ${sampleSymbol} | ${snapshotTimestamp} |\n`;

    await run(db, `UPDATE field_mapping_catalog SET mapping_status = ? WHERE provider = ? AND provider_token = ?`, [
      verificationResult,
      'TRENDLYNE_MCP',
      m.provider_token
    ]);
  }

  fs.writeFileSync('CATALOG_AUDIT_RESULT.md', report);
  console.log('Audit complete. Results written to CATALOG_AUDIT_RESULT.md');

  db.close();
}

main().catch(console.error);
