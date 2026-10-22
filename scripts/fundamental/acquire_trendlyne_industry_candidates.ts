#!/usr/bin/env tsx
/**
 * Read-only acquisition of exact Trendlyne industry labels for candidates whose
 * MasterTickers sector is blank. It writes a provenance artifact, never changes
 * MasterTickers itself. A separate reviewed mapping step owns any update.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const root = process.cwd();
const dbPath = path.join(root, 'portfolio.db');
const manifestPath = path.join(root, 'data/fundamental_enrichment/excel_strategy_manifest.json');
const outPath = path.join(root, 'data/fundamental_enrichment/trendlyne_industry_candidates.json');
const delayMs = Math.max(250, Number(process.argv[process.argv.indexOf('--delay-ms') + 1] || 800));
const requestTimeoutMs = Math.max(5_000, Number(process.argv[process.argv.indexOf('--timeout-ms') + 1] || 20_000));

function endpointUrl(): string {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, '.agents/mcp_config.json'), 'utf8'));
  const url = cfg?.mcpServers?.trendlyne?.url || cfg?.mcpServers?.trendlyne?.serverUrl;
  if (typeof url !== 'string' || !url) throw new Error('Trendlyne MCP URL is not configured.');
  return url;
}

function overviewText(result: any): string {
  return (result?.content || []).filter((item: any) => item?.type === 'text').map((item: any) => String(item.text || '')).join('\n');
}

/**
 * Trendlyne identifies the industry position in stockHeaders. The response is
 * a flattened provider display payload, so extraction succeeds only when the
 * header and stockData row have the same, unambiguous field count.
 */
function extractIndustry(text: string): { industry: string | null; reason: string | null } {
  // This provider block is structured and avoids ambiguous comma splitting in
  // the flattened stockData display row. Prefer it when present.
  const structuredIndustry = text.match(/sectorIndustryData:\s*[\s\S]*?\n\s*industryName:\s*([^\n\r]+)/i)?.[1]?.trim();
  if (structuredIndustry && !/^none$/i.test(structuredIndustry)) {
    return { industry: structuredIndustry, reason: null };
  }
  const headerBlock = text.match(/stockHeaders:\s*([\s\S]*?)\n(?:lastUpdated|stockData):/i)?.[1] || '';
  const headers = [...headerBlock.matchAll(/^\s*[^\n]*\|[^\n]*\|\s*([^|\s]+)\s*\|?\s*$/gmi)].map(match => match[1]);
  const index = headers.indexOf('industry_name');
  const dataBlock = text.match(/stockData:\s*\n\s*([^\n]+)/i)?.[1]?.trim();
  if (index < 0) return { industry: null, reason: 'Trendlyne overview did not expose industry_name in stockHeaders.' };
  if (!dataBlock) return { industry: null, reason: 'Trendlyne overview did not expose a stockData row.' };
  const fields = dataBlock.split(',').map(value => value.trim());
  if (fields.length !== headers.length) {
    return { industry: null, reason: `Provider display field count mismatch (${fields.length} values vs ${headers.length} headers).` };
  }
  const industry = fields[index];
  return !industry || /^none$/i.test(industry)
    ? { industry: null, reason: 'Trendlyne overview returned no industry value.' }
    : { industry, reason: null };
}

async function main() {
  if (process.argv.includes('--reparse-existing')) {
    const prior = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const rows = (prior.rows || []).map((row: any) => {
      const extracted = extractIndustry(overviewText(row.rawResponse));
      return {
        ...row,
        industry: extracted.industry,
        extractionStatus: extracted.industry ? 'AVAILABLE' : 'DATA_INSUFFICIENT',
        extractionReason: extracted.reason,
      };
    });
    fs.writeFileSync(outPath, JSON.stringify({ ...prior, reprocessedAt: new Date().toISOString(), rows }, null, 2));
    console.log(JSON.stringify({ output: outPath, reparsed: rows.length, industryAvailable: rows.filter((row: any) => row.extractionStatus === 'AVAILABLE').length }));
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const symbols = [...new Set((manifest.symbols || []).map((x: unknown) => String(x).trim().toUpperCase()))];
  const db = new Database(dbPath, { readonly: true });
  const placeholders = symbols.map(() => '?').join(',');
  const sectorRows = db.prepare(`SELECT UPPER(symbol) AS symbol, sector FROM MasterTickers WHERE UPPER(symbol) IN (${placeholders})`).all(...symbols) as Array<{ symbol: string; sector: string | null }>;
  db.close();
  const mapped = new Set(sectorRows.filter(row => String(row.sector || '').trim()).map(row => row.symbol));
  const targets = symbols.filter(symbol => !mapped.has(symbol));

  const client = new Client({ name: 'wealthos-trendlyne-industry-acquisition', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(endpointUrl())));
  const rows: any[] = [];
  const writeCheckpoint = (complete: boolean) => {
    fs.writeFileSync(outPath, JSON.stringify({
      generatedAt: new Date().toISOString(), provider: 'TRENDLYNE_MCP', sourceType: 'OVERVIEW',
      candidateCount: targets.length, completedCount: rows.length, complete, rows,
    }, null, 2));
  };
  try {
    for (const symbol of targets) {
      let raw: any = null;
      let error: string | null = null;
      try {
        raw = await client.callTool(
          { name: 'get_overview_news_corp_events', arguments: { stock_code: symbol, type: 'overview' } },
          undefined,
          { timeout: requestTimeoutMs },
        );
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
      }
      const text = raw ? overviewText(raw) : '';
      const extracted = raw && !raw.isError ? extractIndustry(text) : { industry: null, reason: error || 'Trendlyne returned an error.' };
      rows.push({
        symbol,
        provider: 'TRENDLYNE_MCP',
        endpoint: 'get_overview_news_corp_events',
        requestedType: 'overview',
        fetchedAt: new Date().toISOString(),
        industry: extracted.industry,
        extractionStatus: extracted.industry ? 'AVAILABLE' : 'DATA_INSUFFICIENT',
        extractionReason: extracted.reason,
        rawResponse: raw || null,
      });
      writeCheckpoint(false);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  } finally {
    await client.close().catch(() => undefined);
  }
  writeCheckpoint(true);
  const available = rows.filter(row => row.extractionStatus === 'AVAILABLE').length;
  console.log(JSON.stringify({ output: outPath, requested: targets.length, industryAvailable: available, unavailable: targets.length - available }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
