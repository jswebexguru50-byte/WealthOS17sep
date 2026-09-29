/**
 * no_synthetic_evidence_metadata.test.ts
 *
 * Architecture gate: production evidence metadata must never substitute
 * today's date for unknown documentDate or availableAt.
 *
 * Scans intelligence source files for the banned pattern:
 *   `new Date().toISOString()` or `new Date().toISOString().split('T')[0]`
 *   used as a fallback for documentDate or availableAt fields.
 */

import * as fs from 'fs';
import * as path from 'path';

const INTELLIGENCE_ROOT = path.join(process.cwd(), 'src', 'server', 'services', 'intelligence');

// Patterns that represent fabricating today as evidence metadata
const FORBIDDEN_DATE_FABRICATION_PATTERNS = [
  // || new Date() as fallback for documentDate or availableAt
  /documentDate\s*:\s*\S+\s*\|\|\s*new Date\(\)/,
  /availableAt\s*:\s*\S+\s*\|\|\s*new Date\(\)/,
  // direct assignment of new Date() to these fields
  /documentDate\s*=\s*new Date\(\)/,
  /availableAt\s*=\s*new Date\(\)/,
];

function scanDir(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...scanDir(full));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) results.push(full);
  }
  return results;
}

describe('Architecture: No synthetic evidence metadata (date fabrication)', () => {
  const files = scanDir(INTELLIGENCE_ROOT);

  for (const file of files) {
    const relPath = path.relative(process.cwd(), file);
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    it(`${relPath} — no today-date fallback for documentDate or availableAt`, () => {
      const violations: string[] = [];

      lines.forEach((line, i) => {
        const stripped = line.trim();
        if (stripped.startsWith('//') || stripped.startsWith('*')) return;

        for (const pattern of FORBIDDEN_DATE_FABRICATION_PATTERNS) {
          if (pattern.test(line)) {
            violations.push(`L${i + 1}: ${stripped}`);
          }
        }
      });

      if (violations.length > 0) {
        throw new Error(
          `Synthetic evidence date fabrication found in ${relPath}:\n` +
          violations.map(v => `  ${v}`).join('\n') +
          '\n\nUnknown dates must be null, not new Date(). Unknown means unknown.'
        );
      }
    });
  }
});
