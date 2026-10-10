import type Database from 'better-sqlite3';
import {
  REVERIFY_TOKENS, TOKEN_MAPPINGS, classifyUnmapped, inferUnit, mappingFor, type Tier, type TokenMapping,
} from './tokenMappings.js';

const WORD_MAP: Record<string, string> = {
  rev: 'revenue', ann: 'annual', act: 'activity', activities: 'activity', lt: 'long term',
  qtrs: 'qtr', quarter: 'qtr', quarters: 'qtr', yrs: 'yr', year: 'yr', years: 'yr',
};

/**
 * Normalises a provider label for case-insensitive matching: "1Y Ago", "1Yr Ago", "4Qtrs ago" and
 * "Rev." / "Ann." / "Act." variants collapse to one form; "RoA" and "ROA" match.
 */
export function normalizeLabel(label: string): string {
  const text = label
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/%/g, ' pct ')
    .replace(/(\d+)\s*(qtrs?|quarters?|q)\b/g, '$1q')
    .replace(/(\d+)\s*(yrs?|years?|y)\b/g, '$1y');
  return text.split(/[^a-z0-9]+/).filter(Boolean).map(w => WORD_MAP[w] ?? w).join(' ');
}

/** Result of resolving one provider label. */
export type LabelMatch =
  | { kind: 'TOKEN'; token: string }
  | { kind: 'AMBIGUOUS'; tokens: string[] }
  | { kind: 'UNKNOWN' };

/** Case-insensitive label to token index over the tokens of one request. */
export class LabelIndex {
  private readonly byLabel = new Map<string, Set<string>>();

  add(token: string, label: string): void {
    const key = normalizeLabel(label);
    if (!key) return;
    const tokens = this.byLabel.get(key) ?? new Set<string>();
    tokens.add(token);
    this.byLabel.set(key, tokens);
  }

  /** Resolves a provider label; ambiguous labels never resolve to a guess. */
  resolve(label: string): LabelMatch {
    const tokens = this.byLabel.get(normalizeLabel(label));
    if (!tokens || tokens.size === 0) return { kind: 'UNKNOWN' };
    if (tokens.size > 1) return { kind: 'AMBIGUOUS', tokens: [...tokens].sort() };
    return { kind: 'TOKEN', token: [...tokens][0] };
  }
}

/**
 * Builds the label index for the tokens of one request from the discovered catalogue labels, the
 * mapping labels and the aliases (observed response labels such as "LTP" or "OPM Ann. %").
 */
export function buildLabelIndex(tokens: string[], discovered?: ReadonlyMap<string, string>): LabelIndex {
  const index = new LabelIndex();
  for (const token of tokens) {
    const found = discovered?.get(token);
    if (found) index.add(token, found);
    const mapping = mappingFor(token);
    if (!mapping) continue;
    index.add(token, mapping.label);
    mapping.aliases.forEach(alias => index.add(token, alias));
  }
  return index;
}

/** One page of a parameter search. */
export type SearchPage =
  | { ok: true; items: Array<{ parameter: string; helping_text: string }>; nextPage: number | null }
  | { ok: false; errorCode: string; message: string; quotaExhausted: boolean };

export type SearchFn = (query: string, page?: number) => Promise<SearchPage>;

/** Starting queries covering every statement area; discovery then expands from discovered labels. */
export const DEFAULT_SEED_QUERIES: readonly string[] = [
  'revenue', 'operating revenue', 'total revenue', 'net profit', 'operating profit', 'profit before tax', 'tax',
  'interest', 'depreciation', 'other income', 'exceptional items', 'extraordinary items', 'eps', 'dividend',
  'cash flow', 'cash from operating', 'cash from investing', 'cash from financing', 'capital expenditure',
  'borrowings', 'debt', 'net debt', 'equity', 'reserves', 'total assets', 'current assets', 'current liabilities',
  'inventories', 'trade receivables', 'trade payables', 'cash and cash equivalents', 'investments', 'fixed assets',
  'contingent liabilities', 'lease', 'working capital', 'roe', 'roce', 'roic', 'roa', 'margin', 'ratio',
  'market cap', 'price', 'pe', 'peg', 'book value', 'price to sales', 'promoter holding', 'promoter pledge',
  'fii holding', 'dii holding', 'mutual fund holding', 'institutional holding', 'public holding', 'insider',
  'sast', 'ebitda', 'ebita', 'growth', 'ttm', 'annual', 'quarter', 'ago', 'segment', 'employee', 'tax rate',
];

export interface DiscoveryOptions {
  search: SearchFn;
  seedQueries?: readonly string[];
  /** Hard cap on search calls (each costs provider quota). Default 400. */
  maxQueries?: number;
  /** Pages followed per query when the provider returns a next page. Default 50. */
  maxPagesPerQuery?: number;
}

