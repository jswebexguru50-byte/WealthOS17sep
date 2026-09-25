# StockScans Product-Parity Audit

**Scope.** Public, unauthenticated product surfaces reviewed on 24 September 2026. This is a clean-room product specification, not a reverse-engineering exercise. It records observable capabilities and public descriptions; it does not copy private code, scrape authenticated data, or infer hidden algorithms.

## Executive decision

StockScans is a useful product benchmark for three layers that complement the existing app:

1. **Discovery** — custom and prebuilt technical, fundamental, holdings, relative-performance and result scans.
2. **Evidence** — official-announcement, shareholding, result, concall and IPO workflows with saved filters and alerts.
3. **Decision workspace** — breadth dashboard, watchlists, custom thematic indices, peer/return comparisons, calculators and a scan-overlap view.

The app already has material foundations for strategy scans, DuckDB OHLCV, FERE official-source evidence, alerts, portfolio/watchlist views, and valuation/risk services. The priority is to make those foundations visible, fast, explicit about provenance, and composable in one research workflow rather than adding an unrelated second analytics stack.

## Public functionality inventory

| Area | Observable capability | StockScans evidence | App state / clean-room adoption |
|---|---|---|---|
| Universal navigation | Search stocks, indices and ETFs; chart and watchlist entry points | Public navigation | **Partial.** Standardise one instrument resolver using the canonical Upstox/NSE/BSE identity mapping and show exchange, ISIN and data freshness. |
| Stock scans | Saved, technical, fundamental, holdings, relative-performance and results-tracker categories; custom scan builder advertised with 300+ filters | `/scans` | **Partial.** Existing strategy engine is stronger for S1a–S5a. Add a declarative filter-builder, saved scan library, scan run history, universe/data-coverage badge and CSV/XLSX export. |
| Prebuilt technical scans | Movers, short/long breakouts, volume surge, weekly/monthly trend reversal, Stage 2, IPO drawdown, multi-year breakout, RSI/ADX/VSTOP combinations | `/scans` | **Partial.** Implement only deterministic versions backed by DuckDB; publish each formula, timeframe and parameter set beside results. Do not manufacture VSTOP/ADX values. |
| Prebuilt fundamental scans | Growth, deleveraging, margin expansion, near-high, valuation/ROCE, revenue/PAT growth combinations | `/scans` | **Partial.** FERE/XBRL can feed this once field-level freshness and missingness are surfaced. |
| Holdings / smart money scans | FII/DII ownership change, bulk/block deals, insider buy/sell, SAST and shareholder keyword lookup | `/shareholding-scans` | **Partial.** FERE tables already cover official shareholding and events. Build a single scan/query API with period-over-period diffs, source links and `unavailable` rather than a synthetic signal. |
| Result scans | Upcoming results, reported results, documents, analysis, tags, filters by industry/index/watchlist/date | `/result-scans` | **Partial.** Add a results calendar + filing timeline from official BSE/NSE evidence; label calendar status and last verified timestamp. |
| Announcement scans | Keyword full-text matching against official announcements, trending keywords, saved scans and alerts | `/announcement-scans` | **High-fit.** Build FTS over archived official announcement metadata/text, with explicit exchange URL, document hash, fetch time and company identity. |
| Concall scans | Upcoming calls, documents/highlights, result-quality and management-sentiment filters, alerts | `/concall-scans` | **Partial.** FERE can store official materials and claim candidates. Until an auditable transcript exists, show `no verified transcript` — never an invented summary/sentiment score. |
| IPO research | Current, historical and SEBI-filed IPOs; mainboard/SME filters; issue details and subscription figures | `/ipo-scans` | **Gap.** Separate module, lower priority than current holdings/FERE/dossier goals. Use official SEBI/exchange sources with timestamps. |
| Interview research | A distinct interview scan section | `/interview-scans` navigation | **Gap.** Defer unless source/licensing and evidence quality are defined. |
| Market dashboard | Benchmark index performance; selectable periods/date range; market breadth above EMA20/50/100/200; daily ±4% thrust; 52-week highs/lows | `/market-scans/dashboard` | **High-fit.** DuckDB can calculate all of this. Make the complete covered universe and as-of session prominent, with a coverage/exclusion count. |
| Sector / market scans | Public product describes sector leadership, weakness, momentum and participation | `/about-us` | **Partial.** Build on existing sector/index OHLCV; no claims for sectors lacking maintained constituents. |
| Watchlists | Thematic/sector/strategy lists with fundamentals, results, announcements, price/volume and matching scans | `/about-us`, pricing | **Partial.** Existing portfolio/watchlist foundations need a unified item detail, tag model and scan-match feed. |
| Alerts | Price, company, scan, watchlist and chart-drawing alerts over email/Telegram | `/about-us`, pricing | **Partial.** Existing alerts need durable rule definitions, idempotent delivery log, snooze/acknowledge and DuckDB/FERE data provenance. Telegram requires user credentials and explicit setup. |
| Custom indices | Create/copy prebuilt or own index; 1D/1W performance; alerts; equal-weight thematic index stated publicly | `/custom-index`, `/about-us` | **High-fit.** Implement versioned constituent sets and equal-weight daily rebalancing defaults; show alternative methodology only when explicitly selected. |
| Peer comparison | Compare companies across ratios, fundamentals, valuation, profitability, growth, leverage/efficiency and performance | `/peer-comparison` | **Partial.** FERE/XBRL can provide audited fields. Need metric definitions, period alignment and citations. |
| Returns benchmark | Compare chosen symbols with periods/date ranges | `/returns-benchmark` | **High-fit.** Use adjusted DuckDB candles, total-return caveat, and a visible missing-data policy. |
| Calculators | Earnings valuation, OPM valuation and reverse DCF | `/calculators` | **Partial.** Existing valuation services should be consolidated into a transparent calculator UI with saved assumptions and sensitivity tables. |
| Scan Match | Find top/common stocks across selected scans; add all to a watchlist | `/scan-match` | **High-fit.** Add an intersection/union engine over immutable scan-run IDs and parameter hashes; never mix results from different as-of dates without warning. |
| Charts | RSI, ADX, EMA/SMA, relative strength, drawings, saved layouts and drawing alerts are publicly described | `/about-us`, pricing | **Partial.** Primary data must stay DuckDB for historical candles, Upstox only for latest overlay, and show data-source/freshness. Drawing persistence is a separate local SQLite concern. |
| Company research | Financial statements, ratios, valuation, filings, corporate actions, charts, smart-money/disclosures, concall notes and guidance tracking | `/about-us` | **Partial.** FERE plus OHLCV is a stronger auditable base, but needs one evidence-first company page. |
| Guidance / walk-the-talk | Track guidance against eventual delivery | `/about-us` | **Partial.** This maps directly to FERE. Require source-cited management commitments, measurable outcome fields, and `not comparable` where a comparison cannot be made. |
| Research AI | Question-answering / analysis tiers | pricing | **Do not make this a core dependency.** Keep deterministic scans and FERE evidence independent of LLMs. If added later, it must be an optional summarisation layer that quotes/cites local evidence and cannot alter facts or scores. |

