# Trendlyne acquisition contract

## Purpose

Use Trendlyne MCP as a licensed **source of raw evidence**, not as a substitute
for a dated financial-statement store.  Every acquisition run has a named pack,
an exact token list, a target freshness rule and an explicit consumer in the
application.  The runner must not make a request with fewer than ten symbols or
fewer than fifty parameters unless the caller explicitly approves a tail batch.

The MCP tool schema currently documents a hard limit of ten stock codes and an
input allowance of up to fifty parameter tokens.  One sentence in the provider
description still says ten parameters; therefore the first execution of each
new fifty-token pack must be a ten-symbol canary and must record the provider's
actual acceptance before it is used for a full universe.

## What Trendlyne can supply

| Area | Acquisition method | Correct use in WealthOS |
| --- | --- | --- |
| Current and relative financial/valuation values | `get_stock_parameter_values` | Deterministic source snapshot; canonical current facts only when the provider label, observation time and mapping are retained. |
| Relative multi-year values | parameter tokens such as `sramy1`, `opamy1`, `cfoamy1`, `roeamy1` | Historical context in raw evidence. Do **not** call these dated periods until a filing or provider response supplies the actual fiscal period-end. |
| Shareholding, DII/MF detail, SAST, bulk/block deals | `get_ownership_deals_insider_sast` | One-symbol endpoint; quarterly/event-driven evidence, not a ten-symbol parameter call. |
| Overview, technical summary, news and corporate actions | `get_overview_news_corp_events` | Overview every 15 days; technical/news/corporate event retrieval only when a scan or event needs it. OHLCV remains Kite/Upstox primary. |
| Annual reports, results, presentations and transcripts | `get_document_search_results` | Focused, dated retrieval for a company or a missing decision-critical field. Never make a broad universe-wide semantic document query. |

## Pack schedule

### P0: `CURRENT_SNAPSHOT_50`

**Scope:** all active universe symbols.  **Cadence:** 15 days, plus an earnings
or shareholding publication trigger.  **Batch:** exactly ten symbols x fifty
tokens.  This is the current default pack, after replacing the low-value
`insiderpinvokedyesterday` slot with `sra` (annual total revenue).

It covers price/market-cap/valuation; leverage/liquidity; annual and latest
quarter revenue, operating profit and PAT; CFO/cash flow/capex; returns;
ownership changes; dividend; and selected accounting-risk indicators.  It is
the right pack for the current dossier, master sheet, screen filters and
cross-sectional peer comparisons.

### P1: `FINANCIAL_HISTORY_50`

**Scope:** all companies with a live dossier or strategy signal, then the
remaining universe.  **Cadence:** once at onboarding, then after annual or
quarterly results.  **Batch:** exactly ten x fifty after the provider accepts a
canary.

The first tokens to verify and use are:

- Revenue: `sra`, `sramy1` ... `sramy5`, `totalsrq`, and reported quarterly
  revenue history.
- Operating profit/margin: `opa`, `opamy1` ... `opamy5`, `opq`, `opma`, and
  reported quarterly history.
- PAT: `pata`, `npq`, `npqmq1` ... `npqmq7`, `npqmy1`, `npqmy2`.
- CFO: `cfoa`, `cfoamy1` ... `cfoamy5`; capex only when the exact comparable
  annual token and unit are verified.
- Returns: `roea`, `roeamy1` ...; `rocea`, `roceamy1`, `roceaave3`,
  `roceaave5`.

This pack is raw historical context until actual reporting dates are validated.
It must never invent `periodEnd` from a label such as “1Yr Ago”.

### P2: `OWNERSHIP_AND_EVENT_EVIDENCE`

**Scope:** all active universe symbols. **Cadence:** shareholding quarterly;
SAST/bulk-block deals/news/corporate actions daily only for watched or newly
signalled symbols.  This pack uses the one-company ownership and event tools,
because no verified batch API exists for them.  It is not “wasted” capacity:
the provider endpoint itself only accepts one security.

Do not label `instihold` or `mfhold` as DII.  DII must come from the
shareholding response where it is explicitly identified; otherwise show
`DATA_INSUFFICIENT`.

### P3: `DOCUMENTED_CONTEXT`

**Scope:** a new dossier, material anomaly, or a quarterly/annual filing.
**Cadence:** 90 days plus filing trigger.  Fetch focused queries for business
drivers, capacity, input costs, customer concentration, management guidance,
risks, segment economics and governance.  Save the document identity, quoted
claim, period and retrieval timestamp.  Do not use semantic search results as
unattributed facts.

## Field ownership rules

- `market_cap`, valuation, ROE/ROCE, leverage, CFO, operating performance and
  explicit ownership values: Trendlyne P0/P1 where mapped and fresh.
- Dated financial statements, 8-quarter profitability, FCF, CFO/PAT and DCF:
  derive only from same-period, same-scope dated source facts.  Otherwise the
  status is `DATA_INSUFFICIENT`.
- Sector momentum, EMA/SMA, RSI, ATR and OHLCV: Kite/Upstox/DuckDB primary;
  Trendlyne technical response is corroborative only.
- Company sector/industry: canonical master ticker/search entity mapping.
- QGLP qualitative business, management, longevity and risks: cited company
  documents/FERE evidence, not snapshot ratios alone.

## Execution rules

1. Select due symbols by **pack-specific** TTL, then compact them across the
   priority universe before batching.  Hold a one-to-nine-symbol tail until the
   next due symbols exist; an operator may use `--allow-partial-batch` only for
   a one-off user-requested completion run.
2. Validate the parameter list has exactly fifty unique, catalog-verified
   tokens before the provider call.  A less-than-fifty list is a configuration
   error, not a silent request.
3. Store the named pack, raw response, provider label, fetched time, target
   symbol list and mapping version.  Promote only fields in
   `field_mapping_catalog`; preserve raw unpromoted values for later mapping.
4. Do not repeat P0 because P1/P2/P3 is due, and do not refresh documents on a
   generic 15-day timer.
5. Before adding a token, call `search_financial_parameters`, persist the
   returned token/label, run a ten-symbol canary, and update the mapping
   catalogue plus tests.  Never infer a masked token from its spelling.

## Immediate correction

The in-progress daily job was started before this contract and uses a valid
fifty-token P0 request for 230 symbols.  Let it finish; do not start a second
worker.  Its older `insiderpinvokedyesterday` slot is already replaced by `sra`
for subsequent P0 runs.  The next engineering change is pack-aware batching
and canonical promotion of the verified P0 fields, followed by a P1 canary.
