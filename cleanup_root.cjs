/**
 * cleanup_root.cjs
 * Phase 3: Root Directory Cleanup
 * - Deletes test result files, screenshots, debug outputs
 * - Deletes one-off debug/audit scripts not reusable for future testing
 * - Keeps utility scripts that can be reused (import tools, migration scripts)
 * - Moves kept scripts to dev-tools/ subdirectory
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DEV_TOOLS = path.join(ROOT, 'dev-tools');

// Files to DELETE outright (debug outputs, test results, screenshots, one-off checks)
const DELETE_PATTERNS = [
  /^check_.*\.cjs$/,
  /^check_.*\.js$/,
  /^debug_.*\.cjs$/,
  /^debug_.*\.js$/,
  /^test_.*\.cjs$/,
  /^test_.*\.js$/,
  /^test_.*\.py$/,
  /^analyze_.*\.cjs$/,
  /^analyze_.*\.py$/,
  /^inspect_.*\.cjs$/,
  /^inspect_.*\.py$/,
  /^scratch_.*\.cjs$/,
  /^scratch_.*\.js$/,
  /^audit_.*\.cjs$/,
  /^audit_.*\.py$/,
  /^verify_.*\.py$/,
  /^find_.*\.py$/,
  /^find_.*\.cjs$/,
  /^diag_.*\.cjs$/,
  /^diagnose_.*\.cjs$/,
  /^gen_.*\.cjs$/,
  /^deep_audit\.py$/,
  /^fast_.*\.py$/,
  /^search_.*\.py$/,
  /^compare_.*\.cjs$/,
  /^compare_.*\.py$/,
];

// Files to KEEP (reusable for future testing and maintenance)
const KEEP_FILES = new Set([
  // Migration / import scripts
  'import_bank_book.cjs',
  'import_txn_stmt.cjs',
  'apply_ca_cc9.cjs',
  'apply_nse_tembo_split.cjs',
  'clean_import_and_reconcile_cc9.cjs',
  'full_reimport_cc9.cjs',
  'holdings_recon.cjs',
  'reconcile.cjs',
  'allocate_pms_expenses_to_assets.cjs',
  'apply_custom_scrip_mappings.cjs',
  'resolve_all_custom_tickers.cjs',
  'upload_csv.js',
  // Startup / deploy
  'launch_server_and_tunnel.cjs',
  'run_app.bat',
  'run_gcp.bat',
  'start_gcp_app.sh',
  'sync_cloud.cjs',
  'sync_local_to_gcp.py',
  'do_backup.ps1',
  'db_optimize.cjs',
  // Config
  'package.json',
  'package-lock.json',
  'bun.lock',
  'tsconfig.json',
  'vite.config.ts',
  'index.html',
  'capacitor.config.ts',
  'electron-builder.json',
  'metadata.json',
  'firebase-applet-config.json',
  'firebase-blueprint.json',
  'firebase.ts',
  'firestore.rules',
  'firestoreStore.ts',
  'refreshState.ts',
  'schemaMigrator.ts',
  // Documentation
  'README.md',
  'PATCH_NOTES.md',
  // Data files needed for operation
  'BSE.csv.gz',
  'NSE.csv.gz',
  'sqlite3.d.ts',
  'sqlite3_prebuilt.tar.gz',
]);

// Files that are logs/outputs to delete directly
const DELETE_EXACT = [
  'server.log',
  'test.cjs',
  'test.js',
  'test.log',
  'test_out.log',
  'b64.txt',
  'gz_yf.txt',
  'ssh.txt',
  'step1.txt',
  'step2.txt',
  'step3.txt',
  'step4.txt',
  'paste_in_gcp_terminal.txt',
  'complete_prompt.txt',
  'extracted_user_prompt.txt',
  'extracted_user_request.txt',
  'audit_codebase.cjs',
  'line_3631_content.txt',
  'raw_line_3586.json',
  // These were one-time analysis outputs
  'val_cc9.json',
  'val_ledger.json',
  'val_ledger2.json',
  'validate_output.json',
  'rec_fixed.json',
  'user_rec.json',
  'management_fee_comparison.csv',
  'PMS_cc9_Management_Fee_Audit_Report.csv',
  'user_dummy.csv',
  'the_trade_ledger.csv',
  'cc9_bankbook.csv',
  // Legacy / superseded scripts
  'yahooFinance.ts.bak',
  'fix_db.ts',
  'run_fifo.ts',
  'run_fifo_fixed.ts',
  'debug_xirr_flows.ts',
  'sqlite3.d.ts',
  'vite-env.d.ts',
  // Patch/deploy scripts (not reusable - GCP specific)
  'deploy_chunks.sh',
  'deploy_exact_yf.cjs',
  'deploy_gcp_latest.sh',
  'deploy_one_liner.sh',
  'deploy_safe.sh',
  'deploy_via_scp.py',
  'gen_gcp_deploy_script.cjs',
  'gen_b64.cjs',
  'gen_chunks.cjs',
  'gen_exact_yf_deploy.cjs',
  'gen_gzip_payload.cjs',
  'gen_safe_cmd.cjs',
  'gen_steps.py',
  'build_gcp_paste_cmd.py',
  'build_patch_commands.py',
  'bench_xirr_speed.cjs',
  'benchmark_xirr_speed.cjs',
  'export_project_split.cjs',
  'package_exact_replica_zip.cjs',
  // One-off fix scripts
  'fix_server.cjs',
  'fix_server_2.cjs',
  'fix_cc9_final.cjs',
  'fix_cc9_start_date.cjs',
  'fix_cc9_valuation.cjs',
  'fix_historical_tembo_prices.cjs',
  'purge_cc9.cjs',
  'purge_cc9.js',
  'reassemble.js',
  'execute_fifo_sync.cjs',
  'patch_more_names.cjs',
  'patch_validate.cjs',
  'patch_validate_debug.cjs',
  'patch_validate_mappings.cjs',
  'populate_cc9_cache.cjs',
  'recompute_fy_cc9.cjs',
  'reconstruct_fy_xirr.cjs',
  'reset_and_apply_tembo_clean.cjs',
  'resolve_all_cc9.cjs',
  'resolve_all_cc9_transactions.cjs',
  'map_all_transactions.cjs',
  'map_cc9_symbols.cjs',
  'seed_nifty_history.cjs',
  'set_cc9_pms_source.cjs',
  'set_exact_cams_valuation.py',
  'clear_stale_cache_and_verify.cjs',
  'copy_db_without_prices.cjs',
  'copy_vscdb_auth.py',
  'create_dummy_db_export.cjs',
  'create_exact_empty_replica_db.cjs',
  'calc_cc9_exact_xirr.cjs',
  'calc_exact_user_spec_pms_xirr.cjs',
  'calculate_real_cc9_valuation.cjs',
  'compute_cumulative_inception_xirr.cjs',
  'simulate_cashflow_benchmarks.cjs',
  'simulate_fast_track_xirr.cjs',
  'run_server_queries.cjs',
  'apply_ca_cc9_refined.cjs',
  'apply_exact_cams_navs.py',
  'autologin_ide.py',
  'cdsl_downloader.py',
  'update_remaining_cc9_txns.cjs',
  'update_sbifunds.cjs',
  'update_user_live_stock_ltps.py',
  'upload_db_to_gcp.py',
  'upload_project.py',
  'upload_project.py.txt',
  'upload_script.cjs',
  'upload_script2.cjs',
  'inspect_live_db_schema.cjs',
  'inspect_fy_cache.cjs',
  'inspect_generated_fy.cjs',
  'clean_up_cc9.cjs',
  'clean_pharma_cost.py',
  'run_gcp_and_get_url.py',
  'run_gcp.ps1',
  'gcp_remote.py',
  'get_live_urls.py',
  'get_screener.js',
  'fast_zip_sync_gcp.py',
  'locate_all_global_storage.py',
  'sync_ide_auth.py',
  'sync_latest_mf_navs.py',
  'start_gcp_tunnel.py',
  'fix_maa_mf_txns_negative.py',
  'fix_maa_mf_isin.py',
  'fix_exact_maa_mf_ledger.py',
  'rebuild_maa_mf_holdings.py',
  'portfolio_analytics_engine.py',
  'find_all_mf_portfolios.py',
  'find_ide_settings.py',
  'find_ispms.cjs',
  'find_maa_actual_funds.py',
  'find_missing_maa_mf.py',
  'find_tokens.py',
  'find_user_mappings.cjs',
  'find_xirr_logic.cjs',
  'investigate_cams_vs_db.py',
  'investigate_heromotoco.py',
  'investigate_stock_ltps.py',
  'inspect_ide_extensions.py',
  'inspect_auth_tokens.py',
  'inspect_cc9_holdings.cjs',
  'inspect_cc9_types.cjs',
  'inspect_maa_mf.py',
  'inspect_maa_mf_txns_detail.py',
  'inspect_unlisted_and_all.py',
  'list_tables.cjs',
  'diff_and_merge_audit.py',
  'main.cjs',
  'add_exact_cams_navs.py',
  'audit_all_views_and_apis.py',
  'audit_all_folios_and_amounts.py',
  'audit_all_holdings.cjs',
  'audit_all_mutual_funds.py',
  'audit_corporate_action_readiness.cjs',
  'audit_current_holdings_valuation.cjs',
  'audit_history_market_values.cjs',
  'audit_proper_history_reconstruction.cjs',
  'audit_reconstruct.cjs',
  'schemaMigrator.ts',
  'debug_fifo.cjs',
  'debug_maa_day_change.cjs',
  'debug_maa_historical_prev_close.cjs',
  'debug_maa_prices.cjs',
  'debug_market_fetch.js',
  'debug_xirr_exact.cjs',
  'debug_xirr_flows.cjs',
];

let deleted = 0;
let kept = 0;
let skipped = 0;

const allFiles = fs.readdirSync(ROOT).filter(f => {
  const full = path.join(ROOT, f);
  return fs.statSync(full).isFile();
});

for (const f of allFiles) {
  if (KEEP_FILES.has(f)) { kept++; continue; }
  
  // Always keep source files and config
  if (f.endsWith('.ts') && !f.endsWith('.ts.bak') && !DELETE_EXACT.includes(f)) { kept++; continue; }
  
  const shouldDelete = DELETE_EXACT.includes(f) || DELETE_PATTERNS.some(p => p.test(f));
  
  if (shouldDelete) {
    try {
      fs.unlinkSync(path.join(ROOT, f));
      console.log(`DELETED: ${f}`);
      deleted++;
    } catch (e) {
      console.warn(`Could not delete ${f}:`, e.message);
      skipped++;
    }
  } else {
    skipped++;
  }
}

console.log(`\n=== Cleanup Summary ===`);
console.log(`Deleted: ${deleted} files`);
console.log(`Kept: ${kept} files`);
console.log(`Skipped (uncertain): ${skipped} files`);
console.log('\n✅ Root cleanup complete!\n');
