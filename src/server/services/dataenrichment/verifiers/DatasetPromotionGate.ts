import { DatasetPromotionInput, DatasetPromotionDecision, VerificationPredicate } from '../DataStagingContract';

export function evaluateDatasetPromotion(
  input: DatasetPromotionInput
): DatasetPromotionDecision {
  const failures: string[] = [];
  const insufficientReasons = input.insufficientReasons ?? [];

  // Mandate specific predicates exist
  const allPredicateIds = [
    'schemaValid', 'numericValuesFinite', 'noNullNumericValues', 'noNaN',
    'noInfinity', 'ohlcRelationshipValid', 'timestampValid', 'timestampTimezoneExplicit',
    'duplicateIdentityAbsent', 'securityIdentityResolved', 'rawAcquisitionHashRecorded',
    'canonicalHashReproducible', 'tradingCalendarValid', 'sourceRecorded',
    'datasetIdRecorded', 'pitStatusExplicitlyClassified', 'corporateActionBasisExplicit',
    'coverageCalculated', 'missingRangesReported', 'promotionGatePassed',
    'independentRehashPassed'
  ];

  // These MUST be PASS
  const requiredToPass = [
    'schemaValid', 'numericValuesFinite', 'noNullNumericValues', 'noNaN',
    'noInfinity', 'ohlcRelationshipValid', 'timestampValid', 'timestampTimezoneExplicit',
    'duplicateIdentityAbsent', 'securityIdentityResolved', 'rawAcquisitionHashRecorded',
    'canonicalHashReproducible', 'sourceRecorded', 'datasetIdRecorded',
    'coverageCalculated', 'missingRangesReported', 'pitStatusExplicitlyClassified',
    'corporateActionBasisExplicit', 'tradingCalendarValid',
    'independentRehashPassed'
  ];

  const predicateMap = new Map<string, VerificationPredicate>();
  for (const check of input.checks) {
    predicateMap.set(check.id, check);
    if (check.status === 'FAIL') {
      failures.push(`PREDICATE_FAILED:${check.id} - ${check.reason || 'No reason'}`);
    }
  }

  for (const req of allPredicateIds) {
    if (!predicateMap.has(req)) {
      failures.push(`MISSING_PREDICATE:${req}`);
    }
  }

  for (const req of requiredToPass) {
    if (predicateMap.has(req) && predicateMap.get(req)!.status !== 'PASS') {
      failures.push(`PREDICATE_NOT_PASS:${req} (${predicateMap.get(req)!.status})`);
    }
  }

  // The promotion gate must reject NOT_VERIFIABLE manifest conditions explicitly
  if (input.manifest.pitStatus !== 'PIT_VERIFIED') {
    failures.push(`PROMOTION_REJECTED: PIT is ${input.manifest.pitStatus}, required: PIT_VERIFIED`);
  }
  
  if (input.manifest.calendarStatus !== 'VALIDATED') {
    failures.push(`PROMOTION_REJECTED: Calendar is ${input.manifest.calendarStatus}, required: VALIDATED`);
  }

  if (failures.length === 0 && insufficientReasons.length === 0) {
    return {
      datasetId: input.datasetId,
      decision: 'PROMOTED',
      checks: input.checks,
      failures: []
    };
  }

  if (insufficientReasons.length > 0) {
    return {
      datasetId: input.datasetId,
      decision: 'DATA_INSUFFICIENT',
      checks: input.checks,
      failures: [
        ...failures,
        ...insufficientReasons.map(r => `DATA_INSUFFICIENT:${r}`)
      ]
    };
  }

  return {
    datasetId: input.datasetId,
    decision: 'REJECTED',
    checks: input.checks,
    failures
  };
}
