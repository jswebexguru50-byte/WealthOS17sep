#!/usr/bin/env node

/**
 * WEALTHOS
 * Wave 3.7.1
 *
 * DETERMINISTIC TYPESCRIPT INTERFACE DIAGNOSTIC
 * + SAFE REMEDIATION ENGINE
 *
 * PURPOSE
 * -------
 * Diagnose the complete current TypeScript baseline and determine,
 * from repository evidence, how each defect should be remediated.
 *
 * This version is designed for the current Wave 3.7 baseline:
 *
 *     67 TypeScript errors
 *
 * It does NOT blindly "fix" TypeScript.
 *
 * It distinguishes:
 *
 *   1. SAFE_DETERMINISTIC_FIX
 *   2. RENAME_CONFIRMED
 *   3. INTERFACE_DRIFT
 *   4. MISSING_IMPLEMENTATION
 *   5. MISSING_MODULE
 *   6. SIGNATURE_DRIFT
 *   7. UNION_ENUM_DRIFT
 *   8. TYPE_MODEL_DRIFT
 *   9. TEST_ONLY
 *  10. RESEARCH_OR_EXPERIMENTAL
 *  11. PRODUCTION_PATH
 *  12. UNKNOWN
 *
 * SAFETY RULES
 * ------------
 * NEVER:
 *
 *   - modify frozen controls
 *   - add `any`
 *   - add @ts-ignore
 *   - add @ts-expect-error
 *   - weaken tsconfig
 *   - exclude files
 *   - fabricate methods
 *   - fabricate return values
 *   - fabricate interfaces
 *   - change strategy logic
 *   - change strategy parameters
 *   - change capital protection
 *   - change signal quality
 *   - change intraday ingestion
 *   - modify acquisition/replay flags
 *
 * SAFE AUTO-FIXES are intentionally very narrow.
 *
 * OUTPUT
 * ------
 *
 * reports/v65-delivery-2.2/
 *
 *   WAVE3_7_1_TYPESCRIPT_DIAGNOSTIC.json
 *   WAVE3_7_1_TYPESCRIPT_DIAGNOSTIC.md
 *   WAVE3_7_1_INTERFACE_REMEDIATION_PLAN.json
 *   WAVE3_7_1_INTERFACE_REMEDIATION_PLAN.md
 *
 * USAGE
 * -----
 *
 * Diagnose only:
 *
 *   node scripts/audit/diagnose_and_remediate_typescript.cjs
 *
 * Diagnose + apply only deterministic fixes:
 *
 *   node scripts/audit/diagnose_and_remediate_typescript.cjs --apply-safe
 *
 * Diagnose + safe fixes + rerun:
 *
 *   node scripts/audit/diagnose_and_remediate_typescript.cjs --apply-safe --rerun
 *
 * Optional:
 *
 *   --production-only
 *   --include-tests
 *
 * EXIT CODES
 * ----------
 *
 *   0 = TypeScript clean
 *   1 = TypeScript errors remain
 *   2 = diagnostic infrastructure failure
 *   3 = frozen control violation
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '../..');

const REPORT_DIR =
  path.join(
    ROOT,
    'reports/v65-delivery-2.2'
  );

const JSON_REPORT =
  path.join(
    REPORT_DIR,
    'WAVE3_7_1_TYPESCRIPT_DIAGNOSTIC.json'
  );

const MD_REPORT =
  path.join(
    REPORT_DIR,
    'WAVE3_7_1_TYPESCRIPT_DIAGNOSTIC.md'
  );

const PLAN_JSON =
  path.join(
    REPORT_DIR,
    'WAVE3_7_1_INTERFACE_REMEDIATION_PLAN.json'
  );

const PLAN_MD =
  path.join(
    REPORT_DIR,
    'WAVE3_7_1_INTERFACE_REMEDIATION_PLAN.md'
  );

const APPLY_SAFE =
  process.argv.includes('--apply-safe');

const RERUN =
  process.argv.includes('--rerun');

const PRODUCTION_ONLY =
  process.argv.includes('--production-only');

const INCLUDE_TESTS =
  process.argv.includes('--include-tests');

const FROZEN_CONTROLS = {
  'src/server/services/PureTechnicalStrategiesEngine.ts':
    '825FA6C067CF26AB28E15451ABEA80E1015EA15A8F24145102F7FC054977A2A3',

  'src/server/services/StrategyParameterConfig.ts':
    '901CA7A27B2EB4E09183426C9E0DFD7B812AEEBF84472B49B9F829661FE7194B',

  'src/server/services/SignalQualityOverlay.ts':
    'C41CDDB152C150BEA932A8B9BD8FCC6EA01A03A2BA030A723789AAADA5C17452',

  'src/server/services/CapitalProtectionEngine.ts':
    '63B8317889F5A60E9462F883E89ACB57FE99E819935EC8F7B30036ECFE4ED753',

  'src/server/services/NewTechnicalStrategiesEngine.ts':
    '78415BA3C74CA6A9CC2FCC96D2E54BA871E9BCA73FC6E078570C412781B1D354',

  'src/server/services/UpstoxIntradayIngestor.ts':
    '0F1C96D0E0C704672517F378990E17FACDCED7BFBF359DAF9C6F37333BE1B151',

  'data/v6.3_REAL_trade_identity_ledger.jsonl':
    '035D8867F1F8DBC65F9FE35EA45263F20F9FEE00A48D3D7F48807C24A2AFD485'
};


/* ============================================================
 * UTILITIES
 * ============================================================
 */

