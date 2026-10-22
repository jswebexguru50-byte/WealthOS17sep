/**
 * scripts/package_for_google_ai_studio.ts
 *
 * PACKAGER FOR GOOGLE AI STUDIO (GEMINI 1.5 PRO 2M TOKEN CONTEXT)
 * Packages the entire WealthOS / ITAS v6.3 application, all capabilities,
 * research engines, test suites, schemas, and the complete Phase 2 research dataset
 * into an optimized single bundle ready for Google AI Studio ingestion.
 */

import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';

const WORKSPACE_ROOT = process.cwd();
const OUTPUT_XML = path.join(WORKSPACE_ROOT, 'data', 'WealthOS_v6.3_Google_AI_Studio_Complete_Pack.xml');
const OUTPUT_SQL = path.join(WORKSPACE_ROOT, 'data', 'v6.3_pilot_research_dataset_dump.sql');
const OUTPUT_JSON = path.join(WORKSPACE_ROOT, 'data', 'v6.3_pilot_research_dataset_dump.json');
const PROMPT_GUIDE = path.join(WORKSPACE_ROOT, 'GOOGLE_AI_STUDIO_GUIDE.md');

function runAllSql(db: sqlite3.Database, query: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getFilesRecursively(dir: string, extension: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath, extension));
    } else if (item.name.endsWith(extension)) {
      results.push(fullPath);
    }
  }
  return results;
}

