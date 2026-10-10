import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { openForWrite, type WriteGuardOptions } from '../db/dbGuard.js';
import type { ToolResult } from './types.js';

/** Executes `work` against a write-capable handle. Production: dbGuard.openForWrite. */
export type DbWriter = <T>(work: (db: Database.Database) => T) => T;
/** Executes `work` against a read-only handle. */
export type DbReader = <T>(work: (db: Database.Database) => T) => T;

/** Writer that goes through the db guard (production needs --allow-production plus a verified backup). */
export function guardedWriter(options: WriteGuardOptions): DbWriter {
  return work => openForWrite(options, work);
}

/** Read-only reader for a database file. */
export function readOnlyReader(dbPath: string): DbReader {
  return work => {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      return work(db);
    } finally {
      db.close();
    }
  };
}

export type CallStatus = 'SUCCESS' | 'ERROR' | 'QUOTA_EXHAUSTED' | 'CACHE_HIT';

/** One row of research_trendlyne_call_log. */
export interface CallLogEntry {
  runId: string;
  purpose: string;
  endpoint: string;
  symbols: string[];
  tokens: string[];
  requestHash: string;
  status: CallStatus;
  errorCode?: string;
  errorMessage?: string;
  weightedCost?: number;
  responseRef?: string;
  calledAt?: string;
}

const sortedUnique = (values: unknown): unknown =>
  Array.isArray(values) ? [...new Set(values.map(String))].sort() : values;

/**
 * Stable request hash. Symbol and token lists are order-insensitive, so the same logical request
 * always hits the same cache entry.
 */
export function requestHash(endpoint: string, args: Record<string, unknown>): string {
  const normalised: Record<string, unknown> = {};
  for (const key of Object.keys(args).sort()) {
    normalised[key] = key === 'stock_codes' || key === 'parameters' ? sortedUnique(args[key]) : args[key];
  }
  return crypto.createHash('sha256').update(JSON.stringify([endpoint, normalised])).digest('hex');
}

/** Appends one call-log row. Insert only: nothing in this module updates or deletes log rows. */
export function appendCallLog(db: Database.Database, entry: CallLogEntry): number {
  const result = db.prepare(`
    INSERT INTO research_trendlyne_call_log
      (run_id, purpose, endpoint, symbols_json, tokens_json, request_hash, status, error_code, error_message,
       weighted_cost, response_ref, called_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`).run(
    entry.runId, entry.purpose, entry.endpoint, JSON.stringify(entry.symbols), JSON.stringify(entry.tokens),
    entry.requestHash, entry.status, entry.errorCode ?? null, entry.errorMessage ?? null,
    entry.weightedCost ?? null, entry.responseRef ?? null, entry.calledAt ?? null,
  );
  return Number(result.lastInsertRowid);
}

/** Most recent SUCCESS row for a request hash, if any. A later error never hides it. */
export function findSuccess(db: Database.Database, hash: string): { id: number; responseRef: string | null } | null {
  const row = db.prepare(
    "SELECT id, response_ref FROM research_trendlyne_call_log WHERE request_hash = ? AND status = 'SUCCESS' " +
    'ORDER BY id DESC LIMIT 1',
  ).get(hash) as { id: number; response_ref: string | null } | undefined;
  return row ? { id: row.id, responseRef: row.response_ref } : null;
}

export const PROVIDER = 'TRENDLYNE_MCP';
const AUTHORITY = 'LICENSED_PROVIDER';

/** Everything saved for one provider response. */
export interface SnapshotInput {
  symbols: string[];
  isinBySymbol?: Record<string, string | undefined>;
  endpoint: string;
  /** Tool name, e.g. get_stock_parameter_values (source_url becomes mcp://trendlyne/<tool>). */
  tool: string;
  status: 'SUCCESS' | 'SOURCE_UNAVAILABLE';
  error?: string | null;
  payload: ToolResult | null;
  fetchedAt: string;
}

/** Reference written to response_ref: `fss:<symbol>|<fetched_at>` of the first symbol's source snapshot. */
export type ResponseRef = string;

function uniqueFetchedAt(db: Database.Database, symbol: string, fetchedAt: string): string {
  const exists = db.prepare(
    'SELECT 1 FROM fundamental_source_snapshots WHERE symbol = ? AND provider = ? AND fetched_at = ?',
  );
  let stamp = fetchedAt;
  let guard = 0;
  while (exists.get(symbol, PROVIDER, stamp) && guard++ < 1000) {
    stamp = new Date(Date.parse(stamp) + 1).toISOString();
  }
  return stamp;
}

/**
 * Saves a raw payload exactly like scripts/trendlyne-mirror/fetch_eight_packs.ts: one endpoint
 * snapshot (replace) and one append-only source snapshot per symbol, provider TRENDLYNE_MCP, raw
 * payload preserved. Extra rule: an error never replaces an endpoint snapshot that holds a SUCCESS.
 * Call inside the db guard writer only.
 */
