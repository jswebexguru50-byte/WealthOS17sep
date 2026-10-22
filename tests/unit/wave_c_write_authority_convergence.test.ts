/**
 * wave_c_write_authority_convergence.test.ts
 * Architecture regression suite: SINGLE WRITE AUTHORITY enforcement.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'src', relPath), 'utf-8');
}
function countDirectInserts(content: string, table: string): number {
  const regex = new RegExp(`INSERT\\s+(OR\\s+REPLACE\\s+)?INTO\\s+${table}`, 'gi');
  return (content.match(regex) || []).length;
}

const PIPELINE    = 'server/services/intelligence/acquisition/SourceDocumentIngestionPipeline.ts';
const COORDINATOR = 'server/services/intelligence/coordinator/CompanyRefreshCoordinator.ts';
const FACT_REPO   = 'server/services/intelligence/core/CanonicalFactRepository.ts';
const EVENT_REPO  = 'server/services/intelligence/core/CompanyEventRepository.ts';
const COMMIT_REPO = 'server/services/intelligence/core/ManagementCommitmentRepository.ts';

describe('Wave C — Single Write Authority Convergence', () => {

  describe('1. SourceDocumentIngestionPipeline zero direct SQL writes', () => {
    const c = readSrc(PIPELINE);
    it('ZERO INSERT INTO company_facts', () => { expect(countDirectInserts(c, 'company_facts')).toBe(0); });
    it('ZERO INSERT INTO company_events', () => { expect(countDirectInserts(c, 'company_events')).toBe(0); });
    it('ZERO INSERT INTO management_commitments', () => { expect(countDirectInserts(c, 'management_commitments')).toBe(0); });
    it('delegates to CanonicalFactRepository', () => { expect(c).toMatch(/factRepo\.persistFact\(/); });
    it('delegates to CompanyEventRepository', () => { expect(c).toMatch(/eventRepo\.persistEvent\(/); });
    it('delegates to ManagementCommitmentRepository', () => { expect(c).toMatch(/commitmentRepo\.persistCommitment\(/); });
    it('does NOT import better-sqlite3', () => { expect(c).not.toContain("from 'better-sqlite3'"); });
    it('does NOT open raw Database connections', () => { expect(c).not.toMatch(/new Database\s*\(/); });
  });

  describe('2. CompanyRefreshCoordinator zero direct SQL writes', () => {
    const c = readSrc(COORDINATOR);
    it('ZERO INSERT INTO company_facts', () => { expect(countDirectInserts(c, 'company_facts')).toBe(0); });
    it('ZERO INSERT INTO company_events', () => { expect(countDirectInserts(c, 'company_events')).toBe(0); });
    it('does NOT import better-sqlite3', () => { expect(c).not.toContain("from 'better-sqlite3'"); });
    it('does NOT open raw Database connections', () => { expect(c).not.toMatch(/new Database\s*\(/); });
    it('delegates facts via persistIngestedFact', () => { expect(c).toMatch(/persistIngestedFact\(/); });
    it('delegates events via persistEvent', () => { expect(c).toMatch(/persistEvent\(/); });
  });

  describe('3. Repository files are sole INSERT authority per table', () => {
    it('company_facts sole authority', () => {
      expect(countDirectInserts(readSrc(FACT_REPO), 'company_facts')).toBeGreaterThanOrEqual(1);
      expect(countDirectInserts(readSrc(PIPELINE), 'company_facts')).toBe(0);
      expect(countDirectInserts(readSrc(COORDINATOR), 'company_facts')).toBe(0);
    });
    it('company_events sole authority', () => {
      expect(countDirectInserts(readSrc(EVENT_REPO), 'company_events')).toBeGreaterThanOrEqual(1);
      expect(countDirectInserts(readSrc(PIPELINE), 'company_events')).toBe(0);
      expect(countDirectInserts(readSrc(COORDINATOR), 'company_events')).toBe(0);
    });
    it('management_commitments sole authority', () => {
      expect(countDirectInserts(readSrc(COMMIT_REPO), 'management_commitments')).toBeGreaterThanOrEqual(1);
      expect(countDirectInserts(readSrc(PIPELINE), 'management_commitments')).toBe(0);
    });
  });

  describe('4. Repository write APIs exist', () => {
    it('CanonicalFactRepository persistFact, persistIngestedFact, CanonicalFactWriteInput', () => {
      const c = readSrc(FACT_REPO);
      expect(c).toMatch(/public async persistFact\s*\(/);
      expect(c).toMatch(/public async persistIngestedFact\s*\(/);
      expect(c).toMatch(/export interface CanonicalFactWriteInput/);
    });
    it('CompanyEventRepository persistEvent returns Promise<string>', () => {
      const c = readSrc(EVENT_REPO);
      expect(c).toMatch(/public async persistEvent\s*\(/);
      expect(c).toContain('Promise<string>');
    });
    it('ManagementCommitmentRepository persistCommitment exists', () => {
      expect(readSrc(COMMIT_REPO)).toMatch(/public async persistCommitment\s*\(/);
    });
  });

  describe('5. Zero runtime DDL in repositories', () => {
    it('CanonicalFactRepository no CREATE/ALTER', () => {
      const c = readSrc(FACT_REPO);
      expect(c).not.toMatch(/CREATE\s+TABLE/i);
      expect(c).not.toMatch(/ALTER\s+TABLE/i);
    });
    it('CompanyEventRepository no CREATE/ALTER', () => {
      const c = readSrc(EVENT_REPO);
      expect(c).not.toMatch(/CREATE\s+TABLE/i);
      expect(c).not.toMatch(/ALTER\s+TABLE/i);
    });
    it('ManagementCommitmentRepository no CREATE/ALTER', () => {
      const c = readSrc(COMMIT_REPO);
      expect(c).not.toMatch(/CREATE\s+TABLE/i);
      expect(c).not.toMatch(/ALTER\s+TABLE/i);
    });
  });
});
