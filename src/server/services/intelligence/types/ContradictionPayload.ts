/**
 * ContradictionPayload.ts — V2
 * Honest coverage reporting: patternsChecked/patternsEvaluated/patternsSkipped
 */
import { Contradiction } from '../contracts/ContradictionContracts.js';

export interface ContradictionPayload {
  contradictions: Contradiction[];
  openCount: number;
  materialCount: number;
  patternsChecked: number;       // total patterns in engine
  patternsConfigured?: number;
  patternsEvaluable?: number;
  patternsEvaluated?: number;    // patterns that had enough data
  patternsSkipped?: number;      // patterns that lacked data
  contradictionsDetected?: number;
  evaluations?: any[];
  evaluatedAt: string;
}
