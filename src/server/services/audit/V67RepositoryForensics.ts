import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type PlaceholderClassification =
  | 'SAFE'
  | 'RESEARCH-ONLY'
  | 'TEST-ONLY'
  | 'PRODUCTION-SAFE'
  | 'PROHIBITED'
  | 'REQUIRES_REVIEW';

export interface PlaceholderFinding {
  file: string;
  lineNumber: number;
  pattern: string;
  lineContent: string;
  classification: PlaceholderClassification;
  rationale: string;
}

export interface FileInventoryItem {
  file: string;
  relativePath: string;
  sha256: string;
  sizeBytes: number;
  module: string;
  role: 'PRODUCTION' | 'RESEARCH' | 'TEST' | 'SCRIPT' | 'CONFIG' | 'REPORT' | 'DATA';
  placeholderFindings: PlaceholderFinding[];
  status: 'AUDIT_PASS' | 'AUDIT_FAIL' | 'REVIEW_REQUIRED';
}

export interface ForensicsSummary {
  scannedAt: string;
  totalFiles: number;
  totalBytes: number;
  productionFiles: number;
  researchFiles: number;
  testFiles: number;
  scriptFiles: number;
  prohibitedCount: number;
  requiresReviewCount: number;
  auditPassed: boolean;
  items: FileInventoryItem[];
}

export class V67RepositoryForensics {
  private workspaceRoot: string;

  constructor(workspaceRoot: string = process.cwd()) {
    this.workspaceRoot = workspaceRoot;
  }

  public runForensics(): ForensicsSummary {
    const scanDirs = ['src', 'scripts', 'tests', 'reports'];
    const items: FileInventoryItem[] = [];

    for (const dir of scanDirs) {
      const fullDir = path.join(this.workspaceRoot, dir);
      if (fs.existsSync(fullDir)) {
        this.traverse(fullDir, items);
      }
    }

    let prohibitedCount = 0;
    let requiresReviewCount = 0;
    let prodCount = 0;
    let resCount = 0;
    let testCount = 0;
    let scriptCount = 0;
    let totalBytes = 0;

    for (const item of items) {
      totalBytes += item.sizeBytes;
      if (item.role === 'PRODUCTION') prodCount++;
      else if (item.role === 'RESEARCH') resCount++;
      else if (item.role === 'TEST') testCount++;
      else if (item.role === 'SCRIPT') scriptCount++;

      for (const f of item.placeholderFindings) {
        if (f.classification === 'PROHIBITED') prohibitedCount++;
        if (f.classification === 'REQUIRES_REVIEW') requiresReviewCount++;
      }
      if (item.placeholderFindings.some(f => f.classification === 'PROHIBITED')) {
        item.status = 'AUDIT_FAIL';
      } else if (item.placeholderFindings.some(f => f.classification === 'REQUIRES_REVIEW')) {
        item.status = 'REVIEW_REQUIRED';
      } else {
        item.status = 'AUDIT_PASS';
      }
    }

    const auditPassed = prohibitedCount === 0;

    return {
      scannedAt: new Date().toISOString(),
      totalFiles: items.length,
      totalBytes,
      productionFiles: prodCount,
      researchFiles: resCount,
      testFiles: testCount,
      scriptFiles: scriptCount,
      prohibitedCount,
      requiresReviewCount,
      auditPassed,
      items
    };
  }

