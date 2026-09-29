/**
 * repository_boundary.test.ts
 *
 * Architecture gate: analytical engines must not bypass the repository layer
 * and access raw provider data directly. All canonical facts must come through
 * CanonicalFactRepository; all evidence through EvidenceRepository.
 *
 * Scans engine files for direct raw-provider DB access patterns.
 */

import * as fs from 'fs';
import * as path from 'path';

const ENGINE_DIRS = [
  path.join(process.cwd(), 'src', 'server', 'services', 'intelligence', 'management'),
  path.join(process.cwd(), 'src', 'server', 'services', 'intelligence', 'valuation'),
  path.join(process.cwd(), 'src', 'server', 'services', 'intelligence', 'delta'),
  path.join(process.cwd(), 'src', 'server', 'services', 'intelligence', 'thesis'),
  path.join(process.cwd(), 'src', 'server', 'services', 'intelligence', 'risks'),
  path.join(process.cwd(), 'src', 'server', 'services', 'intelligence', 'contradictions'),
];

// Raw provider table names that engines must not query directly
const FORBIDDEN_RAW_TABLES = [
  'fere_financial_facts',
  'raw_ohlcv',
  'raw_company_data',
  'provider_ingest',
];

// Repository imports that are allowed (this is what they SHOULD use)
const PERMITTED_REPOSITORY_PATTERNS = [
  'CanonicalFactRepository',
  'EvidenceRepository',
  'CompanyEventRepository',
  'PriceSeriesRepository',
  'ManagementCommitmentRepository',
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

describe('Architecture: Repository boundary — no raw provider access from engines', () => {
  const files = ENGINE_DIRS.flatMap(scanDir);

  for (const file of files) {
    const relPath = path.relative(process.cwd(), file);
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    it(`${relPath} — no direct raw provider table access`, () => {
      const violations: string[] = [];

      lines.forEach((line, i) => {
        const stripped = line.trim();
        if (stripped.startsWith('//') || stripped.startsWith('*')) return;

        for (const table of FORBIDDEN_RAW_TABLES) {
          if (line.includes(table)) {
            violations.push(`L${i + 1}: ${stripped} (table: ${table})`);
          }
        }
      });

      if (violations.length > 0) {
        throw new Error(
          `Raw provider table access in engine file ${relPath}:\n` +
          violations.map(v => `  ${v}`).join('\n') +
          '\n\nEngines must use repository classes, not raw DB tables.'
        );
      }
    });
  }
});
