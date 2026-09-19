/**
 * WealthOS v6.6 - Engine Contract
 * Agent E Deliverable
 * 
 * SPEC MANDATE:
 * - productionPromotionAuthorized = false literal type encoded directly in TypeScript.
 * - Uniform ComposableEngine contract that all signal, filter, and risk engines implement.
 */

import { EngineCapability } from './EngineCapability.js';
import { EvidenceBus } from './EvidenceBus.js';
import { PITContext } from './PITContext.js';

export interface EngineExecutionMetadata {
  productionPromotionAuthorized: false; // Type-level immutability invariant
  engineId: string;
  version: string;
  sourceHash: string;
  parameterHash: string;
}

export interface ComposableEngine {
  readonly engineId: string;
  readonly version: string;
  readonly capability: EngineCapability;

  /**
   * Evaluates logic strictly through input/output EvidenceBus and PITContext
   */
  evaluate(bus: EvidenceBus, context: PITContext, universeSecurityIds: string[]): Promise<void>;

  getSourceHash(): string;
  getParameterHash(): string;
  getDataRequirementIds(): string[];
}
