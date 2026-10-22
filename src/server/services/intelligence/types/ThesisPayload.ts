/**
 * ThesisPayload.ts — V2
 * ModuleResult payload for the Thesis Engine.
 */
import { CompanyThesis, ThesisPillar, ThesisChange } from '../contracts/ThesisContracts.js';

export interface ThesisPayload {
  thesis: CompanyThesis | null;
  pillars: ThesisPillar[];
  changes: ThesisChange[];
  evaluatedAt: string;
  coverage: 'FULL' | 'PARTIAL' | 'MINIMAL';
  limitations: string[];
  patternsEvaluable: number;
  patternsEvaluated: number;
}