export function saveRawSnapshots(db: Database.Database, input: SnapshotInput): ResponseRef | null {
  const raw = input.payload === null ? null : JSON.stringify(input.payload);
  const sourceUrl = `mcp://trendlyne/${input.tool}`;
  const prior = db.prepare(
    'SELECT status FROM fundamental_endpoint_snapshots WHERE symbol = ? AND provider = ? AND endpoint = ?',
  );
  const writeEndpoint = db.prepare(`
    INSERT OR REPLACE INTO fundamental_endpoint_snapshots
      (symbol, isin, provider, endpoint, authority, source_url, fetched_at, status, http_status, error, response_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 200, ?, ?)`);
  const writeSource = db.prepare(`
    INSERT INTO fundamental_source_snapshots
      (symbol, isin, provider, authority, source_url, fetched_at, status, error, response_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let ref: ResponseRef | null = null;
  for (const symbol of input.symbols) {
    const isin = input.isinBySymbol?.[symbol] ?? null;
    const existing = prior.get(symbol, PROVIDER, input.endpoint) as { status: string } | undefined;
    const protectSuccess = existing?.status === 'SUCCESS' && input.status !== 'SUCCESS';
    if (!protectSuccess) {
      writeEndpoint.run(symbol, isin, PROVIDER, input.endpoint, AUTHORITY, sourceUrl, input.fetchedAt,
        input.status, input.error ?? null, raw);
    }
    const stamp = uniqueFetchedAt(db, symbol, input.fetchedAt);
    writeSource.run(symbol, isin, PROVIDER, AUTHORITY, sourceUrl, stamp, input.status, input.error ?? null, raw);
    if (ref === null && input.status === 'SUCCESS') ref = `fss:${symbol}|${stamp}`;
  }
  return ref;
}

/** Loads a cached raw response by the reference stored in the call log. */
export function loadCachedResponse(db: Database.Database, responseRef: string): ToolResult | null {
  if (!responseRef.startsWith('fss:')) return null;
  const [symbol, fetchedAt] = responseRef.slice(4).split('|');
  const row = db.prepare(
    'SELECT response_json FROM fundamental_source_snapshots WHERE symbol = ? AND provider = ? AND fetched_at = ?',
  ).get(symbol, PROVIDER, fetchedAt) as { response_json: string | null } | undefined;
  if (!row?.response_json) return null;
  try {
    return JSON.parse(row.response_json) as ToolResult;
  } catch {
    return null;
  }
}

/** A recorded outcome the recorder can persist. */
export interface RecordInput {
  purpose: string;
  endpoint: string;
  tool: string;
  symbols: string[];
  tokens: string[];
  requestHash: string;
  weightedCost?: number;
  isinBySymbol?: Record<string, string | undefined>;
  fetchedAt: string;
  outcome:
    | { ok: true; raw: ToolResult }
    | { ok: false; errorCode: string; message: string; quotaExhausted: boolean; raw?: ToolResult };
}

/** Writes snapshots and the call-log row together, through the guarded writer. */
export class CallRecorder {
  constructor(
    private readonly runId: string,
    private readonly write: DbWriter,
    private readonly read?: DbReader,
  ) {}

  /** Cached SUCCESS response for the hash, or null. Never calls the provider. */
  lookup(hash: string): ToolResult | null {
    if (!this.read) return null;
    return this.read(db => {
      const hit = findSuccess(db, hash);
      return hit?.responseRef ? loadCachedResponse(db, hit.responseRef) : null;
    });
  }

  /** Persists one call. Errors are appended as new rows and never overwrite a prior SUCCESS. */
  record(input: RecordInput): void {
    this.write(db => {
      const ok = input.outcome.ok;
      const ref = saveRawSnapshots(db, {
        symbols: input.symbols, isinBySymbol: input.isinBySymbol, endpoint: input.endpoint, tool: input.tool,
        status: ok ? 'SUCCESS' : 'SOURCE_UNAVAILABLE',
        error: input.outcome.ok ? null : `${input.outcome.errorCode}: ${input.outcome.message}`,
        payload: input.outcome.raw ?? null, fetchedAt: input.fetchedAt,
      });
      appendCallLog(db, {
        runId: this.runId, purpose: input.purpose, endpoint: input.endpoint, symbols: input.symbols,
        tokens: input.tokens, requestHash: input.requestHash,
        status: input.outcome.ok ? 'SUCCESS' : input.outcome.quotaExhausted ? 'QUOTA_EXHAUSTED' : 'ERROR',
        errorCode: input.outcome.ok ? undefined : input.outcome.errorCode,
        errorMessage: input.outcome.ok ? undefined : input.outcome.message,
        weightedCost: input.weightedCost, responseRef: ref ?? undefined, calledAt: input.fetchedAt,
      });
    });
  }

  /** Records a cache hit (no provider call, no quota use). */
  recordCacheHit(input: Pick<RecordInput, 'purpose' | 'endpoint' | 'symbols' | 'tokens' | 'requestHash' | 'fetchedAt'>): void {
    this.write(db => {
      appendCallLog(db, {
        runId: this.runId, purpose: input.purpose, endpoint: input.endpoint, symbols: input.symbols,
        tokens: input.tokens, requestHash: input.requestHash, status: 'CACHE_HIT', calledAt: input.fetchedAt,
      });
    });
  }
}