function sha256(file) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex')
    .toUpperCase();
}

function rel(file) {
  return path
    .relative(ROOT, file)
    .replace(/\\/g, '/');
}

function abs(file) {
  return path.isAbsolute(file)
    ? file
    : path.resolve(ROOT, file);
}

function read(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function run(command) {
  const result =
    cp.spawnSync(
      command,
      {
        cwd: ROOT,
        shell: true,
        encoding: 'utf8',
        maxBuffer:
          200 * 1024 * 1024
      }
    );

  return {
    command,
    exitCode:
      typeof result.status === 'number'
        ? result.status
        : 2,
    stdout:
      result.stdout || '',
    stderr:
      result.stderr || ''
  };
}

function git(command) {
  return run(`git ${command}`);
}

function currentCommit() {
  return git('rev-parse HEAD')
    .stdout
    .trim();
}

function workingTree() {
  return git('status --porcelain')
    .stdout
    .trim();
}


/* ============================================================
 * FROZEN CONTROL VERIFICATION
 * ============================================================
 */

function verifyFrozenControls() {
  const results = [];
  const violations = [];

  for (
    const [file, expected]
    of Object.entries(FROZEN_CONTROLS)
  ) {
    const full =
      path.join(ROOT, file);

    if (!fs.existsSync(full)) {
      violations.push({
        file,
        reason:
          'FILE_MISSING',
        expected
      });

      continue;
    }

    const actual =
      sha256(full);

    const pass =
      actual === expected;

    results.push({
      file,
      expected,
      actual,
      pass
    });

    if (!pass) {
      violations.push({
        file,
        reason:
          'HASH_MISMATCH',
        expected,
        actual
      });
    }
  }

  return {
    pass:
      violations.length === 0,
    results,
    violations
  };
}


/* ============================================================
 * SOURCE DISCOVERY
 * ============================================================
 */

function sourceFiles() {
  const files = [];

  function walk(dir) {
    if (!fs.existsSync(dir))
      return;

    for (
      const entry
      of fs.readdirSync(
        dir,
        { withFileTypes: true }
      )
    ) {
      if (
        entry.name ===
          'node_modules' ||
        entry.name === '.git' ||
        entry.name === 'dist' ||
        entry.name === 'build'
      ) {
        continue;
      }

      const full =
        path.join(
          dir,
          entry.name
        );

      if (entry.isDirectory()) {
        walk(full);
        continue;
      }

      if (
        /\.(ts|tsx|js|jsx|mts|cts)$/
          .test(entry.name)
      ) {
        files.push(full);
      }
    }
  }

  walk(
    path.join(ROOT, 'src')
  );

  walk(
    path.join(ROOT, 'scripts')
  );

  return files;
}


/* ============================================================
 * TEST / PRODUCTION CLASSIFICATION
 * ============================================================
 */

function isTestFile(file) {
  const p =
    rel(file);

  return (
    /(^|\/)__tests__\//.test(p) ||
    /\.test\.[cm]?[jt]sx?$/.test(p) ||
    /\.spec\.[cm]?[jt]sx?$/.test(p)
  );
}

function isResearchFile(file) {
  const p =
    rel(file).toLowerCase();

  return (
    p.includes('/research/') ||
    p.includes('/r3/') ||
    p.includes('/r4/') ||
    p.includes('/pkscreener/') ||
    p.includes('/phase2fasttrack/') ||
    p.includes('/phase2forensics/')
  );
}

function isProductionCritical(file) {
  const p =
    rel(file);

  return (
    p.startsWith(
      'src/server/'
    ) &&
    !isResearchFile(file) &&
    !isTestFile(file)
  );
}

function classifyScope(file) {
  if (isTestFile(file))
    return 'TEST';

  if (isResearchFile(file))
    return 'RESEARCH_OR_EXPERIMENTAL';

  if (isProductionCritical(file))
    return 'PRODUCTION_PATH';

  return 'OTHER';
}


/* ============================================================
 * TYPESCRIPT DIAGNOSTIC PARSER
 * ============================================================
 */

function parseDiagnostics(output) {
  const diagnostics = [];

  const lines =
    output.split(/\r?\n/);

  for (
    let i = 0;
    i < lines.length;
    i++
  ) {
    const line =
      lines[i];

    /*
     * Windows / TypeScript:
     *
     * file.ts(12,4): error TS2339: ...
     */

    let m =
      line.match(
        /^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.*)$/
      );

    /*
     * Alternative:
     *
     * file.ts:12:4 - error TS2339: ...
     */

    if (!m) {
      m =
        line.match(
          /^(.+?):(\d+):(\d+)\s+-\s+error\s+(TS\d+):\s*(.*)$/
        );
    }

    if (!m)
      continue;

    diagnostics.push({
      file:
        m[1].trim(),
      line:
        Number(m[2]),
      column:
        Number(m[3]),
      code:
        m[4],
      message:
        m[5].trim()
    });
  }

  return diagnostics;
}


/* ============================================================
 * ERROR CLASSIFICATION
 * ============================================================
 */

