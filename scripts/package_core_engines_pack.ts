/**
 * scripts/package_core_engines_pack.ts
 *
 * Generates a streamlined WealthOS v6.3 Core Engines Pack XML (~280k tokens)
 * containing all production S1–S11 engines, ExecutionSimulator, FrozenSignalAdapter,
 * TradingCalendar, schemas 001-012, and core services.
 * Leaves plenty of headroom (over 700k tokens) for data chunks in Google AI Studio!
 */

import fs from 'node:fs';
import path from 'node:path';

const WORKSPACE_ROOT = process.cwd();
const OUTPUT_XML = path.join(WORKSPACE_ROOT, 'data', 'WealthOS_v6.3_Core_Engines_Pack.xml');

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

function main() {
  console.log('Building Streamlined Core Engines Pack XML for Google AI Studio...');

  const filesToInclude: string[] = [];

  // 1. All Research Services (S1-S11 adapter, ExecutionSimulator, Calendar, etc.)
  const researchFiles = getFilesRecursively(path.join(WORKSPACE_ROOT, 'src', 'server', 'services', 'research'), '.ts');
  for (const f of researchFiles) {
    filesToInclude.push(path.relative(WORKSPACE_ROOT, f).replace(/\\/g, '/'));
  }

  // 2. Frozen Production Strategy Baseline Engines & Core Services
  const coreServices = [
    'PureTechnicalStrategiesEngine.ts',
    'NewTechnicalStrategiesEngine.ts',
    'SignalQualityOverlay.ts',
    'CapitalProtectionEngine.ts',
    'StrategyParameterConfig.ts',
    'UpstoxIntradayIngestor.ts',
    'GreenfieldRebalanceService.ts',
    'MomentumVpaEngine.ts',
    'SmartMoneyConceptsEngine.ts',
    'SmartMoneyFlowEngine.ts',
    'ForensicScoringService.ts',
    'ForensicIntelligenceService.ts',
    'ForensicValuationService.ts',
    'ConsolidatedOpportunityEngine.ts',
    'OpportunityScannerEngine.ts',
    'TaxHarvestingEngine.ts',
    'RebalancingEngine.ts',
    'PostTaxXirrService.ts'
  ];
  for (const cs of coreServices) {
    const rel = `src/server/services/${cs}`;
    if (fs.existsSync(path.join(WORKSPACE_ROOT, rel))) {
      filesToInclude.push(rel);
    }
  }

  // 3. Database Schemas
  const dbFiles = getFilesRecursively(path.join(WORKSPACE_ROOT, 'db'), '.sql');
  for (const f of dbFiles) {
    filesToInclude.push(path.relative(WORKSPACE_ROOT, f).replace(/\\/g, '/'));
  }

  // 4. Data Contract & Replay Scripts
  filesToInclude.push('data/v6.3_DATA_CONTRACT.json');
  filesToInclude.push('scripts/run_phase2_pilot_replay.ts');

  // Build XML
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<wealthos_core_engines_pack>\n';
  xml += '  <metadata>\n';
  xml += '    <app_name>WealthOS / ITAS v6.3 Core Production Engines & Execution Simulator</app_name>\n';
  xml += `    <timestamp>${new Date().toISOString()}</timestamp>\n`;
  xml += '    <version>v6.3.0-STREAMLINED</version>\n';
  xml += '    <token_budget_target>&lt; 300,000 tokens</token_budget_target>\n';
  xml += '  </metadata>\n\n';

  for (const rel of filesToInclude) {
    const fullPath = path.join(WORKSPACE_ROOT, rel);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      xml += `  <file path="${escapeXml(rel)}">\n`;
      xml += `<![CDATA[${content}]]>\n`;
      xml += '  </file>\n\n';
    }
  }

  xml += '</wealthos_core_engines_pack>\n';
  fs.writeFileSync(OUTPUT_XML, xml, 'utf8');

  console.log(`✓ Generated Streamlined Core Pack: ${OUTPUT_XML}`);
  console.log(`✓ Files included: ${filesToInclude.length}`);
  console.log(`✓ Total size: ${(xml.length / (1024 * 1024)).toFixed(2)} MB (~${Math.round(xml.length / 3.7).toLocaleString()} tokens)`);
}

main();
