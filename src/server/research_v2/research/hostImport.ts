import { readFileSync } from 'node:fs';
import { ResearchBudgets, ResearchCapError } from './budget.js';
import { validateJsonSchema, type JsonSchema, type SchemaError } from './jsonSchemaLite.js';
import type { ResearchItemCandidate } from './researchItems.js';
import type { ResearchItemStore, SubmitResult } from './store.js';

/** Path of the JSON schema every host-agent import must satisfy. */
export const RESEARCH_ITEM_SCHEMA_URL = new URL('./schemas/researchItem.schema.json', import.meta.url);

let cachedSchema: JsonSchema | undefined;

/** Loads (once) the research-item JSON schema from disk. */
export function loadResearchItemSchema(): JsonSchema {
  cachedSchema ??= JSON.parse(readFileSync(RESEARCH_ITEM_SCHEMA_URL, 'utf8')) as JsonSchema;
  return cachedSchema;
}

/** Report of one import; when `accepted` is false nothing was written. */
export interface ImportReport {
  accepted: boolean;
  errors: string[];
  results: SubmitResult[];
  counts: Record<string, number>;
}

export interface ImportOptions {
  /** Override of the schema, for tests. */
  schema?: JsonSchema;
}

function formatErrors(errors: SchemaError[]): string[] {
  return errors.map((e) => `${e.path === '' ? '/' : e.path}: ${e.message}`);
}

function refuse(errors: string[]): ImportReport {
  return { accepted: false, errors, results: [], counts: {} };
}

function parsePayload(payload: unknown): { value?: unknown; error?: string } {
  if (typeof payload !== 'string') return { value: payload };
  try {
    return { value: JSON.parse(payload) };
  } catch (error) {
    return { error: `invalid JSON: ${(error as Error).message}` };
  }
}

/**
 * Web items count as fetches; a symbol's declared effort wins over the item count. All symbols are checked before
 * any is charged, so a refused import leaves every budget untouched.
 */
function chargeEffort(
  budgets: ResearchBudgets, items: ResearchItemCandidate[], effort: Record<string, EffortEntry>,
): void {
  const itemCounts = new Map<string, number>();
  for (const item of items) {
    const key = item.symbol.trim().toUpperCase();
    itemCounts.set(key, (itemCounts.get(key) ?? 0) + 1);
  }
  const declared = new Map(Object.entries(effort).map(([k, v]) => [k.trim().toUpperCase(), v]));
  const plan = [...new Set([...itemCounts.keys(), ...declared.keys()])].map((symbol) => ({
    budget: budgets.forSymbol(symbol),
    searches: declared.get(symbol)?.searches ?? 0,
    fetches: declared.get(symbol)?.fetches ?? itemCounts.get(symbol) ?? 0,
  }));
  for (const { budget, searches, fetches } of plan) {
    const code = budget.wouldExceed(searches, fetches);
    if (code !== null) {
      const message = `${budget.symbol}: import of ${searches} searches and ${fetches} fetches exceeds the cap`;
      throw new ResearchCapError(code, budget.symbol, message);
    }
  }
  for (const { budget, searches, fetches } of plan) {
    budget.chargeSearch(searches);
    budget.chargeFetch(fetches);
  }
}

interface EffortEntry {
  searches?: number;
  fetches?: number;
}

interface Envelope {
  items: ResearchItemCandidate[];
  effort?: Record<string, EffortEntry>;
}

/**
 * Imports items the host agent gathered with its own web tools. The payload (JSON text, an envelope, or a bare array
 * of items) must satisfy researchItem.schema.json; effort is charged to the per-scrip budgets before anything is
 * written; primary items are submitted first so secondary items can trace to them in the same batch.
 */
export class HostAgentImportAdapter {
  constructor(
    private readonly store: ResearchItemStore,
    private readonly budgets: ResearchBudgets = new ResearchBudgets(),
  ) {}

  /** Validates and imports a payload; never throws for bad input, it returns a refused report instead. */
  import(payload: unknown, options: ImportOptions = {}): ImportReport {
    const parsed = parsePayload(payload);
    if (parsed.error !== undefined) return refuse([parsed.error]);
    const envelope = Array.isArray(parsed.value) ? { items: parsed.value } : parsed.value;
    const schemaErrors = validateJsonSchema(options.schema ?? loadResearchItemSchema(), envelope);
    if (schemaErrors.length > 0) return refuse(formatErrors(schemaErrors));
    const { items, effort = {} } = envelope as Envelope;
    try {
      chargeEffort(this.budgets, items, effort);
    } catch (error) {
      if (error instanceof ResearchCapError) return refuse([error.message]);
      throw error;
    }
    const ordered = [...items].sort((a, b) => Number(b.tier === 'PRIMARY') - Number(a.tier === 'PRIMARY'));
    const results = ordered.map((item) => this.store.submit(item));
    const counts: Record<string, number> = {};
    for (const r of results) counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
    return { accepted: true, errors: [], results, counts };
  }
}
