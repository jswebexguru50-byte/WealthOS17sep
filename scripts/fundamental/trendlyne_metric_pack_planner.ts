#!/usr/bin/env tsx
/**
 * scripts/fundamental/trendlyne_metric_pack_planner.ts
 *
 * Phase 4 — Trendlyne Capacity Utilization & Metric Pack Planner
 *
 * Requirements:
 * 1. Inspect missing fields from data gap inventory.
 * 2. Map missing fields to exact Trendlyne parameter tokens.
 * 3. Pack up to 50 metrics per call.
 * 4. Batch up to 10 symbols per call.
 * 5. Skip fresh complete symbols (15-day staleness threshold).
 * 6. Mark fields as SOURCE_NOT_AVAILABLE_FROM_TRENDLYNE where provider lacks data.
 * 7. Output planned calls before executing.
 * 8. If --execute flag is passed, execute deterministic queries and persist to company_facts.
 */

import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const root = path.resolve(process.cwd());
const inventoryPath = path.join(root, 'reports', 'data_quality', 'analyze360_missing_data_inventory.json');
const dbPath = (process.env.DATABASE_URL || path.join(root, 'portfolio.db')).replace(/^sqlite:\/\//, '');

export interface FieldMappingInfo {
  appField: string;
  trendlyneToken: string | null;
  providerLabel?: string;
  sourceCategory: 'TRENDLYNE_AVAILABLE' | 'SOURCE_NOT_AVAILABLE_FROM_TRENDLYNE';
  alternativeSource?: string;
  periodType: 'ANNUAL' | 'QUARTERLY' | 'LATEST';
}

export const TRENDLYNE_FIELD_MAP: Record<string, FieldMappingInfo> = {
  // Annual statement & growth series
  revenueGrowth3Y: {
    appField: 'revenueGrowth3Y',
    trendlyneToken: 'sramy3', // sra, sramy1, sramy2, sramy3 give the 4 consecutive points
    providerLabel: 'Rev. Ann. 3Y ago',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'ANNUAL'
  },
  patGrowth3Y: {
    appField: 'patGrowth3Y',
    trendlyneToken: 'npamy3', // npa, npamy1, npamy2, npamy3 give the 4 consecutive points
    providerLabel: 'Net Profit Ann. 3Y Ago',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'ANNUAL'
  },
  operatingProfit: {
    appField: 'operatingProfit',
    trendlyneToken: 'opa',
    providerLabel: 'Operating Profit Ann.',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'ANNUAL'
  },
  pat: {
    appField: 'pat',
    trendlyneToken: 'npa',
    providerLabel: 'Net Profit Ann.',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'ANNUAL'
  },
  marginTrend: {
    appField: 'marginTrend',
    trendlyneToken: 'opmpctqmq1', // combined with opmpctq
    providerLabel: 'OPM 1Q ago %',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'QUARTERLY'
  },
  debtToEquity: {
    appField: 'debtToEquity',
    trendlyneToken: 'debtcea',
    providerLabel: 'Total Debt to Total Equity Ann.',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'ANNUAL'
  },
  totalBorrowings: {
    appField: 'totalBorrowings',
    trendlyneToken: 'borrowingsa',
    providerLabel: 'Borrowings Ann.',
    sourceCategory: 'SOURCE_NOT_AVAILABLE_FROM_TRENDLYNE', // Trendlyne returns None for borrowingsa for most NSE firms
    alternativeSource: 'XBRL balance sheet / annual report',
    periodType: 'ANNUAL'
  },
  interestCoverage: {
    appField: 'interestCoverage',
    trendlyneToken: 'ica',
    providerLabel: 'Interest Coverage Ratio Ann.',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'ANNUAL'
  },
  cfo: {
    appField: 'cfo',
    trendlyneToken: 'cfoa',
    providerLabel: 'Cash from Operating Act. Ann.',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'ANNUAL'
  },
  freeCashFlow: {
    appField: 'freeCashFlow',
    trendlyneToken: 'capitalexpenditurea',
    providerLabel: 'Capex Ann.',
    sourceCategory: 'SOURCE_NOT_AVAILABLE_FROM_TRENDLYNE', // Trendlyne capex is None for most NSE issuers
    alternativeSource: 'XBRL cash flow statement / annual report',
    periodType: 'ANNUAL'
  },
  promoterHolding: {
    appField: 'promoterHolding',
    trendlyneToken: 'prompct',
    providerLabel: 'Promoter holding latest %',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'LATEST'
  },
  promoterPledge: {
    appField: 'promoterPledge',
    trendlyneToken: 'prompledge',
    providerLabel: 'Promoter holding pledge % Qtr',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'QUARTERLY'
  },
  fiiHolding: {
    appField: 'fiiHolding',
    trendlyneToken: 'fiihold',
    providerLabel: 'FII holding current Qtr %',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'QUARTERLY'
  },
  diiHolding: {
    appField: 'diiHolding',
    trendlyneToken: 'mfhold',
    providerLabel: 'MF holding current Qtr %',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'QUARTERLY'
  },
  fiiTrend: {
    appField: 'fiiTrend',
    trendlyneToken: 'fiipct1q',
    providerLabel: 'FII holding change QoQ %',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'QUARTERLY'
  },
  diiTrend: {
    appField: 'diiTrend',
    trendlyneToken: 'mfpct1q',
    providerLabel: 'MF holding change QoQ %',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'QUARTERLY'
  },
  roe: {
    appField: 'roe',
    trendlyneToken: 'roea',
    providerLabel: 'ROE Ann. %',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'ANNUAL'
  },
  roce: {
    appField: 'roce',
    trendlyneToken: 'rocea',
    providerLabel: 'ROCE Ann. %',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'ANNUAL'
  },
  pe: {
    appField: 'pe',
    trendlyneToken: 'pettm',
    providerLabel: 'PE TTM',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'LATEST'
  },
  peg: {
    appField: 'peg',
    trendlyneToken: 'pegttm',
    providerLabel: 'PEG TTM',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'LATEST'
  },
  marketCap: {
    appField: 'marketCap',
    trendlyneToken: 'mcapq',
    providerLabel: 'Market Cap',
    sourceCategory: 'TRENDLYNE_AVAILABLE',
    periodType: 'LATEST'
  }
};

// Canonical 30-token dense pack covering all Trendlyne-supported inputs
export const CANONICAL_30_METRIC_PACK = [
  'sra', 'sramy1', 'sramy2', 'sramy3', 'totalsrq',
  'npa', 'npamy1', 'npamy2', 'npamy3', 'reportedpatq',
  'opa', 'opq', 'opmpctq', 'opmpctqmq1',
  'roea', 'rocea', 'debtcea', 'ica',
  'pettm', 'pegttm', 'pbva', 'mcapq',
  'prompct', 'prompledge', 'fiihold', 'mfhold',
  'fiipct1q', 'mfpct1q', 'cfoa', 'wcq'
];

interface PlannedBatch {
  batchIndex: number;
  symbols: string[];
  parameterTokens: string[];
  metricsPacked: number;
}

export class TrendlyneMetricPackPlanner {
  private db: sqlite3.Database;

  constructor(db: sqlite3.Database) {
    this.db = db;
  }

  private queryAll(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  public async getFreshnessStatus(symbols: string[]): Promise<Map<string, { isFresh: boolean; lastFetched: string | null }>> {
    const map = new Map<string, { isFresh: boolean; lastFetched: string | null }>();
    if (!symbols.length) return map;

    const placeholders = symbols.map(() => '?').join(',');
    const rows = await this.queryAll(`
      SELECT symbol, MAX(fetched_at) as last_fetched
      FROM fundamental_endpoint_snapshots
      WHERE provider = 'TRENDLYNE_MCP' AND symbol IN (${placeholders}) AND status = 'SUCCESS'
      GROUP BY symbol
    `, symbols);

    const fifteenDaysAgo = Date.now() - 15 * 86_400_000;
    const fetchMap = new Map<string, string>();
    for (const r of rows) {
      if (r.symbol && r.last_fetched) fetchMap.set(r.symbol, r.last_fetched);
    }

    for (const s of symbols) {
      const last = fetchMap.get(s);
      if (last) {
        const ts = new Date(last).getTime();
        map.set(s, { isFresh: ts > fifteenDaysAgo, lastFetched: last });
      } else {
        map.set(s, { isFresh: false, lastFetched: null });
      }
    }

    return map;
  }

  public planBatches(targetSymbols: string[], freshnessMap: Map<string, { isFresh: boolean }>): PlannedBatch[] {
    const dueSymbols = targetSymbols.filter(s => !freshnessMap.get(s)?.isFresh);
    const batches: PlannedBatch[] = [];
    const batchSize = 10;

    for (let i = 0; i < dueSymbols.length; i += batchSize) {
      const chunk = dueSymbols.slice(i, i + batchSize);
      batches.push({
        batchIndex: Math.floor(i / batchSize) + 1,
        symbols: chunk,
        parameterTokens: CANONICAL_30_METRIC_PACK,
        metricsPacked: CANONICAL_30_METRIC_PACK.length
      });
    }

    return batches;
  }
}

function endpointUrl(): string | undefined {
  const env = process.env.TRENDLYNE_MCP_URL?.trim();
  if (env && !env.includes('\x16')) return env;
  for (const configPath of [
    path.join(root, '.agents', 'mcp_config.json'),
    path.join(process.env.USERPROFILE || '', '.gemini', 'config', 'mcp_config.json')
  ]) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const url = config.mcpServers?.trendlyne?.url || config.mcpServers?.trendlyne?.serverUrl;
      if (typeof url === 'string' && url.trim() && !url.includes('\x16')) return url.trim();
    } catch {}
  }
  return undefined;
}

