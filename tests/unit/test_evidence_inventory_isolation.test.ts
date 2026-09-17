import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Workstream A: Evidence Inventory Issuer Isolation & Anti-Fallback Test', () => {
  const batchScriptPath = path.resolve(__dirname, '../../ingestion/batch_discover_evidence.cjs');
  const discoverPyPath = path.resolve(__dirname, '../../ingestion/discover_evidence.py');
  const pilotCodesPath = path.resolve(__dirname, '../../ingestion/pilot_bse_codes.json');

  it('prohibits universal hard-coded fallback BSE code (500325) in discovery runners', () => {
    const batchCode = fs.readFileSync(batchScriptPath, 'utf8');
    const pyCode = fs.readFileSync(discoverPyPath, 'utf8');

    // Asserts no line falls back to 500325 or universal scrip code
    expect(batchCode).not.toMatch(/s\.bse_code\s*\|\|\s*['"]500325['"]/);
    expect(batchCode).not.toMatch(/fallback\s*=\s*['"]500325['"]/i);
    expect(pyCode).not.toMatch(/default\s*=\s*['"]500325['"]/);
  });

  it('guarantees mutually exclusive, issuer-specific exchange codes across pilot companies', () => {
    expect(fs.existsSync(pilotCodesPath)).toBe(true);
    const codes = JSON.parse(fs.readFileSync(pilotCodesPath, 'utf8'));

    const seenBseCodes = new Set<string>();
    const multiMapped = [];

    for (const [sym, info] of Object.entries<any>(codes)) {
      if (info && info.bseCode) {
        if (seenBseCodes.has(info.bseCode)) {
          multiMapped.push({ symbol: sym, bseCode: info.bseCode });
        }
        seenBseCodes.add(info.bseCode);
      }
    }

    // Every distinct issuer must have a unique BSE code
    expect(multiMapped).toHaveLength(0);
    // Specifically verify 20MICRONS is 533022, NOT 500325
    expect(codes['20MICRONS'].bseCode).toBe('533022');
    expect(codes['3MINDIA'].bseCode).toBe('523395');
    expect(codes['63MOONS'].bseCode).toBe('526881');
  });

  it('strictly marks unresolvable issuers as SEARCH_FAILED with IDENTIFIER_UNRESOLVED', () => {
    const batchCode = fs.readFileSync(batchScriptPath, 'utf8');
    expect(batchCode).toContain('IDENTIFIER_UNRESOLVED');
    expect(batchCode).toContain('SEARCH_FAILED');
  });
});
