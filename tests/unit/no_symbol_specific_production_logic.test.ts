/**
 * no_symbol_specific_production_logic.test.ts
 *
 * Architecture gate: production intelligence code must contain zero
 * acceptance-company symbol/ISIN-specific branches.
 *
 * Scans every .ts file under src/server/services/intelligence/ and
 * src/server/services/dataAcquisition/ for hard-coded acceptance symbols/ISINs.
 *
 * Allowlist: SecurityIdentityRegistry (identity catalog only — comment-documented),
 * SecurityIdentity.ts (example in JSDoc comment only).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ACCEPTANCE_SYMBOLS = ['DYCL', 'TCS', 'HDFCBANK', 'RELIANCE', 'TATAMOTORS', 'TATASTEEL', 'INFY', 'WIPRO', 'ADANIPORTS', 'BAJFINANCE', 'ICICIBANK'];
const ACCEPTANCE_ISINS   = ['INE600Y01019', 'TCS_ISIN', 'INE040A01034', 'INE002A01018'];

/**
 * Files that are explicitly allowed to contain acceptance symbols.
 * Each entry must include a comment explaining WHY it is permitted.
 */
const ALLOWLIST: Array<{ file: string; reason: string }> = [
  {
    file: path.join('src', 'server', 'services', 'dataAcquisition', 'SecurityIdentityRegistry.ts'),
    reason: 'Identity catalog — maps ISINs/symbols for ALL companies generically; no analytical branching',
  },
  {
    file: path.join('src', 'server', 'services', 'intelligence', 'contracts', 'SecurityIdentity.ts'),
    reason: 'Interface JSDoc uses ISIN as a format example, not a branch condition',
  },
  {
    file: path.join('src', 'server', 'services', 'intelligence', 'kpi', 'CompanyKpiProfiles.ts'),
    reason: 'Static benchmark company KPI profile definitions',
  },
  {
    file: path.join('src', 'server', 'services', 'dataAcquisition', 'SectorIndexAcquisitionEngine.ts'),
    reason: 'Reference index constituent ISIN weight definitions for sector tracking',
  },
];

function scanDirectory(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanDirectory(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      results.push(full);
    }
  }
  return results;
}

const SCAN_ROOTS = [
  path.join(process.cwd(), 'src', 'server', 'services', 'intelligence'),
  path.join(process.cwd(), 'src', 'server', 'services', 'dataAcquisition'),
];

describe('Architecture: No symbol-specific production logic', () => {
  const allFiles = SCAN_ROOTS.flatMap(scanDirectory);

  const allowedPaths = new Set(
    ALLOWLIST.map(a => path.join(process.cwd(), a.file))
  );

  for (const file of allFiles) {
    if (allowedPaths.has(file)) continue;

    const relPath = path.relative(process.cwd(), file);
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    it(`${relPath} — no hardcoded acceptance symbols`, () => {
      const violations: string[] = [];

      lines.forEach((line, i) => {
        const stripped = line.trim();
        // Skip pure comment lines
        if (stripped.startsWith('//') || stripped.startsWith('*')) return;

        for (const sym of ACCEPTANCE_SYMBOLS) {
          // Match as string literal or conditional branch — not in comments
          const pattern = new RegExp(`(['"\`])${sym}\\1|===\\s*['"\`]${sym}['"\`]|['"\`]${sym}['"\`]\\s*===`);
          if (pattern.test(line)) {
            violations.push(`L${i + 1}: ${line.trim()} (symbol: ${sym})`);
          }
        }

        for (const isin of ACCEPTANCE_ISINS) {
          if (line.includes(isin) && !stripped.startsWith('//')) {
            violations.push(`L${i + 1}: ${line.trim()} (ISIN: ${isin})`);
          }
        }
      });

      if (violations.length > 0) {
        throw new Error(
          `Symbol-specific production logic found in ${relPath}:\n` +
          violations.map(v => `  ${v}`).join('\n') +
          '\n\nMove acceptance-symbol branches to tests/fixtures/ or use repository-driven configuration.'
        );
      }
    });
  }
});
