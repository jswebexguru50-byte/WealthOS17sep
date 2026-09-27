# Data Acquisition Schema and Frequency Plan

## 1. Core Principles
The engine relies on a strictly evidence-based data acquisition model. No data field should be assumed, fabricated, or defaulted if it is absent from the source.
- **Evidence-Backed**: Every field is sourced with clear provenance (Provider, Timestamp, Source Period).
- **No Fabrications**: `DATA_INSUFFICIENT` is the only valid output if raw facts are missing.
- **Source of Truth**: `fundamental_endpoint_snapshots` and `fundamental_source_snapshots` in `portfolio.db` (and `fere_evidence.db` for filings).
- **Reusable Freshness Policy**: A field is only reused if it is recent, complete, and verified.

---

## 2. Source Mapping & Data Types

| Domain | Required Fields / Signals | Primary Source | Secondary Source |
|---|---|---|---|
| **Price & OHLCV** | LTP, Volume, EOD Close, Adj. Prices, Indices | Kite Connect | Upstox |
| **Financial History (Annual)**| Rev, CFO, NCF, Op Profit, PAT, PBT, EPS, BV, Capex, ROCE, ROE, Margins | Trendlyne | Upstox |
| **Financial History (Qtr)**| Qtr Rev, Qtr PAT, Op Margins | Trendlyne | Upstox / FERE |
| **Valuation Metrics** | PE (Current, 3Y, 5Y, 10Y avg), PEG, P/B, P/S, EV/EBITDA, Market Cap, Enterprise Value | Trendlyne | - |
| **Balance Sheet / Cash**| Debt, Equity, ST Borrowing, Cash, Working Capital | Trendlyne | Upstox |
| **Ownership & Deals** | Promoter, FII, DII, MF holding & change, Pledge, Insider, Bulk/Block Deals | Trendlyne | FERE |
| **Corporate Events** | Earnings Dates, Dividends, Splits, Board Meetings | Trendlyne | FERE |
| **Filings & Documents** | Annual Reports, XBRL, Investor Presentations, Audits | FERE (NSE/BSE) | Trendlyne |
| **Macro / Smart Money**| India VIX, Nifty EMA/SMA, Advance/Decline, Institutional Delivery % | Kite Connect | NSE |

---

## 3. Freshness and Re-fetch Policy

A provider call will NOT be made if the current snapshot is within its freshness window and structurally complete, UNLESS a new filing/event invalidates it.

### Fetch Frequency Schedule
| Data Category | Freshness Window (TTL) | Trigger to Re-fetch Early |
|---|---|---|
| **End-of-Day Price & Vol** | EOD Daily | Intraday if explicit trigger (e.g. limit order check). |
| **Corporate Actions / News**| EOD Daily | News spike, earning results date, significant price action. |
| **Insider / SAST / Deals** | EOD Daily | Block deal alerts during the session. |
| **Quarterly Financials** | 15 Days | New quarterly result filing released on NSE/BSE. |
| **Shareholding & Pledge** | 15 Days | End of quarter, or SAST disclosure filed. |
| **Annual Financials & Ratios**| 15 Days | Annual result declared, or Annual Report published. |
| **Documents & Presentations**| 30 Days | New document published on exchanges. |

### Terminal Cached States (When NOT to re-fetch)
If a field is missing, it is not simply re-queried infinitely. The system classifies missing data with terminal states:
- `VERIFIED`: Fresh and successfully parsed.
- `NOT_REPORTED_BY_SOURCE`: Source explicitly returns null/absent for the field (e.g., no historical PEG available). Retry only after standard TTL or event trigger.
- `NOT_APPLICABLE`: Structurally impossible (e.g., promoter pledge for a completely widely-held professional company).
- `NOT_PUBLICLY_SOURCEABLE`: Data that requires private access (e.g., undisclosed customer concentration). Do not fetch.
- `IDENTITY_REVIEW`: ISIN/Symbol mismatch between source and local DB. Requires manual intervention.

---

## 4. Derived & Valuation Field Handling
Calculations and models (e.g., QGLP, DCF, EPV, Order Block Decay) must dynamically check the **freshness and completeness of their underlying raw inputs**.
- If *all* inputs are valid and fresh: Calculate and return the derived metric.
- If *any* input is missing or stale: The component emits `DATA_INSUFFICIENT` and queues the missing raw field for acquisition. 
- **Models are NOT facts**: WACC, Terminal Growth, and Discount Rates are strictly *model assumptions*, not fetched facts. They must be user-configurable, visible, and never hard-coded as hidden fallbacks.

## 5. Execution Pipeline
The acquisition chain coordinates using a unified SQLite schema (`fundamental_endpoint_snapshots`).
1. **Queue Generation**: Identify missing or stale fundamental/technical fields per symbol.
2. **Provider Dispatch**: Route missing fields to Trendlyne MCP, Upstox, or Kite scripts.
3. **Write & Validate**: Provider scripts write verbatim responses to DB with a timestamp.
4. **Valuation Input Resolver**: Resolves raw facts into `VERIFIED`, `PARTIAL`, `DATA_INSUFFICIENT` or `SOURCE_UNAVAILABLE`.
5. **Model Evaluation**: Runs pure functions (EPV, DCF) only if resolver yields `VERIFIED`.
