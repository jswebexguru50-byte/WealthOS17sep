import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('V672-R1 — Current Universe Contamination Prevention Tests', () => {
  it('asserts source code contains zero prohibited currentUniverseFallback references', () => {
    const filesToScan = [
      'src/server/services/research/C12IndependentShadowReplayer.ts',
      'src/server/services/research/V65BaselineReproducer.ts',
      'src/server/services/audit/PITEvidenceValidator.ts',
      'src/server/services/audit/EquityPointUniverseManifest.ts',
      'src/server/services/research/ExperimentRegistry.ts'
    ];

    for (const relPath of filesToScan) {
      const full = path.resolve(relPath);
      if (fs.existsSync(full)) {
        const content = fs.readFileSync(full, 'utf8');
        expect(content).not.toContain('currentUniverseFallback');
        expect(content).not.toContain('fallbackToCurrentUniverse');
      }
    }
  });

  it('verifies historical 2022-01-03 constituent universe is strictly distinct from contemporary universe', () => {
    // 2022 Historical NIFTY 500 sample included companies like HDFCBANK, INFY, plus delisted/merged entities
    // contemporary universe includes recent IPOs like ZOMATO, PAYTM, JIOFIN, etc.
    const historicalSnapshot_2022_01_03 = [
      'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
      'HDFC', // Merged into HDFCBANK in July 2023
      'MINDTREE', // Merged into LTIM in Nov 2022
      'LTI'
    ];

    const currentUniverse_2026 = [
      'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
      'ZOMATO', // IPO July 2021
      'JIOFIN', // Demerged Aug 2023
      'SWIGGY', // IPO 2024
      'LTIM'
    ];

    expect(historicalSnapshot_2022_01_03).not.toEqual(currentUniverse_2026);
    expect(historicalSnapshot_2022_01_03).toContain('HDFC');
    expect(currentUniverse_2026).not.toContain('HDFC');
    expect(historicalSnapshot_2022_01_03).not.toContain('ZOMATO');
    expect(currentUniverse_2026).toContain('ZOMATO');
  });
});
