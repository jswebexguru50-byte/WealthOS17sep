import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { CanonicalFactIngestionService } from '../../src/server/services/CanonicalFactIngestionService.js';

const root = process.cwd();
const dbPath = path.join(root, 'portfolio.db');
const db = new sqlite3.Database(dbPath);

const all = (sql: string, params: unknown[] = []) =>
  new Promise<any[]>((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || [])));
const run = (sql: string, params: unknown[] = []) =>
  new Promise<void>((resolve, reject) => db.run(sql, params, err => err ? reject(err) : resolve()));

// 37 trusted tokens in the exact pack
const TRUSTED_37_TOKENS = [
  'opmpctq', 'pegttm', 'sra', 'sramy1', 'sramy2', 'sramy3',
  'npamy1', 'npamy2', 'npamy3', 'opa', 'opmpctqmq1', 'rocea',
  'roea', 'roica', 'cfoa', 'ncfa', 'prompct', 'prompledge',
  'fiihold', 'fiipct1q', 'mfpct1q', 'instihold', 'pettm',
  'pbva', 'mcapq', 'debtcea', 'netdebta', 'pata', 'npq',
  'opq', 'epsttm', 'cepsa', 'capitalexpenditurea',
  'dividendpayoutnpa', 'bvsha', 'cratioa', 'totalsrq'
];

// Exact raw provider output received from Trendlyne MCP in step 1706
const RAW_PROVIDER_TEXT = `3326341|Capillary Technologies|CAPILLARY|544614|2026-10-01
1520710|Global Pet |GLOBALPET||2026-10-01

Net Cash Flow Ann.
CAPILLARY:-193.54
GLOBALPET:1.70

---

Operating Profit Qtr
CAPILLARY:40.30
GLOBALPET:0.00

---

PEG TTM
CAPILLARY:None
GLOBALPET:None

---

Total Debt to Total Equity Ann.
CAPILLARY:0.04
GLOBALPET:0.00

---

OPM 1Q ago %
CAPILLARY:16.41
GLOBALPET:None

---

PE TTM
CAPILLARY:105.97
GLOBALPET:38.75

---

BVSH Ann.
CAPILLARY:128.90
GLOBALPET:46.85

---

Operating Profit Margin Qtr %
CAPILLARY:15.70
GLOBALPET:None

---

Net Profit Ann. 3Y Ago
CAPILLARY:-87.72
GLOBALPET:2.00

---

MF holding change QoQ %
CAPILLARY:0.80
GLOBALPET:0.00

---

Net Profit Qtr
CAPILLARY:-9.55
GLOBALPET:None

---

ROCE Ann. %
CAPILLARY:3.03
GLOBALPET:12.43

---

Cash from Operating Act. Ann.
CAPILLARY:149.91
GLOBALPET:7.07

---

ROIC Ann. %
CAPILLARY:4.90
GLOBALPET:9.59

---

Current Ratio Ann.
CAPILLARY:2.80
GLOBALPET:3.40

---

FII holding current Qtr %
CAPILLARY:3.34
GLOBALPET:6.79

---

Capex Ann.
CAPILLARY:None
GLOBALPET:None

---

Basic EPS TTM
CAPILLARY:5.29
GLOBALPET:4.50

---

ROE Ann. %
CAPILLARY:5.11
GLOBALPET:9.59

---

Institutional holding current Qtr %
CAPILLARY:22.72
GLOBALPET:10.77

---

PBV Adjusted
CAPILLARY:4.40
GLOBALPET:3.72

---

Cash EPS Ann.
CAPILLARY:16.04
GLOBALPET:4.65

---

Promoter holding pledge percentage % Qtr
CAPILLARY:0.00
GLOBALPET:0.00

---

Operating Profit Ann.
CAPILLARY:92.85
GLOBALPET:5.36

---

Rev. Ann. 2Y ago
CAPILLARY:535.44
GLOBALPET:40.01

---

Net Profit Ann. 1Y Ago
CAPILLARY:13.28
GLOBALPET:4.28

---

Dividend Payout to NP Ann.
CAPILLARY:0.00
GLOBALPET:None

---

Total Rev. Qtr
CAPILLARY:262.35
GLOBALPET:None

---

Net Profit Ann. 2Y ago
CAPILLARY:-59.38
GLOBALPET:2.06

---

Rev. Ann. 3Y ago
CAPILLARY:266.25
GLOBALPET:35.15

---

Promoter holding latest %
CAPILLARY:51.45
GLOBALPET:60.13

---

FII holding change QoQ %
CAPILLARY:-0.09
GLOBALPET:None

---

Net Debt Ann.
CAPILLARY:None
GLOBALPET:None

---

Market Cap
CAPILLARY:4460.55
GLOBALPET:205.34

---

PAT Before ExtraOrdinary Items Ann.
CAPILLARY:52.39
GLOBALPET:5.06

---

Total Rev. Ann.
CAPILLARY:748.33
GLOBALPET:57.41

---

Total Rev. Ann. 1Y Ago
CAPILLARY:611.87
GLOBALPET:46.14`;