export function parseTrendlyneResponse(responseText: string): Map<string, Record<string, number | string | null>> {
  const results = new Map<string, Record<string, number | string | null>>();
  if (!responseText) return results;

  const blocks = responseText.split('\n\n---\n\n');
  const headerBlock = blocks[0] || '';
  const metricBlocks = blocks.slice(1);

  // Parse header lines: e.g. 630|Infosys|INFY|500209|2026-10-01
  const headerLines = headerBlock.trim().split('\n').filter(Boolean);
  const metadataBySymbol = new Map<string, { asOfDate: string; companyName: string }>();

  for (const line of headerLines) {
    const parts = line.split('|');
    if (parts.length >= 5) {
      const sym = parts[2].trim().toUpperCase();
      metadataBySymbol.set(sym, {
        companyName: parts[1].trim(),
        asOfDate: parts[4].trim()
      });
      results.set(sym, { asOfDate: parts[4].trim(), companyName: parts[1].trim() });
    }
  }

  // Label to token mapping
  const labelMap: Record<string, string> = {
    'Total Rev. Ann.': 'sra',
    'Total Rev. Ann. 1Y Ago': 'sramy1',
    'Rev. Ann. 2Y ago': 'sramy2',
    'Rev. Ann. 3Y ago': 'sramy3',
    'Total Rev. Qtr': 'totalsrq',
    'Net Profit Ann.': 'npa',
    'Net Profit Ann. 1Y Ago': 'npamy1',
    'Net Profit Ann. 2Y ago': 'npamy2',
    'Net Profit Ann. 3Y Ago': 'npamy3',
    'Reported PAT Qtr': 'reportedpatq',
    'Operating Profit Ann.': 'opa',
    'Operating Profit Qtr': 'opq',
    'Operating Profit Margin Qtr %': 'opmpctq',
    'OPM 1Q ago %': 'opmpctqmq1',
    'ROE Ann. %': 'roea',
    'ROCE Ann. %': 'rocea',
    'Total Debt to Total Equity Ann.': 'debtcea',
    'Interest Coverage Ratio Ann.': 'ica',
    'PE TTM': 'pettm',
    'PEG TTM': 'pegttm',
    'PBV Adjusted': 'pbva',
    'Market Cap': 'mcapq',
    'Promoter holding latest %': 'prompct',
    'Promoter holding pledge percentage % Qtr': 'prompledge',
    'FII holding current Qtr %': 'fiihold',
    'MF holding current Qtr %': 'mfhold',
    'FII holding change QoQ %': 'fiipct1q',
    'MF holding change QoQ %': 'mfpct1q',
    'Cash from Operating Act. Ann.': 'cfoa'
  };

  for (const block of metricBlocks) {
    const lines = block.trim().split('\n').filter(Boolean);
    if (!lines.length) continue;
    const label = lines[0].trim();
    const token = labelMap[label];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const sym = line.substring(0, colonIdx).trim().toUpperCase();
      const valStr = line.substring(colonIdx + 1).trim();

      if (!results.has(sym)) results.set(sym, {});
      const record = results.get(sym)!;

      if (valStr === 'None' || valStr === '' || valStr.toLowerCase() === 'null') {
        if (token) record[token] = null;
      } else {
        const num = Number(valStr);
        if (token) record[token] = isNaN(num) ? valStr : num;
      }
    }
  }

  return results;
}

