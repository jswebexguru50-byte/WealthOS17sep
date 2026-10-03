# WealthOS Data Source Priority Map & Hierarchy Specification

**Document Version**: 1.0.0  
**Effective Date**: 2026-10-03  
**Status**: ACTIVE PRODUCTION SPECIFICATION  

---

## 1. Executive Precedence & Architectural Principles

All data ingestion, field mapping, and research snapshotting in WealthOS strictly follow these deterministic principles:

1. **Hierarchy of Truth**:
   - **Tier 1 (Highest)**: Statutory exchange filings (NSE/BSE XBRL, audited annual reports, corporate action logs).
   - **Tier 2**: Direct broker feeds with exchange timestamps (Kite Connect, Upstox API).
   - **Tier 3**: Persisted local DuckDB adjusted OHLCV with validated corporate action adjustments.
   - **Tier 4**: Third-party structured aggregators (Trendlyne MCP, Screener API) used strictly for non-statutory screening metrics and supplementary parameters.
   - **Tier 5**: Qualitative disclosures, investor presentations, and management transcripts (FERE evidence engine).

2. **Invariants**:
   - Zero synthetic values (no placeholder 0, 1, 15, 25, 50, 100).
   - Zero period substitution (e.g. 5Y growth never accepted as 3Y growth; 3Y CAGR strictly requires 4 consecutive annual points spanning exactly 3 years).
   - Zero capex inference (Total Investing Cash Flow is never substituted for capex; only real `capex_cash_outflow` is accepted).
   - Fail-closed behavior: If required evidence is missing, state `MISSING` / `DATA_INSUFFICIENT` with exact `missingReason`.

---

## 2. Comprehensive Field Source Priority Matrix

