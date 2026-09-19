import { StopTheLineError } from './StopTheLineRegistry';

export class DecisionGraphValidator {
  public validateGraph(graphDefinition: any): void {
    // 1. assertAcyclic
    // 2. assertAllDependenciesDeclared
    // 3. assertConflictPoliciesDeclared
    // 4. assertDeterministicOrdering

    if (this.hasCycle(graphDefinition)) {
      throw new StopTheLineError('GRAPH_CYCLE', 'Decision graph contains a cycle.');
    }

    if (this.isNonDeterministic(graphDefinition)) {
      throw new StopTheLineError('GRAPH_NONDETERMINISM', 'Decision graph has non-deterministic execution order.');
    }
  }

  private hasCycle(graph: any): boolean {
    return false; // Stub
  }

  private isNonDeterministic(graph: any): boolean {
    return false; // Stub
  }
}
