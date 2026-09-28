/**
 * ContradictionPayload.ts — V2
 */
import { Contradiction, ContradictionPatternId } from '../contracts/ContradictionContracts.js';

export interface ContradictionPayload {
  contradictions: Contradiction[];
  openCount: number;
  materialCount: number;
  patternsChecked: ContradictionPatternId[];
  evaluatedAt: string;
}
