import { classifyHost, canonicalizeUrl, scopedUrlHash, INTERNAL_DOC_SCHEME } from './urlTools.js';

/** PRIMARY = regulator, filing, annual report, concall transcript; SECONDARY = everything else (a lead only). */
export type ResearchTier = 'PRIMARY' | 'SECONDARY';

/** VERIFIED = traced to a primary source; UNVERIFIED_LEAD = untraced secondary; MANAGEMENT_CLAIM = concall. */
export type ResearchStatus = 'VERIFIED' | 'UNVERIFIED_LEAD' | 'REJECTED' | 'MANAGEMENT_CLAIM';

/** What kind of document an item is; drives the tier and management-claim rules. */
export type DocumentKind =
  | 'ANNUAL_REPORT' | 'FILING' | 'EXCHANGE_ANNOUNCEMENT' | 'REGULATOR'
  | 'CONCALL_TRANSCRIPT' | 'INVESTOR_PRESENTATION' | 'NEWS' | 'BROKER_NOTE' | 'OTHER';

export const DOCUMENT_KINDS: readonly DocumentKind[] = [
  'ANNUAL_REPORT', 'FILING', 'EXCHANGE_ANNOUNCEMENT', 'REGULATOR', 'CONCALL_TRANSCRIPT',
  'INVESTOR_PRESENTATION', 'NEWS', 'BROKER_NOTE', 'OTHER',
];

/** Kinds that are records made by a company or regulator and can be the target of a trace. */
const PRIMARY_KINDS: ReadonlySet<DocumentKind> = new Set<DocumentKind>([
  'ANNUAL_REPORT', 'FILING', 'EXCHANGE_ANNOUNCEMENT', 'REGULATOR',
]);

/** Kinds that record what management said; they are labelled MANAGEMENT_CLAIM, never VERIFIED. */
const MANAGEMENT_KINDS: ReadonlySet<DocumentKind> = new Set<DocumentKind>([
  'CONCALL_TRANSCRIPT', 'INVESTOR_PRESENTATION',
]);

const CONCALL_TITLE = /\b(concall|con-call|earnings call|conference call|call transcript|analyst call)\b/i;
const SUB_QUESTION_ID = /^Q([1-9]|1\d|2[0-9])(\.[A-Za-z0-9]+)?$/;

/** One stored research item. `url` is canonical; `urlHash` is scoped to the symbol. */
export interface ResearchItem {
  itemId: string;
  symbol: string;
  tier: ResearchTier;
  url: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  retrievedAt: string;
  excerpt: string;
  subQuestionIds: string[];
  status: ResearchStatus;
  /** itemId of the PRIMARY item this was traced to (or the unresolved reference when rejected). */
  tracedTo: string | null;
  urlHash: string;
}

/** An item as gathered, before the protocol decides its tier and status. `status` is advisory and ignored. */
export interface ResearchItemCandidate {
  symbol: string;
  tier: ResearchTier;
  url: string;
  title?: string;
  publisher?: string;
  publishedAt?: string | null;
  retrievedAt: string;
  excerpt: string;
  subQuestionIds?: string[];
  documentKind?: DocumentKind;
  /** itemId or URL of a PRIMARY item that confirms this item. */
  tracedTo?: string | null;
  status?: ResearchStatus;
}

/** Candidate after normalisation and structural validation. */
export interface NormalisedCandidate extends Omit<ResearchItemCandidate, 'title' | 'publisher' | 'publishedAt'> {
  canonicalUrl: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  subQuestionIds: string[];
}

export interface CandidateValidation {
  ok: boolean;
  errors: string[];
  candidate?: NormalisedCandidate;
}

function isValidDate(text: string): boolean {
  return text.trim() !== '' && !Number.isNaN(Date.parse(text));
}

