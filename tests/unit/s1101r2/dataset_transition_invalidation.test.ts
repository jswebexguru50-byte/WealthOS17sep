import { describe, expect, it } from 'vitest';
import { R2C2DependencyGraph } from '../../../src/server/services/s1101r2/R2C2DependencyGraph';
import { executeDatasetTransition } from '../../../src/server/services/s1101r2/R2C2DatasetTransitionOrchestrator';

describe(
  'S1101R2 R2-C2 dataset transition invalidation',
  () => {
    it(
      'must require re-audit when acquired data changes a dependent dataset',
      async () => {
        const graph = new R2C2DependencyGraph();

        graph.register({
          id: 'D2_DAILY_OHLCV',
          type: 'DATASET',
          dependsOn: [],
        });

        graph.register({
          id: 'S1',
          type: 'STRATEGY',
          dependsOn: ['D2_DAILY_OHLCV'],
        });

        graph.register({
          id: 'S1101R2_S1_AUDIT',
          type: 'ARTIFACT',
          dependsOn: ['S1'],
        });

        const executed: string[] = [];

        const result = await executeDatasetTransition({
          previousDatasetHash: 'HASH_V1',
          currentDatasetHash: 'HASH_V2',
          changedDatasetIds: ['D2_DAILY_OHLCV'],
          graph,

          reauditor: {
            async run(artifactId) {
              executed.push(artifactId);

              return {
                artifactId,
                datasetHash: 'HASH_V2',
                dependencyHash: 'DEP_V2',
                success: true,
              };
            },
          },
        });

        expect(result.hashChanged).toBe(true);

        expect(result.requiredReaudits.length).toBeGreaterThan(0);

        expect(result.completedReaudits).toEqual(
          expect.arrayContaining(result.requiredReaudits),
        );

        expect(result.staleArtifacts).toHaveLength(0);

        expect(result.status).toBe('PASS');

        expect(executed.length).toBeGreaterThan(0);
      },
    );

    it(
      'must fail if dataset changed but no dependent re-audit occurred',
      async () => {
        const graph = new R2C2DependencyGraph();

        graph.register({
          id: 'D7_INTRADAY',
          type: 'DATASET',
          dependsOn: [],
        });

        graph.register({
          id: 'S10',
          type: 'STRATEGY',
          dependsOn: ['D7_INTRADAY'],
        });

        graph.register({
          id: 'S10_AUDIT',
          type: 'ARTIFACT',
          dependsOn: ['S10'],
        });

        const result = await executeDatasetTransition({
          previousDatasetHash: 'HASH_V1',
          currentDatasetHash: 'HASH_V2',
          changedDatasetIds: ['D7_INTRADAY'],
          graph,

          reauditor: {
            async run(artifactId) {
              return {
                artifactId,
                datasetHash: 'HASH_V1',
                dependencyHash: 'DEP_V1',
                success: true,
              };
            },
          },
        });

        expect(result.staleArtifacts.length).toBeGreaterThan(0);

        expect(result.status).toBe('FAIL');
      },
    );

    it(
      'must not require re-audit when dataset hash is unchanged',
      async () => {
        const graph = new R2C2DependencyGraph();

        graph.register({
          id: 'D2_DAILY_OHLCV',
          type: 'DATASET',
          dependsOn: [],
        });

        graph.register({
          id: 'S1',
          type: 'STRATEGY',
          dependsOn: ['D2_DAILY_OHLCV'],
        });

        const result = await executeDatasetTransition({
          previousDatasetHash: 'HASH_V1',
          currentDatasetHash: 'HASH_V1',
          changedDatasetIds: [],
          graph,

          reauditor: {
            async run(artifactId) {
              throw new Error(`Unexpected re-audit: ${artifactId}`);
            },
          },
        });

        expect(result.status).toBe('NO_CHANGE');

        expect(result.requiredReaudits).toHaveLength(0);
      },
    );
  },
);
