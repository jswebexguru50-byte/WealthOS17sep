/**
 * gate5_reality_oracle.test.ts — Gate 5 11-Company Reality Oracle Test
 * WealthOS V2 Gate 5
 *
 * Runs the Reality Oracle across all 11 acceptance universe companies:
 * DYCL, TCS, HDFCBANK, RELIANCE, TATAMOTORS, TATASTEEL, INFY, ICICIBANK, SUNPHARMA, TITAN, BEL.
 *
 * Verifies:
 * - 0 unexplained material mismatches.
 * - Strict PIT & provenance metadata on every verified observation.
 * - Machine-generated verification output.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { generateRealityCheckMatrix } from '../../scripts/intelligence/generate_reality_check_matrix.js';

describe('Gate 5: 11-Company Reality Oracle Verification', () => {
  it('generates the Reality Oracle Matrix and confirms 0 unexplained mismatches across 11 companies', () => {
    const report = generateRealityCheckMatrix();

    expect(report).toBeDefined();
    expect(report.totalObservationsSampled).toBeGreaterThanOrEqual(50);
    expect(report.mismatchCount).toBe(0);
    expect(report.verificationPassRatePct).toBe(100);

    const observations = report.observations;
    expect(Array.isArray(observations)).toBe(true);

    const companiesCovered = new Set(observations.map(obs => obs.symbol));
    const requiredCompanies = [
      'DYCL', 'TCS', 'HDFCBANK', 'RELIANCE', 'TATAMOTORS',
      'TATASTEEL', 'INFY', 'ICICIBANK', 'SUNPHARMA', 'TITAN', 'BEL'
    ];

    for (const sym of requiredCompanies) {
      expect(companiesCovered.has(sym)).toBe(true);
    }

    // Verify all observations have valid provenance and PIT metadata
    for (const obs of observations) {
      expect(obs.appValue).toBeDefined();
      expect(obs.sourceValue).toBeDefined();
      expect(obs.availableAt).toBeDefined();
      expect(obs.publishedAt).toBeDefined();
      expect(obs.status).toBe('VERIFIED');
    }

    // Verify written JSON artifact
    const artifactPath = path.resolve('reports', 'intelligence', 'REALITY_CHECK_MATRIX.json');
    expect(fs.existsSync(artifactPath)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
    expect(saved.totalObservationsSampled).toBe(report.totalObservationsSampled);
    expect(saved.mismatchCount).toBe(0);
  });
});
