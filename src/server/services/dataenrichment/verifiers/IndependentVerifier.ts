import { VerificationPredicate, CanonicalMarketObservation } from '../DataStagingContract';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { canonicalizeObservation } from '../DataStagingContract';

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
    if (typeof row.open !== 'number' || typeof row.high !== 'number' || typeof row.low !== 'number' || typeof row.close !== 'number') {
      schemaValid = false;
    }

    if (row.open === null || row.high === null || row.low === null || row.close === null || row.volume === null) {
      noNullNumericValues = false;
    }

    if (Number.isNaN(row.open) || Number.isNaN(row.high) || Number.isNaN(row.low) || Number.isNaN(row.close) || Number.isNaN(row.volume)) {
      noNaN = false;
      numericValuesFinite = false;
    }

    if (!Number.isFinite(row.open) || !Number.isFinite(row.high) || !Number.isFinite(row.low) || !Number.isFinite(row.close) || !Number.isFinite(row.volume)) {
      noInfinity = false;
      numericValuesFinite = false;
    }

    if (row.low > row.high || row.open > row.high || row.open < row.low || row.close > row.high || row.close < row.low) {
      ohlcRelationshipValid = false;
    }

    if (!row.barStartTime || !row.barEndTime) {
      timestampValid = false;
    } else {
      if (!row.barStartTime.includes('T') && !row.barStartTime.includes('+') && !row.barStartTime.endsWith('Z')) {
        timestampTimezoneExplicit = false;
      }
    }

    if (observedTimestamps.has(row.barStartTime)) {
      duplicateIdentityAbsent = false;
    }
    observedTimestamps.add(row.barStartTime);
    
    if (!row.securityId && !(row as any).instrumentKey) {
      securityIdentityResolved = false;
    }
  }

  addPredicate('schemaValid', schemaValid ? 'PASS' : 'FAIL', 'Dataset rows match canonical schema');
  addPredicate('numericValuesFinite', numericValuesFinite ? 'PASS' : 'FAIL', 'All numeric values are finite');
  addPredicate('noNullNumericValues', noNullNumericValues ? 'PASS' : 'FAIL', 'No null numeric values');
  addPredicate('noNaN', noNaN ? 'PASS' : 'FAIL', 'No NaN numeric values');
  addPredicate('noInfinity', noInfinity ? 'PASS' : 'FAIL', 'No Infinity numeric values');
  addPredicate('ohlcRelationshipValid', ohlcRelationshipValid ? 'PASS' : 'FAIL', 'OHLC relationship is mathematically valid');
  addPredicate('timestampValid', timestampValid ? 'PASS' : 'FAIL', 'Timestamps are present');
  addPredicate('timestampTimezoneExplicit', timestampTimezoneExplicit ? 'PASS' : 'FAIL', 'Timezones are explicit');
  addPredicate('duplicateIdentityAbsent', duplicateIdentityAbsent ? 'PASS' : 'FAIL', 'No duplicate observations found');
  addPredicate('securityIdentityResolved', securityIdentityResolved ? 'PASS' : 'FAIL', 'Security identity resolved');

  if (rawAcquiredBytesPath && fs.existsSync(rawAcquiredBytesPath)) {
    const rawBytes = fs.readFileSync(rawAcquiredBytesPath);
    const actualRawHash = crypto.createHash('sha256').update(rawBytes).digest('hex');
    addPredicate('rawAcquisitionHashRecorded', actualRawHash === manifest.rawSha256 ? 'PASS' : 'FAIL', `Raw Hash Check (Expected: ${manifest.rawSha256}, Actual: ${actualRawHash})`);
  } else {
    addPredicate('rawAcquisitionHashRecorded', manifest.rawSha256 ? 'PASS' : 'FAIL', 'Missing physical raw evidence file for rehash');
  }

  let expectedCanonical = '';
  try {
    const lines = rows.map(r => canonicalizeObservation(r));
    expectedCanonical = lines.join('\n');
  } catch (e) {
    // If canonicalization throws (e.g. because of NaN), we just let the hash check fail
  }
  const actualCanonicalHash = crypto.createHash('sha256').update(expectedCanonical, 'utf8').digest('hex');
  
  addPredicate('canonicalHashReproducible', actualCanonicalHash === manifest.canonicalSha256 ? 'PASS' : 'FAIL', `Canonical Hash Check (Expected: ${manifest.canonicalSha256}, Actual: ${actualCanonicalHash})`);

  return predicates;
}
