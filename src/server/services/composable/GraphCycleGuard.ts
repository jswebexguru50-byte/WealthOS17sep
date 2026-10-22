import { DecisionGraph } from './DecisionGraph.js';
import { DecisionEdge } from './DecisionEdgePolicy.js';

export interface GraphCycleCheckResult {
  isAcyclic: boolean;
  cycleDetected: boolean;
  cyclePath?: string[];
  nodesCount: number;
  edgesCount: number;
}

export function assertAcyclicDecisionGraph(edges: DecisionEdge[], nodeIds: string[]): GraphCycleCheckResult {
  const adj = new Map<string, string[]>();
  for (const node of nodeIds) {
    adj.set(node, []);
  }

  for (const edge of edges) {
    if (!adj.has(edge.sourceEngineId)) adj.set(edge.sourceEngineId, []);
    adj.get(edge.sourceEngineId)!.push(edge.targetEngineId);
  }

  // Tarjan / DFS cycle detection
  const visited = new Map<string, number>(); // 0: unvisited, 1: visiting, 2: visited
  const parent = new Map<string, string>();
  let cycleNodes: string[] | undefined;

  function dfs(u: string, stack: string[]): boolean {
    visited.set(u, 1);
    stack.push(u);

    const neighbors = adj.get(u) || [];
    for (const v of neighbors) {
      if (visited.get(v) === 1) {
        // Cycle detected
        const cycleStartIndex = stack.indexOf(v);
        cycleNodes = stack.slice(cycleStartIndex).concat(v);
        return true;
      }
      if (!visited.has(v) || visited.get(v) === 0) {
        if (dfs(v, stack)) return true;
      }
    }

    stack.pop();
    visited.set(u, 2);
    return false;
  }

  for (const node of nodeIds) {
    if (!visited.has(node) || visited.get(node) === 0) {
      if (dfs(node, [])) {
        throw new Error(`GRAPH_CYCLE_VIOLATION: DecisionGraph contains circular dependency: ${cycleNodes?.join(' -> ')}`);
      }
    }
  }

  return {
    isAcyclic: true,
    cycleDetected: false,
    nodesCount: nodeIds.length,
    edgesCount: edges.length
  };
}
