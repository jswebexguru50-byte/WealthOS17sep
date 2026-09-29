/**
 * v2_no_legacy_fallback.test.ts
 *
 * Architecture gate: V2 frontend intelligence response must not fall back to
 * V1 `data.*` field access. Verifies UI response consumers use V2 module paths.
 *
 * Also verifies CompanySnapshotRepository distinguishes legacy rows from V2 rows
 * rather than aliasing content_hash for both canonical_fact_hash and evidence_hash.
 */

import * as fs from 'fs';
import * as path from 'path';

const UI_DIRS = [
  path.join(process.cwd(), 'src', 'client'),
  path.join(process.cwd(), 'src', 'server', 'routes'),
];

// V1 legacy field patterns that must not appear in V2 UI code
const V1_LEGACY_PATTERNS = [
  /response\.data\.(fundamental|management|valuation|technical|business)/,
  /data\.(fundamental|management|valuation|technical|businessDrivers)/,
];

function scanDir(dir: string, ext: string = '.ts'): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...scanDir(full, ext));
    else if ((entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) && !entry.name.endsWith('.test.ts')) results.push(full);
  }
  return results;
}

describe('Architecture: V2 no legacy fallback', () => {
  describe('UI response consumers use V2 module paths', () => {
    const uiFiles = UI_DIRS.flatMap(d => scanDir(d));

    for (const file of uiFiles) {
      const relPath = path.relative(process.cwd(), file);
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      it(`${relPath} — no V1 data.* field access`, () => {
        const violations: string[] = [];

        lines.forEach((line, i) => {
          const stripped = line.trim();
          if (stripped.startsWith('//') || stripped.startsWith('*')) return;

          for (const pattern of V1_LEGACY_PATTERNS) {
            if (pattern.test(line)) {
              violations.push(`L${i + 1}: ${stripped}`);
            }
          }
        });

        if (violations.length > 0) {
          throw new Error(
            `V1 legacy field access found in ${relPath}:\n` +
            violations.map(v => `  ${v}`).join('\n') +
            '\n\nUse modules.fundamental?.result, modules.technical?.result, etc.'
          );
        }
      });
    }
  });

  describe('CompanySnapshotRepository: evidenceHash is independent of canonicalFactHash', () => {
    it('legacy rows are flagged with LEGACY_COMPAT prefix — not silently aliased', () => {
      // Read the actual source and verify the compat path adds a distinct prefix
      const snapRepoPath = path.join(
        process.cwd(),
        'src', 'server', 'services', 'intelligence', 'core', 'CompanySnapshotRepository.ts'
      );
      const content = fs.readFileSync(snapRepoPath, 'utf-8');

      // Must NOT have the old pattern where both hashes are set to the same raw value
      expect(content).not.toMatch(/canonicalFactHash:\s*row\.content_hash,\s*\n\s*evidenceHash:\s*row\.content_hash/);

      // Must HAVE the V2 separate column writes
      expect(content).toContain('canonical_fact_hash');
      expect(content).toContain('evidence_hash');

      // Must flag legacy rows distinctly
      expect(content).toContain('LEGACY_COMPAT');
    });

    it('saveSnapshot writes analytical_hash and module_hashes as separate columns', () => {
      const snapRepoPath = path.join(
        process.cwd(),
        'src', 'server', 'services', 'intelligence', 'core', 'CompanySnapshotRepository.ts'
      );
      const content = fs.readFileSync(snapRepoPath, 'utf-8');
      expect(content).toContain('analytical_hash');
      expect(content).toContain('module_hashes');
    });
  });
});
