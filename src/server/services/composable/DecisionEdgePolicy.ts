/**
 * WealthOS v6.6 - Decision Edge Policy
 * Agent E Deliverable
 * 
 * SPEC MANDATE:
 * Explicitly typed edges in the composable graph:
 *   - FILTER: Source must pass for target to execute (e.g. FERE -> Technical).
 *   - CONFIRM: Target receives confirmation score/evidence.
 *   - SCORE: Modifies composite conviction.
 *   - CONTEXT: Provides market/regime context.
 *   - RISK: Enforces portfolio/concentration limits.
 *   - PORTFOLIO: Weights position.
 *   - OVERRIDE: Reverses prior decision (must have canOverride permission).
 * Ambiguous edges are strictly banned.
 */

export type EdgeType =
  | 'FILTER'
  | 'CONFIRM'
  | 'SCORE'
  | 'CONTEXT'
  | 'RISK'
  | 'PORTFOLIO'
  | 'OVERRIDE';

export interface DecisionEdge {
  edgeId: string;
  sourceEngineId: string;
  targetEngineId: string;
  edgeType: EdgeType;
  mandatory: boolean; // If true, target cannot run unless source emitted evidence
  description: string;
}

export class DecisionEdgePolicy {
  public static validateEdge(
    edge: DecisionEdge,
    sourceProduces: string[],
    targetConsumes: string[]
  ): { valid: boolean; diagnostic: string } {
    if (edge.sourceEngineId === edge.targetEngineId) {
      return { valid: false, diagnostic: `Self-loops forbidden: ${edge.sourceEngineId} -> ${edge.targetEngineId}` };
    }

    // Target must consume at least one evidence type produced by source
    const overlap = sourceProduces.some(p => targetConsumes.includes(p));
    if (!overlap) {
      return {
        valid: false,
        diagnostic: `Type incompatibility: ${edge.sourceEngineId} produces [${sourceProduces.join(', ')}], but ${edge.targetEngineId} consumes [${targetConsumes.join(', ')}]`
      };
    }

    return { valid: true, diagnostic: 'Edge policy validated.' };
  }
}