export type StopReason = 'EXHAUSTED' | 'QUERY_CAP' | 'QUOTA_EXHAUSTED' | 'SEARCH_FAILED';

export interface DiscoveryResult {
  /** token -> helping_text for every distinct token seen. */
  tokens: Map<string, string>;
  /** Actual catalogue size discovered (not an assumed number). */
  size: number;
  queriesRun: number;
  pagesFetched: number;
  /** True only when the query frontier was empty: a full pass found nothing new. */
  exhausted: boolean;
  stoppedBecause: StopReason;
  errors: Array<{ query: string; errorCode: string }>;
}

/** Search stem of a label: drops period markers so one query covers a whole series. */
export function labelStem(label: string): string {
  return normalizeLabel(label)
    .replace(/\b\d+[qy]\b/g, ' ')
    .replace(/\b(ago|annual|qtr|ttm|latest|current|pct|avg|average)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Enumerates the provider parameter catalogue until exhausted. The provider search takes only a
 * query, so there is no page cursor to follow: the frontier is seeded and then expanded with the
 * stems of every newly discovered label until a whole pass adds nothing. Paging is followed
 * only if the provider returns a next page. The result states whether exhaustion was reached.
 */
export async function discoverCatalogue(options: DiscoveryOptions): Promise<DiscoveryResult> {
  const maxQueries = options.maxQueries ?? 400;
  const maxPages = options.maxPagesPerQuery ?? 50;
  const tokens = new Map<string, string>();
  const queried = new Set<string>();
  const frontier: string[] = [...(options.seedQueries ?? DEFAULT_SEED_QUERIES)];
  const errors: DiscoveryResult['errors'] = [];
  let queriesRun = 0;
  let pagesFetched = 0;
  let stoppedBecause: StopReason = 'EXHAUSTED';

  const enqueue = (query: string): void => {
    const key = query.trim().toLowerCase();
    if (key && !queried.has(key) && !frontier.some(q => q.trim().toLowerCase() === key)) frontier.push(query.trim());
  };

  outer: while (frontier.length > 0) {
    const query = frontier.shift() as string;
    const key = query.trim().toLowerCase();
    if (queried.has(key)) continue;
    queried.add(key);
    let page: number | undefined;
    for (let pageNo = 0; pageNo < maxPages; pageNo++) {
      if (queriesRun >= maxQueries) { stoppedBecause = 'QUERY_CAP'; break outer; }
      queriesRun++;
      const result = await options.search(query, page);
      pagesFetched++;
      if (!result.ok) {
        errors.push({ query, errorCode: result.errorCode });
        if (result.quotaExhausted) { stoppedBecause = 'QUOTA_EXHAUSTED'; break outer; }
        break;
      }
      let added = 0;
      for (const item of result.items) {
        if (tokens.has(item.parameter)) continue;
        tokens.set(item.parameter, item.helping_text);
        added++;
        const stem = labelStem(item.helping_text);
        if (stem) { enqueue(stem); enqueue(`${stem} annual`); enqueue(`${stem} quarterly`); }
      }
      if (result.nextPage === null || added === 0) break;
      page = result.nextPage;
    }
  }
  if (stoppedBecause === 'EXHAUSTED' && errors.length > 0) stoppedBecause = 'SEARCH_FAILED';
  const exhausted = stoppedBecause === 'EXHAUSTED';
  return { tokens, size: tokens.size, queriesRun, pagesFetched, exhausted, stoppedBecause, errors };
}

/** Row of research_trendlyne_catalogue. */
export interface CatalogueRow {
  token: string;
  label: string;
  category: string;
  unit: string;
  money_in_crore: 0 | 1;
  period_type: string;
  mapped_metric: string | null;
  tier: Tier;
  discovered_at: string | null;
  notes: string;
}

function categoryFor(mapping: TokenMapping | undefined, label: string): string {
  if (mapping) {
    if (mapping.anchor === 'SHAREHOLDING_QUARTER') return 'OWNERSHIP';
    if (mapping.anchor === 'OBSERVATION_DATE') return 'VALUATION';
    return 'FINANCIALS';
  }
  if (/holding|pledge/i.test(label)) return 'OWNERSHIP';
  if (/insider|sast/i.test(label)) return 'INSIDER';
  return 'OTHER';
}

function periodFor(mapping: TokenMapping | undefined, label: string): string {
  if (mapping) return mapping.periodType;
  if (/annual|\bann\b/i.test(label)) return 'ANNUAL';
  if (/qtr|quarter/i.test(label)) return 'DISCRETE_Q';
  if (/ttm/i.test(label)) return 'TTM';
  return 'UNKNOWN';
}

/**
 * Builds a catalogue row for every discovered token AND every mapped token. A mapped token that
 * discovery did not return is kept (discovered_at null) with a re-verification note rather than
 * silently trusted or dropped.
 */
export function buildCatalogueRows(discovered: ReadonlyMap<string, string>, now: string): CatalogueRow[] {
  const rows: CatalogueRow[] = [];
  const all = new Set<string>([...discovered.keys(), ...TOKEN_MAPPINGS.map(m => m.token)]);
  for (const token of [...all].sort()) {
    const mapping = mappingFor(token);
    const found = discovered.get(token);
    const label = found ?? mapping?.label ?? token;
    const notes: string[] = [];
    let tier: Tier;
    let unit: string;
    let money: boolean;
    if (mapping) {
      tier = mapping.tier; unit = mapping.unit; money = mapping.moneyInCrore;
      if (mapping.notes) notes.push(mapping.notes);
    } else {
      const guess = classifyUnmapped(token, label);
      tier = guess.tier; notes.push(guess.notes);
      const inferred = inferUnit(label);
      unit = inferred.unit; money = inferred.moneyInCrore;
    }
    if (found === undefined) notes.push('NOT_IN_DISCOVERED_CATALOGUE: re-verify before relying on it');
    rows.push({
      token, label, category: categoryFor(mapping, label), unit, money_in_crore: money ? 1 : 0,
      period_type: periodFor(mapping, label), mapped_metric: mapping?.metric ?? null, tier,
      discovered_at: found === undefined ? null : now, notes: notes.join('; '),
    });
  }
  return rows;
}

/** One entry of the re-verification list. */
export interface ReverifyItem {
  token: string;
  label: string;
  discovered: boolean;
  action: 'RE-VERIFY' | 'NOW_DISCOVERED';
  /** Queries to run against search_financial_parameters to look for the token. */
  queries: string[];
}

/** The five previously mapped tokens absent from the discovered catalogue, with their current status. */
export function reverifyList(discovered: ReadonlyMap<string, string>): ReverifyItem[] {
  return REVERIFY_TOKENS.map(token => {
    const label = mappingFor(token)?.label ?? token;
    const present = discovered.has(token);
    return {
      token, label, discovered: present, action: present ? 'NOW_DISCOVERED' : 'RE-VERIFY',
      queries: [label, labelStem(label)].filter((q, i, a) => q && a.indexOf(q) === i),
    };
  });
}

/** Run-report block for the catalogue. */
export interface CatalogueReport {
  discoveredSize: number;
  mappedTokens: number;
  mappedNotDiscovered: string[];
  tierCounts: Record<string, number>;
  exhausted: boolean;
  stoppedBecause: StopReason;
  queriesRun: number;
  reverify: ReverifyItem[];
}

/** Summarises discovery for the run report, including the actual catalogue size. */
export function buildCatalogueReport(discovery: DiscoveryResult): CatalogueReport {
  const rows = buildCatalogueRows(discovery.tokens, 'report');
  const tierCounts: Record<string, number> = { T1: 0, T2: 0, T3: 0, SKIP: 0 };
  rows.forEach(r => { tierCounts[r.tier]++; });
  return {
    discoveredSize: discovery.size,
    mappedTokens: TOKEN_MAPPINGS.length,
    mappedNotDiscovered: TOKEN_MAPPINGS.map(m => m.token).filter(t => !discovery.tokens.has(t)).sort(),
    tierCounts,
    exhausted: discovery.exhausted,
    stoppedBecause: discovery.stoppedBecause,
    queriesRun: discovery.queriesRun,
    reverify: reverifyList(discovery.tokens),
  };
}

/** Upserts catalogue rows. `db` must come from the db guard (openForWrite) or a test database. */
export function saveCatalogueRows(db: Database.Database, rows: CatalogueRow[]): number {
  const stmt = db.prepare(`
    INSERT INTO research_trendlyne_catalogue
      (token, label, category, unit, money_in_crore, period_type, mapped_metric, tier, discovered_at, notes)
    VALUES (@token, @label, @category, @unit, @money_in_crore, @period_type, @mapped_metric, @tier, @discovered_at, @notes)
    ON CONFLICT(token) DO UPDATE SET label=excluded.label, category=excluded.category, unit=excluded.unit,
      money_in_crore=excluded.money_in_crore, period_type=excluded.period_type, mapped_metric=excluded.mapped_metric,
      tier=excluded.tier, discovered_at=COALESCE(excluded.discovered_at, research_trendlyne_catalogue.discovered_at),
      notes=excluded.notes`);
  for (const row of rows) stmt.run(row);
  return rows.length;
}
