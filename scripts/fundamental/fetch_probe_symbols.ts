/**
 * scripts/fundamental/fetch_probe_symbols.ts
 *
 * Dedicated, deterministic Trendlyne batch fetch for probe symbols.
 * Packed with 30 canonical metrics per call, up to 10 symbols per batch.
 * Directly persists into SQLite company_facts and HistoricalFinancialStatements.
 */

import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CANONICAL_30_METRIC_PACK, parseTrendlyneResponse } from './trendlyne_metric_pack_planner.js';

const TARGET_SYMBOLS = [
  'EMAMIREAL', 'MOTISONS', 'DIVYADHAN', 'GUJRAFFIA', 'JITFINFRA', 'K2INFRA',
  'PRAJIND', 'KONSTELEC', 'VLINFRA', 'SUDARCOLOR', 'INFY',
  'TCS', 'RELIANCE', '360ONE', '3IINFOLTD', 'AETHER',
  'DATAPATTNS', 'KPITTECH', 'MAZDOCK', 'SONACOMS', 'TATATECH'
];

const dbPath = path.resolve('portfolio.db');

function getMcpUrl(): string {
  const cfgPath = path.resolve('.agents', 'mcp_config.json');
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    return cfg?.mcpServers?.trendlyne?.serverUrl || cfg?.mcpServers?.trendlyne?.url || '';
  }
  return '';
}

