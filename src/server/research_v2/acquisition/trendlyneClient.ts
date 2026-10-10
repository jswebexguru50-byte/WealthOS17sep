import fs from 'node:fs';
import path from 'node:path';
import {
  AcquisitionError, PROVIDER_MAX_SYMBOLS, PROVIDER_MAX_TOKENS, PROVIDER_QUOTA_CODE,
  type OverviewView, type OwnershipView, type ToolResult, type TrendlyneTransport,
} from './types.js';
import {
  parseEnvelope, parseParameterData, type ParsedParameterTable, type ProviderEnvelope,
} from './responseParser.js';

export interface ClientOptions {
  transport: TrendlyneTransport;
  /** Overrides process.env.NODE_ENV (tests). */
  nodeEnv?: string;
  /** Must be explicitly true, and NODE_ENV must be "test", to use a simulator transport. */
  allowSimulator?: boolean;
}

/** Successful call. `raw` is the untouched MCP result, kept for snapshot storage. */
export interface CallOk<T> { ok: true; data: T; raw: ToolResult; envelope: ProviderEnvelope }

/** Failed call. Never fabricated into data; always logged by the caller. */
export interface CallFailed {
  ok: false;
  errorCode: string;
  message: string;
  /** True when waiting and retrying can succeed (quota 1002, transport failure). */
  retryable: boolean;
  /** True for provider error 1002, "Maximum weighted channel limit exceeded". */
  quotaExhausted: boolean;
  raw?: ToolResult;
}

export type CallResult<T> = CallOk<T> | CallFailed;

export interface ParameterCallData {
  table: ParsedParameterTable;
  /** Requested symbols the provider returned no header for. */
  missingSymbols: string[];
}

export interface CatalogueItem { parameter: string; helping_text: string }
export interface CatalogueSearchData { items: CatalogueItem[]; nextPage: number | null }

/** Parameter call request: up to 10 symbols x 50 tokens. */
export interface ParameterRequest { symbols: string[]; tokens: string[] }

const RETRYABLE_CODES = new Set([PROVIDER_QUOTA_CODE, 'TRANSPORT_FAILED', 'MCP_TOOL_ERROR']);

function failure(errorCode: string, message: string, raw?: ToolResult): CallFailed {
  return {
    ok: false, errorCode, message, raw,
    retryable: RETRYABLE_CODES.has(errorCode),
    quotaExhausted: errorCode === PROVIDER_QUOTA_CODE,
  };
}

/** Typed, quota-aware wrapper over the Trendlyne MCP tools. Real transport only. */
export class TrendlyneClient {
  private readonly transport: TrendlyneTransport;

  /** @throws AcquisitionError SIMULATOR_DISABLED when a simulator is not explicitly allowed in tests. */
  constructor(options: ClientOptions) {
    const env = options.nodeEnv ?? process.env.NODE_ENV;
    if (options.transport.isSimulator && !(env === 'test' && options.allowSimulator === true)) {
      throw new AcquisitionError(
        'SIMULATOR_DISABLED',
        'simulator transports are only allowed under NODE_ENV=test with explicit injection',
      );
    }
    this.transport = options.transport;
  }

