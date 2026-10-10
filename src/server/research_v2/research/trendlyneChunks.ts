import { createHash } from 'node:crypto';
import type { DocumentKind, ResearchItemCandidate } from './researchItems.js';
import type { ResearchItemStore, SubmitResult } from './store.js';
import { INTERNAL_DOC_SCHEME } from './urlTools.js';

type Raw = Record<string, unknown>;

/** A chunk that could not be converted, with the reason. */
export interface SkippedChunk {
  index: number;
  reason: string;
}

export interface ChunkConversion {
  candidates: ResearchItemCandidate[];
  skipped: SkippedChunk[];
}

export interface ChunkConversionOptions {
  /** Used for chunks that carry no retrieval time of their own. */
  retrievedAt?: string;
  subQuestionIds?: string[];
}

const CHUNK_LIST_KEYS = ['chunks', 'results', 'documents', 'data', 'items'];
const TEXT_KEYS = ['text', 'content', 'chunk', 'exact_text', 'chunk_text', 'page_content'];
const URL_KEYS = ['source_url', 'sourceUrl', 'url', 'link', 'document_url', 'pdf_url', 'attachment_url'];
const DOC_ID_KEYS = ['document_id', 'documentId', 'doc_id', 'docId', 'id'];
const TITLE_KEYS = ['title', 'document_title', 'doc_title', 'name'];
const TYPE_KEYS = ['document_type', 'documentType', 'doc_type', 'type', 'category'];
const PERIOD_KEYS = ['reporting_period', 'period', 'fiscal_period', 'fy', 'quarter'];
const DATE_KEYS = ['published_at', 'publishedAt', 'filing_date', 'date', 'document_date'];
const RETRIEVED_KEYS = ['retrieved_at', 'retrievedAt', 'fetched_at'];

function isRaw(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pick(raw: Raw, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

/** Maps Trendlyne's document type text onto a document kind. */
export function documentKindFromType(type: string | undefined): DocumentKind {
  const text = (type ?? '').toLowerCase();
  if (/earnings call|transcript|concall|conference call/.test(text)) return 'CONCALL_TRANSCRIPT';
  if (/presentation/.test(text)) return 'INVESTOR_PRESENTATION';
  if (/annual report/.test(text)) return 'ANNUAL_REPORT';
  if (/quarterly|result|filing|announcement/.test(text)) return 'FILING';
  return 'OTHER';
}

function parsePayload(payload: unknown): unknown {
  return typeof payload === 'string' ? (JSON.parse(payload) as unknown) : payload;
}

/** Finds the chunk records; a document record with nested chunks hands its metadata down to each chunk. */
function collectChunks(payload: unknown): Raw[] {
  if (Array.isArray(payload)) return payload.flatMap(collectChunks);
  if (!isRaw(payload)) return [];
  const nested = payload['chunks'];
  if (Array.isArray(nested)) {
    const { chunks: _omitted, ...docMeta } = payload;
    return nested.filter(isRaw).map((chunk) => ({ ...docMeta, ...chunk }));
  }
  for (const key of CHUNK_LIST_KEYS) {
    const list = payload[key];
    if (Array.isArray(list)) return list.flatMap(collectChunks);
  }
  return pick(payload, TEXT_KEYS) === undefined ? [] : [payload];
}

function buildInternalUrl(
  symbol: string, docId: string | undefined, locator: string | undefined, text: string,
): string {
  const stable = docId ?? `text-${createHash('sha1').update(text).digest('hex').slice(0, 16)}`;
  const parts = [symbol, stable, ...(locator === undefined ? [] : [locator])].map(encodeURIComponent);
  return `${INTERNAL_DOC_SCHEME}//${parts.join('/')}`;
}

function describeLocator(raw: Raw): string | undefined {
  const explicit = pick(raw, ['chunk_locator', 'locator', 'section']);
  if (explicit !== undefined) return explicit;
  const page = pick(raw, ['page', 'page_number']);
  if (page !== undefined) return `page ${page}`;
  const chunk = pick(raw, ['chunk_id', 'chunk_index']);
  return chunk === undefined ? undefined : `chunk ${chunk}`;
}

function convertChunk(raw: Raw, symbol: string, options: ChunkConversionOptions): ResearchItemCandidate | string {
  const text = pick(raw, TEXT_KEYS);
  if (text === undefined) return 'chunk has no text';
  const retrievedAt = pick(raw, RETRIEVED_KEYS) ?? options.retrievedAt;
  if (retrievedAt === undefined) return 'chunk has no retrieval time and none was supplied';
  const docType = pick(raw, TYPE_KEYS);
  const kind = documentKindFromType(docType);
  const sourceUrl = pick(raw, URL_KEYS);
  const locator = describeLocator(raw);
  const url = sourceUrl ?? buildInternalUrl(symbol, pick(raw, DOC_ID_KEYS), locator, text);
  const title = [pick(raw, TITLE_KEYS) ?? docType ?? 'Trendlyne document', pick(raw, PERIOD_KEYS), locator]
    .filter((p): p is string => p !== undefined)
    .join(' | ');
  return {
    symbol,
    // The store re-derives the tier: PRIMARY only for a filing with a primary URL.
    tier: sourceUrl === undefined ? 'SECONDARY' : 'PRIMARY',
    url,
    title,
    publisher: 'Trendlyne document search',
    publishedAt: pick(raw, DATE_KEYS) ?? null,
    retrievedAt,
    excerpt: text,
    subQuestionIds: options.subQuestionIds ?? [],
    documentKind: kind,
  };
}

/**
 * Converts the output of get_document_search_results into research item candidates. The exact chunk text is kept as
 * the excerpt; the document title, type, period and chunk locator go into the title; the source URL is kept when the
 * document has one, otherwise a stable internal URL identifies the chunk. A document without a primary URL stays
 * SECONDARY, and earnings-call chunks are labelled MANAGEMENT_CLAIM by the store.
 * @throws SyntaxError when the payload is text that is not JSON.
 */
export function chunksToCandidates(
  symbol: string, payload: unknown, options: ChunkConversionOptions = {},
): ChunkConversion {
  const sym = symbol.trim().toUpperCase();
  const candidates: ResearchItemCandidate[] = [];
  const skipped: SkippedChunk[] = [];
  collectChunks(parsePayload(payload)).forEach((raw, index) => {
    const converted = convertChunk(raw, sym, options);
    if (typeof converted === 'string') skipped.push({ index, reason: converted });
    else candidates.push(converted);
  });
  return { candidates, skipped };
}

/** Converts chunks and submits each candidate to the store. */
export function importTrendlyneChunks(
  store: ResearchItemStore, symbol: string, payload: unknown, options: ChunkConversionOptions = {},
): { results: SubmitResult[]; skipped: SkippedChunk[] } {
  const { candidates, skipped } = chunksToCandidates(symbol, payload, options);
  return { results: candidates.map((c) => store.submit(c)), skipped };
}
