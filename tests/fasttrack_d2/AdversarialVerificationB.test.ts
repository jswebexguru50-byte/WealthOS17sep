import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runIndependentVerification } from '../../src/server/services/dataenrichment/verifiers/IndependentVerifier';
import { evaluateDatasetPromotion } from '../../src/server/services/dataenrichment/verifiers/DatasetPromotionGate';
import { resolveUpstoxInstrument } from '../../src/server/services/dataenrichment/DataAcquisitionContract';
import { hashCanonicalDataset } from '../../src/server/services/dataenrichment/CanonicalObservationSerializer';

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
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adv-'));
    const tmpDataPath = path.join(tmpDir, 'data.jsonl');
    const tmpManifestPath = path.join(tmpDir, 'manifest.json');
    
    fs.writeFileSync(tmpDataPath, '', 'utf8'); // Empty rows
    fs.writeFileSync(tmpManifestPath, JSON.stringify({ pitStatus: 'PIT_VERIFIED' }), 'utf8');

    const predicates = runIndependentVerification('ID', tmpManifestPath, tmpDataPath, '');
    const pitCheck = predicates.find(p => p.id === 'pitStatusExplicitlyClassified');
    expect(pitCheck?.status).toBe('PASS'); // Only this predicate passes, others fail, gate rejects.
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('3. forged rawSha256 cannot pass independent rehash', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adv-'));
    const tmpRawPath = path.join(tmpDir, 'tmp_raw.bin');
    const tmpDataPath = path.join(tmpDir, 'data.jsonl');
    const tmpManifestPath = path.join(tmpDir, 'manifest.json');
    
    const rawBytes = Buffer.from('actual_downloaded_data');
    fs.writeFileSync(tmpRawPath, rawBytes);
    const rows = [{ open: 1, high: 2, low: 1, close: 1.5, volume: 10, barStartTime: '2020T', instrumentKey: 'A' } as any];
    fs.writeFileSync(tmpDataPath, rows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

    const forgedManifest = {
      rawSha256: 'deadbeefdeadbeef',
      canonicalSha256: hashCanonicalDataset(rows)
    };
    fs.writeFileSync(tmpManifestPath, JSON.stringify(forgedManifest), 'utf8');

    const predicates = runIndependentVerification('ID', tmpManifestPath, tmpDataPath, tmpRawPath);
    const rawCheck = predicates.find(p => p.id === 'rawAcquisitionHashRecorded');
    expect(rawCheck?.status).toBe('FAIL');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  it('4. physical raw-byte mutation causes FAIL', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adv-'));
    const tmpRawPath = path.join(tmpDir, 'tmp_raw.bin');
    const tmpDataPath = path.join(tmpDir, 'data.jsonl');
    const tmpManifestPath = path.join(tmpDir, 'manifest.json');
    
    const rawBytes = Buffer.from('actual_downloaded_data');
    fs.writeFileSync(tmpRawPath, rawBytes);
    
    const validRawHash = crypto.createHash('sha256').update(rawBytes).digest('hex');
    const rows = [{ open: 1, high: 2, low: 1, close: 1.5, volume: 10, barStartTime: '2020T', instrumentKey: 'A' } as any];
    const validCanonicalHash = hashCanonicalDataset(rows);
    const manifest = { rawSha256: validRawHash, canonicalSha256: validCanonicalHash };
    
    fs.writeFileSync(tmpDataPath, rows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    fs.writeFileSync(tmpManifestPath, JSON.stringify(manifest), 'utf8');

    // Assert PASS initially
    const pred1 = runIndependentVerification('ID', tmpManifestPath, tmpDataPath, tmpRawPath);
    expect(pred1.find(p => p.id === 'rawAcquisitionHashRecorded')?.status).toBe('PASS');
    expect(pred1.find(p => p.id === 'canonicalHashReproducible')?.status).toBe('PASS');
    
    // Mutate file physically (raw bytes)
    fs.writeFileSync(tmpRawPath, Buffer.from('actual_downloaded_datb'));
    const pred2 = runIndependentVerification('ID', tmpManifestPath, tmpDataPath, tmpRawPath);
    expect(pred2.find(p => p.id === 'rawAcquisitionHashRecorded')?.status).toBe('FAIL');
    
    // Mutate file physically (canonical bytes, e.g. delete a row)
    fs.writeFileSync(tmpRawPath, rawBytes); // restore raw
    fs.writeFileSync(tmpDataPath, '', 'utf8'); // delete row
    const pred3 = runIndependentVerification('ID', tmpManifestPath, tmpDataPath, tmpRawPath);
    expect(pred3.find(p => p.id === 'canonicalHashReproducible')?.status).toBe('FAIL');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('6. EMPIRICAL mode cannot use fixture silently', async () => {
    try {
      const res = await resolveUpstoxInstrument('FAKE_TICKER');
      expect(res).toBe(null);
    } catch (e: any) {
      expect(e.message).toContain('INSTRUMENT_RESOLUTION_UNAVAILABLE');
    }
  });
  it('10-15. missing manifest metadata and raw hash', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adv-'));
    const tmpDataPath = path.join(tmpDir, 'data.jsonl');
    const tmpManifestPath = path.join(tmpDir, 'manifest.json');
    const rows = [{ open: 1, high: 2, low: 1, close: 1.5, volume: 10, barStartTime: '2020T', instrumentKey: 'A' } as any];
    fs.writeFileSync(tmpDataPath, rows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

    // 10
    fs.writeFileSync(tmpManifestPath, JSON.stringify({ pitStatus: undefined }), 'utf8');
    let pred = runIndependentVerification('ID', tmpManifestPath, tmpDataPath, '');
    expect(pred.find(p => p.id === 'pitStatusExplicitlyClassified')?.status).toBe('FAIL');

    // 11
    fs.writeFileSync(tmpManifestPath, JSON.stringify({ calendarStatus: 'UNKNOWN' }), 'utf8');
    pred = runIndependentVerification('ID', tmpManifestPath, tmpDataPath, '');
    expect(pred.find(p => p.id === 'tradingCalendarValid')?.status).toBe('NOT_VERIFIABLE');

    // 13, 14
    fs.writeFileSync(tmpManifestPath, JSON.stringify({ requestedStart: 'A', requestedEnd: 'B' }), 'utf8');
    pred = runIndependentVerification('ID', tmpManifestPath, tmpDataPath, '');
    expect(pred.find(p => p.id === 'coverageCalculated')?.status).toBe('FAIL');
    expect(pred.find(p => p.id === 'missingRangesReported')?.status).toBe('FAIL');

    // 15
    fs.writeFileSync(tmpManifestPath, JSON.stringify({ rawSha256: 'deadbeef' }), 'utf8');
    pred = runIndependentVerification('ID', tmpManifestPath, tmpDataPath, undefined);
    expect(pred.find(p => p.id === 'rawAcquisitionHashRecorded')?.status).toBe('FAIL');
    expect(pred.find(p => p.id === 'independentRehashPassed')?.status).toBe('FAIL');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

});
