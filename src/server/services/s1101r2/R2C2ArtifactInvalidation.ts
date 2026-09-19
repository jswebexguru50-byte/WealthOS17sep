export interface ArtifactRecord {
  artifactId: string;
  datasetHash: string;
  dependencyHash: string;
  status: 'VALID' | 'INVALIDATED' | 'STALE';
}

export interface InvalidationResult {
  invalidated: string[];
  stale: string[];
}

export function invalidateDependentArtifacts(
  artifacts: ArtifactRecord[],
  affectedArtifactIds: string[],
  currentDatasetHash: string,
  currentDependencyHash: string,
): InvalidationResult {
  const affected = new Set(affectedArtifactIds);

  const invalidated: string[] = [];
  const stale: string[] = [];

  for (const artifact of artifacts) {
    if (!affected.has(artifact.artifactId)) {
      continue;
    }

    if (
      artifact.datasetHash !== currentDatasetHash ||
      artifact.dependencyHash !== currentDependencyHash
    ) {
      artifact.status = 'INVALIDATED';
      invalidated.push(artifact.artifactId);
    }
  }

  for (const artifact of artifacts) {
    if (
      artifact.datasetHash !== currentDatasetHash ||
      artifact.dependencyHash !== currentDependencyHash
    ) {
      artifact.status = 'STALE';
      stale.push(artifact.artifactId);
    }
  }

  return {
    invalidated: [...new Set(invalidated)],
    stale: [...new Set(stale)],
  };
}

export function assertArtifactFresh(
  artifact: {
    datasetHash: string;
    dependencyHash: string;
  },
  currentDatasetHash: string,
  currentDependencyHash: string,
): void {
  if (artifact.datasetHash !== currentDatasetHash) {
    throw new Error(
      'STALE_ARTIFACT_DATASET_HASH',
    );
  }

  if (artifact.dependencyHash !== currentDependencyHash) {
    throw new Error(
      'STALE_ARTIFACT_DEPENDENCY_HASH',
    );
  }
}
