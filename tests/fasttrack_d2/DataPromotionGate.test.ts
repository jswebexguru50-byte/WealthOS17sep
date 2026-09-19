import { describe, it, expect } from 'vitest';
import { evaluateDatasetPromotion } from '../../src/server/services/dataenrichment/verifiers/DatasetPromotionGate';
import { VerificationPredicate } from '../../src/server/services/dataenrichment/DataStagingContract';

describe(
  'D2.2 Dataset Promotion Gate',
  () => {
    const predicateIds = [
      'schemaValid',
      'numericValuesFinite',
      'noNullNumericValues',
      'noNaN',
      'noInfinity',
      'ohlcRelationshipValid',
      'timestampValid',
      'timestampTimezoneExplicit',
      'tradingCalendarValid',
      'duplicateIdentityAbsent',
      'securityIdentityResolved',
      'sourceRecorded',
      'datasetIdRecorded',
      'rawAcquisitionHashRecorded',
      'canonicalHashReproducible',
      'pitStatusExplicitlyClassified',
      'corporateActionBasisExplicit',
      'coverageCalculated',
      'missingRangesReported',
      'promotionGatePassed',
      'independentRehashPassed',
    ];

    const passingChecks: VerificationPredicate[] = predicateIds.map(id => ({
      id,
      status: 'PASS',
      evidence: { source: 'test' }
    }));

    it(
      'PROMOTEs only when every check passes',
      () => {
        const result =
          evaluateDatasetPromotion({
            datasetId: 'TEST_DATASET',
            checks: passingChecks,
            manifest: { pitStatus: 'PIT_VERIFIED', calendarStatus: 'VALIDATED' } as any
          });

        expect(
          result.decision,
        ).toBe('PROMOTED');
      },
    );

    it(
      'rejects an invalid dataset',
      () => {
        const result =
          evaluateDatasetPromotion({
            datasetId: 'TEST_DATASET',
            checks: passingChecks.map(c => c.id === 'ohlcRelationshipValid' ? { ...c, status: 'FAIL' } : c),
            manifest: { pitStatus: 'PIT_VERIFIED', calendarStatus: 'VALIDATED' } as any
          });

        expect(
          result.decision,
        ).toBe('REJECTED');

        expect(
          result.failures,
        ).toContain(
          'PREDICATE_FAILED:ohlcRelationshipValid - No reason',
        );
      },
    );

    it(
      'returns DATA_INSUFFICIENT for missing evidence',
      () => {
        const result =
          evaluateDatasetPromotion({
            datasetId: 'TEST_DATASET',
            checks: passingChecks,
            manifest: { pitStatus: 'PIT_NOT_VERIFIABLE', calendarStatus: 'VALIDATED' } as any,
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
            checks: passingChecks.map(c => c.id === 'securityIdentityResolved' ? { ...c, status: 'FAIL' } : c),
            manifest: { pitStatus: 'PIT_VERIFIED', calendarStatus: 'VALIDATED' } as any
          });

        expect(
          result.decision,
        ).not.toBe(
          'PROMOTED',
        );
      },
    );
  },
);
