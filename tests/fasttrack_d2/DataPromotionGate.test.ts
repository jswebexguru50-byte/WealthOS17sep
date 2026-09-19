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
            checks: passingChecks.map(c => c.id === 'pitStatusExplicitlyClassified' ? { ...c, status: 'NOT_VERIFIABLE' } : c),
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
