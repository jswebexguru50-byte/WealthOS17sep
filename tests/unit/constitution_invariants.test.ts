import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

describe('Step 3: Repository-Wide Constitution Rule 5 & Lineage Integrity Tests', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const dbPath = path.resolve(rootDir, 'portfolio.db');

  // =========================================================================
  // TEST 1: Constitution Rule 5 — No Serving DB Mutation Outside quality-gate
  // =========================================================================
  it('proves no active code path mutates serving tables outside quality-gate.cjs', () => {
    const writePatterns = [
      /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+SecurityDossierSnapshots/i,
      /UPDATE\s+SecurityDossierSnapshots/i,
      /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+ForensicAssertions/i,
      /UPDATE\s+ForensicAssertions/i,
    ];

    const authorizedGatekeepers = [
      path.normalize('pipeline/quality-gate.cjs'),
    ];

    const ignoredDirs = new Set([
      'node_modules',
      '.git',
      '.gemini',
      'dist',
      'build',
      'backups',
      'tests',
      'scratch',
      'scripts' // inactive legacy scripts
    ]);

    function scanFiles(dir: string, list: string[] = []): string[] {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          if (!ignoredDirs.has(e.name)) {
            scanFiles(path.join(dir, e.name), list);
          }
        } else if (e.isFile() && /\.(ts|js|cjs|mjs)$/.test(e.name)) {
          list.push(path.join(dir, e.name));
        }
      }
      return list;
    }

    const sourceFiles = scanFiles(rootDir);
    const violations: Array<{ file: string; line: number; text: string }> = [];

    for (const f of sourceFiles) {
      const rel = path.normalize(path.relative(rootDir, f));
      if (authorizedGatekeepers.includes(rel)) continue;

      const lines = fs.readFileSync(f, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const p of writePatterns) {
          if (p.test(lines[i])) {
            violations.push({ file: rel, line: i + 1, text: lines[i].trim() });
          }
        }
      }
    }

    if (violations.length > 0) {
      console.error('RULE 5 BYPASS VIOLATIONS:', violations);
    }
    expect(violations).toHaveLength(0);
  });

  // =========================================================================
  // TEST 2: Evidence Lineage Isolation — Zero Cross-Issuer Attributions
  // =========================================================================
  it('proves no evidence lineage crosses issuer identity in portfolio.db', () => {
    const pyScript = `
import sqlite3, json
conn = sqlite3.connect(r'${dbPath.replace(/\\/g, '\\\\')}')
cur = conn.cursor()
inv = [dict(zip([c[0] for c in cur.description], row)) for row in cur.execute('SELECT scripId, sourceType, documentId, details FROM EvidenceInventory').fetchall()]
cur.execute('SELECT assertionId, scripId, field, evidenceIds FROM ForensicAssertions')
assertions = [dict(zip([c[0] for c in cur.description], row)) for row in cur.fetchall()]
print(json.dumps({'inventory': inv, 'assertions': assertions}))
`;
    const res = execSync('python', { input: pyScript, encoding: 'utf8' });
    const { inventory: invRows, assertions: assertRows } = JSON.parse(res);

    for (const r of invRows) {
      // Must not contain Reliance 500325 fallback unless the scrip itself is RELIANCE
      if (r.scripId !== 'RELIANCE') {
        expect(r.documentId || '').not.toContain('500325');
        const detailsStr = r.details || '';
        expect(detailsStr).not.toContain('500325');
      }

      // If details has issuer codes, verify identity consistency
      if (r.details) {
        try {
          const d = JSON.parse(r.details);
          if (d.issuerNseSymbol) {
            expect(d.issuerNseSymbol).toBe(r.scripId);
          }
        } catch (e) {
          // ignore parse errors
        }
      }
    }

    // 2. ForensicAssertions verification
    for (const a of assertRows) {
      // Assertion ID must be prefixed with its own scripId
      expect(a.assertionId.startsWith(`${a.scripId}:`)).toBe(true);

      // Evidence IDs must strictly reference the same scripId
      const evIds = JSON.parse(a.evidenceIds || '[]');
      for (const evId of evIds) {
        expect(evId.startsWith(`${a.scripId}:`)).toBe(true);
      }
    }
  });
});
