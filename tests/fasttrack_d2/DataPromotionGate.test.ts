import { describe, expect, it } from 'vitest';

import {
  evaluateDatasetPromotion,
} from '../../src/server/services/dataenrichment/DataStagingContract';

describe(
  'D2.2 Dataset Promotion Gate',
  () => {
    const passingChecks = {
      sourceVerified: true,
      shaVerified: true,
      identityValid: true,
      timestampsValid: true,
      ohlcvValid: true,
      calendarValid: true,
      pitValid: true,
      duplicatesValid: true,
      provenanceComplete: true,
    };

    it(
      'PROMOTEs only when every check passes',
      () => {
        const result =
          evaluateDatasetPromotion({
            datasetId: 'TEST_DATASET',
            checks: passingChecks,
          });

        expect(
          result.decision,
        ).toBe('PROMOTE');
      },
    );

    it(
      'rejects an invalid dataset',
      () => {
        const result =
          evaluateDatasetPromotion({
            datasetId: 'TEST_DATASET',
            checks: {
              ...passingChecks,
              ohlcvValid: false,
            },
          });

        expect(
          result.decision,
        ).toBe('REJECT');

        expect(
          result.failures,
        ).toContain(
          'CHECK_FAILED:ohlcvValid',
        );
      },
    );

    it(
      'returns DATA_INSUFFICIENT for missing evidence',
      () => {
        const result =
          evaluateDatasetPromotion({
            datasetId: 'TEST_DATASET',
            checks: {
              ...passingChecks,
              pitValid: false,
            },
            insufficientReasons: [
              'PUBLICATION_TIMESTAMP_MISSING',
            ],
          });

        expect(
          result.decision,
        ).toBe(
          'DATA_INSUFFICIENT',
        );
      },
    );

    it(
      'cannot be caller-forced to PROMOTE',
      () => {
        const result =
          evaluateDatasetPromotion({
            datasetId: 'TEST_DATASET',
            checks: {
              ...passingChecks,
              provenanceComplete: false,
            },
          });

        expect(
          result.decision,
        ).not.toBe(
          'PROMOTE',
        );
      },
    );
  },
);
