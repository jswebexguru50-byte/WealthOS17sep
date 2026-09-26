#!/usr/bin/env tsx
/**
 * Unified Fundamental Pipeline & Package Orchestrator
 * ===================================================
 * Runs end-to-end fundamental enrichment, official pledge extraction,
 * sovereign PLI tagging, and permanent database synchronization.
 *
 * Usage:
 *   npx tsx scripts/fundamental/run_fundamental_pipeline.ts [--excel "C:/Users/.../Six_Strategies_...xlsx"] [--skip-upstox]
 *   npm run enrich:fundamentals -- --excel "path/to/file.xlsx"
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.cwd());
const manifestPath = path.join(root, 'data', 'fundamental_enrichment', 'excel_strategy_manifest.json');

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (token.startsWith('--')) {
    args.set(token.slice(2), process.argv[i + 1]?.startsWith('--') ? 'true' : (process.argv[++i] || 'true'));
  }
}

const excelPath = args.get('excel');
const skipUpstox = args.get('skip-upstox') === 'true';

function runStep(name: string, command: string) {
  console.log(`\n======================================================`);
  console.log(`>>> [Step] ${name}`);
  console.log(`>>> Command: ${command}`);
  console.log(`======================================================`);
  try {
    execSync(command, { cwd: root, stdio: 'inherit' });
  } catch (e: any) {
    console.error(`[Error] Step failed: ${name}`);
    throw e;
  }
}

async function main() {
  console.log(`\n=== WEALTHOS UNIFIED FUNDAMENTAL ENRICHMENT PACKAGE ===`);
  console.log(`Started at: ${new Date().toISOString()}`);

  // Step 1: Ingest Excel workbook if provided
  if (excelPath && fs.existsSync(excelPath)) {
    console.log(`\n[Excel Ingestion] Parsing candidate workbook: ${excelPath}`);
    // Run python workbook parser to generate excel_strategy_manifest.json
    runStep(
      'Parse Excel Candidates',
      `python -c "
import openpyxl, json, os
wb = openpyxl.load_workbook(r'${excelPath}', data_only=True)
syms = set()
for sheet in wb.sheetnames:
    ws = wb[sheet]
    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 2: continue
    headers = [str(h or '').strip().lower() for h in rows[0]]
    idx = headers.index('symbol') if 'symbol' in headers else -1
    if idx >= 0:
        for r in rows[1:]:
            val = str(r[idx] or '').strip().upper()
            if val and val != 'NONE': syms.add(val)
manifest = {'sourceExcel': r'${excelPath}', 'totalSymbols': len(syms), 'symbols': sorted(list(syms))}
with open(r'${manifestPath}', 'w') as f: json.dump(manifest, f, indent=2)
print(f'Successfully extracted {len(syms)} unique symbols into ${manifestPath}')
"`
    );
  } else if (!fs.existsSync(manifestPath)) {
    console.error(`[Error] No candidate manifest found at ${manifestPath}. Please specify --excel <path>`);
    process.exit(1);
  }

  // Step 2: Upstox 7-Endpoint Fundamentals Enrichment
  if (!skipUpstox) {
    runStep(
      'Upstox 7-Endpoint Fundamentals Pull',
      `npx tsx scripts/fundamental/run_upstox_fundamental_enrichment.ts --group excelStrategyMatches`
    );
  } else {
    console.log(`[Info] Skipping Upstox pull (--skip-upstox passed).`);
  }

  // Step 3: Official NSE Shareholding & Promoter Pledge (Table II XBRL)
  runStep(
    'Official NSE Shareholding & Pledge Extraction',
    `python scripts/fundamental/enrich_pledge_official.py`
  );

  // Step 4: SME / BSE Exchange Disclosures Fallback
  runStep(
    'SME & BSE Exchange Fallback Enrichment',
    `python scripts/fundamental/enrich_remaining_final.py`
  );

  // Step 5: Sovereign PLI & Sunrise Sector Tagging
  runStep(
    'Sovereign PLI & Sunrise Sector Tagging',
    `python scripts/fundamental/tag_sunrise_pli.py`
  );

  // Step 6: Permanent Database Synchronization
  runStep(
    'Permanent Multi-Source Database Synchronization',
    `python scripts/fundamental/sync_verified_fundamentals_package.py --manifest "${manifestPath}"`
  );

  // Step 7: Final Audit & Coverage Check
  runStep(
    'Coverage Verification & Audit Report',
    `python scratch/analyze_coverage.py`
  );

  console.log(`\n======================================================`);
  console.log(`✅ [COMPLETE] All fundamental facts, ratios, pledge, and PLI`);
  console.log(`   alignments have been saved permanently in portfolio.db and fere_evidence.db.`);
  console.log(`======================================================\n`);
}

main().catch(e => {
  console.error('[Fatal Error]', e);
  process.exit(1);
});