async function main() {
  console.log('===============================================================');
  console.log('WealthOS Phase 4: Trendlyne Metric Pack Planner');
  console.log('===============================================================\n');

  let targetSymbols: string[] = [];

  // 1. Load target symbols from inventory
  if (fs.existsSync(inventoryPath)) {
    const inv = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
    targetSymbols = (inv.symbols || []).map((s: any) => (typeof s === 'string' ? s : s?.symbol || '').trim().toUpperCase()).filter(Boolean);
    console.log(`[+] Loaded ${targetSymbols.length} candidate symbols from data gap inventory.`);
  } else {
    targetSymbols = ['INFY', 'TCS', 'RELIANCE', 'EMAMIREAL', 'PRAJIND', '20MICRONS'];
    console.log(`[!] Inventory not found, using default sample of ${targetSymbols.length} symbols.`);
  }

  const db = new sqlite3.Database(dbPath);
  const planner = new TrendlyneMetricPackPlanner(db);

  // 2. Evaluate Freshness
  const freshnessMap = await planner.getFreshnessStatus(targetSymbols);
  let freshCount = 0;
  for (const [_, st] of freshnessMap) {
    if (st.isFresh) freshCount++;
  }
  console.log(`[+] Freshness audit: ${freshCount}/${targetSymbols.length} symbols fresh (< 15 days).`);

  // 3. Plan Dense Batches
  const plannedBatches = planner.planBatches(targetSymbols, freshnessMap);
  console.log(`[+] Total planned batches: ${plannedBatches.length} (up to 10 symbols per batch, 30 metrics per call).`);

  // 4. Source mapping taxonomy
  console.log('\n--- Field Source Mapping & Route Summary ---');
  let availableCount = 0;
  let routedCount = 0;
  for (const [key, mapping] of Object.entries(TRENDLYNE_FIELD_MAP)) {
    if (mapping.sourceCategory === 'TRENDLYNE_AVAILABLE') {
      availableCount++;
      console.log(`  ✓ ${key.padEnd(20)} -> Token: ${mapping.trendlyneToken?.padEnd(12)} [TRENDLYNE_AVAILABLE]`);
    } else {
      routedCount++;
      console.log(`  ✗ ${key.padEnd(20)} -> [SOURCE_NOT_AVAILABLE_FROM_TRENDLYNE] -> Route to: ${mapping.alternativeSource}`);
    }
  }
  console.log(`\nTrendlyne supported: ${availableCount} fields | Routed to XBRL/Statutory: ${routedCount} fields`);

  console.log('\n--- Planned Calls Detail ---');
  for (const b of plannedBatches) {
    console.log(`  Batch ${b.batchIndex}: ${b.symbols.length} symbols (${b.symbols.join(', ')}) -> ${b.metricsPacked} metrics`);
  }

  const shouldExecute = process.argv.includes('--execute');

  if (!shouldExecute) {
    console.log('\n[INFO] Dry-run completed. To execute queries and persist data, run:');
    console.log('       npx tsx scripts/fundamental/trendlyne_metric_pack_planner.ts --execute\n');
    db.close();
    return;
  }

  console.log('\n[EXECUTE] Connecting to Trendlyne MCP server...');
  const url = endpointUrl();
  if (!url) {
    console.error('[-] Could not find Trendlyne MCP URL in configuration.');
    db.close();
    process.exit(1);
  }

  const client = new Client({ name: 'wealthos-trendlyne-planner', version: '2.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));

  let executedCalls = 0;
  let factsPersisted = 0;

  for (const batch of plannedBatches) {
    let currentSymbols = [...batch.symbols];
    let parsedData = new Map<string, Record<string, number | string | null>>();

    while (currentSymbols.length > 0) {
      console.log(`\nExecuting Batch ${batch.batchIndex}/${plannedBatches.length} for ${currentSymbols.join(', ')}...`);
      try {
        const res = await client.callTool({
          name: 'get_stock_parameter_values',
          arguments: {
            stock_codes: currentSymbols,
            parameters: batch.parameterTokens
          }
        });
        executedCalls++;

        const content = (res as any)?.content?.[0]?.text;
        if (!content) {
          console.warn(`[-] Empty response for batch ${batch.batchIndex}`);
          break;
        }

        let textToParse = content;
        try {
          const parsedJson = JSON.parse(content);
          if (parsedJson?.status === 'error') {
            const msg = String(parsedJson.message || '');
            const match = msg.match(/Could not resolve stock code\(s\):\s*([^.]+)/i);
            if (match) {
              const badCodes = match[1].split(',').map(s => s.trim().toUpperCase());
              console.warn(`[!] Provider could not resolve codes: ${badCodes.join(', ')}. Routing to FERE/Statutory.`);
              currentSymbols = currentSymbols.filter(s => !badCodes.includes(s));
              continue; // retry with remaining
            } else {
              console.warn(`[-] Provider error: ${msg}`);
              break;
            }
          }
          if (parsedJson?.data) textToParse = parsedJson.data;
        } catch {}

        parsedData = parseTrendlyneResponse(textToParse);
        break; // Success!
      } catch (err: any) {
        console.error(`[-] Batch call error:`, err?.message || err);
        break;
      }
    }

    // Ingest into SQLite company_facts and fundamental_endpoint_snapshots
    for (const [symbol, metrics] of parsedData) {
        const asOf = (metrics.asOfDate as string) || new Date().toISOString().substring(0, 10);
        const asOfYear = parseInt(asOf.substring(0, 4), 10) || 2026;

        // Persist snapshot to keep freshness
        await new Promise<void>((resolve, reject) => {
          db.run(`
            INSERT OR REPLACE INTO fundamental_endpoint_snapshots
            (symbol, provider, endpoint, authority, source_url, fetched_at, status, response_json)
            VALUES (?, 'TRENDLYNE_MCP', 'get_stock_parameter_values', 'LICENSED_PROVIDER', 'mcp://trendlyne/parameters', datetime('now'), 'SUCCESS', ?)
          `, [symbol, JSON.stringify(metrics)], err => err ? reject(err) : resolve());
        });

        // 1. Annual Revenue Series (4 consecutive annual points)
        const revPoints = [
          { yr: asOfYear, val: metrics.sra },
          { yr: asOfYear - 1, val: metrics.sramy1 },
          { yr: asOfYear - 2, val: metrics.sramy2 },
          { yr: asOfYear - 3, val: metrics.sramy3 }
        ];
        for (const pt of revPoints) {
          if (pt.val != null && Number(pt.val) > 0) {
            const periodEnd = `${pt.yr}-03-31`;
            const factId = `tl:${symbol}:revenue:${periodEnd}`;
            await new Promise<void>((resolve, reject) => {
              db.run(`
                INSERT OR REPLACE INTO company_facts
                (factId, companyId, symbol, metric, periodType, periodEnd, asOfDate, factType, sourceType, scope, verificationStatus, fetchedAt, value, unit, provider, availableAt)
                VALUES (?, ?, ?, 'revenue', 'ANNUAL', ?, ?, 'REPORTED', 'STRUCTURED_SECONDARY', 'CONSOLIDATED', 'SECONDARY_VERIFIED', datetime('now'), ?, 'INR_CR', 'TRENDLYNE_MCP', ?)
              `, [factId, symbol, symbol, periodEnd, asOf, String(pt.val), asOf], (err) => err ? reject(err) : resolve());
            });
            factsPersisted++;
          }
        }

        // 2. Annual Net Profit / PAT Series (4 consecutive annual points)
        const patPoints = [
          { yr: asOfYear, val: metrics.npa },
          { yr: asOfYear - 1, val: metrics.npamy1 },
          { yr: asOfYear - 2, val: metrics.npamy2 },
          { yr: asOfYear - 3, val: metrics.npamy3 }
        ];
        for (const pt of patPoints) {
          if (pt.val != null && !isNaN(Number(pt.val))) {
            const periodEnd = `${pt.yr}-03-31`;
            const factId = `tl:${symbol}:pat:${periodEnd}`;
            await new Promise<void>((resolve, reject) => {
              db.run(`
                INSERT OR REPLACE INTO company_facts
                (factId, companyId, symbol, metric, periodType, periodEnd, asOfDate, factType, sourceType, scope, verificationStatus, fetchedAt, value, unit, provider, availableAt)
                VALUES (?, ?, ?, 'pat', 'ANNUAL', ?, ?, 'REPORTED', 'STRUCTURED_SECONDARY', 'CONSOLIDATED', 'SECONDARY_VERIFIED', datetime('now'), ?, 'INR_CR', 'TRENDLYNE_MCP', ?)
              `, [factId, symbol, symbol, periodEnd, asOf, String(pt.val), asOf], (err) => err ? reject(err) : resolve());
            });
            factsPersisted++;
          }
        }

        // 3. Ratios: ROCE, ROE, Debt/Equity, PE, PEG, Market Cap
        const ratioMetrics: Array<{ metric: string; val: any; unit: string; pType: string }> = [
          { metric: 'roce_reported', val: metrics.rocea, unit: '%', pType: 'ANNUAL' },
          { metric: 'roe_pct', val: metrics.roea, unit: '%', pType: 'ANNUAL' },
          { metric: 'debt_to_equity_reported', val: metrics.debtcea, unit: 'RATIO', pType: 'ANNUAL' },
          { metric: 'pe_ratio', val: metrics.pettm, unit: 'RATIO', pType: 'TTM' },
          { metric: 'peg_ratio', val: metrics.pegttm, unit: 'RATIO', pType: 'TTM' },
          { metric: 'market_cap_cr', val: metrics.mcapq, unit: 'INR_CR', pType: 'LATEST' },
          { metric: 'operating_profit', val: metrics.opa, unit: 'INR_CR', pType: 'ANNUAL' },
          { metric: 'operating_profit', val: metrics.opq, unit: 'INR_CR', pType: 'QUARTERLY' },
          { metric: 'promoter_pledge', val: metrics.prompledge, unit: '%', pType: 'QUARTERLY' },
          { metric: 'cfo', val: metrics.cfoa, unit: 'INR_CR', pType: 'ANNUAL' }
        ];

        for (const rm of ratioMetrics) {
          if (rm.val != null && !isNaN(Number(rm.val))) {
            const factId = `tl:${symbol}:${rm.metric}:${rm.pType}`;
            await new Promise<void>((resolve, reject) => {
              db.run(`
                INSERT OR REPLACE INTO company_facts
                (factId, companyId, symbol, metric, periodType, periodEnd, asOfDate, factType, sourceType, scope, verificationStatus, fetchedAt, value, unit, provider, availableAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'REPORTED', 'STRUCTURED_SECONDARY', 'CONSOLIDATED', 'SECONDARY_VERIFIED', datetime('now'), ?, ?, 'TRENDLYNE_MCP', ?)
              `, [factId, symbol, symbol, rm.metric, rm.pType, asOf, asOf, String(rm.val), rm.unit, asOf], (err) => err ? reject(err) : resolve());
            });
            factsPersisted++;
          }
        }

        // Also update HistoricalFinancialStatements with sequential quarterly margins
        if (metrics.opmpctq != null) {
          const qLabel = `${asOf} (Latest Qtr)`;
          await new Promise<void>((resolve) => {
            db.run(`
              INSERT OR REPLACE INTO HistoricalFinancialStatements
              (symbol, statement_type, period_label, period_date, opm_pct, primary_source)
              VALUES (?, 'QUARTERLY_PL', ?, ?, ?, 'TRENDLYNE_MCP')
            `, [symbol, qLabel, asOf, Number(metrics.opmpctq)], () => resolve());
          });
        }
        if (metrics.opmpctqmq1 != null) {
          const prevQDate = `${asOfYear}-06-30`;
          const prevQLabel = `1Q Ago`;
          await new Promise<void>((resolve) => {
            db.run(`
              INSERT OR REPLACE INTO HistoricalFinancialStatements
              (symbol, statement_type, period_label, period_date, opm_pct, primary_source)
              VALUES (?, 'QUARTERLY_PL', ?, ?, ?, 'TRENDLYNE_MCP')
            `, [symbol, prevQLabel, prevQDate, Number(metrics.opmpctqmq1)], () => resolve());
          });
        }

        console.log(`  [✓] Persisted facts for ${symbol}`);
      }

      // Small throttle between batches
      await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\nExecution complete: ${executedCalls} calls executed, ${factsPersisted} facts persisted.`);
  db.close();
}

main().catch(console.error);