## Provenance and data-design requirements

Every adopted feature should expose the following fields in both API and UI:

- `asOf`: market session or filing timestamp used.
- `dataSource`: DuckDB adjusted OHLCV, Upstox live overlay, official NSE/BSE filing, archived XBRL, or unavailable.
- `coverage`: matched/eligible/unavailable symbols; exclusions must be downloadable.
- `formulaVersion` and `parameters`: required for all scans, breadth and valuation outputs.
- `evidenceUrl`, `documentHash` and `fetchedAt`: required for filing/FERE-derived facts.
- `noDataReason`: required instead of fallback synthetic numbers.

## Recommended delivery order

### P0 — consolidate existing real data (highest value)

1. **Research home and market-breadth API** calculated in DuckDB: index performance, EMA participation, ±4% movers and 52-week extremes.
2. **Scan-run registry and Scan Match**: parameter hash, date, universe coverage, matching reasons, result intersection and watchlist action.
3. **Evidence-first company page**: OHLCV/chart, latest filings, shareholding diffs, FERE card, source links and explicit freshness.
4. **Announcement and shareholding query APIs** over the already archived FERE evidence; full-text index only over text that is legally stored locally.

### P1 — research workspace

5. Custom index and returns benchmark with versioned constituent lists.
6. Peer comparison with period-aligned, cited XBRL/FERE values.
7. Result calendar and filing timeline.
8. Durable alerts with delivery/audit log.