/** Structural validation and normalisation. Missing url, excerpt or retrieval time make an item untraceable. */
export function validateCandidate(input: ResearchItemCandidate): CandidateValidation {
  const errors: string[] = [];
  const symbol = (input.symbol ?? '').trim().toUpperCase();
  if (symbol === '') errors.push('symbol is required');
  if (input.tier !== 'PRIMARY' && input.tier !== 'SECONDARY') errors.push('tier must be PRIMARY or SECONDARY');
  const canonicalUrl = typeof input.url === 'string' ? canonicalizeUrl(input.url) : null;
  if (canonicalUrl === null) errors.push('url must be an http(s) URL');
  const excerpt = (input.excerpt ?? '').trim();
  if (excerpt === '') errors.push('excerpt is required');
  if (typeof input.retrievedAt !== 'string' || !isValidDate(input.retrievedAt)) {
    errors.push('retrievedAt must be a date');
  }
  const published = input.publishedAt ?? null;
  if (published !== null && !isValidDate(published)) errors.push('publishedAt must be a date or null');
  const ids = input.subQuestionIds ?? [];
  for (const id of ids) if (!SUB_QUESTION_ID.test(id)) errors.push(`invalid sub-question id ${id}`);
  if (input.documentKind !== undefined && !DOCUMENT_KINDS.includes(input.documentKind)) {
    errors.push(`unknown documentKind ${String(input.documentKind)}`);
  }
  if (errors.length > 0 || canonicalUrl === null) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    candidate: {
      ...input,
      symbol,
      canonicalUrl,
      excerpt,
      title: (input.title ?? '').trim(),
      publisher: (input.publisher ?? '').trim(),
      publishedAt: published,
      subQuestionIds: [...new Set(ids)],
    },
  };
}

/** True when the item records a management statement (concall, investor presentation). */
export function isManagementStatement(c: Pick<ResearchItemCandidate, 'documentKind' | 'title'>): boolean {
  if (c.documentKind !== undefined && MANAGEMENT_KINDS.has(c.documentKind)) return true;
  if (c.documentKind !== undefined && c.documentKind !== 'OTHER') return false;
  return CONCALL_TITLE.test(c.title ?? '');
}

/**
 * The tier the protocol grants. PRIMARY needs a primary host, or a primary document kind on a host that is not a
 * known secondary site. A declared PRIMARY without that evidence is downgraded to SECONDARY.
 */
export function resolveTier(c: NormalisedCandidate): { tier: ResearchTier; note: string | null } {
  if (c.canonicalUrl.startsWith(INTERNAL_DOC_SCHEME)) {
    const note = c.tier === 'PRIMARY' ? 'document has no primary URL; downgraded to SECONDARY' : null;
    return { tier: 'SECONDARY', note };
  }
  const hostClass = classifyHost(c.canonicalUrl);
  if (hostClass === 'SECONDARY') {
    const note = c.tier === 'PRIMARY' ? 'declared PRIMARY on a secondary host; downgraded to SECONDARY' : null;
    return { tier: 'SECONDARY', note };
  }
  const kind = c.documentKind;
  const kindIsPrimary = kind !== undefined && (PRIMARY_KINDS.has(kind) || MANAGEMENT_KINDS.has(kind));
  if (hostClass === 'PRIMARY' || kindIsPrimary) return { tier: 'PRIMARY', note: null };
  const note = c.tier === 'PRIMARY' ? 'no primary host or document kind; downgraded to SECONDARY' : null;
  return { tier: 'SECONDARY', note };
}

/** Result of the protocol decision for one candidate. */
export interface StatusDecision {
  tier: ResearchTier;
  status: ResearchStatus;
  tracedTo: string | null;
  notes: string[];
  /** Set when status is REJECTED. */
  rejectReason?: string;
}

/** Looks up a stored item by itemId or by (canonical) URL within the candidate's symbol. */
export type PrimaryLookup = (reference: string, symbol: string) => ResearchItem | undefined;

/** True when the item can serve as the primary source a secondary item is traced to. */
export function isTraceTarget(item: ResearchItem | undefined, symbol: string): item is ResearchItem {
  return item !== undefined && item.symbol === symbol && item.tier === 'PRIMARY' && item.status === 'VERIFIED';
}

/**
 * Protocol rules:
 * 1. management statements are MANAGEMENT_CLAIM whatever their tier;
 * 2. PRIMARY items are VERIFIED;
 * 3. SECONDARY items are UNVERIFIED_LEAD, and become VERIFIED only when `tracedTo` resolves to a VERIFIED PRIMARY
 *    item of the same symbol; a trace that does not resolve rejects the item as untraceable.
 */
