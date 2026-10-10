import { createHash } from 'node:crypto';
import type { Bundle, Fact, ResearchItem, ScorecardRow, ReadinessResult } from '../domain/index.js';
import { allSubQuestions } from '../contract/questions.js';

export const SIX_SCRIP_SYMBOLS = ['YUKEN', 'BECTORFOOD', 'VMART', 'TATATECH', 'OPTIEMUS', 'ARROWGREEN'] as const;
export type SixScripSymbol = typeof SIX_SCRIP_SYMBOLS[number];

export interface SecurityIdentity { symbol: string; isin: string; exchange: 'NSE' | 'BSE'; legalName?: string; }
export interface SixScripInventory {
  identity: SecurityIdentity;
  facts?: Fact[];
  researchItems?: ResearchItem[];
  asOf: string;
}
export interface SixScripBundleOptions { routineVersion?: string; }

export class IdentityResolutionError extends Error {
  constructor(readonly symbol: string, message: string) { super(`IDENTITY_INVALID:${symbol}:${message}`); this.name = 'IdentityResolutionError'; }
}

function assertIdentity(symbol: string, identity: SecurityIdentity): void {
  if (!identity || identity.symbol !== symbol) throw new IdentityResolutionError(symbol, 'symbol mismatch');
  if (!identity.isin || !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(identity.isin)) throw new IdentityResolutionError(symbol, 'valid ISIN required');
  if (identity.exchange !== 'NSE' && identity.exchange !== 'BSE') throw new IdentityResolutionError(symbol, 'exchange required');
}

function hashBundle(value: Omit<Bundle, 'bundleHash'>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Creates one frozen, isolated evidence bundle. No defaults are invented for missing facts. */
export function buildSixScripBundle(input: SixScripInventory, options: SixScripBundleOptions = {}): Bundle {
  const symbol = input.identity.symbol.toUpperCase();
  if (!(SIX_SCRIP_SYMBOLS as readonly string[]).includes(symbol)) throw new IdentityResolutionError(symbol, 'symbol is outside six-scrip program');
  assertIdentity(symbol, input.identity);
  if (!input.asOf || Number.isNaN(Date.parse(input.asOf))) throw new IdentityResolutionError(symbol, 'valid asOf required');
  const facts = Object.fromEntries((input.facts ?? []).filter(f => f.symbol === symbol && f.isin === input.identity.isin).map(f => [f.factId, f]));
  const researchItems = (input.researchItems ?? []).filter(r => r.symbol === symbol);
  const readiness: Record<string, ReadinessResult> = Object.fromEntries(allSubQuestions().map(q => [q.id, {
    subQuestionId: q.id,
    state: q.appliesIn === 'OUT_OF_SCOPE' ? 'NOT_APPLICABLE' : 'DATA_INSUFFICIENT',
    satisfiedBy: [],
    gaps: q.appliesIn === 'OUT_OF_SCOPE' ? [] : [{ input: q.requiredMetrics[0] ?? q.id, reason: 'MISSING', detail: 'No verified evidence supplied in inventory' }],
    ...(q.appliesIn === 'OUT_OF_SCOPE' ? { premiseHolds: false, note: q.outOfScopeReason } : {}),
  }] as [string, ReadinessResult]));
  const gaps = allSubQuestions().filter(q => q.appliesIn !== 'OUT_OF_SCOPE').map(q => ({ subQuestionId: q.id, missing: q.requiredMetrics, nextAction: 'Acquire statutory or provider-verified evidence' }));
  const base: Omit<Bundle, 'bundleHash'> = {
    symbol, isin: input.identity.isin, asOf: new Date(input.asOf).toISOString(), facts,
    calcs: {}, scorecard: [] as ScorecardRow[], researchItems, readiness, gaps,
    routineVersion: options.routineVersion ?? 'WEALTHOS_29Q_V2',
  };
  return { ...base, bundleHash: hashBundle(base) };
}

/** Builds all six bundles independently. Duplicate or missing identities fail closed. */
export function buildSixScripBundles(inputs: SixScripInventory[], options: SixScripBundleOptions = {}): Record<SixScripSymbol, Bundle> {
  const bySymbol = new Map(inputs.map(i => [i.identity.symbol.toUpperCase(), i]));
  const result = {} as Record<SixScripSymbol, Bundle>;
  for (const symbol of SIX_SCRIP_SYMBOLS) {
    const item = bySymbol.get(symbol);
    if (!item) throw new IdentityResolutionError(symbol, 'identity inventory entry missing');
    if (result[symbol]) throw new IdentityResolutionError(symbol, 'duplicate identity');
    result[symbol] = buildSixScripBundle(item, options);
  }
  return result;
}