function classifyCode(code) {
  const map = {
    TS2305:
      'MISSING_EXPORT',

    TS2307:
      'MISSING_MODULE',

    TS2339:
      'MISSING_PROPERTY_OR_METHOD',

    TS2551:
      'RENAMED_PROPERTY_CANDIDATE',

    TS2561:
      'OBJECT_LITERAL_INTERFACE_MISMATCH',

    TS2353:
      'OBJECT_LITERAL_INTERFACE_MISMATCH',

    TS2322:
      'TYPE_ASSIGNABILITY_MISMATCH',

    TS2345:
      'ARGUMENT_TYPE_MISMATCH',

    TS2554:
      'ARGUMENT_COUNT_MISMATCH',

    TS2367:
      'STALE_UNION_OR_IMPOSSIBLE_COMPARISON',

    TS2724:
      'RENAMED_EXPORT_CANDIDATE',

    TS2459:
      'NON_EXPORTED_SYMBOL',

    TS18004:
      'MISSING_VARIABLE',

    TS2341:
      'PRIVATE_MEMBER_ACCESS',

    TS2739:
      'INCOMPLETE_OBJECT_IMPLEMENTATION',

    TS2552:
      'MISSING_IDENTIFIER'
  };

  return (
    map[code] ||
    'OTHER'
  );
}


/* ============================================================
 * IDENTIFIER EXTRACTION
 * ============================================================
 */

function identifiers(message) {
  const result = [];

  const patterns = [
    /Property '([^']+)' does not exist/,
    /property '([^']+)' does not exist/,
    /exported member '([^']+)'/,
    /exported member named '([^']+)'/,
    /'([^']+)' does not exist on type/,
    /Cannot find name '([^']+)'/,
    /Did you mean to write '([^']+)'/
  ];

  for (const p of patterns) {
    const m =
      message.match(p);

    if (m)
      result.push(m[1]);
  }

  return [
    ...new Set(result)
  ];
}

function compilerSuggestion(message) {
  const m =
    message.match(
      /Did you mean to write '([^']+)'/
    );

  return m
    ? m[1]
    : null;
}

function typeNames(message) {
  const result = [];

  const patterns = [
    /type '([^']+)'/,
    /interface '([^']+)'/,
    /type ([A-Za-z0-9_]+)/,
    /interface ([A-Za-z0-9_]+)/
  ];

  for (const p of patterns) {
    const m =
      message.match(p);

    if (m)
      result.push(m[1]);
  }

  return [
    ...new Set(result)
  ];
}


/* ============================================================
 * DECLARATION INDEX
 * ============================================================
 */