### P2 — only after source quality is proven

9. Concall / walk-the-talk view from official documents and validated transcripts.
10. IPO and interview modules.
11. Optional evidence-grounded assistant; never used for data acquisition, scan decisions or numeric values.

## Clean-room implementation architecture

```
DuckDB adjusted OHLCV ──┐
Upstox live overlay ────┼─> MarketDataQueryService ─> scans / breadth / charts / benchmarks
Official FERE archive ──┤
FERE evidence SQLite ───┼─> EvidenceQueryService ───> filings / holdings / results / guidance
SQLite app state ───────┴─> WorkspaceService ───────> watchlists / layouts / alerts / saved scans
```

Use a job queue for long scans/enrichment, store immutable run records, and return cached results only when `formulaVersion`, parameter hash, universe revision and data revision all match.

## What can and cannot be reused

- **Can reuse:** public product ideas, conventional finance formulas, publicly documented API protocols, and genuinely open-source dependencies with compatible licences after a separate licence audit.
- **Cannot reuse from StockScans:** its private backend, client bundles, data feeds, subscription-gated output, database schema, signals, ranking logic, branding, or any code without an explicit open-source licence.
- **Public-source finding:** no official, licensed StockScans/SOIC code repository was located in the public GitHub/web search performed for this audit. That is not proof none exists; it means no code is approved for reuse unless the owner provides a repository and licence.

## Public-client architecture observations (inspiration only)

The unauthenticated client visibly uses a React root and Next.js-style `/_next/static/` route bundles. A protected prebuilt-scan URL redirects to a login route with the desired destination retained as a `next` parameter. These are appropriate inspirations for the app's information architecture:

- route-level/lazy-loaded views for heavy research modules;
- a single search-and-navigation shell around scans, company research, charts and watchlists;
- protected or entitlement-aware operations that preserve the caller's intended destination; and
- server-side scan execution, with the browser receiving only result views.

No bundled source was copied, deminified or used to infer algorithms. Client bundle delivery does not expose the platform's backend, source data transformations, ranking formulas or subscription-gated logic.

## Acceptance criteria for each feature

1. Uses real persisted data or visibly returns `unavailable`.
2. Shows as-of time, source and coverage.
3. Formula and parameters are inspectable/exportable.
4. Is deterministic when rerun against the same snapshot.
5. Does not add an LLM requirement to OHLCV, scoring, or FERE fact ingestion.
6. Has one API integration test plus a UI empty/loading/error/data state test.

## Public sources reviewed

- https://www.stockscans.in/pricing
- https://www.stockscans.in/scans
- https://www.stockscans.in/about-us
- https://www.stockscans.in/announcement-scans
- https://www.stockscans.in/shareholding-scans
- https://www.stockscans.in/concall-scans
- https://www.stockscans.in/ipo-scans
- https://www.stockscans.in/market-scans/dashboard
- https://www.stockscans.in/custom-index
- https://www.stockscans.in/peer-comparison
- https://www.stockscans.in/returns-benchmark
- https://www.stockscans.in/calculators
- https://www.stockscans.in/scan-match
