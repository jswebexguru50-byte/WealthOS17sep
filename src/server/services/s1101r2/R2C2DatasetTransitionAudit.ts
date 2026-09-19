import crypto from 'node:crypto';

export interface DatasetArtifact {
  artifactId: string;
  datasetDependencies: string[];
  strategyDependencies: string[];
  downstreamDependencies: string[];
  datasetHash: string;
  dependencyHash?: string;
}

export interface DatasetTransition {
  previousDatasetHash: string;
  currentDatasetHash: string;

  acquiredRecords: number;
  changedRecords: number;
  changedFields: string[];

  affectedDatasets: string[];
  affectedStrategies: string[];
  affectedDownstreamEngines: string[];

  invalidatedArtifacts: string[];
  requiredReaudits: string[];
  actualReaudits: string[];
  staleArtifacts: string[];

  hashChanged: boolean;
  dependencyAffected: boolean;

  status:
    | 'NO_IMPACT'
    | 'REQUIRES_REAUDIT'
    | 'PASS'
    | 'FAIL';

  evidenceHash: string;
}

function sha256(value: string): string {
  return crypto
    .createHash('sha256')
    .update(value, 'utf8')
    .digest('hex');
}

export function calculateDatasetTransition(input: {
  previousDatasetHash: string;
  currentDatasetHash: string;

  acquiredRecords: number;

  changedRecords: number;
  changedFields: string[];

  artifactsBefore: DatasetArtifact[];
  artifactsAfter: DatasetArtifact[];

  reauditedArtifactIds: string[];
}): DatasetTransition {
  const hashChanged =
    input.previousDatasetHash !== input.currentDatasetHash;

  const affectedArtifacts = input.artifactsBefore.filter(
    artifact =>
      artifact.datasetDependencies.some(dataset =>
        input.changedFields.includes(dataset),
      ) ||
      input.changedRecords > 0,
  );

  const dependencyAffected =
    hashChanged && affectedArtifacts.length > 0;

  const invalidatedArtifacts = dependencyAffected
    ? affectedArtifacts.map(a => a.artifactId)
    : [];

  const requiredReaudits = [...invalidatedArtifacts];

  const actualReaudits = input.reauditedArtifactIds.filter(
    id => requiredReaudits.includes(id),
  );

  const staleArtifacts = input.artifactsAfter
    .filter(artifact => {
      if (!dependencyAffected) {
        return false;
      }

      return (
        invalidatedArtifacts.includes(artifact.artifactId) &&
        artifact.datasetHash !== input.currentDatasetHash
      );
    })
    .map(a => a.artifactId);

  let status: DatasetTransition['status'];

  if (!hashChanged) {
    status = 'NO_IMPACT';
  } else if (dependencyAffected) {
    status =
      actualReaudits.length === requiredReaudits.length &&
      staleArtifacts.length === 0
        ? 'PASS'
        : 'FAIL';
  } else {
    status = 'PASS';
  }

  const resultWithoutHash = {
    previousDatasetHash: input.previousDatasetHash,
    currentDatasetHash: input.currentDatasetHash,
    acquiredRecords: input.acquiredRecords,
    changedRecords: input.changedRecords,
    changedFields: input.changedFields,
    affectedArtifacts: invalidatedArtifacts,
    requiredReaudits,
    actualReaudits,
    staleArtifacts,
    hashChanged,
    dependencyAffected,
    status,
  };

  return {
    previousDatasetHash: input.previousDatasetHash,
    currentDatasetHash: input.currentDatasetHash,
    acquiredRecords: input.acquiredRecords,
    changedRecords: input.changedRecords,
    changedFields: input.changedFields,
    affectedDatasets: input.changedFields,
    affectedStrategies: [],
    affectedDownstreamEngines: [],
    invalidatedArtifacts,
    requiredReaudits,
    actualReaudits,
    staleArtifacts,
    hashChanged,
    dependencyAffected,
    status,
    evidenceHash: sha256(JSON.stringify(resultWithoutHash)),
  };
}