  private async invoke(name: string, args: Record<string, unknown>): Promise<CallResult<ProviderEnvelope>> {
    let raw: ToolResult;
    try {
      raw = await this.transport.callTool(name, args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return failure('TRANSPORT_FAILED', message);
    }
    const envelope = parseEnvelope(raw);
    if (!envelope.ok) return failure(envelope.errorCode ?? 'PROVIDER_ERROR', envelope.message ?? 'provider error', raw);
    return { ok: true, data: envelope, raw, envelope };
  }

  /**
   * get_stock_parameter_values. Provider limits: 10 symbols x 50 tokens per call.
   * @throws AcquisitionError PROVIDER_LIMIT_EXCEEDED before any network call when limits are exceeded.
   */
  async getParameterValues(request: ParameterRequest): Promise<CallResult<ParameterCallData>> {
    const { symbols, tokens } = request;
    if (symbols.length < 1 || tokens.length < 1) {
      throw new AcquisitionError('PROVIDER_LIMIT_EXCEEDED', 'at least one symbol and one token are required');
    }
    if (symbols.length > PROVIDER_MAX_SYMBOLS || tokens.length > PROVIDER_MAX_TOKENS) {
      throw new AcquisitionError(
        'PROVIDER_LIMIT_EXCEEDED',
        `${symbols.length} symbols x ${tokens.length} tokens exceeds ${PROVIDER_MAX_SYMBOLS} x ${PROVIDER_MAX_TOKENS}`,
      );
    }
    const result = await this.invoke('get_stock_parameter_values', { stock_codes: symbols, parameters: tokens });
    if (!result.ok) return result;
    let table: ParsedParameterTable;
    try {
      table = parseParameterData(result.envelope.data);
    } catch (error) {
      return failure('RESPONSE_UNPARSEABLE', (error as Error).message, result.raw);
    }
    if (table.rows.length === 0) {
      return failure('NO_METRIC_ROWS', 'provider returned identifiers only (no metric rows)', result.raw);
    }
    const seen = new Set(table.companies.map(c => c.symbol.toUpperCase()));
    const missingSymbols = symbols.filter(s => !seen.has(s.toUpperCase()));
    return { ok: true, data: { table, missingSymbols }, raw: result.raw, envelope: result.envelope };
  }

  /** get_overview_news_corp_events for one symbol and view. */
  getOverview(symbol: string, type: OverviewView): Promise<CallResult<ProviderEnvelope>> {
    return this.invoke('get_overview_news_corp_events', { stock_code: symbol, type });
  }

  /** get_ownership_deals_insider_sast for one symbol and view. */
  getOwnership(symbol: string, type: OwnershipView): Promise<CallResult<ProviderEnvelope>> {
    return this.invoke('get_ownership_deals_insider_sast', { stock_code: symbol, type });
  }

  /** get_document_search_results with a focused query (company name plus the specific topic). */
  searchDocuments(query: string): Promise<CallResult<ProviderEnvelope>> {
    return this.invoke('get_document_search_results', { query });
  }

  /** search_entities, used to resolve a stock code. */
  searchEntities(query: string): Promise<CallResult<ProviderEnvelope>> {
    return this.invoke('search_entities', { query });
  }

  /**
   * search_financial_parameters. `page` is sent only when given; the provider schema documents just
   * `query`, so a next_page hint in the reply is honoured if the provider ever adds one.
   */
  async searchParameters(query: string, page?: number): Promise<CallResult<CatalogueSearchData>> {
    const args: Record<string, unknown> = page === undefined ? { query } : { query, page };
    const result = await this.invoke('search_financial_parameters', args);
    if (!result.ok) return result;
    const raw = result.envelope.data as any;
    const list: unknown = Array.isArray(raw) ? raw : raw?.items;
    if (!Array.isArray(list)) return failure('RESPONSE_UNPARSEABLE', 'parameter search returned no list', result.raw);
    const items = list
      .filter((x: any) => typeof x?.parameter === 'string')
      .map((x: any) => ({ parameter: x.parameter as string, helping_text: String(x.helping_text ?? '') }));
    const hint = raw?.next_page;
    const nextPage = typeof hint === 'number' ? hint : null;
    return { ok: true, data: { items, nextPage }, raw: result.raw, envelope: result.envelope };
  }
}

/** Result of the one-time 10 x 50 limit probe. */
export interface ProbeRecord {
  verified: boolean;
  maxSymbols: number;
  maxTokens: number;
  probedAt: string;
  errorCode?: string;
  message?: string;
}

/** Persistence seam for the probe record (file in production, memory in tests). */
export interface ProbeStore { read(): ProbeRecord | null; write(record: ProbeRecord): void }

/** JSON-file probe store. */
export function fileProbeStore(file: string): ProbeStore {
  return {
    read: () => {
      try { return JSON.parse(fs.readFileSync(file, 'utf8')) as ProbeRecord; } catch { return null; }
    },
    write: record => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(record, null, 2));
    },
  };
}

/**
 * Verifies once that a 10 symbol x 50 token call is accepted, and records the outcome. A previously
 * verified record is returned without any call. A failed probe is recorded but not trusted: it is
 * retried on the next probe. Costs one provider call.
 */
export async function probeParameterLimits(
  client: TrendlyneClient,
  store: ProbeStore,
  sample: ParameterRequest,
  now: () => string = () => new Date().toISOString(),
): Promise<ProbeRecord> {
  const prior = store.read();
  if (prior?.verified) return prior;
  const result = await client.getParameterValues(sample);
  const base = { maxSymbols: sample.symbols.length, maxTokens: sample.tokens.length, probedAt: now() };
  const record: ProbeRecord = result.ok
    ? { verified: true, ...base }
    : { verified: false, ...base, errorCode: result.errorCode, message: result.message };
  store.write(record);
  return record;
}