function buildDeclarationIndex() {
  const index =
    new Map();

  for (
    const file
    of sourceFiles()
  ) {
    const content =
      read(file);

    if (!content)
      continue;

    const lines =
      content.split(/\r?\n/);

    for (
      let i = 0;
      i < lines.length;
      i++
    ) {
      const line =
        lines[i];

      const patterns = [
        /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,
        /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/,
        /\b(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/,
        /\b(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/,
        /\b(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/,
        /\b(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/,
        /^\s*(?:public|private|protected|static|async|\s)*([A-Za-z_$][\w$]*)\s*\(/
      ];

      for (
        const pattern
        of patterns
      ) {
        const m =
          line.match(pattern);

        if (!m)
          continue;

        const name =
          m[1];

        if (!index.has(name))
          index.set(name, []);

        index
          .get(name)
          .push({
            file:
              rel(file),
            line:
              i + 1,
            text:
              line.trim()
          });
      }
    }
  }

  return index;
}


/* ============================================================
 * IMPORT / EXPORT INDEX
 * ============================================================
 */

function buildImportExportIndex() {
  const imports = [];
  const exports = [];

  for (
    const file
    of sourceFiles()
  ) {
    const content =
      read(file);

    if (!content)
      continue;

    const lines =
      content.split(/\r?\n/);

    for (
      let i = 0;
      i < lines.length;
      i++
    ) {
      const line =
        lines[i];

      if (
        /\bimport\b/.test(line)
      ) {
        imports.push({
          file:
            rel(file),
          line:
            i + 1,
          text:
            line.trim()
        });
      }

      if (
        /\bexport\b/.test(line)
      ) {
        exports.push({
          file:
            rel(file),
          line:
            i + 1,
          text:
            line.trim()
        });
      }
    }
  }

  return {
    imports,
    exports
  };
}


/* ============================================================
 * REFERENCE INDEX
 * ============================================================
 */

function findReferences(
  identifier
) {
  if (!identifier)
    return [];

  const escaped =
    identifier.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );

  const regex =
    new RegExp(
      `\\b${escaped}\\b`
    );

  const results = [];

  for (
    const file
    of sourceFiles()
  ) {
    const content =
      read(file);

    if (!content)
      continue;

    const lines =
      content.split(/\r?\n/);

    for (
      let i = 0;
      i < lines.length;
      i++
    ) {
      if (
        regex.test(lines[i])
      ) {
        results.push({
          file:
            rel(file),
          line:
            i + 1,
          scope:
            classifyScope(file),
          text:
            lines[i].trim()
        });
      }
    }
  }

  return results;
}


/* ============================================================
 * ALTERNATIVE SYMBOL SEARCH
 * ============================================================
 */

function normalizedIdentifier(value) {
  return value
    .replace(
      /([a-z0-9])([A-Z])/g,
      '$1 $2'
    )
    .toLowerCase()
    .replace(
      /[_-]/g,
      ' '
    )
    .trim();
}

function similarity(a, b) {
  const at =
    normalizedIdentifier(a)
      .split(/\s+/)
      .filter(Boolean);

  const bt =
    normalizedIdentifier(b)
      .split(/\s+/)
      .filter(Boolean);

  if (!at.length || !bt.length)
    return 0;

  let score = 0;

  for (const token of at) {
    if (
      bt.some(
        x =>
          x === token ||
          x.includes(token) ||
          token.includes(x)
      )
    ) {
      score++;
    }
  }

  return score / at.length;
}

function findAlternatives(
  identifier,
  declarationIndex
) {
  if (!identifier)
    return [];

  const candidates = [];

  for (
    const [name, declarations]
    of declarationIndex.entries()
  ) {
    if (
      name === identifier
    )
      continue;

    const score =
      similarity(
        identifier,
        name
      );

    if (score >= 0.5) {
      candidates.push({
        name,
        score,
        declarations:
          declarations.slice(0, 5)
      });
    }
  }

  return candidates
    .sort(
      (a, b) =>
        b.score - a.score
    )
    .slice(0, 15);
}


/* ============================================================
 * SPECIAL REPOSITORY SEMANTICS
 * ============================================================
 */

function determineKnownStatus(
  diagnostic
) {
  const message =
    diagnostic.message;

  const ids =
    identifiers(message);

  /*
   * DEF-001:
   *
   * recordValuationSnapshot was deliberately
   * removed as part of the observation timestamp
   * remediation.
   */

  if (
    ids.includes(
      'recordValuationSnapshot'
    )
  ) {
    return {
      remediation:
        'SAFE_REMOVE_STALE_IMPORT',
      confidence:
        'HIGH',
      reason:
        'DEF-001 removed the dead valuation snapshot helper. Current repository contains no declaration.'
    };
  }

  /*
   * FERE canonical type:
   *
   * ClaimOutcome is not the repository's
   * canonical type.
   */

  if (
    ids.includes(
      'ClaimOutcome'
    )
  ) {
    return {
      remediation:
        'VERIFY_CLAIM_STATUS_MAPPING',
      confidence:
        'REVIEW_REQUIRED',
      reason:
        'Repository contains canonical ClaimStatus values. Replacement must be semantically checked; do not blindly rename.'
    };
  }

  /*
   * ContradictionStatus versus ContradictionState.
   */

  if (
    ids.includes(
      'ContradictionStatus'
    )
  ) {
    return {
      remediation:
        'VERIFY_CONTRADICTION_STATE_MAPPING',
      confidence:
        'REVIEW_REQUIRED',
      reason:
        'Repository contains ContradictionState. Must determine whether caller means state or resolution status.'
    };
  }

  /*
   * Missing method.
   */

  if (
    diagnostic.code ===
      'TS2339' &&
    /Property '([^']+)' does not exist/.test(
      message
    )
  ) {
    return {
      remediation:
        'MISSING_API_CONTRACT',
      confidence:
        'REVIEW_REQUIRED',
      reason:
        'A missing method/property must not be fabricated. Search callers and current service API before implementation.'
    };
  }

  /*
   * Missing module.
   */

  if (
    diagnostic.code ===
      'TS2307'
  ) {
    return {
      remediation:
        'MISSING_MODULE',
      confidence:
        'REVIEW_REQUIRED',
      reason:
        'Determine whether module was renamed, deleted, misplaced, or genuinely required.'
    };
  }

  /*
   * Object literal mismatch.
   */

  if (
    diagnostic.code ===
      'TS2561' ||
    diagnostic.code ===
      'TS2353'
  ) {
    return {
      remediation:
        'INTERFACE_DRIFT',
      confidence:
        'REVIEW_REQUIRED',
      reason:
        'Caller and interface disagree. Must inspect canonical interface and all consumers.'
    };
  }

  /*
   * Rename suggestion.
   */

  if (
    diagnostic.code ===
      'TS2551'
  ) {
    return {
      remediation:
        'RENAME_CANDIDATE',
      confidence:
        'REVIEW_REQUIRED',
      reason:
        'Compiler suggests a replacement, but semantic equivalence must be established.'
    };
  }

  /*
   * Union mismatch.
   */

  if (
    diagnostic.code ===
      'TS2367'
  ) {
    return {
      remediation:
        'UNION_OR_STATE_MACHINE_DRIFT',
      confidence:
        'REVIEW_REQUIRED',
      reason:
        'Comparison is inconsistent with current domain state model.'
    };
  }

  /*
   * Signature mismatch.
   */

  if (
    diagnostic.code ===
      'TS2554'
  ) {
    return {
      remediation:
        'SIGNATURE_DRIFT',
      confidence:
        'REVIEW_REQUIRED',
      reason:
        'Caller argument count differs from implementation contract.'
    };
  }

  /*
   * Private access.
   */

  if (
    diagnostic.code ===
      'TS2341'
  ) {
    return {
      remediation:
        'ENCAPSULATION_VIOLATION',
      confidence:
        'REVIEW_REQUIRED',
      reason:
        'Do not make private APIs public merely to satisfy compilation.'
    };
  }

  /*
   * Missing variable.
   */

  if (
    diagnostic.code ===
      'TS18004'
  ) {
    return {
      remediation:
        'MISSING_RUNTIME_VALUE',
      confidence:
        'REVIEW_REQUIRED',
      reason:
        'Missing variable may affect runtime semantics; do not fabricate.'
    };
  }

  return {
    remediation:
      'MANUAL_SOURCE_REVIEW',
    confidence:
      'REVIEW_REQUIRED',
    reason:
      'No deterministic remediation rule exists.'
  };
}


/* ============================================================
 * DIAGNOSTIC ENRICHMENT
 * ============================================================
 */

function enrichDiagnostic(
  diagnostic,
  declarationIndex
) {
  const file =
    abs(
      diagnostic.file
    );

  const scope =
    classifyScope(file);

  const ids =
    identifiers(
      diagnostic.message
    );

  const primaryIdentifier =
    ids[0] || null;

  const refs =
    primaryIdentifier
      ? findReferences(
          primaryIdentifier
        )
      : [];

  const alternatives =
    primaryIdentifier
      ? findAlternatives(
          primaryIdentifier,
          declarationIndex
        )
      : [];

  const known =
    determineKnownStatus(
      diagnostic
    );

  const declarations =
    primaryIdentifier
      ? (
          declarationIndex.get(
            primaryIdentifier
          ) || []
        )
      : [];

  return {
    ...diagnostic,

    scope,

    classification:
      classifyCode(
        diagnostic.code
      ),

    identifiers:
      ids,

    primaryIdentifier,

    compilerSuggestion:
      compilerSuggestion(
        diagnostic.message
      ),

    referencedTypes:
      typeNames(
        diagnostic.message
      ),

    declarations,

    references:
      refs.slice(0, 100),

    alternatives,

    remediation:
      known.remediation,

    confidence:
      known.confidence,

    remediationReason:
      known.reason,

    productionImpact:
      scope === 'PRODUCTION_PATH'
        ? 'DIRECT'
        : scope === 'TEST'
          ? 'TEST_ONLY'
          : scope ===
              'RESEARCH_OR_EXPERIMENTAL'
            ? 'RESEARCH_OR_EXPERIMENTAL'
            : 'INDIRECT'
  };
}


/* ============================================================
 * SAFE FIX ENGINE
 * ============================================================
 */

function isFrozen(file) {
  const normalized =
    rel(file);

  return Object.prototype
    .hasOwnProperty.call(
      FROZEN_CONTROLS,
      normalized
    );
}

function replaceExactly(
  file,
  oldText,
  newText
) {
  if (isFrozen(file)) {
    throw new Error(
      `FROZEN FILE: ${rel(file)}`
    );
  }

  const content =
    read(file);

  if (content === null)
    return false;

  const count =
    content.split(
      oldText
    ).length - 1;

  if (count !== 1) {
    throw new Error(
      `Expected exactly one occurrence in ${rel(file)}, found ${count}`
    );
  }

  fs.writeFileSync(
    file,
    content.replace(
      oldText,
      newText
    ),
    'utf8'
  );

  return true;
}

function applySafeFixes(
  diagnostics
) {
  const applied = [];
  const skipped = [];

  for (
    const diagnostic
    of diagnostics
  ) {
    /*
     * --------------------------------------------------------
     * SAFE FIX:
     *
     * recordValuationSnapshot
     *
     * This is explicitly known from DEF-001 to be
     * dead/removed functionality.
     * --------------------------------------------------------
     */

    if (
      diagnostic.remediation ===
      'SAFE_REMOVE_STALE_IMPORT'
    ) {
      const file =
        abs(
          diagnostic.file
        );

      const content =
        read(file);

      if (!content) {
        skipped.push({
          diagnostic,
          reason:
            'FILE_UNREADABLE'
        });

        continue;
      }

      /*
       * Remove only the named import.
       *
       * Supports:
       *
       *   recordValuationSnapshot
       *
       * and:
       *
       *   recordValuationSnapshot,
       */

      const patterns = [
        '  recordValuationSnapshot,\n',
        '  recordValuationSnapshot,\r\n',
        '  recordValuationSnapshot\n',
        '  recordValuationSnapshot\r\n',
        'recordValuationSnapshot,\n',
        'recordValuationSnapshot,\r\n'
      ];

      let fixed = false;

      for (
        const oldText
        of patterns
      ) {
        if (
          content.includes(
            oldText
          )
        ) {
          replaceExactly(
            file,
            oldText,
            ''
          );

          fixed = true;

          break;
        }
      }

      if (fixed) {
        applied.push({
          file:
            diagnostic.file,
          line:
            diagnostic.line,
          code:
            diagnostic.code,
          action:
            'REMOVE_STALE_RECORD_VALUATION_SNAPSHOT_IMPORT',
          basis:
            'DEF-001 confirmed dead helper removal'
        });
      } else {
        skipped.push({
          diagnostic,
          reason:
            'SAFE_PATTERN_NOT_FOUND'
        });
      }

      continue;
    }

    /*
     * Everything else remains untouched.
     */

    skipped.push({
      diagnostic,
      reason:
        'SEMANTIC_REVIEW_REQUIRED'
    });
  }

  return {
    applied,
    skipped
  };
}


/* ============================================================
 * REMEDIATION PLAN
 * ============================================================
 */

function buildPlan(
  diagnostics
) {
  const plan = [];

  for (
    const d
    of diagnostics
  ) {
    const item = {
      id:
        `${d.code}-${d.file}-${d.line}`,

      file:
        d.file,

      line:
        d.line,

      column:
        d.column,

      code:
        d.code,

      message:
        d.message,

      scope:
        d.scope,

      classification:
        d.classification,

      productionImpact:
        d.productionImpact,

      identifier:
        d.primaryIdentifier,

      compilerSuggestion:
        d.compilerSuggestion,

      declarations:
        d.declarations,

      references:
        d.references.slice(0, 20),

      alternatives:
        d.alternatives,

      remediation:
        d.remediation,

      confidence:
        d.confidence,

      basis:
        d.remediationReason,

      action:
        actionFor(d)
    };

    plan.push(item);
  }

  return plan;
}

function actionFor(d) {
  switch (
    d.remediation
  ) {
    case 'SAFE_REMOVE_STALE_IMPORT':
      return 'AUTO_SAFE';

    case 'VERIFY_CLAIM_STATUS_MAPPING':
      return 'INSPECT_CANONICAL_TYPE_AND_MAP';

    case 'VERIFY_CONTRADICTION_STATE_MAPPING':
      return 'INSPECT_CANONICAL_STATE_MODEL';

    case 'MISSING_API_CONTRACT':
      return 'TRACE_CALLERS_AND_IMPLEMENT_CANONICAL_METHOD';

    case 'MISSING_MODULE':
      return 'TRACE_IMPORT_AND_RESTORE_OR_REMOVE_BASED_ON_USAGE';

    case 'INTERFACE_DRIFT':
      return 'COMPARE_CALLER_WITH_CANONICAL_INTERFACE';

    case 'RENAME_CANDIDATE':
      return 'VERIFY_SEMANTIC_RENAME_BEFORE_CHANGE';

    case 'UNION_OR_STATE_MACHINE_DRIFT':
      return 'RECONCILE_DOMAIN_STATE_MODEL';

    case 'SIGNATURE_DRIFT':
      return 'COMPARE_ALL_CALLERS_WITH_CANONICAL_SIGNATURE';

    case 'ENCAPSULATION_VIOLATION':
      return 'USE_PUBLIC_API_OR_ADD_EXPLICIT_PUBLIC_METHOD_ONLY_IF_REQUIRED';

    case 'MISSING_RUNTIME_VALUE':
      return 'TRACE_DATA_FLOW_AND_RESTORE_REAL_VALUE';

    default:
      return 'MANUAL_SOURCE_REVIEW';
  }
}


/* ============================================================
 * REPORT GENERATION
 * ============================================================
 */

function generateDiagnosticMarkdown(
  report
) {
  const lines = [];

  lines.push(
    '# WEALTHOS Wave 3.7.1 TypeScript Diagnostic'
  );

  lines.push('');

  lines.push(
    `- Commit: \`${report.sourceCommit}\``
  );

  lines.push(
    `- Evaluated: ${report.evaluatedAt}`
  );

  lines.push(
    `- TypeScript exit code: ${report.tsc.exitCode}`
  );

  lines.push(
    `- Diagnostics: ${report.diagnostics.length}`
  );

  lines.push(
    `- Safe fixes applied: ${report.remediation.applied.length}`
  );

  lines.push('');

  lines.push(
    '## Error Classification'
  );

  lines.push('');

  const counts = {};

  for (
    const d
    of report.diagnostics
  ) {
    const key =
      `${d.classification} / ${d.scope}`;

    counts[key] =
      (counts[key] || 0) + 1;
  }

  for (
    const [key, value]
    of Object.entries(counts)
  ) {
    lines.push(
      `- ${key}: ${value}`
    );
  }

  lines.push('');

  lines.push(
    '## Remediation Summary'
  );

  lines.push('');

  const remediationCounts = {};

  for (
    const d
    of report.diagnostics
  ) {
    remediationCounts[
      d.remediation
    ] =
      (
        remediationCounts[
          d.remediation
        ] || 0
      ) + 1;
  }

  for (
    const [key, value]
    of Object.entries(
      remediationCounts
    )
  ) {
    lines.push(
      `- ${key}: ${value}`
    );
  }

  lines.push('');

  lines.push(
    '## Diagnostics'
  );

  lines.push('');

  for (
    const d
    of report.diagnostics
  ) {
    lines.push(
      `### ${d.code} — ${d.file}:${d.line}:${d.column}`
    );

    lines.push('');

    lines.push(
      `**Scope:** ${d.scope}`
    );

    lines.push(
      `**Classification:** ${d.classification}`
    );

    lines.push(
      `**Production impact:** ${d.productionImpact}`
    );

    lines.push(
      `**Remediation:** ${d.remediation}`
    );

    lines.push(
      `**Confidence:** ${d.confidence}`
    );

    lines.push('');

    lines.push(
      `> ${d.message}`
    );

    lines.push('');

    if (
      d.primaryIdentifier
    ) {
      lines.push(
        `Identifier: \`${d.primaryIdentifier}\``
      );
    }

    if (
      d.compilerSuggestion
    ) {
      lines.push(
        `Compiler suggestion: \`${d.compilerSuggestion}\``
      );
    }

    if (
      d.declarations.length
    ) {
      lines.push('');
      lines.push(
        '**Existing declarations:**'
      );

      for (
        const x
        of d.declarations
          .slice(0, 10)
      ) {
        lines.push(
          `- ${x.file}:${x.line} — ${x.text}`
        );
      }
    }

    if (
      d.alternatives.length
    ) {
      lines.push('');
      lines.push(
        '**Candidate alternatives:**'
      );

      for (
        const x
        of d.alternatives
          .slice(0, 10)
      ) {
        lines.push(
          `- ${x.name} — similarity ${x.score.toFixed(2)}`
        );

        for (
          const declaration
          of x.declarations
        ) {
          lines.push(
            `  - ${declaration.file}:${declaration.line}`
          );
        }
      }
    }

    if (
      d.references.length
    ) {
      lines.push('');
      lines.push(
        '**References:**'
      );

      for (
        const x
        of d.references
          .slice(0, 10)
      ) {
        lines.push(
          `- ${x.file}:${x.line} [${x.scope}]`
        );
      }
    }

    lines.push('');

    lines.push(
      `**Required action:** ${actionFor(d)}`
    );

    lines.push('');
  }

  return lines.join('\n');
}


function generatePlanMarkdown(
  plan,
  sourceCommit
) {
  const lines = [];

  lines.push(
    '# WEALTHOS Wave 3.7.1 Interface Remediation Plan'
  );

  lines.push('');

  lines.push(
    `Source commit: \`${sourceCommit}\``
  );

  lines.push('');

  lines.push(
    'This plan is evidence-derived from the actual TypeScript compiler output and repository symbol graph.'
  );

  lines.push('');

  lines.push(
    '## Important'
  );

  lines.push('');

  lines.push(
    '- Missing methods are not fabricated.'
  );

  lines.push(
    '- Interfaces are not weakened to satisfy callers.'
  );

  lines.push(
    '- `any`, `@ts-ignore`, `@ts-expect-error`, and tsconfig exclusions are prohibited.'
  );

  lines.push(
    '- Frozen controls remain immutable.'
  );

  lines.push('');

  lines.push(
    '| File | Line | Code | Scope | Classification | Remediation | Confidence |'
  );

  lines.push(
    '|---|---:|---|---|---|---|---|'
  );

  for (
    const p
    of plan
  ) {
    lines.push(
      `| ${p.file} | ${p.line} | ${p.code} | ${p.scope} | ${p.classification} | ${p.remediation} | ${p.confidence} |`
    );
  }

  lines.push('');

  return lines.join('\n');
}


/* ============================================================
 * MAIN
 * ============================================================
 */

function main() {
  fs.mkdirSync(
    REPORT_DIR,
    { recursive: true }
  );

  console.log('');
  console.log(
    '================================================'
  );
  console.log(
    'WEALTHOS WAVE 3.7.1'
  );
  console.log(
    'DETERMINISTIC TYPESCRIPT DIAGNOSTIC'
  );
  console.log(
    '================================================'
  );

  /*
   * ----------------------------------------------------------
   * Frozen controls BEFORE
   * ----------------------------------------------------------
   */

  const frozenBefore =
    verifyFrozenControls();

  if (!frozenBefore.pass) {
    console.error(
      'STOP: FROZEN CONTROL VIOLATION'
    );

    console.error(
      JSON.stringify(
        frozenBefore,
        null,
        2
      )
    );

    process.exit(3);
  }

  const sourceCommit =
    currentCommit();

  const workingTreeBefore =
    workingTree();

  console.log(
    `Commit: ${sourceCommit}`
  );

  /*
   * ----------------------------------------------------------
   * TypeScript
   * ----------------------------------------------------------
   */

  console.log(
    'Running npx tsc --noEmit ...'
  );

  const tsc =
    run(
      'npx tsc --noEmit'
    );

  const diagnostics =
    parseDiagnostics(
      `${tsc.stdout}\n${tsc.stderr}`
    );

  console.log(
    `Diagnostics captured: ${diagnostics.length}`
  );

  /*
   * ----------------------------------------------------------
   * Build source indexes
   * ----------------------------------------------------------
   */

  console.log(
    'Building repository declaration index ...'
  );

  const declarationIndex =
    buildDeclarationIndex();

  console.log(
    `Declarations indexed: ${declarationIndex.size}`
  );

  const importExportIndex =
    buildImportExportIndex();

  /*
   * ----------------------------------------------------------
   * Enrich diagnostics
   * ----------------------------------------------------------
   */

  let enriched =
    diagnostics.map(
      d =>
        enrichDiagnostic(
          d,
          declarationIndex
        )
    );

  if (
    PRODUCTION_ONLY
  ) {
    enriched =
      enriched.filter(
        d =>
          d.scope ===
          'PRODUCTION_PATH'
      );
  }

  /*
   * ----------------------------------------------------------
   * Safe remediation
   * ----------------------------------------------------------
   */

  let remediation = {
    applied: [],
    skipped: []
  };

  if (
    APPLY_SAFE
  ) {
    console.log(
      'Applying deterministic safe fixes only ...'
    );

    remediation =
      applySafeFixes(
        enriched
      );
  }

  /*
   * ----------------------------------------------------------
   * Verify frozen controls AFTER
   * ----------------------------------------------------------
   */

  const frozenAfter =
    verifyFrozenControls();

  if (!frozenAfter.pass) {
    console.error(
      'STOP: FROZEN CONTROL CHANGED'
    );

    console.error(
      JSON.stringify(
        frozenAfter,
        null,
        2
      )
    );

    process.exit(3);
  }

  /*
   * ----------------------------------------------------------
   * Optional rerun
   * ----------------------------------------------------------
   */

  let rerun = null;

  if (
    RERUN &&
    remediation.applied.length
  ) {
    console.log(
      'Re-running TypeScript after safe fixes ...'
    );

    rerun =
      run(
        'npx tsc --noEmit'
      );
  }

  /*
   * ----------------------------------------------------------
   * Final state
   * ----------------------------------------------------------
   */

  const finalExitCode =
    rerun
      ? rerun.exitCode
      : tsc.exitCode;

  const finalOutput =
    rerun
      ? `${rerun.stdout}\n${rerun.stderr}`
      : `${tsc.stdout}\n${tsc.stderr}`;

  const finalDiagnostics =
    rerun
      ? parseDiagnostics(
          finalOutput
        )
      : diagnostics;

  /*
   * ----------------------------------------------------------
   * Plan
   * ----------------------------------------------------------
   */

  const plan =
    buildPlan(
      enriched
    );

  /*
   * ----------------------------------------------------------
   * Safety summary
   * ----------------------------------------------------------
   */

  const summary = {
    initialDiagnosticCount:
      diagnostics.length,

    finalDiagnosticCount:
      finalDiagnostics.length,

    productionErrors:
      enriched.filter(
        d =>
          d.scope ===
          'PRODUCTION_PATH'
      ).length,

    testErrors:
      enriched.filter(
        d =>
          d.scope ===
          'TEST'
      ).length,

    researchErrors:
      enriched.filter(
        d =>
          d.scope ===
          'RESEARCH_OR_EXPERIMENTAL'
      ).length,

    highConfidenceSafeFixes:
      enriched.filter(
        d =>
          d.confidence ===
          'HIGH'
      ).length,

    reviewRequired:
      enriched.filter(
        d =>
          d.confidence !==
          'HIGH'
      ).length
  };

  /*
   * ----------------------------------------------------------
   * Report
   * ----------------------------------------------------------
   */

  const report = {
    schemaVersion:
      '3.7.1',

    evaluatedAt:
      new Date().toISOString(),

    sourceCommit,

    workingTreeBefore,

    workingTreeAfter:
      workingTree(),

    mode:
      APPLY_SAFE
        ? RERUN
          ? 'APPLY_SAFE_AND_RERUN'
          : 'APPLY_SAFE'
        : 'DIAGNOSE_ONLY',

    frozenControls: {
      before:
        frozenBefore,

      after:
        frozenAfter
    },

    tsc: {
      command:
        'npx tsc --noEmit',

      initialExitCode:
        tsc.exitCode,

      finalExitCode,

      initialStdout:
        tsc.stdout,

      initialStderr:
        tsc.stderr,

      rerun:
        rerun
          ? {
              exitCode:
                rerun.exitCode,
              stdout:
                rerun.stdout,
              stderr:
                rerun.stderr
            }
          : null
    },

    summary,

    diagnostics:
      enriched,

    remediation,

    plan
  };

  fs.writeFileSync(
    JSON_REPORT,
    JSON.stringify(
      report,
      null,
      2
    ) + '\n',
    'utf8'
  );

  fs.writeFileSync(
    MD_REPORT,
    generateDiagnosticMarkdown(
      report
    ),
    'utf8'
  );

  fs.writeFileSync(
    PLAN_JSON,
    JSON.stringify(
      {
        schemaVersion:
          '3.7.1',

        sourceCommit,

        generatedAt:
          report.evaluatedAt,

        summary,

        plan
      },
      null,
      2
    ) + '\n',
    'utf8'
  );

  fs.writeFileSync(
    PLAN_MD,
    generatePlanMarkdown(
      plan,
      sourceCommit
    ),
    'utf8'
  );

  /*
   * ----------------------------------------------------------
   * Console
   * ----------------------------------------------------------
   */

  console.log('');
  console.log(
    '================================================'
  );
  console.log(
    'RESULT'
  );
  console.log(
    '================================================'
  );

  console.log(
    `Initial errors: ${summary.initialDiagnosticCount}`
  );

  console.log(
    `Production-path errors: ${summary.productionErrors}`
  );

  console.log(
    `Test errors: ${summary.testErrors}`
  );

  console.log(
    `Research/experimental errors: ${summary.researchErrors}`
  );

  console.log(
    `High-confidence safe fixes: ${summary.highConfidenceSafeFixes}`
  );

  console.log(
    `Review required: ${summary.reviewRequired}`
  );

  console.log(
    `Safe fixes applied: ${remediation.applied.length}`
  );

  console.log(
    `Final TypeScript errors: ${summary.finalDiagnosticCount}`
  );

  console.log('');

  console.log(
    `Diagnostic JSON: ${rel(JSON_REPORT)}`
  );

  console.log(
    `Diagnostic MD:   ${rel(MD_REPORT)}`
  );

  console.log(
    `Plan JSON:       ${rel(PLAN_JSON)}`
  );

  console.log(
    `Plan MD:         ${rel(PLAN_MD)}`
  );

  console.log(
    '================================================'
  );

  /*
   * ----------------------------------------------------------
   * Exit
   * ----------------------------------------------------------
   */

  if (
    finalDiagnostics.length === 0
  ) {
    process.exit(0);
  }

  process.exit(1);
}


try {
  main();
} catch (error) {
  console.error(
    error &&
    error.stack
      ? error.stack
      : String(error)
  );

  process.exit(2);
}
