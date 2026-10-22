import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('v6.4.2 Source Artifact Provenance Registry Unit Tests', () => {
  const provPath = path.join(process.cwd(), 'data/v6.4/v642_source_artifact_provenance.json');

  test('1. Provenance registry links all sources to publication dates, effective dates, local paths, and SHA-256 hashes', () => {
    expect(fs.existsSync(provPath)).toBe(true);
    const prov = JSON.parse(fs.readFileSync(provPath, 'utf-8'));

    expect(prov.artifacts.length).toBeGreaterThanOrEqual(2);
    for (const art of prov.artifacts) {
      expect(art.sourceId).toBeDefined();
      expect(art.documentTitle).toBeDefined();
      expect(art.documentUrl).toBeDefined();
      expect(art.publicationDate).toBeDefined();
      expect(art.effectiveDate).toBeDefined();
      expect(art.localArtifactPath).toBeDefined();
      expect(art.sha256).toBeDefined();
    }
  });
});