async function main() {
  console.log('================================================================');
  console.log('   WEALTHOS / ITAS v6.3 — GOOGLE AI STUDIO BUNDLE PACKAGER      ');
  console.log('================================================================\n');

  // 1. Dump Phase 2 Pilot Research Database
  const dbPath = path.join(WORKSPACE_ROOT, 'data', 'portfolio_v6.3_pilot_research.db');
  console.log(`[Step 1/4] Dumping research database: ${dbPath}`);
  
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database not found at ${dbPath}`);
  }

  const db = new sqlite3.Database(dbPath);
  const tables = await runAllSql(db, "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  
  let sqlDump = `-- WEALTHOS / ITAS v6.3 AUTHORITATIVE RESEARCH DATABASE DUMP\n-- Generated: ${new Date().toISOString()}\n\n`;
  const datasetJson: Record<string, any[]> = {};

  for (const t of tables) {
    sqlDump += `${t.sql};\n\n`;
    const rows = await runAllSql(db, `SELECT * FROM ${t.name}`);
    datasetJson[t.name] = rows;

    for (const r of rows) {
      const keys = Object.keys(r);
      const vals = keys.map(k => {
        const v = r[k];
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'number') return v;
        return `'${String(v).replace(/'/g, "''")}'`;
      });
      sqlDump += `INSERT INTO ${t.name} (${keys.join(', ')}) VALUES (${vals.join(', ')});\n`;
    }
    sqlDump += '\n';
  }

  fs.writeFileSync(OUTPUT_SQL, sqlDump, 'utf8');
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(datasetJson, null, 2), 'utf8');
  console.log(`✓ Exported SQL dump: ${OUTPUT_SQL} (${(sqlDump.length / 1024).toFixed(1)} KB)`);
  console.log(`✓ Exported JSON dataset: ${OUTPUT_JSON} (${(fs.statSync(OUTPUT_JSON).size / 1024).toFixed(1)} KB)`);

  // 2. Discover all relevant files for Google AI Studio Bundle
  console.log('\n[Step 2/4] Collecting application codebase, schemas, tests, and documentation...');

  const filesToInclude: string[] = [];

  // (A) Master Specifications & Docs
  const docs = [
    'MASTER_APPLICATION_SPECIFICATION.md',
    'SPECS_UNIFIED_10_STRATEGY_PARAMETERIZATION.md',
    'SPECS_DATA_PIPELINE_AND_PARAMETERIZATION.md',
    'AUDIT_DATA_SOURCES.md',
    'README_E2E_RESEARCH.md',
    'package.json',
    'tsconfig.json'
  ];
  for (const d of docs) {
    if (fs.existsSync(path.join(WORKSPACE_ROOT, d))) {
      filesToInclude.push(d);
    }
  }

  // (B) All Research Services
  const researchFiles = getFilesRecursively(path.join(WORKSPACE_ROOT, 'src', 'server', 'services', 'research'), '.ts');
  for (const f of researchFiles) {
    filesToInclude.push(path.relative(WORKSPACE_ROOT, f).replace(/\\/g, '/'));
  }

  // (C) All Flagship Engines & Services in src/server/services/
  const keyServices = [
    'PureTechnicalStrategiesEngine.ts',
    'NewTechnicalStrategiesEngine.ts',
    'SignalQualityOverlay.ts',
    'CapitalProtectionEngine.ts',
    'StrategyParameterConfig.ts',
    'UpstoxIntradayIngestor.ts',
    'GreenfieldRebalanceService.ts',
    'PaperTradingPotService.ts',
    'MomentumVpaEngine.ts',
    'SmartMoneyConceptsEngine.ts',
    'SmartMoneyFlowEngine.ts',
    'ForensicScoringService.ts',
    'ForensicIntelligenceService.ts',
    'ForensicQualityAuditService.ts',
    'ForensicValuationService.ts',
    'ConsolidatedOpportunityEngine.ts',
    'OpportunityScannerEngine.ts',
    'MultibaggerDiscoveryEngine.ts',
    'IpoAnalysisEngine.ts',
    'PmsReconciliationService.ts',
    'PostTaxXirrService.ts',
    'TaxHarvestingEngine.ts',
    'RebalancingEngine.ts',
    'InstitutionalDossierReportGenerator.ts'
  ];
  for (const ks of keyServices) {
    const rel = `src/server/services/${ks}`;
    if (fs.existsSync(path.join(WORKSPACE_ROOT, rel))) {
      filesToInclude.push(rel);
    }
  }

  // (D) All DB Migrations and Schemas
  const dbFiles = getFilesRecursively(path.join(WORKSPACE_ROOT, 'db'), '.sql');
  for (const f of dbFiles) {
    filesToInclude.push(path.relative(WORKSPACE_ROOT, f).replace(/\\/g, '/'));
  }

  // (E) All Unit & Invariant Tests
  const testFiles = getFilesRecursively(path.join(WORKSPACE_ROOT, 'tests', 'unit'), '.ts');
  for (const f of testFiles) {
    filesToInclude.push(path.relative(WORKSPACE_ROOT, f).replace(/\\/g, '/'));
  }

  // (F) Pipeline & Replay Scripts
  const scripts = [
    'scripts/build_phase2_pilot_dataset.ts',
    'scripts/audit_candidate_coverage.ts'
  ];
  for (const sc of scripts) {
    if (fs.existsSync(path.join(WORKSPACE_ROOT, sc))) {
      filesToInclude.push(sc);
    }
  }

  // (G) Phase 2 Audit & Provenance Reports
  const dataReports = [
    'data/v6.3_DATA_CONTRACT.json',
    'data/v6.3_PILOT_COVERAGE_AUDIT.json',
    'data/v6.3_DATA_PROVENANCE_REPORT.json',
    'data/v6.3_UNIVERSE_INTEGRITY_REPORT.json',
    'data/v6.3_CORPORATE_ACTION_REPORT.json'
  ];
  for (const dr of dataReports) {
    if (fs.existsSync(path.join(WORKSPACE_ROOT, dr))) {
      filesToInclude.push(dr);
    }
  }

  // 3. Assemble Complete XML Pack for Google AI Studio
  console.log(`\n[Step 3/4] Assembling unified Google AI Studio XML pack across ${filesToInclude.length} files...`);
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<wealthos_application_and_dataset>\n';
  xml += '  <metadata>\n';
  xml += '    <app_name>WealthOS / ITAS v6.3 Empirical Research Engine & Portfolio Operating System</app_name>\n';
  xml += `    <timestamp>${new Date().toISOString()}</timestamp>\n`;
  xml += '    <architecture_version>v6.3.0-R1-PHASE2</architecture_version>\n';
  xml += '    <target_model>Gemini 1.5 Pro (Google AI Studio)</target_model>\n';
  xml += '    <invariants>\n';
  xml += '      <rule>1. Six production strategy engines are 100% frozen bit-for-bit.</rule>\n';
  xml += '      <rule>2. Next-bar-open execution strictly enforced.</rule>\n';
  xml += '      <rule>3. Zero synthetic fallback proxies permitted.</rule>\n';
  xml += '      <rule>4. Directive B: consumed record availableAt <= decisionTimestamp.</rule>\n';
  xml += '      <rule>5. Directive C: Zero signals or zero trades is a legitimate research outcome.</rule>\n';
  xml += '    </invariants>\n';
  xml += '  </metadata>\n\n';

  let totalFiles = 0;
  let totalBytes = 0;

  for (const relPath of filesToInclude) {
    const fullPath = path.join(WORKSPACE_ROOT, relPath);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, 'utf8');
    totalBytes += content.length;
    totalFiles++;

    xml += `  <file path="${escapeXml(relPath)}">\n`;
    xml += `<![CDATA[${content}]]>\n`;
    xml += '  </file>\n\n';
  }

  // Also embed the Complete Research Database SQL Dump
  xml += '  <file path="data/authoritative_phase2_research_dataset.sql">\n';
  xml += `<![CDATA[${sqlDump}]]>\n`;
  xml += '  </file>\n\n';
  totalBytes += sqlDump.length;
  totalFiles++;

  xml += '</wealthos_application_and_dataset>\n';

  fs.writeFileSync(OUTPUT_XML, xml, 'utf8');

  // Estimate tokens (roughly 1 token ≈ 4 characters of code/xml)
  const approxTokens = Math.round(xml.length / 3.8);

  console.log('\n[Step 4/4] Package completed successfully!');
  console.log('================================================================');
  console.log(`Bundle File:       ${OUTPUT_XML}`);
  console.log(`Files Included:    ${totalFiles}`);
  console.log(`Total Size:        ${(xml.length / (1024 * 1024)).toFixed(2)} MB (${xml.length.toLocaleString()} characters)`);
  console.log(`Estimated Tokens:  ~${approxTokens.toLocaleString()} tokens`);
  console.log(`Context Fit:       ${((approxTokens / 2000000) * 100).toFixed(1)}% of Gemini 1.5 Pro's 2,000,000 token window`);
  console.log('================================================================\n');

  // 4. Create Instructions Guide for the User
  const guideContent = `# How to Load WealthOS / ITAS v6.3 into Google AI Studio

This package contains the **full application, all capabilities (S1–S20 strategies, execution simulator, ablation engine, FERE forensic engines, portfolio rebalancing, tax engines, test suites)** and the **entire authoritative Phase 2 research dataset**.

---

## 1. Bundle Files Generated

1. **Complete Unified Pack (Codebase + Complete Dataset)**:
   - Path: \`data/WealthOS_v6.3_Google_AI_Studio_Complete_Pack.xml\`
   - Size: ~${(xml.length / (1024 * 1024)).toFixed(2)} MB (~${approxTokens.toLocaleString()} tokens)
   - Fits seamlessly in Gemini 1.5 Pro (only ~${((approxTokens / 2000000) * 100).toFixed(1)}% of the 2,000,000 token limit!)

2. **Standalone Research Database SQL Dump**:
   - Path: \`data/v6.3_pilot_research_dataset_dump.sql\`
   - Contains all table DDLs and 100% of data rows for:
     - \`DailyOHLCV\` (all 645 normalized bars across 5 pilot securities)
     - \`authoritative_trading_calendar\` (all 182 calendar sessions)
     - \`historical_universe_membership\`
     - \`corporate_actions\`
     - \`quarterly_financial_disclosures\`
     - \`shareholding_disclosures\`
     - \`forensic_accounting_health\`

3. **Standalone JSON Dataset**:
   - Path: \`data/v6.3_pilot_research_dataset_dump.json\`

---

## 2. Step-by-Step Instructions to Load in Google AI Studio

1. Open **[Google AI Studio](https://aistudio.google.com/)** in your browser.
2. In the top-right model selector, choose **Gemini 1.5 Pro** (this provides the full 2,000,000 token context window).
3. In the right-hand panel:
   - Set **Temperature** to \`0.1\` or \`0.0\` (for strict deterministic code and data reasoning).
4. In **System Instructions** (left/top panel), paste:
\`\`\`text
You are the Chief Quantitative Architect and Auditor for WealthOS / ITAS v6.3.
You have been provided with the complete application codebase, all capabilities, and the entire authoritative research dataset.
Enforce all core invariants:
- The 6 production baseline files are frozen.
- All executions strictly use next-tradable-bar open.
- Incomplete datasets fail closed (DATA_INSUFFICIENT).
- Directive B: A record is only leaked if consumed before its availableAt timestamp.
- Directive C: Zero signals or zero trades is a legitimate research outcome; do not synthesize trades.
Answer questions, audit implementations, inspect data, verify math, and run code analyses with mathematical rigor.
\`\`\`
5. In the chat prompt box, click the **\`+\` (Insert / Upload)** button or drag and drop:
   - \`data/WealthOS_v6.3_Google_AI_Studio_Complete_Pack.xml\`
6. Click **Send** or ask any query!

---

## 3. Example Queries You Can Ask Google AI Studio

* **Audit Invariants**: *"Audit the ExecutionSimulator and FrozenSignalAdapter to prove that no same-bar execution can ever occur and that Directive B is strictly enforced."*
* **Inspect Dataset**: *"Query the DailyOHLCV and authoritative_trading_calendar in the embedded dataset to verify if there are any missing sessions or non-positive delivery quantities for CANBK."*
* **Analyze Strategies**: *"Explain how strategies S1 through S11 generate signals and how the SignalQualityOverlay scores their quality."*
* **Verify Replay Math**: *"Walk through the execution simulator transaction cost calculations for a 100-share buy order at open with STT, brokerage, and GST."*
`;

  fs.writeFileSync(PROMPT_GUIDE, guideContent, 'utf8');
  console.log(`✓ Instructions written to: ${PROMPT_GUIDE}`);
}

main().catch(err => {
  console.error('Packaging failed:', err);
  process.exit(1);
});
