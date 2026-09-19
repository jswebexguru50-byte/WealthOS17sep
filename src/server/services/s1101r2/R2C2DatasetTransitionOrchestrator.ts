import { R2C2DependencyGraph } from './R2C2DependencyGraph';
import { calculateDependencyHash } from './R2C2DependencyHash';

export interface ReauditExecutor {
  run(artifactId: string): Promise<{
    artifactId: string;
    datasetHash: string;
    dependencyHash: string;
    success: boolean;
  }>;
}

export interface TransitionExecutionResult {
  previousDatasetHash: string;
  currentDatasetHash: string;

  hashChanged: boolean;

  affectedNodes: string[];
  affectedArtifacts: string[];

  requiredReaudits: string[];
  completedReaudits: string[];

  staleArtifacts: string[];

  dependencyHash: string;

  status:
    | 'NO_CHANGE'
    | 'PASS'
    | 'FAIL';
}

export async function executeDatasetTransition(
  input: {
    previousDatasetHash: string;
    currentDatasetHash: string;
    changedDatasetIds: string[];
    graph: R2C2DependencyGraph;
    reauditor: ReauditExecutor;
  },
): Promise<TransitionExecutionResult> {
  const hashChanged =
    input.previousDatasetHash !==
    input.currentDatasetHash;

  if (!hashChanged) {
    return {
      previousDatasetHash:
        input.previousDatasetHash,
      currentDatasetHash:
        input.currentDatasetHash,
      hashChanged: false,
      affectedNodes: [],
      affectedArtifacts: [],
      requiredReaudits: [],
      completedReaudits: [],
      staleArtifacts: [],
      dependencyHash: calculateDependencyHash(
        input.graph,
      ),
      status: 'NO_CHANGE',
    };
  }

  const affectedNodes =
    input.graph.getAffectedNodes(
      input.changedDatasetIds,
    );

  const affectedArtifacts =
    affectedNodes.filter(id =>
      id.startsWith('S1101R2_') ||
      id.endsWith('_FINAL_STATUS') ||
      id.includes('AUDIT'),
    );

  const strategyAndEngineNodes =
    affectedNodes.filter(id => {
      const node = input.graph.get(id);

      return (
        node?.type === 'STRATEGY' ||
        node?.type === 'ENGINE' ||
        node?.type === 'ARTIFACT' ||
        node?.type === 'REPORT'
      );
    });

  const requiredReaudits = [
    ...new Set([
      ...affectedArtifacts,
      ...strategyAndEngineNodes,
    ]),
  ];

  const completedReaudits: string[] = [];
  const staleArtifacts: string[] = [];

  for (const artifactId of requiredReaudits) {
    const result =
      await input.reauditor.run(artifactId);

    if (!result.success) {
      throw new Error(
        `R2-C2 REAUDIT FAILED: ${artifactId}`,
      );
    }

    if (
      result.datasetHash !==
      input.currentDatasetHash
    ) {
      staleArtifacts.push(artifactId);
    } else {
      completedReaudits.push(artifactId);
    }
  }

  const dependencyHash =
    calculateDependencyHash(input.graph);

  const status =
    completedReaudits.length ===
      requiredReaudits.length &&
    staleArtifacts.length === 0
      ? 'PASS'
      : 'FAIL';

  return {
    previousDatasetHash:
      input.previousDatasetHash,
    currentDatasetHash:
      input.currentDatasetHash,
    hashChanged,
    affectedNodes,
    affectedArtifacts,
    requiredReaudits,
    completedReaudits,
    staleArtifacts,
    dependencyHash,
    status,
  };
}
