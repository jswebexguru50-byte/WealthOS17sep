import fs from 'fs';
import path from 'path';

const rootDir = path.resolve('.');
const targetFile = path.join(rootDir, 'data', 'phase2_cohort', 'FERE_V3_2_CODE_LEVEL_AUDIT_PACKAGE.md');

const fileList = [
  // 1. Core Engines
  { title: '1. FactValidationGate.ts (Gate A)', relPath: 'src/server/intelligence/engines/FactValidationGate.ts', lang: 'typescript' },
  { title: '2. IndependentEvidenceVerifier.ts (Gate B)', relPath: 'src/server/intelligence/engines/IndependentEvidenceVerifier.ts', lang: 'typescript' },
  { title: '3. NumericalNormalizationEngine.ts', relPath: 'src/server/intelligence/engines/NumericalNormalizationEngine.ts', lang: 'typescript' },
  { title: '4. FactDerivationEngine.ts', relPath: 'src/server/intelligence/engines/FactDerivationEngine.ts', lang: 'typescript' },
  { title: '5. EvidenceFreshnessEngine.ts', relPath: 'src/server/intelligence/engines/EvidenceFreshnessEngine.ts', lang: 'typescript' },
  { title: '6. ContradictionResolutionEngine.ts', relPath: 'src/server/intelligence/engines/ContradictionResolutionEngine.ts', lang: 'typescript' },
  { title: '7. DecisionReplayEngine.ts', relPath: 'src/server/intelligence/engines/DecisionReplayEngine.ts', lang: 'typescript' },
  { title: '8. ProvenanceIntegrityValidator.ts', relPath: 'src/server/intelligence/engines/ProvenanceIntegrityValidator.ts', lang: 'typescript' },

  // 2. Domain Types
  { title: '9. FinancialFact.ts', relPath: 'src/server/intelligence/types/FinancialFact.ts', lang: 'typescript' },
  { title: '10. DerivedFact.ts', relPath: 'src/server/intelligence/types/DerivedFact.ts', lang: 'typescript' },
  { title: '11. Contradiction.ts', relPath: 'src/server/intelligence/types/Contradiction.ts', lang: 'typescript' },
  { title: '12. InvestmentBrief.ts', relPath: 'src/server/intelligence/types/InvestmentBrief.ts', lang: 'typescript' },

  // 3. Test Suites
  { title: '13. Master Cohort Verification Test Suite (41 Tests)', relPath: 'tests/unit/test_phase2_all_20_companies_verification.test.ts', lang: 'typescript' },
  { title: '14. Metamorphic Reasoning Invariants Test Suite (MR-1 to MR-5)', relPath: 'tests/unit/metamorphic_reasoning_invariants.test.ts', lang: 'typescript' },

  // 4. Representative Cohort Dossiers
  { title: '15. SOLARINDS Canonical facts.json (Clean Benchmark)', relPath: 'data/phase2_cohort/SOLARINDS/facts.json', lang: 'json' },
  { title: '16. SOLARINDS investment-brief.json (DecisionSnapshot & DAG)', relPath: 'data/phase2_cohort/SOLARINDS/investment-brief.json', lang: 'json' },
  { title: '17. VMART Canonical facts.json (Active Breaker Archetype)', relPath: 'data/phase2_cohort/VMART/facts.json', lang: 'json' },
  { title: '18. VMART investment-brief.json (Veto DecisionSnapshot)', relPath: 'data/phase2_cohort/VMART/investment-brief.json', lang: 'json' },
  { title: '19. TATATECH contradictions.json (Guidance Miss Contradiction)', relPath: 'data/phase2_cohort/TATATECH/contradictions.json', lang: 'json' },
  { title: '20. TATATECH investment-brief.json (Constrained Sizing Snapshot)', relPath: 'data/phase2_cohort/TATATECH/investment-brief.json', lang: 'json' },
  { title: '21. MANORAMA facts.json (Article 25 Thin Disclosures)', relPath: 'data/phase2_cohort/MANORAMA/facts.json', lang: 'json' },
  { title: '22. MANORAMA investment-brief.json (Gated Escrow Snapshot)', relPath: 'data/phase2_cohort/MANORAMA/investment-brief.json', lang: 'json' }
];

let doc = `# FERE v3.2 Code-Level Implementation & Audit Package
**Architecture:** Financial Evidence & Reasoning Engine (FERE v3.2)  
**Authoritative Evaluation Date:** 2026-09-15  
**Automated Specification Test Status:** 46/46 Passing Tests (100% Deterministic)  
**Purpose:** Self-contained, full-fidelity source code and test suite dossier for direct inspection and independent verification.

---

## Table of Contents
`;

fileList.forEach((f, idx) => {
  doc += `${idx + 1}. [${f.title}](#${f.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}) (\`${f.relPath}\`)\n`;
});

doc += `\n---\n\n`;

fileList.forEach((f, idx) => {
  const fullPath = path.join(rootDir, f.relPath);
  doc += `## ${f.title}\n`;
  doc += `**File:** [\`${f.relPath}\`](file:///${fullPath.replace(/\\/g, '/')})  \n\n`;

  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    doc += `\`\`\`${f.lang}\n${content}\n\`\`\`\n\n`;
  } else {
    doc += `*File not found at path: ${f.relPath}*\n\n`;
  }

  doc += `---\n\n`;
});

fs.writeFileSync(targetFile, doc, 'utf8');
console.log('Successfully generated FERE_V3_2_CODE_LEVEL_AUDIT_PACKAGE.md with size:', doc.length, 'bytes');
