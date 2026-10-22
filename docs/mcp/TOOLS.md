# WealthOS Universal MCP — Tool Reference Catalog
**Version:** 2.0.0  
**Transport:** Stdio & Streamable HTTP / SSE  
**Standard Envelope:** `{ status, asOf, data, evidence, missing, warnings, meta }`

---

## Complete Tools by Domain

### 1. Security / Instrument Master
- **`search_securities`** (Read-Only)
  - *Description:* Searches active Indian equities by symbol, name, or ISIN across `MasterTickers` (3,654 instruments).
  - *Parameters:* `query` (string), `limit` (number, default 20).
- **`resolve_security`** (Read-Only)
  - *Description:* Resolves exact canonical identity, preventing ticker collisions (e.g., `STYL` [INE04VU01023] vs `STYLAMIND` [INE239C01020]).
  - *Parameters:* `symbolOrIsin` (string).

### 2. Portfolio Management
- **`list_portfolios`** (Read-Only)
  - *Description:* Lists all active investor and family office portfolios stored in SQLite.
- **`get_portfolio_summary`** (Read-Only)
  - *Description:* Returns aggregated AUM, total invested cost, unrealized P&L, and return percentage.
  - *Parameters:* `portfolioId` (optional string).
- **`get_portfolio_holdings`** (Read-Only)
  - *Description:* Returns individual holdings, quantity, average cost, LTP, current valuation, and unrealized gain/loss.
  - *Parameters:* `portfolioId` (optional), `limit` (number, default 100).
- **`get_portfolio_transactions`** (Read-Only)
  - *Description:* Retrieves dated raw transactions (buy, sell, dividend) with broker, net amounts, and tax breakdown.
  - *Parameters:* `portfolioId` (optional), `symbol` (optional), `limit` (number, default 50).
- **`add_transaction`** (Write / Mutation)
  - *Description:* Adds an investment transaction with validation, deduplication, and FIFO lot tracking.
  - *Parameters:* `portfolioId`, `symbol`, `type` (BUY|SELL|DIVIDEND), `date`, `quantity`, `price`, `charges`, `isin`.

### 3. Portfolio Query / Copilot
- **`query_portfolio`** (Read-Only)
  - *Description:* Structured query across portfolio holdings to inspect risks, sector allocations, and deteriorating metrics without executing raw SQL.
  - *Parameters:* `portfolioId`, `minGainPct`, `maxGainPct`.

### 4. Returns & XIRR
- **`get_portfolio_xirr`** (Read-Only)
  - *Description:* Calculates portfolio XIRR using true dated cashflows and terminal valuation via the production Newton-Raphson engine in `src/server/xirr.ts`.
  - *Parameters:* `portfolioId` (optional).

### 5. Tax & Capital Gains
- **`get_tax_summary`** (Read-Only)
  - *Description:* Calculates statutory capital gains tax breakdown (LTCG, STCG, Section 112A grandfathering) for a financial year.
  - *Parameters:* `financialYear` (string, e.g. FY2025-2026).

### 6. Reporting
- **`list_reports`** (Read-Only)
  - *Description:* Lists available report generation templates (Commercial Excel, Schedule 112A, Institutional Research Dossier).

### 7. Company / Stock Intelligence
- **`get_company_intelligence`** (Read-Only)
  - *Description:* Runs multi-module company intelligence (business, fundamentals, management, valuation, catalysts, risks) through the production orchestrator.
  - *Parameters:* `symbol`, `modules` (optional array).
- **`get_financial_statements`** (Read-Only)
  - *Description:* Retrieves point-in-time canonical financial facts, historical P&L, balance sheet, and cashflow metrics.
  - *Parameters:* `symbol`, `limit` (default 100).
- **`get_management_analysis`** (Read-Only)
  - *Description:* Inspects management Walk-the-Talk records, commitments, and historical claims with adverse evidence preserved.
  - *Parameters:* `symbol`.

### 8. Deterministic QGLP
- **`get_qglp_analysis`** (Read-Only)
  - *Description:* Computes deterministic Motilal-Oswal QGLP score across Quality, Growth, Longevity, and Price pillars. Fail-closed on missing evidence.
  - *Parameters:* `symbol`.

### 9. Opportunity Engine
- **`get_opportunity_candidates`** (Read-Only)
  - *Description:* Retrieves pre-calculated strategy candidates across the full universe from scan reports.
  - *Parameters:* `strategyId` (optional: S1A, S1B, S2A, S3A, S4B, S5A).