export function decideStatus(c: NormalisedCandidate, lookup: PrimaryLookup): StatusDecision {
  const { tier, note } = resolveTier(c);
  const notes = note === null ? [] : [note];
  const reference = (c.tracedTo ?? '').trim();
  if (isManagementStatement(c)) {
    notes.push('management statement; not verified fact');
    return { tier, status: 'MANAGEMENT_CLAIM', tracedTo: null, notes };
  }
  if (tier === 'PRIMARY') return { tier, status: 'VERIFIED', tracedTo: null, notes };
  if (reference === '') return { tier, status: 'UNVERIFIED_LEAD', tracedTo: null, notes };
  const target = lookup(reference, c.symbol);
  if (isTraceTarget(target, c.symbol)) return { tier, status: 'VERIFIED', tracedTo: target.itemId, notes };
  return {
    tier,
    status: 'REJECTED',
    tracedTo: reference,
    notes,
    rejectReason: `untraceable: tracedTo ${reference} is not a VERIFIED PRIMARY item for ${c.symbol}`,
  };
}

/** Builds the stored item from a normalised candidate and its decision. */
export function toResearchItem(c: NormalisedCandidate, decision: StatusDecision): ResearchItem {
  const urlHash = scopedUrlHash(c.symbol, c.canonicalUrl);
  return {
    itemId: `ri_${urlHash.slice(0, 20)}`,
    symbol: c.symbol,
    tier: decision.tier,
    url: c.canonicalUrl,
    title: c.title,
    publisher: c.publisher,
    publishedAt: c.publishedAt,
    retrievedAt: c.retrievedAt,
    excerpt: c.excerpt,
    subQuestionIds: c.subQuestionIds,
    status: decision.status,
    tracedTo: decision.tracedTo,
    urlHash,
  };
}

/** An open gap the research brief should address. */
export interface OpenGap {
  subQuestionId: string;
  factNeeded: string;
  preferredSource?: string;
}

/** One line of a research brief. */
export interface ResearchBriefLine {
  subQuestionId: string;
  factNeeded: string;
  preferredSource: string;
}

const SOURCE_HINTS: Array<[RegExp, string]> = [
  [/pledge|shareholding|promoter holding|fii|dii|mutual fund/i, 'Exchange shareholding pattern (NSE/BSE filing)'],
  [/related.party|auditor|remuneration|kmp|contingent|segment|note to accounts/i, 'Annual report notes'],
  [/guidance|order book|capex plan|management|outlook|target/i,
    'Concall transcript or investor presentation (MANAGEMENT_CLAIM)'],
  [/litigation|regulatory|sebi|penalty|order|tax demand/i, 'Exchange announcement or SEBI/regulator record'],
];

/** Default preferred source for a fact, always a primary one. */
export function defaultPreferredSource(factNeeded: string): string {
  for (const [pattern, source] of SOURCE_HINTS) if (pattern.test(factNeeded)) return source;
  return 'Annual report or exchange filing';
}

function compareSubQuestionIds(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}

/**
 * One research brief per scrip from its open gaps: sub-question, the exact fact needed and the preferred source.
 * Duplicate gaps collapse; lines are ordered by sub-question id.
 */
export function buildBrief(symbol: string, openGaps: OpenGap[]): ResearchBriefLine[] {
  if (symbol.trim() === '') throw new Error('buildBrief: symbol is required');
  const seen = new Set<string>();
  const lines: ResearchBriefLine[] = [];
  for (const gap of openGaps) {
    const factNeeded = gap.factNeeded.trim();
    const key = `${gap.subQuestionId}\n${factNeeded.toLowerCase()}`;
    if (factNeeded === '' || seen.has(key)) continue;
    seen.add(key);
    const preferredSource = (gap.preferredSource ?? '').trim() || defaultPreferredSource(factNeeded);
    lines.push({ subQuestionId: gap.subQuestionId, factNeeded, preferredSource });
  }
  return lines.sort((a, b) => compareSubQuestionIds(a.subQuestionId, b.subQuestionId));
}
