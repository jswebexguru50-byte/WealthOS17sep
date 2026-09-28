/**
 * DeltaPayload.ts — V2
 * ModuleResult payload for the Delta Intelligence Engine.
 */

import { IntelligenceDelta, DeltaComparisonType } from '../contracts/DeltaContracts.js';

export interface DeltaPayload {
  deltas: IntelligenceDelta[];
  highCount: number;
  mediumCount: number;
  comparisonsAvailable: DeltaComparisonType[];
  evaluatedAt: string;
}
