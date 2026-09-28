# WealthOS Integrated Intelligence Capability Matrix

**Release Phase:** Foundation Wave 1 & 2  
**Framework Version:** `WEALTHOS_INTEGRATED_INTELLIGENCE_FOUNDATION_v1.0`  
**Constitution Adherence:** STRICT FAIL-CLOSED  

---

## 1. Operating Model & Constitution Summary

1. **Deterministic Processing:** No LLMs in deterministic signal, score, filter, FERE, QGLP, or portfolio-decision paths.
2. **Immutable Snapshots:** Raw source snapshots (`fundamental_endpoint_snapshots`, `fere_evidence.db`, `ohlcv.duckdb`) are immutable.
3. **No Synthetic Overwriting:** Derived calculations cannot overwrite raw observations.
4. **Fail-Closed Reporting:** Missing data returns `DATA_INSUFFICIENT` or `SOURCE_UNAVAILABLE`. Never fallback to silent defaults or arbitrary constants.
5. **No DB Writes on Read:** GET or read-only analysis routes never perform schema mutations or database writes.

---

## 2. Integrated Module Capability Matrix

| Module | Primary Source | Production Status | Independent Execution | Contract Status | Provenance & Evidence Type |
|---|---|---|---|---|---|
| **Technical** | DuckDB Adjusted OHLCV | **VERIFIED** | Supported | Full Adherence | Primary daily OHLCV bars with split/bonus adjustments |
| **Fundamental** | `company_facts` | **PARTIAL** | Supported | Full Adherence | Standardized facts mapped via `field_mapping_catalog` |
| **FERE** | `fere_evidence.db` | **VERIFIED** | Supported | Full Adherence | MCA / XBRL verified filings and financial statement items |
| **QGLP** | `company_facts` + FERE | **DATA_INSUFFICIENT** | Supported | Full Adherence | Numeric proxy active (`QGLP_NUMERIC_PROXY`); Longevity/Moat pending |
| **Management** | FERE Claim Candidates | **PARTIAL** | Supported | Full Adherence | Management commitments and transcripts from verified filings |
| **Business Inflection** | `company_facts` | **DATA_INSUFFICIENT** | Supported | Full Adherence | Sequential margin and revenue turnaround indicators |
| **Valuation** | Multiples & OHLCV | **DATA_INSUFFICIENT** | Supported | Full Adherence | Trailing P/E, P/B, EV/EBITDA; historical peer band pending |
| **Smart Money** | `SectorFlowService` | **DATA_INSUFFICIENT** | Supported | Full Adherence | Institutional flow proxy gated at 60% market cap; direct feed unavailable |
| **Market Context** | `SectorMomentumService` | **VERIFIED** | Supported | Full Adherence | Sector index momentum (EMA20, SMA20, 20D return) |
| **Catalysts** | Corporate Actions DB | **PARTIAL** | Supported | Full Adherence | Ex-dates, dividend announcements, board meetings |
| **Risk** | DuckDB OHLCV + Beta | **VERIFIED** | Supported | Full Adherence | Max drawdown, historical volatility, ATR, downside deviation |
| **Thesis** | Evidence Envelope | **DATA_INSUFFICIENT** | Supported | Full Adherence | Integrated cross-module thesis; requires candidate lifecycle |
| **Portfolio Context** | Holdings Ledger | **PARTIAL** | Supported | Full Adherence | Account positions, cost basis, XIRR, allocation weights |

---

## 3. Data Source Architecture & Enrichment Roadmap

| Data Domain | Current Source | Status | Planned Enrichment Roadmap |
|---|---|---|---|
| Fundamental Snapshots | Trendlyne MCP Snapshots | Production Active | Periodic automated background fetch with TTL gating |
| Canonical Structured Facts | `company_facts` | Production Active | Multi-year historical quarterly statement population |
| Forensic Evidence | `fere_evidence.db` | Production Active | Ingestion of latest annual and quarterly XBRL disclosures |
| Daily Market Data | DuckDB Adjusted OHLCV | Production Active | Daily EOD ingest via automated pipeline |
| Sector Momentum | `SectorMomentumService` | Production Active | Sector classification expansion and ETF mapping |
| Sector Institutional Flows | `SectorFlowService` | Proxy Active | Upstream delivery of exchange-published FII/DII segment files |
| Identity Resolution | `SecurityIdentityRegistry` | Production Active | Unified ISIN / NSE / BSE temporal mapping catalog |
