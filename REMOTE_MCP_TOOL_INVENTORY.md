# WealthOS Remote MCP Tool Inventory & Registry Reconciliation

## 1. Tool Count Reconciliation (54 vs 66)

| Component | Count | Description |
|---|---|---|
| **Original Baseline Canonical Tools** | **54** | Core product, portfolio, market data, and baseline developer tools |
| **+ Fundamental Calibration Review Suite** | **+6** | Specialized tools for fundamental reviewer blindness, finding extraction, cluster analysis |
| **+ Granular Inspection & Requirement Suite** | **+6** | Fine-grained file diff, git commit history, requirement query, test suite listing |
| **TOTAL REGISTERED MCP TOOLS** | **66** | Fully implemented, documented, and verified in WealthOS Universal MCP |

### Detail on Additional 12 Tools:
- **Batch 1 (Fundamental Calibration Suite, 6 tools):**
  1. `get_fundamental_review_inputs`: Returns blinded company facts, derived metrics, and context without developer verdicts.
  2. `create_fundamental_review_run`: Initializes independent reviewer run session.
  3. `record_fundamental_review`: Submits reviewer findings, confidence, and evidence citations.
  4. `get_fundamental_review_run`: Queries review run status and aggregated metrics.
  5. `get_fundamental_review_findings`: Retrieves specific findings filtered by severity.
  6. `get_fundamental_review_clusters`: Extracts root-cause systemic defect clusters.
- **Batch 2 (Granular Inspection & Requirements Suite, 6 tools):**
  7. `get_commit_history`: Queries recent git commit log with message and hash bounds.
  8. `get_file_diff`: Inspects unified diff for specific modified files.
  9. `inspect_source_file`: Reads sanitized repo source files within sandboxed boundaries.
  10. `get_requirement`: Fetches formal requirement specification by requirement ID.
  11. `list_requirements`: Lists all system requirements by domain and status.
  12. `list_test_suites`: Enumerates all available unit, integration, and parity test suites.

## 2. Remote Reviewer Profile Surface Minimization

Out of **66** total tools, the Remote Reviewer Profile exposes ONLY **28** capabilities strictly required for autonomous review.
Unrestricted developer operations (`create_development_session`, `resume_development_session`, `create_development_task_package`, `cancel_remediation`) are **strictly prohibited and excluded** from the Reviewer profile.

## 3. Comprehensive Tool Inventory Matrix (All 66 Tools)