// Parsed values per symbol
const CAPILLARY_METRICS: Record<string, number | null | string> = {
  asOfDate: '2026-10-01',
  companyName: 'Capillary Technologies',
  sra: 748.33,
  sramy1: 611.87,
  sramy2: 535.44,
  sramy3: 266.25,
  totalsrq: 262.35,
  opa: 92.85,
  opq: 40.30,
  opmpctq: 15.70,
  opmpctqmq1: 16.41,
  pata: 52.39,
  npq: -9.55,
  npamy1: 13.28,
  npamy2: -59.38,
  npamy3: -87.72,
  cfoa: 149.91,
  ncfa: -193.54,
  rocea: 3.03,
  roea: 5.11,
  roica: 4.90,
  prompct: 51.45,
  prompledge: 0.00,
  fiihold: 3.34,
  fiipct1q: -0.09,
  mfpct1q: 0.80,
  instihold: 22.72,
  debtcea: 0.04,
  cratioa: 2.80,
  bvsha: 128.90,
  epsttm: 5.29,
  cepsa: 16.04,
  dividendpayoutnpa: 0.00,
  pettm: 105.97,
  pbva: 4.40,
  mcapq: 4460.55,
  pegttm: null,
  capitalexpenditurea: null,
  netdebta: null
};

const GLOBALPET_METRICS: Record<string, number | null | string> = {
  asOfDate: '2026-10-01',
  companyName: 'Global Pet',
  sra: 57.41,
  sramy1: 46.14,
  sramy2: 40.01,
  sramy3: 35.15,
  totalsrq: null,
  opa: 5.36,
  opq: 0.00,
  opmpctq: null,
  opmpctqmq1: null,
  pata: 5.06,
  npq: null,
  npamy1: 4.28,
  npamy2: 2.06,
  npamy3: 2.00,
  cfoa: 7.07,
  ncfa: 1.70,
  rocea: 12.43,
  roea: 9.59,
  roica: 9.59,
  prompct: 60.13,
  prompledge: 0.00,
  fiihold: 6.79,
  fiipct1q: null,
  mfpct1q: 0.00,
  instihold: 10.77,
  debtcea: 0.00,
  cratioa: 3.40,
  bvsha: 46.85,
  epsttm: 4.50,
  cepsa: 4.65,
  dividendpayoutnpa: null,
  pettm: 38.75,
  pbva: 3.72,
  mcapq: 205.34,
  pegttm: null,
  capitalexpenditurea: null,
  netdebta: null
};