  private traverse(currentDir: string, accumulator: FileInventoryItem[]) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
          continue;
        }
        this.traverse(fullPath, accumulator);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.ts', '.js', '.mjs', '.cjs', '.json', '.md'].includes(ext)) {
          accumulator.push(this.inspectFile(fullPath));
        }
      }
    }
  }

  private inspectFile(filePath: string): FileInventoryItem {
    const relPath = path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/');
    const content = fs.readFileSync(filePath);
    const contentStr = content.toString('utf-8');
    const sha256 = crypto.createHash('sha256').update(content).digest('hex');
    const sizeBytes = content.length;

    let role: FileInventoryItem['role'] = 'PRODUCTION';
    if (relPath.startsWith('tests/')) role = 'TEST';
    else if (relPath.startsWith('scripts/')) role = 'SCRIPT';
    else if (relPath.startsWith('reports/')) role = 'REPORT';
    else if (relPath.includes('/research/')) role = 'RESEARCH';
    else if (relPath.endsWith('.json') && !relPath.startsWith('src/')) role = 'DATA';
    else if (relPath.includes('config') || relPath.endsWith('.json')) role = 'CONFIG';

    const module = relPath.split('/')[0] || 'root';
    const placeholderFindings = this.detectPlaceholders(relPath, contentStr, role);

    return {
      file: filePath,
      relativePath: relPath,
      sha256,
      sizeBytes,
      module,
      role,
      placeholderFindings,
      status: 'AUDIT_PASS'
    };
  }

  private detectPlaceholders(
    relPath: string,
    content: string,
    role: FileInventoryItem['role']
  ): PlaceholderFinding[] {
    const findings: PlaceholderFinding[] = [];
    const lines = content.split('\n');

    // Patterns to inspect
    const targetPatterns = [
      { regex: /throw new Error\(["']TODO/i, pattern: 'throw new Error("TODO")' },
      { regex: /throw new Error\(["']not implemented/i, pattern: 'throw new Error("not implemented")' },
      { regex: /Math\.random\(\)/, pattern: 'Math.random()' },
      { regex: /\bcurrentUniverse\b/, pattern: 'currentUniverse' },
      { regex: /\bpreviousDay\b/, pattern: 'previousDay' },
      { regex: /\bfallback\b/i, pattern: 'fallback' },
      { regex: /\bsynthetic\b/i, pattern: 'synthetic' }
    ];

    if (relPath.includes('V67RepositoryForensics')) {
      return [];
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        continue; // skip pure comments
      }

      for (const p of targetPatterns) {
        if (p.regex.test(line)) {
          let classification: PlaceholderClassification = 'REQUIRES_REVIEW';
          let rationale = 'Detected pattern requires review';

          if (role === 'TEST') {
            classification = 'TEST-ONLY';
            rationale = 'Test fixture / mock usage allowed in test suite';
          } else if (p.pattern === 'throw new Error("TODO")' || p.pattern === 'throw new Error("not implemented")') {
            classification = (role === 'PRODUCTION' || role === 'RESEARCH') ? 'PROHIBITED' : 'REQUIRES_REVIEW';
            rationale = 'Unimplemented path in active code';
          } else if (p.pattern === 'Math.random()') {
            classification = (role === 'RESEARCH') ? 'PROHIBITED' : 'REQUIRES_REVIEW';
            rationale = 'Non-deterministic RNG forbidden in reproducible research; use SeededRandom(seed=42)';
          } else if (p.pattern === 'currentUniverse' || p.pattern === 'previousDay') {
            if (line.includes('noCurrentUniverseFallback') || line.includes('rejectCurrentUniverse') || line.includes('!currentUniverse')) {
              classification = 'SAFE';
              rationale = 'Defensive invariant guard against forbidden fallback';
            } else if (line.toLowerCase().includes('fallback') || role === 'RESEARCH') {
              classification = 'PROHIBITED';
              rationale = 'Forbidden historical fallback keyword in research or fallback path';
            } else {
              classification = 'PRODUCTION-SAFE';
              rationale = 'Live runtime universe reference in non-historical daemon';
            }
          } else if (p.pattern === 'fallback') {
            if (line.includes('fallbackAllowed: false') || line.includes('noFallback') || line.includes('DISALLOW_FALLBACK')) {
              classification = 'SAFE';
              rationale = 'Explicit fallback prohibition';
            } else {
              classification = 'PRODUCTION-SAFE';
              rationale = 'Configurable fallback structure';
            }
          }

          findings.push({
            file: relPath,
            lineNumber: i + 1,
            pattern: p.pattern,
            lineContent: trimmed.slice(0, 120),
            classification,
            rationale
          });
        }
      }
    }

    return findings;
  }
}
