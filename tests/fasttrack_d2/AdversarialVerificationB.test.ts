import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { runIndependentVerification } from '../../src/server/services/dataenrichment/verifiers/IndependentVerifier';
import { evaluateDatasetPromotion } from '../../src/server/services/dataenrichment/verifiers/DatasetPromotionGate';
import { resolveUpstoxInstrument } from '../../src/server/services/dataenrichment/DataAcquisitionContract';

describe('Adversarial Verification B - Forensics', () => {
  const repoRoot = process.cwd();
  
  it('forged PROMOTED result cannot pass the gate natively', () => {
    // Workers don't even have a PROMOTED status allowed in the type if compiled strictly, 
    // but at runtime, the DatasetPromotionGate strictly evaluates checks.
    const input = {
      datasetId: 'TEST_ID',
      manifest: {} as any,
      checks: [
        { id: 'schemaValid', status: 'PASS' as const, evidence: { source: 'worker_forged' } }
      ]
    };
    
    // Gate requires 12 mandatory predicates to PASS
    const decision = evaluateDatasetPromotion(input);
    expect(decision.decision).toBe('REJECTED');
    expect(decision.failures.some(f => f.includes('MISSING_PREDICATE:noNaN'))).toBe(true);
  });

  it('forged rawSha256 cannot pass independent rehash', () => {
    const rawBytes = Buffer.from('actual_downloaded_data');
    const tmpPath = path.join(repoRoot, 'tmp_raw.bin');
    fs.writeFileSync(tmpPath, rawBytes);
    
    const forgedManifest = {
      rawSha256: 'deadbeefdeadbeef',
      canonicalSha256: 'canonicalhash'
    };
    
    const predicates = runIndependentVerification('ID', [], forgedManifest, tmpPath);
    const rawCheck = predicates.find(p => p.id === 'rawAcquisitionHashRecorded');
    expect(rawCheck?.status).toBe('FAIL');
    
    fs.unlinkSync(tmpPath);
  });
  
  it('modified staged bytes fail canonical hash', () => {
    const forgedManifest = {
      rawSha256: 'something',
      canonicalSha256: 'deadbeefdeadbeef'
    };
    
    // We pass empty rows, which hashes to something else
    const predicates = runIndependentVerification('ID', [], forgedManifest, '');
    const canCheck = predicates.find(p => p.id === 'canonicalHashReproducible');
    expect(canCheck?.status).toBe('FAIL');
  });

  it('mock instrument master cannot be used in empirical mode', async () => {
    // Empirical mode tries to fetch from upstox assets url.
    // If we spoof it by passing a fake name, it should throw INSTRUMENT_RESOLUTION_UNAVAILABLE or similar.
    // Assuming the url download works (if online), it will parse and not find 'FAKE_TICKER'
    try {
      const res = await resolveUpstoxInstrument('FAKE_TICKER');
      expect(res).toBe(null);
    } catch (e: any) {
      // Or it might throw if offline, but it should never read from the mock file silently
      expect(e.message).toContain('INSTRUMENT_RESOLUTION_UNAVAILABLE');
    }
  });
});