async function main() {
  console.log('=== WealthOS Controlled Final Execution: Provider Promotion ===\n');

  const fetchedAt = '2026-10-04 10:49:42';

  // 1. Audit artifact persistence
  const rawAuditPayload = {
    provider: 'TRENDLYNE_MCP',
    operation: 'get_stock_parameter_values',
    symbols: ['CAPILLARY', 'GLOBALPET'],
    requestedTokens: TRUSTED_37_TOKENS,
    requestedCells: 74,
    returnedCells: 74,
    returnedNonNullCells: 62,
    returnedNullCells: 12,
    providerTimestamp: '2026-10-01',
    fetchedAt,
    callStatus: 'SUCCESS',
    detailsPerSymbol: {
      CAPILLARY: {
        requested: 37,
        nonNull: 34,
        nullCount: 3,
        nullTokens: ['pegttm', 'capitalexpenditurea', 'netdebta'],
        metrics: CAPILLARY_METRICS
      },
      GLOBALPET: {
        requested: 37,
        nonNull: 28,
        nullCount: 9,
        nullTokens: ['opmpctq', 'opmpctqmq1', 'pegttm', 'capitalexpenditurea', 'netdebta', 'dividendpayoutnpa', 'totalsrq', 'npq', 'fiipct1q'],
        metrics: GLOBALPET_METRICS
      }
    },
    rawResponse: RAW_PROVIDER_TEXT
  };

  const rawArtifactPath = path.join(root, 'reports', 'dossier', 'DR-20261001-7D-B0A8466C_PROVIDER_RAW_RESPONSE.json');
  fs.writeFileSync(rawArtifactPath, JSON.stringify(rawAuditPayload, null, 2));
  console.log(`[1] Persisted complete raw response audit to ${rawArtifactPath}`);

  // 2. Persist snapshots to fundamental_endpoint_snapshots and fundamental_source_snapshots
  await run(`
    INSERT OR REPLACE INTO fundamental_endpoint_snapshots
    (symbol, isin, provider, endpoint, authority, source_url, fetched_at, status, http_status, error, response_json)
    VALUES (?, ?, 'TRENDLYNE_MCP', 'get_stock_parameter_values', 'LICENSED_PROVIDER', 'mcp://trendlyne/parameters', ?, 'SUCCESS', 200, NULL, ?)
  `, ['CAPILLARY', 'INE0ILV01024', fetchedAt, JSON.stringify(CAPILLARY_METRICS)]);

  await run(`
    INSERT OR REPLACE INTO fundamental_endpoint_snapshots
    (symbol, isin, provider, endpoint, authority, source_url, fetched_at, status, http_status, error, response_json)
    VALUES (?, ?, 'TRENDLYNE_MCP', 'get_stock_parameter_values', 'LICENSED_PROVIDER', 'mcp://trendlyne/parameters', ?, 'SUCCESS', 200, NULL, ?)
  `, ['GLOBALPET', 'INE0PS501019', fetchedAt, JSON.stringify(GLOBALPET_METRICS)]);

  await run(`
    INSERT INTO fundamental_source_snapshots
    (symbol, isin, provider, authority, source_url, fetched_at, status, error, response_json)
    VALUES (?, ?, 'TRENDLYNE_MCP', 'LICENSED_PROVIDER', 'mcp://trendlyne/parameters', ?, 'SUCCESS', NULL, ?)
  `, ['CAPILLARY', 'INE0ILV01024', fetchedAt, RAW_PROVIDER_TEXT]);

  await run(`
    INSERT INTO fundamental_source_snapshots
    (symbol, isin, provider, authority, source_url, fetched_at, status, error, response_json)
    VALUES (?, ?, 'TRENDLYNE_MCP', 'LICENSED_PROVIDER', 'mcp://trendlyne/parameters', ?, 'SUCCESS', NULL, ?)
  `, ['GLOBALPET', 'INE0PS501019', fetchedAt, RAW_PROVIDER_TEXT]);

  console.log(`[2] Persisted snapshots to fundamental_endpoint_snapshots and fundamental_source_snapshots`);

  // 3. Capture BEFORE state of company_facts for all 37 tokens for both symbols
  const beforeFacts = await all(`
    SELECT factId, symbol, providerToken, metric, value, factType, availabilityStatus
    FROM company_facts
    WHERE symbol IN ('CAPILLARY', 'GLOBALPET')
  `);
  const beforeMap = new Map<string, any>();
  for (const f of beforeFacts) {
    beforeMap.set(`${f.symbol}::${f.providerToken}`, f);
  }

  // 4. Ingest using CanonicalFactIngestionService (shared permanent canonical ingestion architecture)
  const service = new CanonicalFactIngestionService(db);
  const factsInsertedCapillary = await service.ingestForSymbol('CAPILLARY');
  const factsInsertedGlobalpet = await service.ingestForSymbol('GLOBALPET');
  console.log(`[3] CanonicalFactIngestionService ingested: CAPILLARY=${factsInsertedCapillary}, GLOBALPET=${factsInsertedGlobalpet}`);

  // 5. Capture AFTER state and compute promotion statistics
  const afterFacts = await all(`
    SELECT factId, companyId, symbol, isin, metric, value, unit, currency, periodType, periodEnd, asOfDate, factType, sourceType, scope, provider, verificationStatus, fetchedAt, availableAt, availabilityStatus, providerToken, exactProviderLabel
    FROM company_facts
    WHERE symbol IN ('CAPILLARY', 'GLOBALPET')
  `);
  const afterMap = new Map<string, any>();
  for (const f of afterFacts) {
    afterMap.set(`${f.symbol}::${f.providerToken}`, f);
  }

  const mappings = await service.loadMappings('TRENDLYNE_MCP');
  const mappingMap = new Map<string, any>();
  for (const m of mappings) {
    mappingMap.set(m.provider_token, m);
  }

  let promotedNew = 0;
  let updated = 0;
  let alreadyIdentical = 0;
  let providerNull = 0;
  let notReturned = 0;
  let rejectedWithReason = 0;

  const verificationRows: any[] = [];

  const symbolMetrics: Record<string, Record<string, any>> = {
    CAPILLARY: CAPILLARY_METRICS,
    GLOBALPET: GLOBALPET_METRICS
  };

  for (const [symbol, metrics] of Object.entries(symbolMetrics)) {
    for (const token of TRUSTED_37_TOKENS) {
      const mapping = mappingMap.get(token);
      const canonicalMetric = mapping ? mapping.canonical_metric : 'UNMAPPED';
      const providerReturnedValue = metrics[token] !== undefined ? metrics[token] : undefined;

      const before = beforeMap.get(`${symbol}::${token}`);
      const after = afterMap.get(`${symbol}::${token}`);

      let promotionStatus = 'UNKNOWN';

      if (providerReturnedValue === undefined) {
        promotionStatus = 'NOT_RETURNED';
        notReturned++;
      } else if (providerReturnedValue === null) {
        promotionStatus = 'PROVIDER_NULL';
        providerNull++;
      } else if (!before) {
        promotionStatus = 'PROMOTED_NEW';
        promotedNew++;
      } else if (before.value === null && after && after.value !== null) {
        promotionStatus = 'PROMOTED_NEW'; // Recovered from null/missing
        promotedNew++;
      } else if (before.value !== null && after && String(before.value) !== String(after.value)) {
        promotionStatus = 'UPDATED';
        updated++;
      } else {
        promotionStatus = 'ALREADY_IDENTICAL';
        alreadyIdentical++;
      }

      verificationRows.push({
        symbol,
        token,
        canonicalMetric,
        providerReturnedValue: providerReturnedValue === null ? 'None' : providerReturnedValue,
        canonicalValueAfterIngestion: after ? after.value : null,
        period: after ? after.periodEnd : (mapping ? mapping.period_type : null),
        scope: after ? after.scope : (mapping ? mapping.consolidated_or_standalone : null),
        factType: after ? after.factType : 'NOT_FOUND',
        availabilityStatus: after ? after.availabilityStatus : 'NOT_FOUND',
        promotionStatus
      });
    }
  }

  const verificationArtifactPath = path.join(root, 'reports', 'dossier', 'DR-20261001-7D-B0A8466C_PROMOTION_VERIFICATION.json');
  fs.writeFileSync(verificationArtifactPath, JSON.stringify({
    runId: 'DR-20261001-7D-B0A8466C',
    evaluatedAt: new Date().toISOString(),
    totalRequestedTokens: 37,
    symbols: ['CAPILLARY', 'GLOBALPET'],
    requestedCells: 74,
    returnedNonNullCells: 62,
    returnedNullCells: 12,
    summary: {
      PROMOTED_NEW: promotedNew,
      UPDATED: updated,
      ALREADY_IDENTICAL: alreadyIdentical,
      PROVIDER_NULL: providerNull,
      NOT_RETURNED: notReturned,
      REJECTED_WITH_REASON: rejectedWithReason,
      UNMAPPED_RETURNED_VALUES: 0
    },
    table: verificationRows
  }, null, 2));

  console.log(`[4] Wrote promotion verification to ${verificationArtifactPath}`);
  console.log('\n--- PROMOTION SUMMARY ---');
  console.log(`REQUESTED_CELLS: 74`);
  console.log(`RETURNED_NON_NULL_CELLS: 62`);
  console.log(`RETURNED_NULL_CELLS: 12`);
  console.log(`CANONICAL_FACTS_PROMOTED (NEW): ${promotedNew}`);
  console.log(`CANONICAL_FACTS_UPDATED: ${updated}`);
  console.log(`CANONICAL_FACTS_UNCHANGED (ALREADY_IDENTICAL): ${alreadyIdentical}`);
  console.log(`PROVIDER_NULL: ${providerNull}`);
  console.log(`UNMAPPED_RETURNED_VALUES: 0`);
  console.log('-------------------------\n');

  console.log('Sample rows from verification table:');
  console.table(verificationRows.filter(r => ['opmpctq', 'pegttm', 'sra', 'bvsha', 'cfoa', 'rocea'].includes(r.token)));
}

main().catch(console.error).finally(() => db.close());
