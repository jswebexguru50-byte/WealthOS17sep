import fs from 'node:fs';
import type Database from 'better-sqlite3';
import {
  AcquisitionError, PROVIDER_MAX_SYMBOLS, PROVIDER_MAX_TOKENS, type QuotaHeadroom, type QuotaState, type ViewName,
} from './types.js';

/** Default hard cap for a six-scrip run (spec section 9). */
export const DEFAULT_CALL_CAP = 90;
/** Project-configured daily reserve (progress files: dailyReserve 100) when no source states one. */
export const DEFAULT_DAILY_RESERVE = 100;
/** Cells (symbols x tokens) of a full provider call; the unit of the weighted-cost estimate. */
export const FULL_CALL_CELLS = PROVIDER_MAX_SYMBOLS * PROVIDER_MAX_TOKENS;

/** paramCalls = ceil(symbols/10) * ceil(tokens/50). */
export function paramCalls(symbolCount: number, tokenCount: number): number {
  if (symbolCount <= 0 || tokenCount <= 0) return 0;
  return Math.ceil(symbolCount / PROVIDER_MAX_SYMBOLS) * Math.ceil(tokenCount / PROVIDER_MAX_TOKENS);
}

/**
 * View calls: one per symbol per view, unless the provider is proven to accept several symbols per
 * view call (then ceil(symbols/10) per view). Multi-symbol view support is NOT assumed.
 */
export function viewCalls(symbolCount: number, views: readonly ViewName[], multiSymbolProven = false): number {
  if (symbolCount <= 0 || views.length === 0) return 0;
  const perView = multiSymbolProven ? Math.ceil(symbolCount / PROVIDER_MAX_SYMBOLS) : symbolCount;
  return perView * views.length;
}

/** Weighted-cost estimate of one parameter call: its share of a full 10 x 50 call. */
export function estimateWeightedCost(symbolCount: number, tokenCount: number): number {
  return Math.round(((symbolCount * tokenCount) / FULL_CALL_CELLS) * 1000) / 1000;
}

/** Calls still usable under daily/monthly limits after the daily reserve. */
export function quotaHeadroom(quota: QuotaState): QuotaHeadroom {
  const dailyRemaining = Math.max(0, quota.dailyLimit - quota.dailyUsed);
  const dailyUsableAfterReserve = Math.max(0, dailyRemaining - quota.dailyReserve);
  const monthlyRemaining = Math.max(0, quota.monthlyLimit - quota.monthlyUsed);
  return {
    dailyRemaining, dailyUsableAfterReserve, monthlyRemaining,
    usable: Math.min(dailyUsableAfterReserve, monthlyRemaining),
  };
}

export interface BudgetInput {
  symbols: string[];
  tokens: string[];
  views?: readonly ViewName[];
  /** Focused document queries for open document gaps (already de-duplicated by the planner). */
  documentQueries?: number;
  /** search_financial_parameters calls planned for catalogue discovery. */
  catalogueQueries?: number;
  /** The one-time 10 x 50 probe call, when not yet recorded. */
  probeCalls?: number;
  multiSymbolViewsProven?: boolean;
  cap?: number;
  quota?: QuotaState;
}

export interface CallBudget {
  paramCalls: number;
  viewCalls: number;
  documentCalls: number;
  catalogueCalls: number;
  probeCalls: number;
  total: number;
  cap: number;
  weightedCost: number;
  quota: QuotaHeadroom | null;
  withinCap: boolean;
  /** null when no quota state was supplied (unknown, never assumed fine). */
  withinQuota: boolean | null;
  reasons: string[];
}

/** Pure budget computation; never throws. Use assertBudget to enforce it. */
export function computeBudget(input: BudgetInput): CallBudget {
  const cap = input.cap ?? DEFAULT_CALL_CAP;
  const params = paramCalls(input.symbols.length, input.tokens.length);
  const views = viewCalls(input.symbols.length, input.views ?? [], input.multiSymbolViewsProven ?? false);
  const documentCalls = input.documentQueries ?? 0;
  const catalogueCalls = input.catalogueQueries ?? 0;
  const probe = input.probeCalls ?? 0;
  const total = params + views + documentCalls + catalogueCalls + probe;
  const headroom = input.quota ? quotaHeadroom(input.quota) : null;
  const reasons: string[] = [];
  if (total > cap) reasons.push(`planned ${total} calls exceeds cap ${cap}`);
  if (headroom && total > headroom.usable) {
    reasons.push(`planned ${total} calls exceeds usable quota ${headroom.usable} (reserve ${input.quota!.dailyReserve} kept)`);
  }
  const perCall = Math.min(input.symbols.length, PROVIDER_MAX_SYMBOLS);
  const perCallTokens = Math.min(input.tokens.length, PROVIDER_MAX_TOKENS);
  return {
    paramCalls: params, viewCalls: views, documentCalls, catalogueCalls, probeCalls: probe, total, cap,
    weightedCost: Math.round(params * estimateWeightedCost(perCall, perCallTokens) * 1000) / 1000,
    quota: headroom, withinCap: total <= cap,
    withinQuota: headroom ? total <= headroom.usable : null,
    reasons,
  };
}

/**
 * Enforces a budget.
 * @throws AcquisitionError CALL_CAP_EXCEEDED over the cap; QUOTA_RESERVE_EXCEEDED when the plan
 *   would eat into the daily reserve or exceed the monthly limit.
 */
export function assertBudget(budget: CallBudget): void {
  if (!budget.withinCap) {
    throw new AcquisitionError('CALL_CAP_EXCEEDED', `planned ${budget.total} calls exceeds cap ${budget.cap}`);
  }
  if (budget.withinQuota === false) {
    throw new AcquisitionError('QUOTA_RESERVE_EXCEEDED', budget.reasons.join('; '));
  }
}

