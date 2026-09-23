import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FactValidationGate, type CandidateFactInput } from '../../src/server/intelligence/engines/FactValidationGate';
import { SourceArtifactTrust } from '../../src/server/intelligence/services/SourceArtifactTrust';

const temporary: string[] = [];
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('FERE live source boundary', () => {
  it('rejects EV_FAKE_REVENUE with a fabricated ₹999 crore quote', () => {
    const candidate: CandidateFactInput = {
      factId: 'FACT_FAKE_REVENUE', issuerSymbol: 'RELIANCE', metric: 'REVENUE',
      metricFamily: 'REVENUE', value: 999, unit: 'INR_CRORE', currency: 'INR',
      measurementType: 'FLOW', periodStart: '2025-04-01', periodEnd: '2026-03-31',
      scope: 'CONSOLIDATED', sourceEvidenceId: 'EV_FAKE_REVENUE',
      sourceQuotedText: 'Revenue from operations was ₹999 crore for FY26.'
    };
    const result = FactValidationGate.validate(candidate);
    expect(result.checks.sourceSpanAuthentic).toBe(false);
    expect(result.verificationStatus).toBe('REJECTED');
  });

  it('rejects modified bytes paired with the original SHA256', () => {
    const archive = path.resolve('data/fere/verified_filings/archive');
    const name = readdirSync(archive).find(file => file.endsWith('.xml'));
    expect(name).toBeTruthy();
    const dir = mkdtempSync(path.join(os.tmpdir(), 'fere-source-test-'));
    temporary.push(dir);
    copyFileSync(path.join(archive, name!), path.join(dir, 'official.xml'));
    const bytes = readFileSync(path.join(dir, 'official.xml'));
    const originalHash = createHash('sha256').update(bytes).digest('hex');
    const quote = bytes.toString('utf8').slice(50, 100);
    expect(SourceArtifactTrust.verifyPersistedBytes('official.xml', originalHash, quote, 'application/xml', dir)).toBe(true);
    writeFileSync(path.join(dir, 'official.xml'), Buffer.concat([bytes, Buffer.from('tampered')]));
    expect(SourceArtifactTrust.verifyPersistedBytes('official.xml', originalHash, quote, 'application/xml', dir)).toBe(false);
  });

  it('rejects a fabricated quote absent from persisted source bytes', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'fere-quote-test-'));
    temporary.push(dir);
    const bytes = Buffer.from('<Revenue>1000</Revenue>');
    writeFileSync(path.join(dir, 'filing.xml'), bytes);
    const hash = createHash('sha256').update(bytes).digest('hex');
    expect(SourceArtifactTrust.verifyPersistedBytes('filing.xml', hash, '<Revenue>999</Revenue>', 'application/xml', dir)).toBe(false);
  });

  it('rejects the legacy capacity-as-currency unit defect', () => {
    const result = FactValidationGate.validate({
      factId: 'FACT_CAPACITY', issuerSymbol: 'RELIANCE', metric: 'CAPACITY',
      metricFamily: 'CAPACITY', value: 1200, unit: 'INR_CRORE', measurementType: 'STOCK',
      asOfDate: '2026-03-31', scope: 'CONSOLIDATED', sourceEvidenceId: 'EV_CAPACITY',
      sourceQuotedText: 'Capacity is 1,200 MW.'
    });
    expect(result.checks.unitConsistentWithFamily).toBe(false);
    expect(result.verificationStatus).toBe('REJECTED');
  });
});
