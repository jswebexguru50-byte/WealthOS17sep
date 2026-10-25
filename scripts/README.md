# scripts/

Standalone analysis, reconciliation, and data-import scripts that are NOT part of the main application.
These are one-off or ad-hoc utilities run directly by developers.

## How to run

```bash
node scripts/script-name.cjs        # Node/CommonJS scripts
python scripts/script-name.py       # Python scripts
```

## Script inventory

### Reconciliation & Audit
- `aggregate_reconciliation.cjs` — Portfolio-wide reconciliation summary across all portfolios
- `audit_cc9.cjs` — Reconciliation audit for cc9 portfolio
- `audit_cc9_flows.cjs` — Cash flow audit for cc9 portfolio
- `audit_all_four_files.cjs` — Audit across four broker statement files
- `audit_all_metrics.cjs` — Audit all portfolio metrics
- `audit_cash_breakdown.cjs` — Breakdown of cash positions across portfolios
- `audit_holdings.cjs` — Holdings reconciliation audit
- `audit_hirect_all.cjs` — Audit all Hirect portfolio positions
- `audit_reconciled_cc9.cjs` — Post-reconciliation audit for cc9
- `audit_security_in.cjs` — Audit security inflows
- `build_and_reconcile_all_portfolios.cjs` — Full build + reconciliation run for all portfolios
- `deep_audit.cjs` — Deep multi-level audit across portfolios
- `def001_audit.cjs` — Audit for DEF001 portfolio
- `generate_cc9_fee_audit.cjs` — Fee audit report for cc9
- `master_reconciliation.cjs` — Master reconciliation across all brokers
- `p0_audit.cjs` — P0 priority audit
- `reconcile_all_bidirectional.cjs` — Bidirectional reconciliation across all portfolios
- `reconcile_all_portfolios_from_files.cjs` — Reconcile portfolios from statement files
- `reconcile_cc9_db.cjs` — Reconcile cc9 against database
- `reconcile_cc9_full.cjs` — Full reconciliation for cc9
- `reconcile_three_ports.cjs` — Reconcile three specific portfolios
- `run_all_holdings_recon.cjs` — Run holdings reconciliation for all portfolios
- `verify_all_four_files_final.cjs` — Final verification of four statement files

### Data Fixes & Cleaning
- `apply_iifl_closing_withdrawal.cjs` — Apply IIFL closing withdrawal transactions
- `apply_rnfi_clean.cjs` — Clean RNFI data entries
- `clean_all_duplicate_summary_rows.cjs` — Remove duplicate rows from summary tables
- `clean_iifl_holdings.cjs` — Clean IIFL holdings data
- `cleanup_root.cjs` — Root-level cleanup script
- `cleanup_synthetic_withdrawal.cjs` — Remove synthetic withdrawal entries
- `detect_all_duplicate_summary_rows.cjs` — Detect duplicates in summary tables
- `fix_jtl.cjs` — Fix JTL portfolio data
- `fix_p0_ca.cjs` — Fix P0 corporate actions
- `fix_rnfi_duplicates.cjs` — Remove RNFI duplicate transactions
- `fix_schema_migrations.cjs` — Fix schema migration tracking issues
- `fix_us_splits.cjs` — Apply US stock split adjustments
- `hirect_ca.cjs` — Hirect corporate actions application
- `import_all_iifl_expenses.cjs` — Import IIFL expense transactions
- `normalize_tx_types.cjs` — Normalize transaction type labels
- `setup_dual_cost.cjs` — Setup dual-cost accounting entries
- `sync_special_holdings.cjs` — Sync special/manual holdings entries
- `update_token.cjs` — Update API authentication tokens

### Database Utilities
- `create_missing_tables.cjs` — Create any missing database tables
- `create_portable_bundle.cjs` — Create a portable DB bundle for distribution
- `db_optimize.cjs` — Run database optimization (VACUUM, ANALYZE)
- `get_schema.cjs` — Print current database schema
- `index_db_tables.cjs` — Add missing indexes to database tables
- `schema_check.cjs` — Verify schema consistency
- `fix_schema_migrations.cjs` — Fix migration tracking table

### Analysis & Computation
- `analyze_cap_register.cjs` — Analyze capitalization register
- `calculate_true_investor_xirr.cjs` — Calculate true investor XIRR across portfolios
- `investigate_ca.cjs` — Investigate corporate action impacts
- `investigate_rnfi_across_all.cjs` — Investigate RNFI data across all portfolios
- `parse_cap_register.cjs` — Parse capitalization register from file
- `parse_cc9_statement.cjs` — Parse cc9 broker statement
- `parse_iifl_expenses.cjs` — Parse IIFL expense statements
- `print_us_holdings_only.cjs` — Print US-listed holdings only
- `refresh_evaluations.cjs` — Refresh portfolio evaluations/valuations
- `run_cc9_fifo_stage.cjs` — Run FIFO stage for cc9 portfolio
- `run_fifo_recompute.cjs` — Recompute FIFO lots across portfolios
- `run_full_system_resync.cjs` — Full system data resync
- `scan_all_jdb.cjs` — Scan all JDB portfolio data
- `scan_holding_files.cjs` — Scan and validate holding statement files
- `search_frontend_cash.cjs` — Search for cash position discrepancies in frontend data
- `seed_cc9_baseline.cjs` — Seed cc9 portfolio baseline data

### Server & Infrastructure
- `launch_server_and_tunnel.cjs` — Launch dev server and expose via tunnel
- `performance_test.cjs` — Performance/load test the API
- `restart_server.cjs` — Restart the dev server

### Ad-hoc Tests & API Probes
- `test-api-phase1.cjs` — Phase 1 API tests
- `test-phase1-final.cjs` — Final phase 1 test suite
- `test-phase1.cjs` — Phase 1 test runner
- `test_api.cjs` — General API probe tests
- `test_audit_api.cjs` — Audit API probe
- `test_find_diff.cjs` — Find data differences between sources
- `test_iifl_full_recon.cjs` — Full IIFL reconciliation test
- `test_live_apis.cjs` — Live API endpoint tests
- `test_parse_all_expenses.cjs` — Test expense parser on all files
- `test_phase_a.cjs` — Phase A tests
- `test_pms_audit_service.cjs` — PMS audit service probe
- `test_pms_dashboard_fn.cjs` — PMS dashboard function test
- `test_recon_sim.cjs` — Reconciliation simulation

### Python Utilities
- `apply_v15_v16.py` — Apply v15/v16 data migration patches
- `apply_v17_data_conflicts.py` — Resolve v17 data conflicts
- `chat_claude.py` — CLI chat with Claude API
- `chatgpt_reviewer.py` — ChatGPT-based code review utility
- `exchange_token.py` — Exchange OAuth tokens for broker APIs
- `fetch_tv_universe.py` — Fetch TradingView stock universe
- `fill_historical_data.py` — Fill missing historical price data
- `fix_fifo.py` — Fix FIFO lot matching issues
- `fix_yahoo.py` — Fix Yahoo Finance data imports
- `get_max_date.py` — Get max date in historical data
- `load_staged_data.py` — Load staged data into database
- `patch.py` / `patch2.py` / `patch3.py` — Ad-hoc data patches
- `patch_ui.py` — UI patch helper
- `run_scan_dossier.py` — Run scrip intelligence dossier scan
- `scratch_count_symbols.py` — Count symbols in database
- `scratch_update_manifest.py` — Update data manifest
- `update_kite_incremental.py` — Incremental Zerodha/Kite data update

## Note on jest.config.cjs

`jest.config.cjs` remains in the project root — Jest discovers it automatically from there and moving it would break all test runs.
