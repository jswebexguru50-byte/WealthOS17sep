import { DatasetPromotionInput, DatasetPromotionDecision, VerificationPredicate } from '../DataStagingContract';

export function evaluateDatasetPromotion(
  input: DatasetPromotionInput
): DatasetPromotionDecision {
  const failures: string[] = [];
  const insufficientReasons = input.insufficientReasons ?? [];

  // Mandate specific predicates exist and pass
  const requiredPredicateIds = [
    'schemaValid',
    'numericValuesFinite',
    'noNullNumericValues',
    'noNaN',
    'noInfinity',
    'ohlcRelationshipValid',
    'timestampValid',
    'timestampTimezoneExplicit',
    'duplicateIdentityAbsent',
    'securityIdentityResolved',
    'rawAcquisitionHashRecorded',
    'canonicalHashReproducible'
  ];

  const predicateMap = new Map<string, VerificationPredicate>();
  for (const check of input.checks) {
    predicateMap.set(check.id, check);
    if (check.status === 'FAIL') {
      failures.push(`PREDICATE_FAILED:${check.id} - ${check.reason || 'No reason'}`);
    }
  }

  for (const req of requiredPredicateIds) {
    if (!predicateMap.has(req)) {
      failures.push(`MISSING_PREDICATE:${req}`);
    } else if (predicateMap.get(req)!.status !== 'PASS') {
      failures.push(`PREDICATE_NOT_PASS:${req}`);
    }
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