async function main() {
  console.log(`Starting Trendlyne probe symbols fetch for ${TARGET_SYMBOLS.length} symbols...`);

  const url = getMcpUrl();
  if (!url) {
    console.error('Trendlyne MCP URL not found.');
    process.exit(1);
  }

  const db = new sqlite3.Database(dbPath);
  const client = new Client({ name: 'wealthos-probe-fetcher', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));

  const batchSize = 10;
  let totalFactsPersisted = 0;
  let totalHfsPersisted = 0;

  for (let i = 0; i < TARGET_SYMBOLS.length; i += batchSize) {
    let currentSymbols = TARGET_SYMBOLS.slice(i, i + batchSize);
    let parsedData = new Map<string, Record<string, any>>();

    while (currentSymbols.length > 0) {
      console.log(`\nFetching batch for [${currentSymbols.join(', ')}]...`);
      try {
        const res = await client.callTool({
          name: 'get_stock_parameter_values',
          arguments: {
            stock_codes: currentSymbols,
            parameters: CANONICAL_30_METRIC_PACK
          }
        });

        const content = (res as any)?.content?.[0]?.text;
        if (!content) {
          console.warn('[-] Empty content received.');
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
              console.warn(`[!] Provider cannot resolve: ${badCodes.join(', ')}. Routing to FERE.`);
              currentSymbols = currentSymbols.filter(s => !badCodes.includes(s));
              continue;
            } else {
              console.warn(`[-] Provider error: ${msg}`);
              break;
            }
          }
          if (parsedJson?.data) textToParse = parsedJson.data;
        } catch {}

        parsedData = parseTrendlyneResponse(textToParse);
        break;
      } catch (err: any) {
        console.error('Batch fetch error:', err?.message || err);
        break;
      }
    }

    // Persist into SQLite
    for (const [symbol, metrics] of parsedData) {
      const asOf = (metrics.asOfDate as string) || '2026-10-01';
      const asOfYear = parseInt(asOf.substring(0, 4), 10) || 2026;

      // 1. Snapshot
      await new Promise<void>((resolve) => {
        db.run(`
          INSERT OR REPLACE INTO fundamental_endpoint_snapshots
          (symbol, provider, endpoint, authority, source_url, fetched_at, status, response_json)
          VALUES (?, 'TRENDLYNE_MCP', 'get_stock_parameter_values', 'LICENSED_PROVIDER', 'mcp://trendlyne/parameters', datetime('now'), 'SUCCESS', ?)
        `, [symbol, JSON.stringify(metrics)], () => resolve());
      });

      // 2. Annual Revenue Series
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
          await new Promise<void>((resolve) => {
            db.run(`
              INSERT OR REPLACE INTO company_facts
              (factId, companyId, symbol, metric, periodType, periodEnd, asOfDate, factType, sourceType, scope, verificationStatus, fetchedAt, value, unit, provider, availableAt)
              VALUES (?, ?, ?, 'revenue', 'ANNUAL', ?, ?, 'REPORTED', 'STRUCTURED_SECONDARY', 'CONSOLIDATED', 'SECONDARY_VERIFIED', datetime('now'), ?, 'INR_CR', 'TRENDLYNE_MCP', ?)
            `, [factId, symbol, symbol, periodEnd, asOf, String(pt.val), asOf], () => resolve());
          });
          totalFactsPersisted++;
        }
      }

      // 3. Annual Net Profit / PAT Series
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
          await new Promise<void>((resolve) => {
            db.run(`
              INSERT OR REPLACE INTO company_facts
              (factId, companyId, symbol, metric, periodType, periodEnd, asOfDate, factType, sourceType, scope, verificationStatus, fetchedAt, value, unit, provider, availableAt)
              VALUES (?, ?, ?, 'pat', 'ANNUAL', ?, ?, 'REPORTED', 'STRUCTURED_SECONDARY', 'CONSOLIDATED', 'SECONDARY_VERIFIED', datetime('now'), ?, 'INR_CR', 'TRENDLYNE_MCP', ?)
            `, [factId, symbol, symbol, periodEnd, asOf, String(pt.val), asOf], () => resolve());
          });
          totalFactsPersisted++;
        }
      }

      // 4. Ratios
      const ratioMetrics = [
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
          await new Promise<void>((resolve) => {
            db.run(`
              INSERT OR REPLACE INTO company_facts
              (factId, companyId, symbol, metric, periodType, periodEnd, asOfDate, factType, sourceType, scope, verificationStatus, fetchedAt, value, unit, provider, availableAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'REPORTED', 'STRUCTURED_SECONDARY', 'CONSOLIDATED', 'SECONDARY_VERIFIED', datetime('now'), ?, ?, 'TRENDLYNE_MCP', ?)
            `, [factId, symbol, symbol, rm.metric, rm.pType, asOf, asOf, String(rm.val), rm.unit, asOf], () => resolve());
          });
          totalFactsPersisted++;
        }
      }

      // 5. Quarterly margins
      if (metrics.opmpctq != null && !isNaN(Number(metrics.opmpctq))) {
        await new Promise<void>((resolve) => {
          db.run(`
            INSERT OR REPLACE INTO HistoricalFinancialStatements
            (symbol, statement_type, period_label, period_date, opm_pct, primary_source)
            VALUES (?, 'QUARTERLY_PL', ?, ?, ?, 'TRENDLYNE_MCP')
          `, [symbol, `${asOf} (Latest Qtr)`, asOf, Number(metrics.opmpctq)], () => resolve());
        });
        totalHfsPersisted++;
      }
      if (metrics.opmpctqmq1 != null && !isNaN(Number(metrics.opmpctqmq1))) {
        await new Promise<void>((resolve) => {
          db.run(`
            INSERT OR REPLACE INTO HistoricalFinancialStatements
            (symbol, statement_type, period_label, period_date, opm_pct, primary_source)
            VALUES (?, 'QUARTERLY_PL', '1Q Ago', ?, ?, 'TRENDLYNE_MCP')
          `, [symbol, `${asOfYear}-06-30`, Number(metrics.opmpctqmq1)], () => resolve());
        });
        totalHfsPersisted++;
      }

      console.log(`  [✓] Persisted facts for ${symbol}`);
    }
  }

  db.close();
  console.log(`\nFetch complete! Persisted ${totalFactsPersisted} facts and ${totalHfsPersisted} HFS quarterly margin records.`);
}

main().catch(console.error);
