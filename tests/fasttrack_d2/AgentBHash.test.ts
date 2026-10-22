import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { hashCanonicalDataset } from '../../src/server/services/dataenrichment/CanonicalObservationSerializer';
import { writeDataset } from '../../src/server/services/dataenrichment/DatasetManifestWriter';

describe('Agent B - Hash / Canonicalization', () => {
  const repoRoot = process.cwd();
  
  it('writerHash === verifierHash for identical physical evidence', () => {
    const rows: any[] = [
      {
        instrumentKey: 'TEST',
        barStartTime: '2024-01-01T09:15:00Z',
        providerTimestamp: '2024-01-01T09:15:00Z',
        dataAcquisitionTimestamp: '2024-01-01T15:30:00Z',
        dataReceivedTimestamp: '2024-01-01T15:30:05Z',
        candleState: 'CLOSED',
        open: 100,
        high: 110,
        low: 90,
        close: 105,
        volume: 1000
      }
    ];

    const result = writeDataset('test_hash', 'TEST_HASH', rows, {
      agentId: 'B1',
      runId: 'r1',
      datasetId: 'TEST_HASH',
      status: 'ACQUIRING',
      source: 'TEST',
      provider: 'TEST'
    } as any, Buffer.from('raw'));

    const writerHash = result.canonicalSha256;
    
    // Verifier side
    const verifierHash = hashCanonicalDataset(rows);
    
    expect(writerHash).toBe(verifierHash);
    expect(writerHash).toBeTruthy();
  });
});
