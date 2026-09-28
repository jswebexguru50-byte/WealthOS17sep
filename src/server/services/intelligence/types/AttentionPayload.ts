/**
 * AttentionPayload.ts — V2
 */
import { AttentionItem } from '../contracts/AttentionContracts.js';
import { InvestigationQuestion } from '../contracts/AttentionContracts.js';

export interface AttentionPayload {
  items: AttentionItem[];
  highCount: number;
  questions: InvestigationQuestion[];
  evaluatedAt: string;
}
