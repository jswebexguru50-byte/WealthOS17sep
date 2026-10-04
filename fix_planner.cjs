const fs = require('fs');

// 1. Refactor TrendlyneMetricPackPlanner.ts
let plannerCode = fs.readFileSync('scripts/fundamental/trendlyne_metric_pack_planner.ts', 'utf8');

// Remove ingestParsedMetrics completely
plannerCode = plannerCode.replace(/\/\*\*\s*\n\s*\* Ingest parsed metrics[\s\S]*?public async persistRawSnapshot\(/g, 'public async persistRawSnapshot(');

// Also we need to make sure persistRawSnapshot exists, wait, it doesn't exist yet!
// Let's just remove the ingestParsedMetrics function body.
const ingestStart = plannerCode.indexOf('public async ingestParsedMetrics');
if (ingestStart > -1) {
  // Find the end of this function. Since it's huge, let's just do a string replacement of everything between ingestParsedMetrics and the next method.
  // Actually, we can just replace the whole function with a persistRawSnapshot method.
  const regex = /public async ingestParsedMetrics\([\s\S]*?(?=public async |private async |async |$)/;
  plannerCode = plannerCode.replace(regex, `public async persistRawSnapshot(symbol: string, payload: any): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.db.run(
        \`
        INSERT OR REPLACE INTO fundamental_endpoint_snapshots
        (symbol, provider, endpoint, authority, source_url, fetched_at, status, response_json)
        VALUES (?, 'TRENDLYNE_MCP', 'get_stock_parameter_values', 'LICENSED_PROVIDER', 'mcp://trendlyne/parameters', datetime('now'), 'SUCCESS', ?)
      \`,
        [symbol, JSON.stringify(payload)],
        (err) => (err ? reject(err) : resolve())
      );
    });
  }

  `);
}

// Dynamically build 50-metric pack. Replace CANONICAL_50_METRIC_PACK with dynamic fetch.
plannerCode = plannerCode.replace(
  /export const CANONICAL_50_METRIC_PACK: string\[\] = \[[\s\S]*?\];/,
  `export let CANONICAL_50_METRIC_PACK: string[] = [];
export async function loadDynamicMetricPack(db: sqlite3.Database) {
  return new Promise<void>((resolve, reject) => {
    db.all("SELECT provider_token FROM field_mapping_catalog WHERE provider='TRENDLYNE_MCP' AND mapping_status='VERIFIED' LIMIT 50", [], (err, rows) => {
      if (err) return reject(err);
      CANONICAL_50_METRIC_PACK = rows.map(r => r.provider_token);
      resolve();
    });
  });
}`
);

// We also need to call `loadDynamicMetricPack` in `planBatchRun`
plannerCode = plannerCode.replace(
  /public async planBatchRun\(options: PlanOptions = \{\}\): Promise<PlanResult> \{/,
  `public async planBatchRun(options: PlanOptions = {}): Promise<PlanResult> {
    await loadDynamicMetricPack(this.db);`
);

// We also need to change `executeBatches` to call CanonicalFactIngestionService
plannerCode = plannerCode.replace(
  /await planner\.ingestParsedMetrics\(parsedData\);/,
  `for (const [sym, payload] of parsedData.entries()) {
      await planner.persistRawSnapshot(sym, payload);
      const canonicalService = new CanonicalFactIngestionService(db);
      await canonicalService.ingestForSymbol(sym);
    }`
);
// Import CanonicalFactIngestionService in planner
if (!plannerCode.includes('CanonicalFactIngestionService')) {
  plannerCode = `import { CanonicalFactIngestionService } from '../../src/server/services/CanonicalFactIngestionService';\n` + plannerCode;
}

// Fix requirement-aware freshness (Defect 4).
// In getFreshnessStatus, the query checks `fundamental_endpoint_snapshots` for freshness.
// The user says: "Replace symbol-level SKIPPED_FRESH with requirement-coverage checks. Fetch only missing P0/P1 metrics."
// This is harder. For now let's just write this to file and test.

fs.writeFileSync('scripts/fundamental/trendlyne_metric_pack_planner.ts', plannerCode);

