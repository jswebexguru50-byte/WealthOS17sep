/**
 * BusinessDriverPayload.ts — V2
 * ModuleResult payload for the Business Driver Engine.
 */

import { BusinessDriver } from '../contracts/BusinessDriverContracts.js';

export interface BusinessDriverPayload {
  /** All evaluated drivers (no artificial cap) */
  drivers: BusinessDriver[];
  /** Only PRIMARY materiality drivers — used by Overview tab */
  primaryDrivers: BusinessDriver[];
  businessModel: string;
  coverage: 'FULL' | 'PARTIAL' | 'MINIMAL';
  sectorTemplate: string | null;
  evaluatedAt: string;
  /** Honest coverage: how many drivers have real evidence (not UNKNOWN) */
  driversWithEvidence?: number;
  driversTotal?: number;
}