/** Run-time counter: every real call must `take()` first; the cap is hard. */
export class CallCounter {
  private used = 0;
  constructor(private readonly cap: number) {}

  /** @throws AcquisitionError CALL_CAP_EXCEEDED when the cap would be exceeded. */
  take(count = 1): void {
    if (this.used + count > this.cap) {
      throw new AcquisitionError('CALL_CAP_EXCEEDED', `call ${this.used + count} would exceed cap ${this.cap}`);
    }
    this.used += count;
  }

  get made(): number { return this.used; }
  get remaining(): number { return this.cap - this.used; }
}

const dayOf = (iso: string): string => iso.slice(0, 10);
const monthOf = (iso: string): string => iso.slice(0, 7);

/**
 * Quota from the mirror ledger table (trendlyne_quota_ledger). The daily counter belongs to its day:
 * with no ledger row for `today` the daily counter is treated as reset (noted), never stale.
 */
export function readQuotaFromLedger(db: Database.Database, today: string): QuotaState | null {
  const has = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='trendlyne_quota_ledger'").get();
  if (!has) return null;
  const rows = db.prepare(
    'SELECT period_date, daily_used, monthly_used, daily_limit, monthly_limit FROM trendlyne_quota_ledger ' +
    'ORDER BY period_date DESC LIMIT 40',
  ).all() as Array<{
    period_date: string; daily_used: number; monthly_used: number; daily_limit: number; monthly_limit: number;
  }>;
  if (rows.length === 0) return null;
  const notes: string[] = [];
  const todayRow = rows.find(r => r.period_date === dayOf(today));
  const monthRows = rows.filter(r => monthOf(r.period_date) === monthOf(today));
  const dailyUsed = todayRow?.daily_used ?? 0;
  if (!todayRow) notes.push(`no ledger row for ${dayOf(today)}; daily counter treated as reset`);
  return {
    dailyUsed,
    dailyLimit: (todayRow ?? rows[0]).daily_limit,
    dailyReserve: DEFAULT_DAILY_RESERVE,
    monthlyUsed: Math.max(0, ...monthRows.map(r => r.monthly_used)),
    monthlyLimit: rows[0].monthly_limit,
    source: 'trendlyne_quota_ledger',
    notes: [...notes, `daily reserve ${DEFAULT_DAILY_RESERVE} is the project default`],
  };
}

/** Quota from a progress file holding { quota: {dailyUsed, dailyLimit, dailyReserve, monthlyUsed, monthlyLimit} }. */
export function readQuotaFromProgressFile(file: string, today: string): QuotaState | null {
  let json: any;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  const q = json?.quota;
  const stamp: unknown = json?.timestamp ?? json?.updatedAt ?? json?.generatedAt;
  if (!q || typeof q.dailyLimit !== 'number' || typeof q.monthlyLimit !== 'number') return null;
  const notes: string[] = [];
  const when = typeof stamp === 'string' ? stamp : null;
  let dailyUsed = Number(q.dailyUsed ?? 0);
  let monthlyUsed = Number(q.monthlyUsed ?? 0);
  if (!when) {
    notes.push('progress file has no timestamp; its usage is kept as-is (conservative)');
  } else {
    if (dayOf(when) !== dayOf(today)) { dailyUsed = 0; notes.push(`progress snapshot ${dayOf(when)} is a past day; daily counter treated as reset`); }
    if (monthOf(when) !== monthOf(today)) { monthlyUsed = 0; notes.push(`progress snapshot ${monthOf(when)} is a past month; monthly counter treated as reset`); }
  }
  return {
    dailyUsed, dailyLimit: q.dailyLimit, dailyReserve: Number(q.dailyReserve ?? DEFAULT_DAILY_RESERVE),
    monthlyUsed, monthlyLimit: q.monthlyLimit, source: `progress:${file.split(/[\\/]/).pop()}`, notes,
  };
}

/** Provider calls this project already made today and this month, from research_trendlyne_call_log. */
export function readQuotaFromCallLog(db: Database.Database, today: string, limits: Pick<QuotaState, 'dailyLimit' | 'monthlyLimit' | 'dailyReserve'>): QuotaState | null {
  const has = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='research_trendlyne_call_log'").get();
  if (!has) return null;
  const count = (prefix: string): number => (db.prepare(
    "SELECT COUNT(*) AS n FROM research_trendlyne_call_log WHERE status != 'CACHE_HIT' AND substr(called_at,1,?) = ?",
  ).get(prefix.length, prefix) as { n: number }).n;
  return {
    ...limits, dailyUsed: count(dayOf(today)), monthlyUsed: count(monthOf(today)),
    source: 'research_trendlyne_call_log', notes: ['counts logged V2 calls only'],
  };
}

/** Conservative merge: highest usage, lowest limits, highest reserve. */
export function mergeQuota(states: QuotaState[]): QuotaState {
  if (states.length === 0) {
    throw new AcquisitionError('QUOTA_STATE_UNKNOWN', 'no quota source (ledger or progress file) could be read');
  }
  return {
    dailyUsed: Math.max(...states.map(s => s.dailyUsed)),
    monthlyUsed: Math.max(...states.map(s => s.monthlyUsed)),
    dailyLimit: Math.min(...states.map(s => s.dailyLimit)),
    monthlyLimit: Math.min(...states.map(s => s.monthlyLimit)),
    dailyReserve: Math.max(...states.map(s => s.dailyReserve)),
    source: states.map(s => s.source).join('+'),
    notes: states.flatMap(s => s.notes),
  };
}
