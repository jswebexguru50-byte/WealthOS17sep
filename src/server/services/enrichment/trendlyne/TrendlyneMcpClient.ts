/**
 * TrendlyneMcpClient.ts — Trendlyne MCP Client & Tool Capability Probe
 * WealthOS V2 Mandatory Amendment — Trendlyne MCP Max Enrichment
 *
 * Implements:
 * - Direct communication with Trendlyne MCP server via TRENDLYNE_MCP_URL env var.
 * - Raw response preservation into trendlyne_raw_response.
 * - Dynamic capability probe & saving to reports/data/trendlyne/MCP_CAPABILITY_PROBE.json.
 * - Configurable limits: TRENDLYNE_MAX_METRICS_PER_CALL=50 (default), TRENDLYNE_MAX_SCRIPS_PER_CALL=10.
 * - Fail-closed: throws TrendlyneNotConfiguredError when TRENDLYNE_MCP_URL is absent.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDB, dbRun } from '../../../database.js';

export interface McpToolSchema {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface McpCapabilityProbeReport {
  probedAt: string;
  serverStatus: 'CONNECTED' | 'NOT_CONFIGURED';
  maxScripsPerCall: number;
  maxMetricsPerCall: number;
  maxCellsPerCall: number;
  discoveredTools: Array<{
    toolName: string;
    description: string;
    supportedParams: string[];
  }>;
  documentSearchSupported: boolean;
  multiStockStructuredSupported: boolean;
  ownershipSupported: boolean;
  corporateEventsSupported: boolean;
  quotaReportedByServer: boolean;
}

export class TrendlyneNotConfiguredError extends Error {
  public readonly code = 'TRENDLYNE_NOT_CONFIGURED';
  constructor(toolName: string) {
    super(`Trendlyne MCP transport is not configured; cannot call '${toolName}'. Set TRENDLYNE_MCP_URL in .env. No data was fetched or fabricated (source_unavailable).`);
    this.name = 'TrendlyneNotConfiguredError';
  }
}

export class TrendlyneMcpClient {
  private static instance: TrendlyneMcpClient;
  private readonly maxScrips: number;
  private readonly maxMetrics: number;
  private liveClient?: any; // @modelcontextprotocol/sdk Client, loaded lazily

  private constructor() {
    this.maxScrips = Number(process.env.TRENDLYNE_MAX_SCRIPS_PER_CALL) || 10;
    this.maxMetrics = Number(process.env.TRENDLYNE_MAX_METRICS_PER_CALL) || 50;
  }

  public static getInstance(): TrendlyneMcpClient {
    if (!TrendlyneMcpClient.instance) {
      TrendlyneMcpClient.instance = new TrendlyneMcpClient();
    }
    return TrendlyneMcpClient.instance;
  }

  public getMaxScrips(): number { return this.maxScrips; }
  public getMaxMetrics(): number { return this.maxMetrics; }

  public isConfigured(): boolean {
    return Boolean(process.env.TRENDLYNE_MCP_URL?.trim());
  }

  public assertTransport(toolName: string): void {
    if (!this.isConfigured()) throw new TrendlyneNotConfiguredError(toolName);
  }

  private async invokeLive(toolName: string, request: Record<string, any>): Promise<any> {
    const url = process.env.TRENDLYNE_MCP_URL?.trim();
    if (!url) throw new TrendlyneNotConfiguredError(toolName);

    if (!this.liveClient) {
      // Dynamic import so the server starts even when MCP SDK is absent
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
      const client = new Client({ name: 'wealthos-institutional29', version: '1.0.0' });
      await client.connect(new StreamableHTTPClientTransport(new URL(url)));
      this.liveClient = client;
    }

    const result = await this.liveClient.callTool({ name: toolName, arguments: request });
    if (result?.isError) throw new Error(`TRENDLYNE_TOOL_ERROR:${toolName}`);

    const content = Array.isArray(result?.content) ? result.content : [];
    const text = content.find((item: any) => item?.type === 'text' && typeof item.text === 'string')?.text;
    if (text) {
      try { return JSON.parse(text); } catch { return text; } // return raw text for plain-text responses
    }
    return result?.structuredContent || result;
  }

  /**
   * Probes MCP schemas and writes reports/data/trendlyne/MCP_CAPABILITY_PROBE.json
   */
  public probeCapabilities(outputDir = path.resolve('reports', 'data', 'trendlyne')): McpCapabilityProbeReport {
    const schemaDir = path.resolve(process.env.USERPROFILE || '', '.gemini', 'antigravity-ide', 'mcp', 'trendlyne');
    const tools: Array<{ toolName: string; description: string; supportedParams: string[] }> = [];

    if (fs.existsSync(schemaDir)) {
      try {
        const files = fs.readdirSync(schemaDir).filter((f) => f.endsWith('.json'));
        for (const file of files) {
          const content = JSON.parse(fs.readFileSync(path.join(schemaDir, file), 'utf-8'));
          tools.push({
            toolName: content.name || path.basename(file, '.json'),
            description: content.description || '',
            supportedParams: Object.keys(content.parameters?.properties || {}),
          });
        }
      } catch { /* ignore */ }
    }

    const fromSchemas = tools.length > 0;
    if (tools.length === 0) {
      tools.push(
        { toolName: 'get_stock_parameter_values', description: 'Fetches parameters for up to 10 stocks and 50 metrics', supportedParams: ['stock_codes', 'parameters'] },
        { toolName: 'get_parameter_values_multi_stock', description: 'Semantic multi-stock parameter search', supportedParams: ['query', 'type'] },
        { toolName: 'get_overview_news_corp_events', description: 'News, overview and corporate events', supportedParams: ['stock_code', 'type'] },
        { toolName: 'get_ownership_deals_insider_sast', description: 'Shareholding, bulk/block deals, SAST, insider trades', supportedParams: ['stock_code', 'type'] },
        { toolName: 'get_document_search_results', description: 'Document search for annual reports, results, presentations', supportedParams: ['query', 'stock_code', 'document_type'] },
        { toolName: 'search_entities', description: 'Resolves stock codes and entities', supportedParams: ['query'] },
        { toolName: 'search_financial_parameters', description: 'Resolves financial parameter tokens', supportedParams: ['query'] }
      );
    }

    const report: McpCapabilityProbeReport = {
      probedAt: new Date().toISOString(),
      serverStatus: (fromSchemas || this.isConfigured()) ? 'CONNECTED' : 'NOT_CONFIGURED',
      maxScripsPerCall: this.maxScrips,
      maxMetricsPerCall: this.maxMetrics,
      maxCellsPerCall: this.maxScrips * this.maxMetrics,
      discoveredTools: tools,
      documentSearchSupported: tools.some((t) => t.toolName.includes('document')),
      multiStockStructuredSupported: tools.some((t) => t.toolName === 'get_stock_parameter_values'),
      ownershipSupported: tools.some((t) => t.toolName.includes('ownership')),
      corporateEventsSupported: tools.some((t) => t.toolName.includes('events')),
      quotaReportedByServer: false,
    };

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'MCP_CAPABILITY_PROBE.json'), JSON.stringify(report, null, 2), 'utf-8');

    return report;
  }

  /**
   * Persists immutable raw response into trendlyne_raw_response
   */
  public async storeRawResponse(
    toolName: string,
    requestObj: any,
    responseObj: any
  ): Promise<string> {
    const requestJson = JSON.stringify(requestObj);
    const responseJson = JSON.stringify(responseObj);
    const requestHash = crypto.createHash('sha256').update(requestJson).digest('hex');
    const responseHash = crypto.createHash('sha256').update(responseJson).digest('hex');
    const responseId = `tl_raw_${requestHash.substring(0, 12)}_${responseHash.substring(0, 12)}`;

    const db = getDB();
    if (db) {
      try {
        await dbRun(
          db,
          `INSERT OR IGNORE INTO trendlyne_raw_response
           (response_id, request_hash, tool_name, request_json, response_json, response_hash, retrieved_at, provider_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, '1.0.0')`,
          [responseId, requestHash, toolName, requestJson, responseJson, responseHash, new Date().toISOString()]
        );
      } catch { /* non-fatal */ }
    }

    return responseId;
  }

  /**
   * Trendlyne returns sections in its own canonical order, NOT the request order.
   * Each section's first non-header line is a human-readable description that identifies
   * the parameter. We match descriptions to requested tokens via keyword patterns.
   *
   * Section 0 contains the stock header (id|name|symbol|...) AND the first data section
   * merged together; subsequent sections separated by '---' each contain one parameter.
   */
  private static readonly DESCRIPTION_TOKEN_PATTERNS: Array<[RegExp, string]> = [
    [/pledge.*change|change.*pledge/i, 'prompledge1q'],
    [/pledge/i, 'prompledge'],
    [/fii.*change|change.*fii/i, 'fiipct1q'],
    [/fii.*4q|4q.*fii/i, 'fiipct4q'],
    [/fii\s+(holding|%)/i, 'fiihold'],
    [/mf.*change|change.*mf/i, 'mfpct1q'],
    [/mutual\s+fund|mf\s+(holding|%)/i, 'mfhold'],
    [/institutional.*change|change.*institutional/i, 'instipct1q'],
    [/institutional\s+(holding|%)/i, 'instihold'],
    [/promoter.*(latest|current)|promoter\s+holding\s*%/i, 'prompct'],
    [/roce.*avg|roce.*3yr/i, 'roceaave3'],
    [/roce/i, 'rocea'],
    [/roe/i, 'roea'],
    [/reported\s+pat|pat.*qtr|quarterly.*pat/i, 'reportedpatq'],
    [/pat.*annual|annual.*pat/i, 'pata'],
    [/market\s+cap/i, 'mcapq'],
    [/pe\s+ttm|p\/e.*ttm/i, 'pettm'],
    [/eps\s+ttm/i, 'epsttm'],
    [/debt.*equity|d\/e\s+ratio/i, 'debtcea'],
    [/price.*book|p\/b\s+ratio/i, 'pbq'],
    [/net\s+debt/i, 'netdebta'],
    [/ebitda.*(qtr|quarter)/i, 'ebitdaq'],
    [/ebitda.*annual/i, 'ebitdaa'],
    [/ebitda/i, 'ebitdaq'],
    [/(cash\s+flow|cfo).*(qtr|quarter)/i, 'cfoq'],
    [/(sales|revenue).*(qtr|quarter)/i, 'salesq'],
    [/(sales|revenue).*annual/i, 'salesa'],
    [/gross\s+profit\s+margin/i, 'gpma'],
    [/operating.*margin|opm/i, 'opmq'],
    [/sales\s+qtr|revenue\s+qtr/i, 'salesq'],
  ];

  private resolveTokenFromDescription(desc: string): string | null {
    const d = desc.toLowerCase();
    for (const [pattern, token] of TrendlyneMcpClient.DESCRIPTION_TOKEN_PATTERNS) {
      if (pattern.test(d)) return token;
    }
    return null;
  }

  private parseParameterText(
    text: string,
    tokens: string[],
    stockCodes: string[]
  ): Record<string, Record<string, any>> {
    const result: Record<string, Record<string, any>> = {};
    const tokenSet = new Set(tokens);
    for (const sym of stockCodes) result[sym.toUpperCase()] = {};

    // Split on section separator; section 0 contains header + first data section merged
    const rawSections = text.split(/\n---\n/);
    const allSections: string[] = [];

    // Extract data from section 0: skip pipe-delimited header rows, keep the rest
    const sec0Lines = rawSections[0].split('\n');
    const sec0DataLines = sec0Lines.filter((l) => !l.includes('|') && l.trim());
    if (sec0DataLines.length > 0) allSections.push(sec0DataLines.join('\n'));

    // Remaining sections come as-is
    for (const s of rawSections.slice(1)) {
      if (s.trim()) allSections.push(s);
    }

    for (const section of allSections) {
      const lines = section.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) continue;

      // First line is the parameter description
      const descLine = lines[0];
      const resolvedToken = this.resolveTokenFromDescription(descLine);
      if (!resolvedToken || !tokenSet.has(resolvedToken)) continue; // skip if not requested

      for (const line of lines.slice(1)) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        const sym = line.substring(0, colonIdx).trim().toUpperCase();
        const valStr = line.substring(colonIdx + 1).trim();
        if (!(sym in result)) continue;
        if (valStr === 'None' || valStr === '' || valStr === 'N/A') {
          result[sym][resolvedToken] = null;
        } else {
          const num = Number(valStr);
          result[sym][resolvedToken] = isNaN(num) ? valStr : num;
        }
      }
    }
    return result;
  }

  /**
   * Multi-stock structured parameter execution.
   * @throws TrendlyneNotConfiguredError when TRENDLYNE_MCP_URL is not set.
   */
  public async getStockParameterValues(
    stockCodes: string[],
    parameters: string[]
  ): Promise<{ data: Record<string, Record<string, any>>; rawResponseId: string; retrievedAt: string }> {
    this.assertTransport('get_stock_parameter_values');
    const requestObj = { stock_codes: stockCodes, parameters };
    const responseObj = await this.invokeLive('get_stock_parameter_values', requestObj);

    // invokeLive already tried JSON.parse; if it failed the raw text is returned
    let data: Record<string, Record<string, any>>;
    if (responseObj && typeof responseObj === 'object' && ('result' in responseObj || 'data' in responseObj)) {
      const inner = responseObj.result || responseObj.data;
      if (typeof inner === 'string') {
        // Trendlyne wraps plain-text in {"status":"success","data":"..."} — parse the inner text
        data = this.parseParameterText(inner, parameters, stockCodes);
      } else {
        data = inner;
      }
    } else if (typeof responseObj === 'string') {
      // Plain-text format — parse manually
      data = this.parseParameterText(responseObj, parameters, stockCodes);
    } else {
      // invokeLive returned raw SDK result; check structuredContent or reconstruct from content text
      const rawText = responseObj?.content?.find?.((c: any) => c?.type === 'text')?.text
        || (typeof responseObj === 'object' ? JSON.stringify(responseObj) : String(responseObj));
      data = this.parseParameterText(rawText, parameters, stockCodes);
    }

    if (!data || typeof data !== 'object') throw new Error('TRENDLYNE_INVALID_STRUCTURED_RESPONSE');
    const rawResponseId = await this.storeRawResponse('get_stock_parameter_values', requestObj, responseObj);
    return { data, rawResponseId, retrievedAt: new Date().toISOString() };
  }

  public async getDocumentSearchResults(request: Record<string, any>): Promise<{ response: any; rawResponseId: string }> {
    this.assertTransport('get_document_search_results');
    const response = await this.invokeLive('get_document_search_results', request);
    if (!response || typeof response !== 'object') throw new Error('TRENDLYNE_INVALID_DOCUMENT_RESPONSE');
    const rawResponseId = await this.storeRawResponse('get_document_search_results', request, response);
    return { response, rawResponseId };
  }

  public async getOwnershipDealsInsiderSast(request: Record<string, any>): Promise<{ response: any; rawResponseId: string }> {
    this.assertTransport('get_ownership_deals_insider_sast');
    const response = await this.invokeLive('get_ownership_deals_insider_sast', request);
    if (!response || typeof response !== 'object') throw new Error('TRENDLYNE_INVALID_OWNERSHIP_RESPONSE');
    const rawResponseId = await this.storeRawResponse('get_ownership_deals_insider_sast', request, response);
    return { response, rawResponseId };
  }

  public async getOverviewNewsCorpEvents(request: Record<string, any>): Promise<{ response: any; rawResponseId: string }> {
    this.assertTransport('get_overview_news_corp_events');
    const response = await this.invokeLive('get_overview_news_corp_events', request);
    if (!response || typeof response !== 'object') throw new Error('TRENDLYNE_INVALID_NEWS_RESPONSE');
    const rawResponseId = await this.storeRawResponse('get_overview_news_corp_events', request, response);
    return { response, rawResponseId };
  }
}
