import type Database from 'better-sqlite3';
import { assertSafeWrite, isGuardedHandle, type WriteGuardOptions } from '../db/dbGuard.js';
import {
  decideStatus, toResearchItem, validateCandidate, isTraceTarget,
  type ResearchItem, type ResearchItemCandidate, type ResearchStatus, type ResearchTier,
} from './researchItems.js';
import { canonicalizeUrl, scopedUrlHash } from './urlTools.js';
import { isSyndicatedCopy } from './similarity.js';

/** Guard settings for writes; the target path always comes from the open handle. */
export type StoreGuardOptions = Omit<WriteGuardOptions, 'dbPath'>;

export type SubmitOutcome =
  | 'STORED' | 'UPGRADED' | 'DUPLICATE_URL' | 'SYNDICATED_DUPLICATE' | 'REJECTED' | 'INVALID';

/** What happened to one submitted candidate. */
export interface SubmitResult {
  outcome: SubmitOutcome;
  item?: ResearchItem;
  /** itemId of the existing item a duplicate or syndicated copy matched. */
  duplicateOf?: string;
  reason?: string;
  errors?: string[];
  notes: string[];
}

interface ItemRow {
  item_id: string;
  symbol: string;
  tier: string;
  url: string;
  title: string | null;
  publisher: string | null;
  published_at: string | null;
  retrieved_at: string;
  excerpt: string;
  sub_question_ids_json: string | null;
  status: string;
  traced_to: string | null;
  url_hash: string;
}

function parseIds(json: string | null): string[] {
  if (json === null || json === '') return [];
  const parsed: unknown = JSON.parse(json);
  return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
}

function rowToItem(row: ItemRow): ResearchItem {
  return {
    itemId: row.item_id,
    symbol: row.symbol,
    tier: row.tier as ResearchTier,
    url: row.url,
    title: row.title ?? '',
    publisher: row.publisher ?? '',
    publishedAt: row.published_at,
    retrievedAt: row.retrieved_at,
    excerpt: row.excerpt,
    subQuestionIds: parseIds(row.sub_question_ids_json),
    status: row.status as ResearchStatus,
    tracedTo: row.traced_to,
    urlHash: row.url_hash,
  };
}

/**
 * Store for research_items. The table is created by the schema SQL, never here. Every write passes the db guard
 * (production needs allowProduction plus a verified backup) and runs in one transaction.
 */
export class ResearchItemStore {
  constructor(private readonly db: Database.Database, private readonly guard: StoreGuardOptions = {}) {}

  private write<T>(work: () => T): T {
    if (this.db.readonly) throw new Error('ResearchItemStore: database handle is read-only');
    if (!isGuardedHandle(this.db)) {
      assertSafeWrite({ ...this.guard, dbPath: this.db.memory ? ':memory:' : this.db.name });
    }
    return this.db.transaction(work).immediate();
  }

  /** The item with this id, if stored. */
  getById(itemId: string): ResearchItem | undefined {
    const row = this.db.prepare('SELECT * FROM research_items WHERE item_id = ?').get(itemId) as ItemRow | undefined;
    return row === undefined ? undefined : rowToItem(row);
  }

  /** The item for a symbol and URL (canonicalised before lookup). */
  getByUrl(symbol: string, url: string): ResearchItem | undefined {
    const canonical = canonicalizeUrl(url);
    if (canonical === null) return undefined;
    const hash = scopedUrlHash(symbol, canonical);
    const row = this.db.prepare('SELECT * FROM research_items WHERE url_hash = ?').get(hash) as ItemRow | undefined;
    return row === undefined ? undefined : rowToItem(row);
  }

  /** Items of one symbol, optionally filtered by status; ordered by retrieval time then id. */
  list(symbol: string, status?: ResearchStatus): ResearchItem[] {
    const sym = symbol.trim().toUpperCase();
    const order = 'ORDER BY retrieved_at, item_id';
    const rows = status === undefined
      ? this.db.prepare(`SELECT * FROM research_items WHERE symbol = ? ${order}`).all(sym)
      : this.db.prepare(`SELECT * FROM research_items WHERE symbol = ? AND status = ? ${order}`).all(sym, status);
    return (rows as ItemRow[]).map(rowToItem);
  }

  /** Resolves a reference (itemId, or a URL) to a stored item of the symbol. */
  resolve(reference: string, symbol: string): ResearchItem | undefined {
    const byId = this.getById(reference.trim());
    if (byId !== undefined) return byId;
    return this.getByUrl(symbol, reference);
  }

  /** An earlier non-rejected item of the symbol whose excerpt is a near-copy (syndicated content). */
  findSyndicated(symbol: string, excerpt: string, tier: ResearchTier): ResearchItem | undefined {
    return this.list(symbol).find((existing) => {
      if (existing.status === 'REJECTED') return false;
      // A primary record is never discarded because a secondary lead already carries its text.
      if (tier === 'PRIMARY' && existing.tier === 'SECONDARY') return false;
      return isSyndicatedCopy(existing.excerpt, excerpt);
    });
  }