### 10. Technical Analysis & OHLCV
- **`get_adjusted_ohlcv`** (Read-Only)
  - *Description:* Fetches corporate-action adjusted daily candlestick bars from the DuckDB/Parquet store (`data/market_data/tejhq_hf_10y/`).
  - *Parameters:* `symbol`, `limit` (default 250), `from`, `to`.

### 11. Technical Strategies (S1–S10)
- **`evaluate_strategies`** (Read-Only)
  - *Description:* Evaluates production technical strategies (S1A VPA 3-Leg, S1B Trough Reversal, S2A FVG/CE, S3A Breakout, S4B Gap, S5A Minervini) on real adjusted OHLCV bars.
  - *Parameters:* `symbol`, `strategies` (optional array).

### 12. Sector Momentum
- **`get_sector_momentum`** (Read-Only)
  - *Description:* Analyzes sector momentum rankings and relative strength indicators across market segments.

### 13. Evidence & FERE
- **`get_fact_provenance`** (Read-Only)
  - *Description:* Traces exact source filing, citation, verification status, and provider for any canonical fact ID.
  - *Parameters:* `factId`.

### 14. Composite Orchestration
- **`analyze_investment_candidate`** (Read-Only)
  - *Description:* Assembles complete end-to-end investment research dossier across identity, fundamentals, QGLP, management, valuation, technicals, and strategies.
  - *Parameters:* `symbol`.

### 15. Requirement Registry
- **`list_requirements`** (Read-Only)
  - *Description:* Lists all verified WealthOS product requirements, acceptance criteria, and suite mappings.
- **`get_requirement`** (Read-Only)
  - *Description:* Retrieves detailed requirement specification, acceptance criteria, and status by requirement ID.
  - *Parameters:* `requirementId`.

### 16. Repository Review Plane
- **`get_repository_status`** (Read-Only)
  - *Description:* Inspects repository git status, current branch, SHA, and modified/untracked files.
- **`get_commit_history`** (Read-Only)
  - *Description:* Retrieves recent git commits with hash, author, date, and message.
  - *Parameters:* `limit` (default 10, max 50).
- **`get_file_diff`** (Read-Only)
  - *Description:* Inspects git diff of working tree or a specific file with automatic secret redaction.
  - *Parameters:* `filePath` (optional).
- **`inspect_source_file`** (Read-Only)
  - *Description:* Reads bounded source file lines within repository with path traversal sandboxing and secret redaction.
  - *Parameters:* `filePath`, `startLine`, `endLine`.

### 17. Test Execution Plane
- **`list_test_suites`** (Read-Only)
  - *Description:* Lists available allowlisted test suites (`unit`, `integration`, `strategies`, `xirr`, `acceptance`, `verification`).
- **`run_tests`** (Action)
  - *Description:* Executes an allowlisted test suite and captures structured outcomes (passed, failed, duration, logs).
  - *Parameters:* `suiteId`.

### 18. Independent Verification Plane (Anti-Self-Certification Oracles)
- **`verify_xirr`** (Read-Only)
  - *Description:* Independently recomputes XIRR from raw dated cashflows using a clean-room root-finder and compares against production value.
  - *Parameters:* `cashflows`, `productionXirr`, `tolerance` (default 0.005).
- **`verify_financial_metric`** (Read-Only)
  - *Description:* Independently recomputes financial ratios (CAGR, YOY_GROWTH, EBITDA_MARGIN_PCT, PAT_MARGIN_PCT, ROE_PCT, ROCE_PCT, CFO_TO_PAT_PCT) from raw facts.
  - *Parameters:* `metricName`, `rawInputs`, `productionResult`, `tolerance` (default 0.01).
- **`verify_technical_indicator`** (Read-Only)
  - *Description:* Independently computes technical indicators (SMA, EMA, RSI) directly from raw bar close prices.
  - *Parameters:* `indicatorName`, `rawBars`, `productionResult`, `period`, `tolerance`.

### 19. Developer Session Model & Remediation Contract
- **`create_development_session`** (Action)
  - *Description:* Creates a tracked development session (`DEV-*`) capturing baseline branch, commit, objective, and constraints.
  - *Parameters:* `objective`, `constraints` (optional array).
- **`get_development_session`** (Read-Only)
  - *Description:* Inspects development session state, modified files, diff summary, and test integrity guard flags.
  - *Parameters:* `sessionId`.
- **`list_development_sessions`** (Read-Only)
  - *Description:* Lists all recorded development sessions with their status and repair cycle counts.
- **`submit_remediation_request`** (Action)
  - *Description:* Submits a structured remediation request to developer bot (max 3 cycles before escalating to human).
  - *Parameters:* `sessionId`, `observedFailure`, `severity`, `allowedScope`, `forbiddenChanges`, `acceptanceTests`.