| Field Name | Functional Need in App | Preferred Source | Fallback Source | Refresh Cadence | Staleness Rule | QGLP Eligible | Informational Only | Exact Period Match Required |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Stock OHLCV** | Technical indicators (EMA, SMA, RSI, ATR%), breakout verification, backtest, paper trading | DuckDB Adjusted OHLCV (`daily_bars`) | Kite / Upstox Historical API | Daily post-market | > 5 trading days = STALE | Yes (Price/Entry) | No | Yes |
| **Sector Index OHLCV** | Sector momentum status, double momentum verification (Stock + Sector) | Local DuckDB Index Parquet (`kite_index_backfill`) | NSE Index Historical Candles / Kite Index | Daily post-market | > 5 trading days = STALE | No | Yes (Context) | Yes |
| **3Y Revenue CAGR** | QGLP Growth pillar, top-line compounding velocity | `company_facts` (XBRL `revenue` Annual) | FERE Statutory Statements (`HistoricalFinancialStatements`) | Quarterly / Annual post-results | > 400 days from FY end | Yes | No | Yes (4 consecutive annual filings) |
| **5Y Revenue CAGR** | Long-term growth runway and lifecycle maturity | `company_facts` / `DataQualityAuditLedger` (`sales_growth_5y_pct`) | Trendlyne Annual Sales Growth | Quarterly / Annual | > 400 days from FY end | No | Yes | No (Informational) |
| **Operating Profit (EBITDA)** | Cash generation capacity, core operational profitability | `HistoricalFinancialStatements` (`operating_profit_cr`) | `company_facts` (`operating_profit`) | Quarterly | > 120 days post-quarter | Yes | No | Yes |
| **PAT (Profit After Tax)** | Quality of earnings, ROE numerator, P/E denominator | `HistoricalFinancialStatements` (`net_profit_pat_cr`) | `company_facts` (`pat`) | Quarterly | > 120 days post-quarter | Yes | No | Yes |
| **Operating Margin Trend** | Pricing power, input cost pass-through capability | `HistoricalFinancialStatements` (`opm_pct` sequential quarters) | `company_facts` (`operating_profit` / `revenue`) | Quarterly | Requires at least 2 consecutive quarters | Yes | No | Yes |
| **Debt to Equity** | Solvency assessment, financial leverage risk | `company_facts` (`debt_to_equity`) | `DataQualityAuditLedger` (`debt_to_equity`) | Quarterly / Annual | > 180 days | Yes (Quality) | No | Yes |
| **Total Borrowings** | Balance sheet obligations, enterprise value calculation | `company_facts` (`total_borrowings_cr` / XBRL Borrowings) | `DataQualityAuditLedger` (`total_borrowings_cr`) | Annual / Half-Yearly | > 200 days | Yes | No | Yes |
| **Cash Flow from Operations (CFO)** | Real cash earnings, forensic accounting check | `company_facts` (`cfo` Annual/Quarterly) | `HistoricalFinancialStatements` (`cfo_cr`) | Annual / Half-Yearly | > 200 days | Yes (Quality) | No | Yes |
| **CFO / PAT Ratio** | Earnings quality filter, revenue recognition integrity | Derived: `(cfo / pat) * 100` (exact matched period) | None | Annual / Half-Yearly | > 200 days | Yes (Quality) | No | Yes (Same period and scope) |
| **CFO / Operating Profit** | Cash conversion of EBITDA | Derived: `(cfo / operating_profit) * 100` (matched period) | None | Annual / Half-Yearly | > 200 days | Yes (Quality) | No | Yes (Same period and scope) |
| **Free Cash Flow (FCF)** | True economic surplus available to shareholders | Derived: `cfo - Math.abs(capex_cash_outflow)` | None (Never use CFI) | Annual | > 200 days | Yes (Quality/Price) | No | Yes (Matched period) |
| **FCF Yield %** | Valuation check against market capitalization | Derived: `(freeCashFlow / marketCapCr) * 100` | None | Daily (FCF fixed, Mcap dynamic) | FCF > 200 days | Yes (Price) | No | Yes |
| **Working Capital & CCC** | Operational liquidity, supply chain bargaining power | `FEREEnrichedLedger` (`cash_conversion_cycle`, DSO, DIO, DPO) | `company_facts` (`inventory_change`, purchases) | Annual | > 200 days | Yes | No | Yes |
| **Promoter Holding %** | Skin in the game, governance alignment | `HistoricalShareholdingPattern` (`promoter_pct`) | `DataQualityAuditLedger` (`promoter_pct`) | Quarterly | > 120 days post-quarter | Yes (Quality) | No | Yes |
| **Promoter Pledge %** | Liquidation risk, governance distress signal | `fere_evidence.db` (`shareholding_snapshot.promoter_pledge`) | `FEREEnrichedLedger` (`promoter_pledge_pct`) | Quarterly | > 120 days post-quarter | Yes (Quality) | No | Yes |
| **FII / DII Holding & Trend** | Institutional sponsorship and conviction shifts | `HistoricalShareholdingPattern` (Sequential quarters) | `company_facts` (`fii_holding`, `dii_holding`) | Quarterly | Requires at least 2 consecutive quarters | Yes (Longevity) | No | Yes |
| **Return on Equity (ROE)** | Equity compounding rate | `company_facts` (`roe_pct` from XBRL filings) | `DataQualityAuditLedger` (`roe_pct`) | Annual / TTM | > 200 days | Yes (Quality) | No | Yes |
| **Return on Capital Employed (ROCE)** | Capital efficiency across equity + debt | `company_facts` (`roce_reported` / `roce_pct`) | `DataQualityAuditLedger` (`roce_pct`) | Annual / TTM | > 200 days | Yes (Quality) | No | Yes |
| **Price to Earnings (PE)** | Relative valuation multiple | `company_facts` (`pe_ratio`) | `DataQualityAuditLedger` (`pe_ratio`) | Daily | Price dynamic, EPS TTM | Yes (Price) | No | Yes |
| **PEG Ratio** | Growth-adjusted valuation | Derived: `pe_ratio / profitCagr3yPct` | `company_facts` (`peg_ratio` where verified) | Daily / Quarterly | PE dynamic, Growth audited | Yes (Price) | No | Yes |
| **Demand Outlook / Catalysts** | Qualitative moat, runway for 2–3 year growth | `SecurityDossierSnapshots` (`catalystRadar`) | FERE Management Presentations / Transcripts | Quarterly / Event | > 180 days | No | Yes (Evidence) | No |
| **Peer Context & Positioning** | Competitive advantage, industry leadership | `SecurityDossierSnapshots` (`businessProfile`) | Industry Analysis Reports | Quarterly | > 180 days | No | Yes (Evidence) | No |
| **Key Risks & Antithesis** | Downside drivers, structural vulnerabilities | `SecurityDossierSnapshots` (`thesis.brutalBearAntithesis`) | Annual Report Risk Section / FERE | Annual / Event | > 200 days | No | Yes (Evidence) | No |
| **What to Watch Next** | Invalidation triggers, forward milestones | `SecurityDossierSnapshots` (`thesis.invalidationTriggers`) | Earnings Call Guidance Checkpoints | Quarterly | > 120 days | No | Yes (Evidence) | No |

