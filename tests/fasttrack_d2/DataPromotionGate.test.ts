import { describe, expect, it } from 'vitest';

import {
  evaluateDatasetPromotion,
} from '../../src/server/services/dataenrichment/DataStagingContract';

describe(
  'D2.2 Dataset Promotion Gate',
  () => {
    const passingChecks = {
      schemaValid: true,
      numericValuesFinite: true,
      noNullNumericValues: true,
      noNaN: true,
      noInfinity: true,
      ohlcRelationshipValid: true,
      timestampValid: true,
      timestampTimezoneExplicit: true,
      tradingCalendarValid: true,
      duplicateIdentityAbsent: true,
      securityIdentityResolved: true,
      sourceRecorded: true,
      datasetIdRecorded: true,
      rawAcquisitionHashRecorded: true,
      canonicalHashReproducible: true,
      pitStatusExplicitlyClassified: true,
      corporateActionBasisExplicit: true,
      coverageCalculated: true,
      missingRangesReported: true,
      promotionGatePassed: true,
      independentRehashPassed: true,
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
              ohlcRelationshipValid: false,
            },
          });

        expect(
          result.decision,
        ).toBe('REJECT');

        expect(
          result.failures,
        ).toContain(
          'CHECK_FAILED:ohlcRelationshipValid',
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
              pitStatusExplicitlyClassified: false,
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
              securityIdentityResolved: false,
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
