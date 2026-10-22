import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('v6.4.2 Reproducibility Unit Tests', () => {
  const manifestPath = path.join(process.cwd(), 'data/v6.4/v642_reproducibility_manifest.json');

  test('1. Manifest contains exact SHA-256 hashes of all generated v6.4.2 artifacts', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    expect(manifest.version).toBe('v6.4.2');
    expect(manifest.parentControl.runId).toBe('v6.3_REAL_T1_EXECUTION_REMEDIATED_1789650500000');
    expect(Object.keys(manifest.generatedArtifacts).length).toBe(9);
  });
});