---

## 3. Source Hierarchy Detailed Breakdown

### 1. OHLCV / Technicals
- **Preferred**: Local DuckDB adjusted OHLCV (`data/market_data/tejhq_hf_10y/ohlcv.duckdb` and `kite_adjusted_backfill/candles`).
- **Fallback**: Upstox Historical Candle API / Kite Connect Daily Candles.
- **Coverage Requirement**: Minimum 60 daily bars for valid indicator computations; 250 daily bars for 200-day SMA and historical swing backtest.
- **Refresh Frequency**: Daily at 16:00 IST after exchange bhavcopy finalization.

### 2. Sector Momentum
- **Preferred**: Local DuckDB Index candles (`data/market_data/tejhq_hf_10y/kite_index_backfill/candles`).
- **Supported Sector Indices**:
  - `NIFTY BANK`, `NIFTY FIN SERVICE`, `NIFTY IT`, `NIFTY AUTO`, `NIFTY PHARMA`, `NIFTY FMCG`, `NIFTY METAL`, `NIFTY REALTY`, `NIFTY ENERGY`, `NIFTY INFRA`, `NIFTY MEDIA`, `NIFTY CONSUMPTION`.
- **Refresh Frequency**: Daily at 16:00 IST.

### 3. Annual Financial History (True 3Y / 4Y Analysis)
- **Preferred**: FERE XBRL extracted directly from NSE/BSE statutory filings (`company_facts`).
- **Requirements**:
  - Revenue, PAT, and CFO for at least 4 consecutive fiscal years.
  - Verification that $Y_3 - Y_0 = 3$ without skipped annual reporting periods.
  - Direct matched capex cash outflows for FCF computation.
- **Refresh Frequency**: Quarterly scan during financial results season; complete annual refresh post-AGM/annual report release.

### 4. Quarterly Financial History
- **Preferred**: Statutory exchange results (`HistoricalFinancialStatements` with `statement_type='QUARTERLY_PL'`).
- **Requirements**:
  - Sequential quarters for revenue, operating profit, PAT, and OPM %.
  - Minimum 4 quarters for operating margin stability and coefficient of variation.
  - Minimum 8 quarters for profitable quarter reliability checks.
- **Refresh Frequency**: Continuous 15-day cadence during quarterly earnings season.

### 5. ROE / ROCE & Capital Efficiency
- **Preferred**: Statutory XBRL metrics in `company_facts`.
- **Fallback**: Multi-year ratio series from audited statements.
- **Consistency Requirement**: QGLP requires at least 3 annual points with ROCE $\ge 15\%$ for full quality pillar passage.

### 6. Shareholding & Institutional Trends
- **Preferred**: Statutory quarterly filings (`HistoricalShareholdingPattern`).
- **Fallback**: FERE `shareholding_snapshot` in `data/fere/verified_filings/fere_evidence.db`.
- **Trend Requirement**: Minimum 2 dated consecutive quarters to determine institutional direction ($\Delta$ FII / $\Delta$ DII). Single-period shareholding is presented as static fact and strictly marked as `NO_FII_HOLDING_TREND` for trend evaluation.

---

## 4. Operational Ingestion Guidelines

1. **Deterministic Execution**: Every ingestion job runs via non-interactive script or CLI service with dedicated progress tracking (`.json`), idempotency hashes, and error logs.
2. **Provenance Traceability**: Every inserted canonical fact must record:
   - `factId`: Cryptographic hash of `source:symbol:metric:periodEnd`.
   - `provider`: Explicit provider name (`FERE_NSE_XBRL`, `DUCKDB_MARKET_DATA`, `TRENDLYNE_MCP_MAX`, etc.).
   - `availableAt`: Source filing timestamp or exchange publication time. Never substitute current system clock.
   - `periodType`: `ANNUAL`, `QUARTERLY`, `TTM`, or `POINT_IN_TIME`.
   - `periodEnd`: ISO date string (`YYYY-MM-DD`).
3. **Fail-Closed Architecture**: Any stock lacking statutory evidence displays explicit missing reason tags in the UI and report exports, preserving complete analytical integrity.
