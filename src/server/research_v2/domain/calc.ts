import type { Scope } from './types.js';

/** Outcome of one calculator. INSUFFICIENT_DATA and NOT_APPLICABLE carry a null value, never a default. */
export type CalcStatus = 'OK' | 'INSUFFICIENT_DATA' | 'NOT_APPLICABLE';

/** A deterministic calculation with its inputs and formula, referenced by claims through `calcId`. */
export interface CalcResult {
  /** Stable id, e.g. `cfo_to_ebitda|FY26|CONSOLIDATED`. */
  calcId: string;
  name: string;
  /** null unless status is OK. */
  value: number | null;
  unit: string;
  /** Period label such as `FY26`, `Q3 FY26` or an as-of date. */
  period: string;
  scope: Scope | null;
  /** factIds and calcIds used. */
  inputs: string[];
  /** Human-readable formula with the actual operands. */
  formula: string;
  status: CalcStatus;
  note: string;
  /** What was missing when status is INSUFFICIENT_DATA. */
  missing?: string[];
}
