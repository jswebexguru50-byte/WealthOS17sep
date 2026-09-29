/**
 * deterministic_identity.test.ts
 *
 * Architecture gate: analytical/event/watch/snapshot identity must be
 * deterministic — no Date.now() or Math.random() in identity generation.
 *
 * Scans intelligence and coordinator source files for banned nondeterministic
 * identity patterns in analytical output construction.
 */

import * as fs from 'fs';
import * as path from 'path';

const SCAN_ROOTS = [
  path.join(process.cwd(), 'src', 'server', 'services', 'intelligence'),
];

// Files where Date.now() is permitted (e.g., for timing/logging, not identity)
const ALLOWLIST_FILES = new Set([
  'CompanyIntelligenceOrchestrator.ts',   // measures wall-clock duration for logging
  'AnalysisEvidenceRepository.ts',         // measures cache age in days
]);

// Pattern: Date.now() or Math.random() used inside a template literal for an ID field
const NONDETERMINISTIC_ID_PATTERNS = [
  /[`'"].*Id.*[`'"].*\$\{.*Date\.now\(\).*\}/,
  /[Ii]d\s*[:=].*Date\.now\(\)/,
  /[Ii]d\s*[:=].*Math\.random\(\)/,
  /\`[a-z_]+_\$\{.*Date\.now\(\)/,
  /\`[a-z_]+_\$\{.*Math\.random\(\)/,
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

describe('Architecture: Deterministic analytical identity', () => {
  const files = scanDir(SCAN_ROOTS[0]);

  for (const file of files) {
    const basename = path.basename(file);
    if (ALLOWLIST_FILES.has(basename)) continue;

    const relPath = path.relative(process.cwd(), file);
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    it(`${relPath} — no Date.now() or Math.random() in ID generation`, () => {
      const violations: string[] = [];

      lines.forEach((line, i) => {
        const stripped = line.trim();
        if (stripped.startsWith('//') || stripped.startsWith('*')) return;

        for (const pattern of NONDETERMINISTIC_ID_PATTERNS) {
          if (pattern.test(line)) {
            violations.push(`L${i + 1}: ${stripped}`);
          }
        }
      });

      if (violations.length > 0) {
        throw new Error(
          `Nondeterministic ID generation found in ${relPath}:\n` +
          violations.map(v => `  ${v}`).join('\n') +
          '\n\nUse SHA256 of stable inputs. Re-running identical state must produce the same ID.'
        );
      }
    });
  }
});