  /**
   * Runs the protocol for one candidate: validate, canonicalise, de-duplicate by URL and by content, decide tier and
   * status, store. Untraceable and invalid items never become VERIFIED.
   */
  submit(input: ResearchItemCandidate): SubmitResult {
    const validation = validateCandidate(input);
    if (!validation.ok || validation.candidate === undefined) {
      return { outcome: 'INVALID', errors: validation.errors, reason: validation.errors.join('; '), notes: [] };
    }
    const candidate = validation.candidate;
    const decision = decideStatus(candidate, (ref, symbol) => this.resolve(ref, symbol));
    const fresh = toResearchItem(candidate, decision);
    const existing = this.getByUrl(candidate.symbol, candidate.canonicalUrl);
    if (existing !== undefined) return this.handleExisting(existing, fresh, decision.notes);
    const twin = this.findSyndicated(candidate.symbol, candidate.excerpt, decision.tier);
    if (twin !== undefined) {
      return {
        outcome: 'SYNDICATED_DUPLICATE',
        duplicateOf: twin.itemId,
        notes: decision.notes,
        reason: `excerpt duplicates ${twin.itemId} (${twin.url})`,
      };
    }
    this.write(() => this.insert(fresh));
    if (fresh.status === 'REJECTED') {
      return { outcome: 'REJECTED', item: fresh, notes: decision.notes, reason: decision.rejectReason };
    }
    return { outcome: 'STORED', item: fresh, notes: decision.notes };
  }

  private handleExisting(existing: ResearchItem, fresh: ResearchItem, notes: string[]): SubmitResult {
    const canUpgrade = existing.status !== 'VERIFIED' && existing.status !== 'MANAGEMENT_CLAIM'
      && fresh.status === 'VERIFIED' && fresh.tracedTo !== null;
    if (canUpgrade) {
      const item = this.write(() => this.setTrace(existing, fresh.tracedTo as string));
      return { outcome: 'UPGRADED', item, duplicateOf: existing.itemId, notes };
    }
    const merged = [...new Set([...existing.subQuestionIds, ...fresh.subQuestionIds])];
    const grew = merged.length > existing.subQuestionIds.length;
    const item = grew ? this.write(() => this.setSubQuestions(existing, merged)) : existing;
    return {
      outcome: 'DUPLICATE_URL',
      item,
      duplicateOf: existing.itemId,
      notes,
      reason: `URL already stored as ${existing.itemId}`,
    };
  }

  /**
   * Traces an existing secondary item to a primary item and upgrades it to VERIFIED.
   * @throws Error when the item is missing, is a management claim, or the target is not a VERIFIED PRIMARY item.
   */
  traceItem(itemId: string, primaryRef: string): ResearchItem {
    const item = this.getById(itemId);
    if (item === undefined) throw new Error(`traceItem: unknown item ${itemId}`);
    if (item.status === 'MANAGEMENT_CLAIM') throw new Error('traceItem: a management claim cannot be verified');
    if (item.tier === 'PRIMARY') throw new Error('traceItem: a primary item needs no trace');
    const target = this.resolve(primaryRef, item.symbol);
    if (!isTraceTarget(target, item.symbol)) {
      throw new Error(`traceItem: ${primaryRef} is not a VERIFIED PRIMARY item of ${item.symbol}`);
    }
    return this.write(() => this.setTrace(item, target.itemId));
  }

  private insert(item: ResearchItem): void {
    this.db.prepare(
      `INSERT INTO research_items (item_id, symbol, tier, url, title, publisher, published_at, retrieved_at, excerpt,
         sub_question_ids_json, status, traced_to, url_hash)
       VALUES (@itemId, @symbol, @tier, @url, @title, @publisher, @publishedAt, @retrievedAt, @excerpt,
         @subQuestionIdsJson, @status, @tracedTo, @urlHash)`,
    ).run({
      itemId: item.itemId, symbol: item.symbol, tier: item.tier, url: item.url, title: item.title,
      publisher: item.publisher, publishedAt: item.publishedAt, retrievedAt: item.retrievedAt,
      excerpt: item.excerpt, subQuestionIdsJson: JSON.stringify(item.subQuestionIds), status: item.status,
      tracedTo: item.tracedTo, urlHash: item.urlHash,
    });
  }

  private setTrace(item: ResearchItem, primaryId: string): ResearchItem {
    this.db.prepare('UPDATE research_items SET status = ?, traced_to = ? WHERE item_id = ?')
      .run('VERIFIED', primaryId, item.itemId);
    return { ...item, status: 'VERIFIED', tracedTo: primaryId };
  }

  private setSubQuestions(item: ResearchItem, ids: string[]): ResearchItem {
    this.db.prepare('UPDATE research_items SET sub_question_ids_json = ? WHERE item_id = ?')
      .run(JSON.stringify(ids), item.itemId);
    return { ...item, subQuestionIds: ids };
  }
}
