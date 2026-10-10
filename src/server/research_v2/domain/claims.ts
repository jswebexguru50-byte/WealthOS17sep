import type { CalcResult } from './calc.js';
import type { ReadinessResult } from './readiness.js';
import type { ResearchItem } from './research.js';
import type { ScorecardRow } from './scorecard.js';
import type { Fact, Scope } from './types.js';

/** Terminal answer state of a sub-question. No other state may be published. */
export type AnswerState = 'ANSWERED' | 'PARTIAL' | 'NOT_DISCLOSED' | 'NOT_APPLICABLE';

/** Evidence kind a claim relies on. INFERENCE must be labelled as such, never stated as fact. */
export type ClaimKind = 'FACT' | 'CALC' | 'RESEARCH' | 'INFERENCE';

/** One statement with its evidence. Every number in a narrative must appear as a claim. */
export interface Claim {
  claimId: string;
  text: string;
  value?: number;
  unit?: string;
  period?: string;
  scope?: Scope;
  /** factId | calcId | researchItemId present in the bundle. */
  refs: string[];
  kind: ClaimKind;
}

/** Answer to one sub-question, ready for the validator and the completeness gate. */
export interface SubAnswer {
  subQuestionId: string;
  state: AnswerState;
  claims: Claim[];
  narrative: string;
  /** Required for PARTIAL. */
  gap?: string;
  nextAction?: string;
  /** Required for NOT_DISCLOSED. */
  sourcesSearched?: string[];
  /** Required for NOT_APPLICABLE. */
  premiseCheck?: { holds: boolean; note: string };
}

/** What is missing for one sub-question and the next step to close it. */
export interface BundleGap {
  subQuestionId: string;
  missing: string[];
  nextAction: string;
}

/** Search handle for one item inside a bundle. */
export interface BundleIndexEntry {
  id: string;
  kind: 'FACT' | 'CALC' | 'RESEARCH';
  label: string;
  period?: string;
  scope?: Scope;
  unit?: string;
  value?: number | null;
}

/** Frozen, per-scrip evidence bundle handed to the drafter. Immutable once `bundleHash` is computed. */
export interface Bundle {
  symbol: string;
  isin: string;
  /** ISO UTC instant the bundle is point-in-time to. */
  asOf: string;
  /** Facts indexed by factId. */
  facts: Record<string, Fact>;
  /** Calculations indexed by calcId. */
  calcs: Record<string, CalcResult>;
  scorecard: ScorecardRow[];
  researchItems: ResearchItem[];
  /** Readiness per sub-question id such as `Q7.b`. */
  readiness: Record<string, ReadinessResult>;
  gaps: BundleGap[];
  routineVersion: string;
  /** SHA-256 of the canonical bundle content. */
  bundleHash: string;
}
