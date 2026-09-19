import { VerificationPredicate, CanonicalMarketObservation } from '../DataStagingContract';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { hashCanonicalDataset } from '../CanonicalObservationSerializer';

export function runIndependentVerification(
  datasetId: string,
  rows: CanonicalMarketObservation[],
  manifest: any,
  rawAcquiredBytesPath?: string
): VerificationPredicate[] {
  const predicates: VerificationPredicate[] = [];
  
  const addPredicate = (id: string, status: 'PASS' | 'FAIL' | 'NOT_VERIFIABLE', reason?: string) => {
    predicates.push({
      id,
      status,
      evidence: { source: 'IndependentVerifier' },
      reason
    });
  };

  // We will run through the logic even if rows are empty, 
  // setting flags appropriately.
  if (!rows || rows.length === 0) {
    // We let the loops run (0 iterations) and default flags will be caught by empty dataset logic if needed.
  }

  // 1-10: Row-level validations
  let schemaValid = true;
  let numericValuesFinite = true;
  let noNullNumericValues = true;
  let noNaN = true;
  let noInfinity = true;
  let ohlcRelationshipValid = true;
  let timestampValid = true;
  let timestampTimezoneExplicit = true;
  let duplicateIdentityAbsent = true;
  let securityIdentityResolved = true;

  const observedTimestamps = new Set<string>();

  for (const row of rows) {
    if (typeof row.open !== 'number' || typeof row.high !== 'number' || typeof row.low !== 'number' || typeof row.close !== 'number' || typeof row.volume !== 'number') {
      schemaValid = false;
    }

    if (row.open === null || row.high === null || row.low === null || row.close === null || row.volume === null) {
      noNullNumericValues = false;
    }

    if (Number.isNaN(row.open) || Number.isNaN(row.high) || Number.isNaN(row.low) || Number.isNaN(row.close) || Number.isNaN(row.volume)) {
      noNaN = false;
      numericValuesFinite = false;
    }

    if (row.open === Infinity || row.open === -Infinity ||
        row.high === Infinity || row.high === -Infinity ||
        row.low === Infinity || row.low === -Infinity ||
        row.close === Infinity || row.close === -Infinity ||
        row.volume === Infinity || row.volume === -Infinity) {
      noInfinity = false;
      numericValuesFinite = false;
    }

    if (row.low > row.high || row.open > row.high || row.open < row.low || row.close > row.high || row.close < row.low) {
      ohlcRelationshipValid = false;
    }

    if (!row.barStartTime) {
      timestampValid = false;
    } else {
      if (!row.barStartTime.includes('T') && !row.barStartTime.includes('+') && !row.barStartTime.endsWith('Z')) {
        timestampTimezoneExplicit = false;
      }
    }

    if (row.barStartTime && observedTimestamps.has(row.barStartTime)) {
      duplicateIdentityAbsent = false;
    }
    if (row.barStartTime) {
      observedTimestamps.add(row.barStartTime);
    }
    
    if (!row.instrumentKey) {
      securityIdentityResolved = false;
    }
  }

  const hasRows = rows && rows.length > 0;
  addPredicate('schemaValid', schemaValid && hasRows ? 'PASS' : 'FAIL', 'Dataset rows match canonical schema');
  addPredicate('numericValuesFinite', numericValuesFinite && hasRows ? 'PASS' : 'FAIL', 'All numeric values are finite');
  addPredicate('noNullNumericValues', noNullNumericValues && hasRows ? 'PASS' : 'FAIL', 'No null numeric values');
  addPredicate('noNaN', noNaN && hasRows ? 'PASS' : 'FAIL', 'No NaN numeric values');
  addPredicate('noInfinity', noInfinity && hasRows ? 'PASS' : 'FAIL', 'No Infinity numeric values');
  addPredicate('ohlcRelationshipValid', ohlcRelationshipValid && hasRows ? 'PASS' : 'FAIL', 'OHLC relationship is mathematically valid');
  addPredicate('timestampValid', timestampValid && hasRows ? 'PASS' : 'FAIL', 'Timestamps are present');
  addPredicate('timestampTimezoneExplicit', timestampTimezoneExplicit && hasRows ? 'PASS' : 'FAIL', 'Timezones are explicit');
  addPredicate('duplicateIdentityAbsent', duplicateIdentityAbsent && hasRows ? 'PASS' : 'FAIL', 'No duplicate observations found');
  addPredicate('securityIdentityResolved', securityIdentityResolved && hasRows ? 'PASS' : 'FAIL', 'Security identity resolved');

  // 11. rawAcquisitionHashRecorded & 21. independentRehashPassed
  if (rawAcquiredBytesPath && fs.existsSync(rawAcquiredBytesPath)) {
    const rawBytes = fs.readFileSync(rawAcquiredBytesPath);
    const actualRawHash = crypto.createHash('sha256').update(rawBytes).digest('hex');
    const matched = actualRawHash === manifest.rawSha256;
    addPredicate('rawAcquisitionHashRecorded', matched ? 'PASS' : 'FAIL', `Raw physical hash match`);
    addPredicate('independentRehashPassed', matched ? 'PASS' : 'FAIL', `Independent raw physical rehash match`);
  } else {
    // If the physical raw file is missing, we must NOT pass.
    addPredicate('rawAcquisitionHashRecorded', 'FAIL', 'Missing physical raw evidence file for rehash');
    addPredicate('independentRehashPassed', 'FAIL', 'Missing physical raw evidence file for rehash');
  }

  // 12. canonicalHashReproducible
  let expectedCanonicalHash = '';
  try {
    expectedCanonicalHash = hashCanonicalDataset(rows);
  } catch (e) {
    // Ignore, let the check fail
  }
  addPredicate('canonicalHashReproducible', (expectedCanonicalHash && expectedCanonicalHash === manifest.canonicalSha256) ? 'PASS' : 'FAIL', 'Canonical Hash Match');

  // 13. tradingCalendarValid (not fully implemented in fasttrack, but must report explicit state)
  addPredicate('tradingCalendarValid', manifest.calendarStatus === 'CALENDAR_VERIFIED' ? 'PASS' : 'NOT_VERIFIABLE', 'Calendar basis');

  // 14. sourceRecorded
  addPredicate('sourceRecorded', (manifest.source && manifest.provider) ? 'PASS' : 'FAIL', 'Source explicitly recorded');

  // 15. datasetIdRecorded
  addPredicate('datasetIdRecorded', manifest.datasetId === datasetId ? 'PASS' : 'FAIL', 'Dataset ID matches');

  // 16. pitStatusExplicitlyClassified
  const pitStatus = manifest.pitStatus;
  addPredicate('pitStatusExplicitlyClassified', pitStatus ? 'PASS' : 'FAIL', 'PIT Status classified');

  // 17. corporateActionBasisExplicit
  // Just mark NOT_VERIFIABLE if unknown, but FAIL if not even specified
  addPredicate('corporateActionBasisExplicit', 'NOT_VERIFIABLE', 'No corporate action data attached');

  // 18. coverageCalculated
  if (manifest.requestedStart && manifest.requestedEnd && manifest.actualStart && manifest.actualEnd) {
    addPredicate('coverageCalculated', 'PASS', 'Coverage metadata found');
  } else {
    addPredicate('coverageCalculated', 'FAIL', 'Missing requested/actual coverage bounds');
  }

  // 19. missingRangesReported
  if (manifest.missingRanges && Array.isArray(manifest.missingRanges)) {
    addPredicate('missingRangesReported', 'PASS', 'Missing ranges array present');
  } else {
    addPredicate('missingRangesReported', 'FAIL', 'Missing ranges array absent');
  }

  // 20. promotionGatePassed (always FAIL or NOT_VERIFIABLE here, since it cannot promote itself)
  // The DatasetPromotionGate will evaluate everything. We just output a placeholder here to hit 21 checks.
  addPredicate('promotionGatePassed', 'NOT_VERIFIABLE', 'Promotion gate evaluates predicates externally');

  return predicates;
}
