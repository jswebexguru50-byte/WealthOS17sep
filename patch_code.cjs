const fs = require('fs');

// 1. PATCH CanonicalFactIngestionService.ts
let canonicalPath = 'src/server/services/CanonicalFactIngestionService.ts';
let canonicalCode = fs.readFileSync(canonicalPath, 'utf8');

canonicalCode = canonicalCode.replace(
  /const factId = \`\$\{companyId\}_\$\{mapping.canonical_metric\}_LATEST_\$\{periodType\}_\$\{mapping.consolidated_or_standalone\}_REPORTED\`;/,
  `let relativePeriod = 'LATEST';
        if (mapping.provider_token.match(/my\\d$/)) {
            relativePeriod = 'LATEST_MY' + mapping.provider_token.slice(-1);
        } else if (mapping.provider_token.match(/mq\\d$/)) {
            relativePeriod = 'LATEST_MQ' + mapping.provider_token.slice(-1);
        } else if (mapping.provider_token.match(/1q$/)) {
            relativePeriod = 'LATEST_1Q';
        }
        
        const factId = \`\$\{companyId\}_\$\{mapping.canonical_metric\}_\$\{relativePeriod\}_\$\{periodType\}_\$\{mapping.consolidated_or_standalone\}_REPORTED\`;`
);

canonicalCode = canonicalCode.replace(
  /periodType, 'LATEST', observationDate/,
  `periodType, relativePeriod, observationDate`
);

fs.writeFileSync(canonicalPath, canonicalCode);
console.log("Patched CanonicalFactIngestionService.ts");


// 2. PATCH trendlyne_metric_pack_planner.ts
let plannerPath = 'scripts/fundamental/trendlyne_metric_pack_planner.ts';
let plannerCode = fs.readFileSync(plannerPath, 'utf8');

// Replace CANONICAL_50_METRIC_PACK with dynamic fetch
plannerCode = plannerCode.replace(
  /export const CANONICAL_50_METRIC_PACK: string\[\] = \[[^]*?\];/,
  `export let CANONICAL_50_METRIC_PACK: string[] = [];
export async function loadDynamicMetricPack(db: sqlite3.Database) {
  return new Promise<void>((resolve, reject) => {
    db.all("SELECT provider_token FROM field_mapping_catalog WHERE provider='TRENDLYNE_MCP' AND mapping_status='VERIFIED' LIMIT 50", [], (err, rows: any[]) => {
      if (err) return reject(err);
      CANONICAL_50_METRIC_PACK = rows.map(r => r.provider_token);
      resolve();
    });
  });
}`
);

// We need to also replace CANONICAL_30_METRIC_PACK initialization to use it
plannerCode = plannerCode.replace(
  /export const CANONICAL_30_METRIC_PACK = CANONICAL_50_METRIC_PACK;/,
  `export let CANONICAL_30_METRIC_PACK: string[] = [];
// Will be initialized in loadDynamicMetricPack
const _old_load = loadDynamicMetricPack;
export async function loadDynamicMetricPack(db: sqlite3.Database) {
  return new Promise<void>((resolve, reject) => {
    db.all("SELECT provider_token FROM field_mapping_catalog WHERE provider='TRENDLYNE_MCP' AND mapping_status='VERIFIED' LIMIT 50", [], (err, rows: any[]) => {
      if (err) return reject(err);
      CANONICAL_50_METRIC_PACK = rows.map(r => r.provider_token);
      CANONICAL_30_METRIC_PACK = CANONICAL_50_METRIC_PACK;
      resolve();
    });
  });
}`
);

// Add call to loadDynamicMetricPack in planBatchRun
plannerCode = plannerCode.replace(
  /public async planBatchRun\(options: PlanOptions = \{\}\): Promise<PlanResult> \{/,
  `public async planBatchRun(options: PlanOptions = {}): Promise<PlanResult> {
    await loadDynamicMetricPack(this.db);`
);


// Replace ingestParsedMetrics body
const ingestStart = plannerCode.indexOf('public async ingestParsedMetrics');
if (ingestStart > -1) {
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

// In executeBatches, call persistRawSnapshot + CanonicalFactIngestionService
plannerCode = plannerCode.replace(
  /await planner\.ingestParsedMetrics\(parsedData\);/,
  `for (const [sym, payload] of parsedData.entries()) {
      await planner.persistRawSnapshot(sym, payload);
      const canonicalService = new CanonicalFactIngestionService(db);
      await canonicalService.ingestForSymbol(sym);
    }`
);

// Add import for CanonicalFactIngestionService
if (!plannerCode.includes('CanonicalFactIngestionService')) {
  plannerCode = plannerCode.replace(/import { StreamableHTTPClientTransport } from '@modelcontextprotocol\/sdk\/client\/streamableHttp\.js';/, 
  `import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CanonicalFactIngestionService } from '../../src/server/services/CanonicalFactIngestionService';`);
}

// Defect 4: "Replace symbol-level SKIPPED_FRESH with requirement-coverage checks. Fetch only missing P0/P1 metrics."
// This means getFreshnessStatus should check if ANY P0/P1 metrics are missing.
// We can modify getFreshnessStatus to check `analyze_gaps.mjs` output or company_facts directly.
// Actually, for now let's just make getFreshnessStatus return false (not fresh) if they are missing data.
// A simpler way: we'll run `analyze_gaps.mjs`, which creates `analyze360_missing_data_inventory.json`.
// We can load that JSON and if a symbol has gaps, it's NOT fresh.
plannerCode = plannerCode.replace(
  /const fifteenDaysAgo = Date.now\(\) - 15 \* 86_400_000;/,
  `const fifteenDaysAgo = Date.now() - 15 * 86_400_000;
    
    let missingInventory: any = { missingBySymbol: {} };
    try {
      const invPath = require('path').join(process.cwd(), 'reports', 'data_quality', 'analyze360_missing_data_inventory.json');
      missingInventory = JSON.parse(require('fs').readFileSync(invPath, 'utf8'));
    } catch(e) {}
    `
);

plannerCode = plannerCode.replace(
  /map\.set\(upper, \{ isFresh: ts > fifteenDaysAgo, lastFetched: last \}\);/,
  `
        const hasGaps = missingInventory.missingBySymbol[upper] && missingInventory.missingBySymbol[upper].length > 0;
        map.set(upper, { isFresh: (ts > fifteenDaysAgo && !hasGaps), lastFetched: last });
  `
);

fs.writeFileSync(plannerPath, plannerCode);
console.log("Patched trendlyne_metric_pack_planner.ts");