| # | Tool ID | Tool Name | Plane | Permission Tier | Action Type | Reviewer Profile | Status |
|---|---|---|---|---|---|---|---|
| 1 | `TOOL-SEC-001` | `search_securities` | PRODUCT | `PRODUCT_READ` | READ_ONLY | **EXPOSED** | `VERIFIED` |
| 2 | `TOOL-SEC-002` | `resolve_security` | PRODUCT | `PRODUCT_READ` | READ_ONLY | **EXPOSED** | `VERIFIED` |
| 3 | `TOOL-SEC-003` | `get_security_profile` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 4 | `TOOL-PORT-001` | `list_portfolios` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 5 | `TOOL-PORT-002` | `get_portfolio_summary` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 6 | `TOOL-PORT-003` | `get_portfolio_holdings` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 7 | `TOOL-PORT-007` | `get_portfolio_transactions` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 8 | `TOOL-PORT-006` | `add_transaction` | PRODUCT | `PRODUCT_READ` | WRITE_ACTION | HIDDEN | `VERIFIED` |
| 9 | `TOOL-PORT-004` | `get_portfolio_allocation` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 10 | `TOOL-PORT-005` | `get_portfolio_history` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 11 | `TOOL-COPILOT-001` | `query_portfolio` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 12 | `TOOL-XIRR-001` | `get_portfolio_xirr` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 13 | `TOOL-XIRR-002` | `get_security_xirr` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 14 | `TOOL-XIRR-003` | `get_dual_currency_xirr` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 15 | `TOOL-TAX-001` | `get_tax_summary` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 16 | `TOOL-TAX-002` | `get_tax_harvesting_opportunities` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 17 | `TOOL-REP-001` | `list_reports` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 18 | `TOOL-REP-002` | `generate_report` | PRODUCT | `PRODUCT_READ` | WRITE_ACTION | HIDDEN | `VERIFIED` |
| 19 | `TOOL-INTEL-001` | `get_company_intelligence` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 20 | `TOOL-INTEL-002` | `get_financial_statements` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 21 | `TOOL-INTEL-003` | `get_management_analysis` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 22 | `TOOL-INTEL-004` | `get_valuation_analysis` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 23 | `TOOL-QGLP-001` | `get_qglp_analysis` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 24 | `TOOL-OPP-002` | `get_opportunity_candidates` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 25 | `TOOL-OPP-001` | `run_opportunity_discovery` | PRODUCT | `PRODUCT_READ` | WRITE_ACTION | HIDDEN | `VERIFIED` |
| 26 | `TOOL-FND-001` | `screen_fundamentals` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 27 | `TOOL-TECH-001` | `get_adjusted_ohlcv` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 28 | `TOOL-TECH-002` | `get_technical_indicators` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 29 | `TOOL-STRAT-001` | `evaluate_strategies` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 30 | `TOOL-STRAT-002` | `get_strategy_scan_results` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 31 | `TOOL-SEC-MOM-001` | `get_sector_momentum` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 32 | `TOOL-UNIV-001` | `get_universe_coverage` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 33 | `TOOL-DATA-001` | `get_data_freshness_summary` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 34 | `TOOL-EV-001` | `get_fact_provenance` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 35 | `TOOL-COMP-001` | `analyze_investment_candidate` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 36 | `TOOL-COMP-002` | `analyze_portfolio` | PRODUCT | `PRODUCT_READ` | READ_ONLY | HIDDEN | `VERIFIED` |
| 37 | `TOOL-REQ-001` | `get_requirements` | BOTH | `PRODUCT_READ` | READ_ONLY | **EXPOSED** | `VERIFIED` |
| 38 | `TOOL-GEN-038` | `list_requirements` | DEVELOPMENT | `REVIEW_READ` | READ_ONLY | **EXPOSED** | `VERIFIED` |
| 39 | `TOOL-GEN-039` | `get_requirement` | DEVELOPMENT | `REVIEW_READ` | READ_ONLY | **EXPOSED** | `VERIFIED` |
| 40 | `TOOL-DEV-001` | `get_repository_status` | DEVELOPMENT | `REVIEW_READ` | READ_ONLY | **EXPOSED** | `VERIFIED` |
| 41 | `TOOL-GEN-041` | `get_commit_history` | DEVELOPMENT | `REVIEW_READ` | READ_ONLY | **EXPOSED** | `VERIFIED` |
| 42 | `TOOL-GEN-042` | `get_file_diff` | DEVELOPMENT | `REVIEW_READ` | READ_ONLY | **EXPOSED** | `VERIFIED` |
| 43 | `TOOL-GEN-043` | `inspect_source_file` | DEVELOPMENT | `REVIEW_READ` | READ_ONLY | **EXPOSED** | `VERIFIED` |
| 44 | `TOOL-GEN-044` | `list_test_suites` | DEVELOPMENT | `REVIEW_READ` | READ_ONLY | **EXPOSED** | `VERIFIED` |
| 45 | `TOOL-DEV-004` | `run_tests` | DEVELOPMENT | `REVIEW_ACTION` | WRITE_ACTION | **EXPOSED** | `VERIFIED` |
| 46 | `TOOL-VERIF-001` | `verify_xirr` | BOTH | `PRODUCT_READ` | READ_ONLY | **EXPOSED** | `VERIFIED` |
| 47 | `TOOL-VERIF-002` | `verify_financial_metric` | BOTH | `PRODUCT_READ` | READ_ONLY | **EXPOSED** | `VERIFIED` |
| 48 | `TOOL-VERIF-003` | `verify_technical_indicator` | BOTH | `PRODUCT_READ` | READ_ONLY | **EXPOSED** | `VERIFIED` |
| 49 | `TOOL-DEV-008` | `create_development_session` | DEVELOPMENT | `DEVELOPER_ACTION` | WRITE_ACTION | HIDDEN | `VERIFIED` |
| 50 | `TOOL-DEV-009` | `get_development_session` | PRODUCT | `PRODUCT_READ` | READ_ONLY | **EXPOSED** | `VERIFIED` |
| 51 | `TOOL-DEV-010` | `list_development_sessions` | PRODUCT | `PRODUCT_READ` | READ_ONLY | **EXPOSED** | `VERIFIED` |
| 52 | `TOOL-DEV-011` | `submit_remediation_request` | DEVELOPMENT | `REVIEW_ACTION` | WRITE_ACTION | **EXPOSED** | `VERIFIED` |
| 53 | `TOOL-DEV-002` | `get_diff` | DEVELOPMENT | `REVIEW_READ` | READ_ONLY | **EXPOSED** | `VERIFIED` |
| 54 | `TOOL-DEV-003` | `inspect_source` | DEVELOPMENT | `REVIEW_READ` | READ_ONLY | **EXPOSED** | `VERIFIED` |
| 55 | `TOOL-DEV-005` | `run_build_and_typecheck` | DEVELOPMENT | `REVIEW_ACTION` | WRITE_ACTION | **EXPOSED** | `VERIFIED` |
| 56 | `TOOL-DEV-006` | `get_system_health` | DEVELOPMENT | `REVIEW_READ` | READ_ONLY | **EXPOSED** | `VERIFIED` |
| 57 | `TOOL-DEV-007` | `run_browser_journey` | DEVELOPMENT | `REVIEW_ACTION` | READ_ONLY | **EXPOSED** | `VERIFIED` |
| 58 | `TOOL-DEV-012` | `create_development_task_package` | DEVELOPMENT | `DEVELOPER_ACTION` | WRITE_ACTION | HIDDEN | `VERIFIED` |
| 59 | `TOOL-DEV-013` | `resume_development_session` | DEVELOPMENT | `DEVELOPER_ACTION` | WRITE_ACTION | HIDDEN | `VERIFIED` |
| 60 | `TOOL-DEV-014` | `cancel_remediation` | DEVELOPMENT | `DEVELOPER_ACTION` | WRITE_ACTION | HIDDEN | `VERIFIED` |
| 61 | `TOOL-DEV-015` | `get_fundamental_review_inputs` | DEVELOPMENT | `REVIEW_READ` | READ_ONLY | **EXPOSED** | `VERIFIED` |
| 62 | `TOOL-DEV-016` | `create_fundamental_review_run` | DEVELOPMENT | `REVIEW_ACTION` | WRITE_ACTION | **EXPOSED** | `VERIFIED` |
| 63 | `TOOL-DEV-017` | `record_fundamental_review` | DEVELOPMENT | `REVIEW_ACTION` | WRITE_ACTION | **EXPOSED** | `VERIFIED` |
| 64 | `TOOL-DEV-018` | `get_fundamental_review_run` | DEVELOPMENT | `REVIEW_READ` | READ_ONLY | **EXPOSED** | `VERIFIED` |
| 65 | `TOOL-DEV-019` | `get_fundamental_review_findings` | DEVELOPMENT | `REVIEW_READ` | READ_ONLY | **EXPOSED** | `VERIFIED` |
| 66 | `TOOL-DEV-020` | `get_fundamental_review_clusters` | DEVELOPMENT | `REVIEW_READ` | READ_ONLY | **EXPOSED** | `VERIFIED` |