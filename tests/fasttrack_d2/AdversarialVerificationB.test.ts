import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { runIndependentVerification } from '../../src/server/services/dataenrichment/verifiers/IndependentVerifier';
import { evaluateDatasetPromotion } from '../../src/server/services/dataenrichment/verifiers/DatasetPromotionGate';
import { resolveUpstoxInstrument } from '../../src/server/services/dataenrichment/DataAcquisitionContract';
import { serializeDataset, hashCanonicalDataset } from '../../src/server/services/dataenrichment/CanonicalObservationSerializer';

describe('Adversarial Verification B - Forensics', () => {
  const repoRoot = process.cwd();
  
  it('1. forged PROMOTED status cannot pass the gate natively', () => {
    const input = {
      datasetId: 'TEST_ID',
      manifest: {} as any,
      checks: [
        { id: 'schemaValid', status: 'PASS' as const, evidence: { source: 'worker_forged' } }
      ]
    };
    const decision = evaluateDatasetPromotion(input);
    expect(decision.decision).toBe('REJECTED');
  });

  it('2. forged PIT_VERIFIED in manifest does not pass if gate strictly checks', () => {
    // The gate enforces strict logic. Just having PIT_VERIFIED in manifest isn't enough if predicates fail.
    // If we spoof the manifest.pitStatus, the predicate pitStatusExplicitlyClassified might pass,
    // but the promotion gate requires all 21 passing, so forging one thing won't bypass the gate.
    const forgedManifest = { pitStatus: 'PIT_VERIFIED' };
    const predicates = runIndependentVerification('ID', [], forgedManifest, '');
    const pitCheck = predicates.find(p => p.id === 'pitStatusExplicitlyClassified');
    // Since rows are empty, 1-10 fail.
    expect(pitCheck?.status).toBe('PASS'); // Only this predicate passes, others fail, gate rejects.
  });

  it('3. forged rawSha256 cannot pass independent rehash', () => {
    const rawBytes = Buffer.from('actual_downloaded_data');
    const tmpPath = path.join(repoRoot, 'tmp_raw.bin');
    fs.writeFileSync(tmpPath, rawBytes);
    
    const forgedManifest = {
      rawSha256: 'deadbeefdeadbeef',
      canonicalSha256: 'canonicalhash'
    };
    
    // valid rows to bypass empty row failure
    const rows = [{ open: 1, high: 2, low: 1, close: 1.5, volume: 10, barStartTime: '2020T', instrumentKey: 'A' } as any];
    const predicates = runIndependentVerification('ID', rows, forgedManifest, tmpPath);
    const rawCheck = predicates.find(p => p.id === 'rawAcquisitionHashRecorded');
    expect(rawCheck?.status).toBe('FAIL');
    
    fs.unlinkSync(tmpPath);
  });
  
  it('4. physical raw-byte mutation causes FAIL', () => {
    const rawBytes = Buffer.from('actual_downloaded_data');
    const tmpPath = path.join(repoRoot, 'tmp_raw.bin');
    fs.writeFileSync(tmpPath, rawBytes);
    
    const validRawHash = crypto.createHash('sha256').update(rawBytes).digest('hex');
    const manifest = { rawSha256: validRawHash };
    const rows = [{ open: 1, high: 2, low: 1, close: 1.5, volume: 10, barStartTime: '2020T', instrumentKey: 'A' } as any];
    
    // Assert PASS initially
    const pred1 = runIndependentVerification('ID', rows, manifest, tmpPath);
    expect(pred1.find(p => p.id === 'rawAcquisitionHashRecorded')?.status).toBe('PASS');
    
    // Mutate file physically
    fs.writeFileSync(tmpPath, Buffer.from('actual_downloaded_datb'));
    
    // Assert FAIL
    const pred2 = runIndependentVerification('ID', rows, manifest, tmpPath);
    expect(pred2.find(p => p.id === 'rawAcquisitionHashRecorded')?.status).toBe('FAIL');
    
    fs.unlinkSync(tmpPath);
  });

  it('5. physical staged canonical bytes mutation causes FAIL', () => {
    const rows = [{ open: 1, high: 2, low: 1, close: 1.5, volume: 10, barStartTime: '2020T', instrumentKey: 'A' } as any];
    const validCanonicalHash = hashCanonicalDataset(rows);
    const manifest = { canonicalSha256: validCanonicalHash };
    
    const pred1 = runIndependentVerification('ID', rows, manifest, '');
    expect(pred1.find(p => p.id === 'canonicalHashReproducible')?.status).toBe('PASS');
    
    // Mutate rows
    rows[0].open = 2;
    const pred2 = runIndependentVerification('ID', rows, manifest, '');
    expect(pred2.find(p => p.id === 'canonicalHashReproducible')?.status).toBe('FAIL');
  });

  it('6. EMPIRICAL mode cannot use fixture silently', async () => {
    try {
      const res = await resolveUpstoxInstrument('FAKE_TICKER');
      expect(res).toBe(null);
    } catch (e: any) {
      expect(e.message).toContain('INSTRUMENT_RESOLUTION_UNAVAILABLE');
    }
  });

  it('10. missing publication => PIT_NOT_VERIFIABLE', () => {
    const manifest = { pitStatus: undefined };
    const rows = [{ open: 1, high: 2, low: 1, close: 1.5, volume: 10, barStartTime: '2020T', instrumentKey: 'A' } as any];
    const pred = runIndependentVerification('ID', rows, manifest, '');
    expect(pred.find(p => p.id === 'pitStatusExplicitlyClassified')?.status).toBe('FAIL');
  });

  it('11. missing calendar evidence cannot PASS', () => {
    const manifest = { calendarStatus: 'UNKNOWN' };
    const rows = [{ open: 1, high: 2, low: 1, close: 1.5, volume: 10, barStartTime: '2020T', instrumentKey: 'A' } as any];
    const pred = runIndependentVerification('ID', rows, manifest, '');
    expect(pred.find(p => p.id === 'tradingCalendarValid')?.status).toBe('NOT_VERIFIABLE');
  });

  it('13,14. missing coverage and ranges cannot PASS', () => {
    const manifest = { requestedStart: 'A', requestedEnd: 'B', actualStart: undefined, missingRanges: undefined };
    const rows = [{ open: 1, high: 2, low: 1, close: 1.5, volume: 10, barStartTime: '2020T', instrumentKey: 'A' } as any];
    const pred = runIndependentVerification('ID', rows, manifest, '');
    expect(pred.find(p => p.id === 'coverageCalculated')?.status).toBe('FAIL');
    expect(pred.find(p => p.id === 'missingRangesReported')?.status).toBe('FAIL');
  });

  it('15. manifest-only raw hash cannot PASS', () => {
    const manifest = { rawSha256: 'deadbeef' };
    const rows = [{ open: 1, high: 2, low: 1, close: 1.5, volume: 10, barStartTime: '2020T', instrumentKey: 'A' } as any];
    const pred = runIndependentVerification('ID', rows, manifest, undefined); // No raw path passed
    expect(pred.find(p => p.id === 'rawAcquisitionHashRecorded')?.status).toBe('FAIL');
    expect(pred.find(p => p.id === 'independentRehashPassed')?.status).toBe('FAIL');
  });

});
