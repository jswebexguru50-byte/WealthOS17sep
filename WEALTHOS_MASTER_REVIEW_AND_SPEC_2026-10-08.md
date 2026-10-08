# WealthOS — Master Review, Benchmark and Developer Specification

**Date:** 2026-10-08 · **Audience:** product owner and developer bot · **Supersedes:** `UI_UX_REVIEW_2026-10-07.md` (kept as detail), `UI_DESIGN_EXAMPLES_2026-10-07.md` (kept as design reference), `WEALTHOS_REVIEW_AND_DEV_SPEC_2026-10-08.md` (replaced by this file; do not use both).

**Nature of this document:** review and recommendations only. The reviewer changed no application code, database or configuration.

---

## 0. Scope, method and evidence levels

### 0.1 Scope
In scope: UI/look and feel, colour, layout and workflow; functionality and bugs; data flow; database and indexing; backend architecture; stale/duplicate calls; redundant code; reports and search parameters; user friendliness; security; benchmark against comparable products; an implementation plan with guard rails and code stubs.
Out of scope: changing the forensic evidence engine's rules (governed by `AGENT_CONSTITUTION.md`), changing tax/financial calculation logic without a human sign-off, any production data operations.

### 0.2 Evidence levels used throughout
| Tag | Meaning |
|---|---|
| **[V]** | Verified by the reviewer reading the source directly. |
| **[R]** | Reported by a read-only sub-audit (grep/read). Plausible and cited, but the developer bot must re-confirm before acting. |
| **[RT]** | Observed at runtime in the **built front end** (`dist/`, build dated 2026-10-07 21:04) served statically with **no backend** (every `/api` call answered 503). This shows UI behaviour and error handling, not real data or backend speed. |
| **[W]** | From a web source (URL in §8); accessed 2026-10-08. Many vendor pages do not document the feature, so "not found" means "not verified", not "absent". |

### 0.3 What could not be done (honest limits)
- **The backend could not be started.** Neither Node nor Python is installed on this machine, and the server startup would touch the 3+ GB production database. Therefore: no real data screens, no measured API latency, no `EXPLAIN QUERY PLAN`, no profiling. Performance and indexing statements are static-analysis based.
- Duplicate-engine and duplicate-view findings come from names, sizes and endpoint overlap, not line-by-line diffs.
- Benchmark coverage is partial: Altruist, Arch/Allvue, ET Money, Winman and some NRI trackers were not found/reached; several rows rest on search-result snippets (flagged in §8).
- The audited local checkout is three commits behind `origin/ai-review` (tip `e1c3c9b9` and the fundamental-report commits); the UI commit was reviewed from its diff (§2).

---

## 1. Executive summary

WealthOS has unusual depth (NRI tax logic, FIFO with grandfathering, PMS/AIF reconciliation, autonomous signal generation) but the packaging has four systemic problems:

1. **Security is the blocking issue.** The API has no authentication; an HTTP route can deploy and execute code; purge/restore/database-download routes are open. The only sign-in is a client-side gate [RT] that does not protect the API.
2. **Misleading failure behaviour.** When data fails to load, some screens show a clear error [RT] (Overview, Discover), but Portfolio shows **₹0, 0.00%, Sharpe −0.41 and "Dividend Yield 0.00%" as if real** [RT]. In a financial product, placeholder zeros are worse than errors.
3. **Waste and drift.** Tab changes refetch everything; ~6 overlapping timers; ~16 files call Yahoo/Stooq directly; three capital-gains computations; duplicate routers/views; ~100 root files.
4. **UI inconsistency and density.** Three different navigation vocabularies (desktop, mobile bar, docs), tiny text, hard-coded colours, horizontal overflow on mobile [RT].

**Top 12 actions, in order:** (1) delete `deploy-sync`, rotate its secret; (2) global API authentication + startup check; (3) typed-confirm + pre-backup + audit on destructive routes; lock database download/restore; (4) never show zero-filled financial values on failed loads; (5) one market-data gateway with single-flight and one scheduler; (6) FIFO/sync as background jobs; (7) one capital-gains source of truth (`RealizedGains`); (8) frontend query cache, abort, per-tab error boundary; (9) index migration and query rewrites; (10) one report-parameter contract + server-side export; (11) NRI features (USD 1M NRO tracker, Form 145/146, 112A export presets); (12) delete dead code and clean the repo.

---

## 2. Changes already implemented (commit `e1c3c9b9`, "align default UI with institutional light review")

Reviewed from the diff (`src/App.tsx` +7/−6, `src/index.css` +17/−2) **[V]** and observed in the built UI **[RT]**.

| Change | Assessment |
|---|---|
| Removed the duplicate `'6. Audit…'` heading expression | Correct. Heading renders once [RT]. |
| Alerts, Reports, Layout, Theme, Preferences buttons → transparent + token borders | Good direction. **Incomplete:** Risk & VaR and Snapshot remain tinted/blue [RT]; icons keep `text-amber/cyan/emerald-400`. |
| Removed `animate-ping` on the Alerts dot | Good. "LIVE" pill still pulses and uses cyan/slate classes. |
| Fonts trimmed to Inter + JetBrains Mono | Good, **but** the built UI still resolves "Space Grotesk" as a font family [RT]; `--font-display` still names it. Either restore it or remove the reference. |
| `--accent-gold` → `#2457D6` and brand tokens added as an *override* | Works, but the misleading token name remains; other 16 themes unaffected. |
| `prefers-reduced-motion`, tabular numerals, body font | Good, low risk. |
| Mis-indented `className` lines | Run the formatter. |

**Still open from the first UI review:** four copies of the nav list; numbered nav labels; 17 themes + 11 layouts; low-contrast sidebar active/secondary labels and dark-on-dark banner text on Discover [RT]; ~17.5k raw palette classes [R]; ~2,065 uses of 8–10 px text [R].

---

## 3. Runtime observations [RT] (static build, no backend)

| # | Observation | Implication |
|---|---|---|
| RT1 | First screen is "Authorized Account Access" with the email pre-filled and a "Verified Owner" badge; one click signs in. | Client-side gate only. Not a security control. Matches `GoogleAuthModal` writing a default authorised email [R]. |
| RT2 | **Seven API calls fire at load, before sign-in:** `family-members`, `alerts`, `portfolios`, `dashboard`, `command-center`, `dashboard/xirr`, `growth-history`. | Data is requested behind the gate; confirms the API is the only real boundary (and it is open). Startup fan-out should be reduced (§6.3). |
| RT3 | Overview shows a clear pink error card ("Failed to load Command Center", "Try Again"). Discover shows an inline error banner. | Good pattern — should be universal. |
| RT4 | **Portfolio shows ₹0, "0.00% Today", "Sharpe −0.41", "0.00% Dividend Yield"** with no error. | **Bug:** failed/empty loads render fabricated-looking numbers. See B1. |
| RT5 | Navigating tabs only fetches that tab's own endpoints (e.g. Discover → `scrips-list`, `seven-strategies-candidates`); portfolio data is held in App state. | Partly mitigated for core data; per-tab data still refetches on revisit [R]. |
| RT6 | Desktop nav: "1. Overview / 2. Discover / 3. Analyze / 4. Portfolio / 5. Research / 6. Audit & System". **Mobile bottom bar: "Command / Net Worth / Engine / Tax/FEMA / Ledger / More…"** | Two different information architectures for the same app. |
| RT7 | Mobile (375 px): **horizontal overflow (page width 643 px vs 375 px)**; header branded "SAMSUNG S24 ULTRA"; toolbar clipped; 91 text nodes under 12 px of 170 (54%). | Mobile layout defects; device-specific label in product chrome. |
| RT8 | Login screen: 28 of 52 text nodes under 12 px; no icon-only buttons without names (good). | Tiny text pervasive even on the simplest screen. |
| RT9 | Header toolbar on desktop: Alerts, Risk & VaR, Snapshot, Reports, Layout ("Classic Standard"), Theme, Preferences + member + portfolio selectors. | Control overload persists. |
| RT10 | Discover: 7 sub-tabs visible with scroll, plus a second row of strategy pills (S1a…S5a, "Multi-Convergence"), plus filters. Three levels of tabs. | Over-nested navigation. |

---

## 4. Findings

### 4.1 Security (fix first)
| # | Finding | Evidence | Fix |
|---|---|---|---|
| S1 | **Remote code deployment route** `POST /api/admin/deploy-sync`: writes request-supplied files, runs `execSync('npx esbuild …')`, `pm2 restart`. Only guard is a literal string in code (not reproduced here; treat as compromised and rotate). | `server.ts:6658-6690` [V] | Delete route. Deploy via CI or a local script. |
| S2 | **No API authentication.** `requireAppPassword` is defined, never used; only `/api/ai-studio-proxy` checks `x-app-password`. | `config.ts:203` [V]; `server.ts:213-221` [R] | Global auth middleware; startup refuses to run with a tunnel and no password. |
| S3 | Tunnel tooling in repo (`cloudflared.exe`, `cloudflared_config.yml`, `run_cloudflared.bat`, `launch_server_and_tunnel.cjs`). | repo root [V] | Remove from repo; require S2 first. |
| S4 | Destructive routes open: `purge-everything`, `purge-transactions`, `purge-data` (body `confirm===true`), `purge-master-tickers`, `pms/purge-bank-book`, `DELETE /api/portfolios/:name`, `restore-database` + chunked upload. | `server.ts:12742-12813, 13476-13496, 11379, 14409-14495` [V for purge-everything and restore; R for the rest] | Auth + typed phrase + mandatory `VACUUM INTO` backup + audit row; delete "alias" duplicates. |
| S5 | `GET /api/admin/database-file` serves the entire DB (PAN, tokens) unauthenticated. | `server.ts:13526` [V] | Remove, or auth + admin role + audit. |
| S6 | CORS: no-Origin requests get first allowed origin; `*` + credentials possible; private-network header unconditional. | `server.ts:168-193` [R] | Strict allowlist. |
| S7 | One global limit (600/min/IP); heavy routes unlimited individually; tunnel clients may share one IP. | `server.ts:199` [R] | Per-route limits. |
| S8 | Validation ad hoc; zod helper exists but use unconfirmed; no `helmet`; 2 MB JSON cap global. | `config.ts`, `server.ts ~13500` [R] | zod on every POST/PUT; `helmet`. |
| S9 | Client-side "verified owner" gate with pre-filled email; hard-coded default authorised email. | RT1; `GoogleAuthModal.tsx:13-16` [R] | Replace with server-side auth; remove default email. |
| S10 | Secrets (tokens, broker keys) stored in the DB; DB copies and zips sit in the repo folder. | repo root; `server.ts:15062` [R] | Move secrets to env/OS keychain or encrypt; keep DBs out of git and zips. |

SQL injection: spot-checks found parameterised queries and whitelisted `ORDER BY`; none confirmed. Table-name interpolation (`server.ts ~13695`) must stay whitelisted.

### 4.2 Bugs and correctness
| # | Bug | Evidence |
|---|---|---|
| B1 | **Failed/empty loads render zeros and derived metrics (₹0, Sharpe −0.41, 0.00% yield) instead of an error/empty state.** | RT4 |
| B2 | Capital gains computed three ways (in-memory FIFO in `ReportsService`, audited `RealizedGains`, client CSV mappers with hard-coded 12.5%/20%) → numbers can differ between Reports modal, Schedule 112A and TaxView. | `ReportsEngineModal.tsx:~300` [R] |
| B3 | `assetClass` sent by Schedule 112A is dropped for `CAPITAL_GAINS`; filter has no effect. | `reports.ts:~20-38`, `Schedule112AReportModal.tsx:~55` [R] |
| B4 | Report catalog mislabels: three "performance" reports all run `HOLDING_STATEMENT`; "Unrealized Capital Gains" returns realised sells; "Computax" has no mapper. | `ReportsEngineModal.tsx:36-140` [R] |
| B5 | Report modal ignores HTTP errors (`res.ok`/`success` unchecked); 112A fails silently; raw `err.message` returned. | `ReportsEngineModal.tsx:222-231`, `reports.ts:42` [R] |
| B6 | `buildDateFilter` silently ignores a malformed FY and returns unfiltered data. | `ReportsService.ts:~30` [R] |
| B7 | NRI endpoints default FY hard-coded to `2024-2025`. | `nri.ts:14,29` [R] |
| B8 | `idx_sd_pan_fy` defined with different columns in two files; first-created wins. | `database.ts:1594` vs `fifoEngine.ts:330` [R] |
| B9 | `refreshAllCoreData` fires twice on portfolio select (handler + effect); event listener re-registers every render. | `App.tsx:537-545, 628-640` [R] |
| B10 | `setInterval(async …)` pollers can stack on slow responses; none pause when the tab is hidden. | `App.tsx:660-692`, several views [R] |
| B11 | CSV export via `encodeURI` data-URI risks truncation/corruption of `#` and `%`. | `ReportsEngineModal.tsx` [R] |
| B12 | Report SQL: `date(t.date)`, `UPPER(type)`, `LIKE '%x%'`, `OR` join to `MasterTickers` can duplicate rows or skip indexes. | `ReportsService.ts:55,76,332,402` [R] |
| B13 | Currency inferred from `portfolio==='US - IBKR' \|\| isin.startsWith('US')`. | `transactions.ts:~70` [R] |
| B14 | Search/transactions list refetches per keystroke (no debounce, no abort). | `TransactionsView.tsx:173-177` [R] |
| B15 | Mobile: horizontal overflow, "SAMSUNG S24 ULTRA" in header. | RT7 |
| B16 | `createPersistentBackup` copies a live WAL-mode DB (inconsistent copy risk) and has no found caller; periodic checkpoint only runs when `ENABLE_STARTUP_DB_MUTATIONS`. | `database.ts:36-58`, `server.ts:15670` [R] |

### 4.3 Architecture and redundant code
- `server.ts` 15,919 lines, ~175 inline routes beside ~25 routers [V/R]. Routers mounted twice: `reconciliationAuditRouter` at `/api/audit` and `/api/reconciliation-audit`; `strategiesRouter` at `/api/strategies` and `/api/technical-strategies` [V `:365-366, 373-374`]. Four routers share bare `/api` [V].
- Near-duplicate engines by name [R]: smart-money ×4, technical ×5, backtest ×3, daily pipeline ×2, reconciliation ×5, valuation ×2.
- Review scaffolding (`r421`, `r43`, `s110`, `s1101r2`…) beside runtime code; ~100 root `.md`, many `.cjs`, DB copies, `.bak`, zips [R].
- Frontend: 9 files > 2,000 lines (largest 9,617); 4 components imported nowhere (`AnalyzeWorkspace`, `EvidenceSpineHeader`, `MiniChartThumbnail`, `PortfolioSelector`) and ~25k lines of probable transitive dead code; ≥9 dossier/stock views, ≥7 screener/quant views, 9 hubs, duplicate `SettingsView`/`SettingsHubView` and `PortfolioManagerView`/`PMSManagerView` [R].
- `lib/formatters.ts` imported by only 14 files; ~149 inline `toLocaleString`; `formatCurrency` passed as a prop to 28 files [R].
- `App.tsx`: 34 `useState`, 0 `useMemo/useCallback`; `AuditWorkspace` 25 props, `PortfolioHubView` 17 [R].
- 609 `any`; 91 `alert/confirm`; 0 `AbortController`; 0 `React.memo`; 0 virtualisation; localStorage and `window` events used as message buses [R].

### 4.4 Data flow, stale and duplicate calls
1. FIFO recalculate and corporate-action sync run `autoFetchMarketData` for every portfolio **inside the HTTP request** (`server.ts:12462-12468, 10869`); `:10807` races a 6 s timeout without cancelling [R].
2. ~6 overlapping timers: 45 s market loop (unguarded), second scheduler with its own forex cycle, pre-calc, backtest, live stream tick/heartbeat, event stream [R].
3. Yahoo/Stooq called directly from ~16 files with no shared cache; `MarketDataCache.ts` exists but is not the single gateway [R].
4. 43 `SELECT *` in `server.ts`; whole-table loads in exports and reports [R].
5. XIRR/valuation recomputed inline; only an in-memory dashboard cache (3 min), invalidated wholesale (11 call sites) [R].
6. Frontend: tab switch unmounts workspaces (`App.tsx:1786-1792`); `refreshAllCoreData` (3 calls) called from 24+ places; `/api/portfolios` refetched by 4 components; pollers uncoordinated [R]. Startup fan-out of 7 calls [RT2].

### 4.5 Database and indexing (static)
- ~20 indexes on `Transactions`, including triplicate `(portfolio, isin, date)` under three names and duplicate single-column indexes; `HistoricalPrices(symbol,date)` declared three times [R].
- Hot queries defeat indexes (see B12). Missing: `Transactions(portfolio, date DESC, id DESC)`; normalised `type_norm` and `search_key`; `RealizedGains(portfolio, financial_year, sell_date)`; partial `Holdings(portfolio) WHERE quantity>0`; FTS5 for free-text.
- Proposed migration exists at `ai-review/2026-10-07-Analysis/index_migration_PROPOSED.sql` (not applied) [R].
- Trim job deletes large history ranges unbatched; WAL checkpoint gating (B16).

### 4.6 Reports and search
- One API `POST /api/reports/generate` (JSON only): `reportType, portfolio, financialYear, startDate, endDate, assetClass, includeGrandfathering`. Other report-like endpoints use `fy`, `financial_year`, `start_date`, `portfolios`+`member_id`; "all" is `Combined`/`all`/`ALL`/`ALL_TIME` [R].
- `ReportStudioView` (2,045 lines): client-side grouping/filter/export; `include_sold=false` hard-coded; `nocache=true`; single portfolio; presets in localStorage; PDF = `window.print()` [R].
- `GET /api/transactions/export` dumps three whole tables; client requests `limit=100000`, server does not cap [R].
- Missing for NRI/family-office users: consolidated multi-currency statement with as-of date; XIRR by period; FX gain/loss; TDS/FEMA exports (endpoints exist, not in catalog); realised vs unrealised tax estimate; income with TDS; charges by FY; audit-trail report; scheduled/emailed reports; report history.

### 4.7 UI, colour, layout, user friendliness
Detail in `UI_UX_REVIEW_2026-10-07.md` and `UI_DESIGN_EXAMPLES_2026-10-07.md`. Key points: calm light default with one brand colour; semantic status colours with icons (never colour alone); asset-class and chart palettes; Home with KPI row + "needs attention"; global search; ≥12 px text; drawers instead of stacked modals; plain-language sub-tab names; single nav source; one IA for desktop and mobile (RT6); Light + Dark only; density switch instead of 11 layouts.

---

## 5. Benchmark (sourced where possible)

Method: vendor/help pages read on 2026-10-08. "Not found" means not verified. See §8 for URLs and the snippet-level caveats.

### 5.1 What leaders document, and what WealthOS should take
| Pattern | Seen at [W] | WealthOS status | Recommendation |
|---|---|---|---|
| Role/entity/user-scoped permissions; per-person, per-portfolio sharing revocable in one click | Masttro, Kubera, Addepar (granular RBAC) | Single owner, no server auth | RBAC by family member; view-only share links (P2) |
| SOC 2 / ISO 27001, MFA/SSO, audit capability | Addepar (SOC 2 Type II), Masttro (ISO 27001, MFA), INDmoney (ISO 27001, PCI DSS), Zerodha (TOTP 2FA) | None on API | Auth + TOTP 2FA + audit log table (P0/P2); do not claim certifications |
| Auto-reconciliation of alternatives against cash flows; overnight reconciliation status | Masttro; Orion (3P) | Strong engine, weak surfacing | Show a reconciliation-status chip on Home linked to the break list |
| Private-fund tracking (commitment, calls, distributions, IRR) | Kubera, Masttro | PMS/AIF exist; call/distribution ledger not confirmed | Add AIF cash-call/distribution ledger and IRR |
| "Recap: what moved and why" on home | Kubera | None | Home "What changed" tile (day/week attribution) |
| One-click display-currency switch for all totals | Kubera | INR/USD handled ad hoc (B13) | Global ₹/$ segmented control with stored FX source/date |
| Switchable performance method (TWR/IRR/simple) | Orion (3P snippet) | XIRR only | Offer TWR + XIRR with method label |
| Look-through across entities | Addepar, Masttro | Family hierarchy exists | Expose entity tree rollups in Portfolio |
| Consolidated client portal / white-label | Addepar, Masttro | None | Out of scope now; read-only family view later |
| FY + quarter + segment filter on every tax report; advance-tax by quarter | Zerodha Console | FY only, inconsistent | Standard `period` parameter (§6.3) and advance-tax view |
| Tradewise ledger with grandfathered cost and ISIN for Sec 112A | Zerodha | Present in engine | Direct 112A export preset |
| Reconciliation note when charges span FYs | Zerodha | None | Surface in tax report |
| Capital-gains export presets for filing tools (ClearTax, Winman, Spectrum) | MProfit | ClearTax/Winman mappers exist, Computax missing | Add Spectrum/Computax mappers and server-side export |
| Consent-based MF import (MF Central OTP), CAS fallback; broker-agnostic import (1,500+ sources, contract notes) | INDmoney, MProfit | CAMS/CAS + Zerodha + PMS | Add MF Central consent import and contract-note parser backlog |
| Fund overlap analysis | INDmoney | None | Add overlap view for MF holdings |
| Group-by overlay (strategy/smallcase) | Tickertape | Studio group-by (client only) | Server-side group-by in reports |
| Explicit NRI flow: residency, TDS, DTAA (TRC + Form 10F), Form 145/146, USD 1M NRO limit | ClearTax, blogs (3P) | TDS recon and repatriation exist, not guided | Guided NRI stepper + **USD 1M NRO limit tracker** (no competitor showed one) |

### 5.2 Position
- **Ahead:** NRI tax and repatriation depth, PMS/AIF reconciliation, FIFO with grandfathering, research/idea breadth.
- **Behind:** authentication/RBAC/audit, onboarding clarity, consistent mobile/desktop design, report builder and exports, scheduled reports, honest failure states.
- **UX conventions** (gain/loss colour, dashboard tiles, command palette, saved screens) were **not found** in sources; recommendations in §6.1 are design judgement, not benchmarked facts.

### 5.3 NRI tax facts to verify before building (all third-party, snippet-level)
Form 15CB where remittance exceeds ₹5 lakh and taxable; for remittances on/after 1 Apr 2026 Form 145 replaces 15CA and Form 146 replaces 15CB under the Income-tax Act 2025; NRO repatriation limit USD 1M per FY; Sec 112A applies to NRIs and basic exemption cannot be set against it; LTCG rate/threshold quoted by one blog may be outdated. **Require a human tax professional to confirm every rate, form name and limit against the Income Tax Department before it enters code.**

---

## 6. Specification

### 6.1 UI specification
1. **Navigation:** five destinations — Home, Portfolio, Ideas, Tax & NRI, Data & Settings — from one `NAV_ITEMS`; same on desktop and mobile; remove numbering; keep old tab ids as aliases for one release.
2. **Header:** one context bar (member, portfolio scope, ₹/$ switch, data freshness chip, Alerts bell, overflow menu). Risk, Snapshot, Reports, Theme, Layout, Preferences move into Portfolio sections or the overflow.
3. **Home:** KPI row (Net worth, Today, Total gain/XIRR, Cash & FDs) → "Needs attention" strip (stale prices, reconciliation breaks, tax-harvest, **NRO limit usage**) → Allocation (stacked bar + list) and Performance vs benchmark → Top movers, Upcoming, Ideas.
4. **Tokens:** adopt "Ledger Blue" palette from `UI_DESIGN_EXAMPLES_2026-10-07.md` (light and dark); semantic gain/loss/attention/info; asset-class and chart palettes; rename `--accent-gold` to `--brand`.
5. **Typography:** Inter only; minimum 12 px; tabular numerals on figures; uppercase only for tiny eyebrows.
6. **States:** every data view uses `AsyncState` (skeleton, error with Retry, empty with next action). **Never render a zero or derived metric when the load failed (B1).**
7. **Components:** `KpiTile`, `DeltaChip`, `StatusPill`, `DataTable` (sticky header, virtualised, column chooser), `Drawer`, `EmptyState`, `ErrorState`, `ConfirmationModal` (replaces `alert/confirm`).
8. **Mobile:** no horizontal scroll; 2×2 KPI grid; tables become cards; remove device-specific branding text.
9. **Accessibility:** `aria-label` on icon buttons, tab semantics, focus management on tab change, status never by colour alone.
10. **Themes:** ship Light + Dark; other themes behind a feature flag; density switch (Comfortable/Compact) replaces 11 layouts.

### 6.2 Backend and architecture specification
1. Mount each router once; move inline `server.ts` handlers into domain routers; delete alias routes after a deprecation shim that logs a warning.
2. One `MarketDataGateway` (single-flight, TTL, circuit breaker); remove direct Yahoo/Stooq/XE calls elsewhere.
3. One `scheduler` module with overlap guard; replace the ~6 timers.
4. Job queue for FIFO recalculation, price sync and heavy reports (202 + job id + status endpoint).
5. Consistent backup via `VACUUM INTO` on a daily schedule; `wal_checkpoint(TRUNCATE)` on a timer (not env-gated); batched deletes for trims.
6. Store per-portfolio XIRR/valuation snapshots (tables exist) and serve from them; targeted cache invalidation.
7. Auth: global middleware; roles `OWNER`, `FAMILY_VIEW`, `ACCOUNTANT_READONLY`; audit table for all mutations and exports.
8. Pick one engine per domain; archive the rest (after caller check).

### 6.3 Database specification
1. Additive migration, tested on a copy: drop duplicate indexes; add `type_norm`, `search_key`; add the hot-path indexes (§7.6); resolve `idx_sd_pan_fy`.
2. Replace `OR` master join with `isin` join plus symbol fallback; replace `date(col)` and `UPPER()` filters.
3. Free-text search via FTS5 or prefix `search_key`.
4. Add `AuditLog(id, ts, actor, action, target, params_hash, result)` and `ReportRuns(id, ts, actor, type, params_json, row_count, file_hash)`.
5. Add `NroRepatriationLedger` view/usage metrics for the USD 1M tracker (reuse `FemaRepatriationLedger`; no new table unless sign-off per constitution).
6. Currency stored per transaction/portfolio, not inferred (B13).
7. Keep DB files out of git and zips; document backup/restore procedure.

### 6.4 Reports specification
Standard parameter contract (all report/list endpoints):

| Parameter | Type | Notes |
|---|---|---|
| `scope.memberIds[]`, `scope.portfolios[]` | string[] | empty = all permitted; replaces `Combined/all/ALL` |
| `period.preset` | `MTD|QTD|YTD|FY|1M|3M|6M|1Y|3Y|5Y|ITD|CUSTOM` | |
| `period.fy` | `YYYY-YY` (e.g. `2025-26`) | one parser; 400 on invalid |
| `period.quarter` | `Q1..Q4` | advance-tax view |
| `period.from`, `period.to` | ISO date | inclusive |
| `asOf` | ISO date | valuation date |
| `filters.assetClass[]`, `symbols[]`, `isins[]`, `txnTypes[]`, `includeSold` | | |
| `currency.display` | `INR|USD` | with `fxSource`, `fxDate` |
| `benchmark`, `performanceMethod` | symbol, `XIRR|TWR|SIMPLE` | |
| `taxRegime` | `OLD|NEW` | |
| `groupBy[]` | `portfolio|assetClass|sector|member|month|fy` | |
| `sort`, `page`, `pageSize` | | `pageSize` ≤ 500 |
| `format` | `json|csv|xlsx|pdf` | server-side; header block with as-of, parameters, generated-at, app version |

Report catalog (target): Holdings statement (as-of), Consolidated family statement (multi-currency), Performance (period XIRR/TWR vs benchmark), Capital gains (FY, from `RealizedGains`, with loss set-off/carry-forward), Schedule 112A export (+ ClearTax/Winman/Spectrum/Computax presets), Unrealised gains and tax estimate, Income/dividends with TDS, TDS reconciliation, FEMA/NRO repatriation (with USD 1M tracker), FX gain/loss, Charges by FY, Transactions ledger, Reconciliation breaks, Audit trail. Scheduled delivery and report history are phase-2.

### 6.5 New functionality and enhancements (prioritised)
| Priority | Enhancement | Rationale |
|---|---|---|
| P0 | Global auth + audit log | Security |
| P1 | "Needs attention" Home strip | Answers "what do I do now?" |
| P1 | Global search / command palette (Ctrl+K) | Navigation across 90+ views |
| P1 | ₹/$ display switch with FX source/date | Kubera pattern; fixes B13 |
| P1 | NRO USD 1M repatriation tracker + Form 145/146 guided stepper | NRI differentiator; no competitor showed it |
| P2 | Period XIRR and TWR with method label | Orion pattern |
| P2 | Role-based sharing (`FAMILY_VIEW`, accountant read-only) | Addepar/Masttro/Kubera pattern |
| P2 | AIF cash-call/distribution ledger + IRR | Kubera/Masttro pattern |
| P2 | "What changed" attribution tile | Kubera "Recap" |
| P3 | MF Central consent import; contract-note parser | INDmoney/MProfit pattern |
| P3 | Fund overlap view | INDmoney |
| P3 | Scheduled/emailed reports; report history | Institutional norm |
| P3 | Saved views/presets stored per member on the server | Replace localStorage presets |

---

## 7. Code stubs (illustrative TypeScript/SQL — adapt to repo conventions: ESM `.js` import suffix, `dbAll/dbRun/dbGet`, response `{ success, message, data }`)

### 7.1 Global auth and destructive guard
```ts
// src/server/middleware/auth.ts
import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
const PUBLIC = new Set(['/api/health']);
export function requireAuth(expected = process.env.APP_PASSWORD) {
  if (!expected) throw new Error('APP_PASSWORD must be set');
  const exp = Buffer.from(expected);
  return (req: Request, res: Response, next: NextFunction) => {
    if (PUBLIC.has(req.path)) return next();
    const got = Buffer.from(String(req.header('x-app-password') ?? ''));
    if (got.length !== exp.length || !crypto.timingSafeEqual(got, exp))
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    next();
  };
}
export const requireDestructiveConfirm = (phrase: string) =>
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.body?.confirmPhrase !== phrase)
      return res.status(400).json({ success: false, message: `Type "${phrase}" to confirm` });
    await createConsistentBackup('pre-destructive');      // VACUUM INTO
    await writeAuditLog(req, 'DESTRUCTIVE', req.path);
    next();
  };
// server.ts: app.use('/api', requireAuth());  // before all routers
```

### 7.2 Market-data gateway (single-flight + TTL)
```ts
export class MarketDataGateway {
  private inflight = new Map<string, Promise<unknown>>();
  private cache = new Map<string, { at: number; v: unknown }>();
  constructor(private ttlMs = 30_000) {}
  async get<T>(key: string, fetcher: () => Promise<T>, ttl = this.ttlMs): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.v as T;
    const live = this.inflight.get(key);
    if (live) return live as Promise<T>;
    const p = fetcher().then(v => (this.cache.set(key, { at: Date.now(), v }), v))
                       .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
}
```

### 7.3 Scheduler with overlap guard and 7.4 job queue
```ts
export function every(name: string, ms: number, job: () => Promise<void>) {
  let running = false;
  return setInterval(async () => {
    if (running) return console.warn(`[scheduler] ${name} skipped (still running)`);
    running = true; const t0 = Date.now();
    try { await job(); } catch (e) { console.error(`[scheduler] ${name}`, e); }
    finally { running = false; console.info(`[scheduler] ${name} ${Date.now() - t0}ms`); }
  }, ms);
}
// Heavy op -> 202
let fifoJob: string | null = null;
router.post('/fifo/recalculate', async (_req, res) => {
  if (fifoJob) return res.status(202).json({ success: true, data: { jobId: fifoJob, reused: true } });
  const id = crypto.randomUUID(); fifoJob = id; jobs.set(id, { status: 'running', progress: 0 });
  runFifoJob(id).finally(() => (fifoJob = null));
  res.status(202).json({ success: true, data: { jobId: id } });
});
```

### 7.5 Backup, WAL, batched trim
```ts
await dbRun(db, `VACUUM INTO ?`, [backupPath]);
await dbRun(db, `PRAGMA wal_checkpoint(TRUNCATE)`);
for (;;) {
  const r = await dbRun(db, `DELETE FROM HistoricalPrices WHERE rowid IN
    (SELECT rowid FROM HistoricalPrices WHERE date < ? LIMIT 5000)`, [cutoff]);
  if (!r.changes) break; await new Promise(r => setTimeout(r, 25));
}
```

### 7.6 Index migration (additive; test on a copy; compare `EXPLAIN QUERY PLAN` before/after)
```sql
DROP INDEX IF EXISTS idx_txns_port_isin_date;      -- keep idx_txn_port_isin_date (confirm identical first)
DROP INDEX IF EXISTS idx_txns_symbol;              -- keep idx_tx_sym_date
ALTER TABLE Transactions ADD COLUMN type_norm TEXT;
ALTER TABLE Transactions ADD COLUMN search_key TEXT;
UPDATE Transactions SET type_norm = UPPER(type) WHERE type_norm IS NULL;   -- batch it
CREATE INDEX IF NOT EXISTS idx_tx_port_date_id   ON Transactions(portfolio, date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_tx_port_type_date ON Transactions(portfolio, type_norm, date);
CREATE INDEX IF NOT EXISTS idx_rg_port_fy_sell   ON RealizedGains(portfolio, financial_year, sell_date);
CREATE INDEX IF NOT EXISTS idx_holdings_port_open ON Holdings(portfolio) WHERE quantity > 0;
-- Query rewrites: date(t.date) >= date(?) -> t.date >= ?; OR master join -> isin join + COALESCE symbol fallback;
-- LIKE '%x%' -> prefix match on search_key or FTS5.
```

### 7.7 Report contract (shared by server and client)
```ts
import { z } from 'zod';
export const Fy = z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-YY, e.g. 2025-26');
export const ReportParams = z.object({
  scope: z.object({ memberIds: z.array(z.string()).default([]), portfolios: z.array(z.string()).default([]) }).default({}),
  period: z.object({
    preset: z.enum(['MTD','QTD','YTD','FY','1M','3M','6M','1Y','3Y','5Y','ITD','CUSTOM']).default('FY'),
    fy: Fy.optional(), quarter: z.enum(['Q1','Q2','Q3','Q4']).optional(),
    from: z.string().date().optional(), to: z.string().date().optional(),
  }).default({}),
  asOf: z.string().date().optional(),
  filters: z.object({
    assetClass: z.array(z.string()).default([]), symbols: z.array(z.string()).default([]),
    isins: z.array(z.string()).default([]), txnTypes: z.array(z.string()).default([]),
    includeSold: z.boolean().default(false) }).default({}),
  currency: z.object({ display: z.enum(['INR','USD']).default('INR') }).default({}),
  performanceMethod: z.enum(['XIRR','TWR','SIMPLE']).default('XIRR'),
  benchmark: z.string().optional(), groupBy: z.array(z.string()).default([]),
  page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(500).default(100),
  format: z.enum(['json','csv','xlsx','pdf']).default('json'),
});
// POST /api/reports/:type -> parse -> 400 on error (never ignore a bad FY).
// GET  /api/reports/:type/export -> streamed file with header block (generatedAt, asOf, params, appVersion).
// Capital gains MUST read RealizedGains (+ CarriedForwardLosses); no in-memory FIFO; no client-side tax rates.
```

### 7.8 Frontend: query cache, polling, async state, honest failure
```tsx
// TanStack Query defaults: staleTime 30_000, retry 1, refetchOnWindowFocus false
const { data, error, isLoading, refetch } = useQuery({
  queryKey: ['dashboard', scope],
  queryFn: ({ signal }) => api.get('/api/dashboard', { signal }),
});
// after a mutation: queryClient.invalidateQueries({ queryKey: ['dashboard'] })   // targeted

export function usePolling(fn: (s: AbortSignal) => Promise<void>, ms: number) {
  useEffect(() => {
    let stop = false, t: number; const ac = new AbortController();
    const loop = async () => {
      if (!document.hidden) { try { await fn(ac.signal); } catch {} }
      if (!stop) t = window.setTimeout(loop, ms);
    };
    loop(); return () => { stop = true; ac.abort(); clearTimeout(t); };
  }, [fn, ms]);
}

// B1: never coerce missing data to numbers
const nav = data?.metrics?.marketValue;                 // number | undefined
return <AsyncState loading={isLoading} error={error} empty={nav == null} onRetry={refetch}>
  <KpiTile label="Market valuation" value={formatINR(nav!)} />
</AsyncState>;
// Wrap every lazy workspace: <ErrorBoundary><Suspense fallback={<Skeleton/>}>…</Suspense></ErrorBoundary>
```

### 7.9 Single navigation source and debounced search
```ts
export const NAV_ITEMS = [
  { id: 'HOME', label: 'Home', icon: Home }, { id: 'PORTFOLIO', label: 'Portfolio', icon: Wallet },
  { id: 'IDEAS', label: 'Ideas', icon: Sparkles }, { id: 'TAX', label: 'Tax & NRI', icon: Receipt },
  { id: 'DATA', label: 'Data & Settings', icon: Settings },
] as const;   // desktop sidebar, mobile bar, title and routing all read this
const q = useDebouncedValue(search, 300);   // + AbortController via query signal; server pageSize <= 500
```

### 7.10 NRO limit tracker (spec only; rates/limits to be confirmed by a tax professional)
```ts
// Inputs: FemaRepatriationLedger rows for FY, account type (NRO), configured limit (default USD 1,000,000)
// Output: { usedUsd, remainingUsd, pctUsed, lastRemittance, formsRequired: [...] }
// Surface: Home "Needs attention" chip at >=80% used; Tax & NRI stepper step 3.
```

---

## 8. Sources for the benchmark (accessed 2026-10-08)

**Institutional / global**
- Addepar RIA solutions: addepar.com/solutions/ria (security, reporting, multi-currency, aggregation)
- Masttro multi-family office: masttro.com/multi-family-office; masttro.com/insights/best-family-office-software
- Kubera: kubera.com/wealth-tracker
- Orion (third-party): tour.orion.com/answers/portfolio-accounting-software; orionadvisortech.com/blog/tech-tip-thursday-show-the-best-performance-calculation-method-for-your-clients/ (search snippet only)
- Addepar third-party summary: andsimple.co/companies/addepar/ (3P)

**India / NRI**
- Zerodha: support.zerodha.com/category/console/reports/articles/i-need-a-profit-and-loss-report-for-a-tax-audit-where-can-i-get-this-from; zerodha.com/z-connect/business-updates/tax-reports-at-zerodha; support.zerodha.com/category/trading-and-markets/general-kite/login-credentials-of-trading-platforms/articles/set-up-2fa-security
- Groww (via ClearTax): cleartax.in/s/groww-p-and-l-statement-for-itr-filing (snippet)
- Kuvera: kuvera.in/blog/?p=41428 (snippet)
- INDmoney: indmoney.com/mutual-funds/track-mutual-funds
- Tickertape: help.tickertape.in/support/discussions/topics/82000675554
- Smallcase (via Kotak): kotaksecurities.com/smallcases/what-is-smallcase-portfolio-and-how-to-track-it/ (snippet)
- Screener.in: support.screener.in/article/28-export-screen-results
- MProfit: mprofit.in/features; mprofit.in/help/getting-started/cams-cas-import
- ClearTax NRE/NRO: cleartax.in/s/nre-nro-taxation
- NRI tax facts (3P, verify): taxaj.com/learn/?p=935; calcguru.in/?p=6163

**Caveats:** official pages were fetched directly only for Zerodha tax P&L, Screener export, INDmoney track-funds, MProfit features, Kubera, Addepar and Masttro; others are snippet-level. Not found: ET Money, Winman, dedicated NRI portfolio trackers, gain/loss colour conventions, dashboard-tile and command-palette conventions, Screener saved-screen details.

---

## 9. Constitution (non-negotiable rules for the developer bot)

This is a **remediation constitution**. It coexists with `AGENT_CONSTITUTION.md` (Forensic Scrip Evidence Engine, "No evidence = no conclusion", one ACTIVE phase, no new tables/services without sign-off). **Where they conflict, the stricter rule wins, and the forensic engine's scope lock is not modified by this work.** A human must mark which remediation phase is ACTIVE; the bot works only on that phase.

1. **Truthful numbers.** A financial value is either backed by loaded data or shown as unavailable. Never default to zero, never show a derived metric from missing inputs (B1).
2. **No silent changes to money logic.** FIFO, grandfathering, XIRR, tax rates, FX and repatriation limits change only with a human sign-off and a before/after reconciliation on a fixture.
3. **Evidence before action.** Every finding marked [R] is re-confirmed (file, line, reproduction) before it is changed. If not reproducible, record it and skip.
4. **Scope lock.** Work only on the ACTIVE phase's tasks. Out-of-phase ideas go in the PR description as "deferred".
5. **Least surface.** No new tables, services or dependencies without a "Sign-off log" line (name/date). Prefer reusing existing tables (`RealizedGains`, `FemaRepatriationLedger`, `PortfolioHistory`, `ValuationSnapshots`).
6. **Secure by default.** Every endpoint authenticated, validated, rate-limited as appropriate; destructive actions require typed confirmation, a backup and an audit row.
7. **Reversible and observable.** Migrations additive and idempotent; every change has a rollback note; background jobs log duration and outcome.
8. **Single source of truth.** One market-data gateway, one scheduler, one capital-gains source, one navigation list, one report contract, one formatter library.
9. **Honest UX.** Loading, empty and error states everywhere; no colour-only status; no text below 12 px in new code.
10. **Human gates.** Stop and ask when a change touches tax numbers, authentication policy, data deletion, production secrets, or the forensic engine.

---

## 10. Guard rails (checklists the bot must pass)

**Data and environment**
1. Never touch `portfolio.db*`, `*.bak*`, `*_backup.db`, `intraday_history.db*`, uploads or financial data files. Never call purge/restore/recalculate against real data; use a copy or fixture DB.
2. Snapshot any DB (`VACUUM INTO`) before testing a migration; migrations: no `DROP TABLE`, no `UPDATE` without `WHERE` and a row-count assertion.
3. Never print, log or commit secrets; rotate the deploy secret found in `server.ts`; secrets via environment/OS keychain.

**Git**
4. New branch from the latest `origin/ai-review`; never force-push, never rewrite history, never commit to `master`. One concern per PR (≈400 changed lines max); conventional commits.

**Quality gates (every PR)**
5. `npm run lint` clean; unit + integration tests pass; tests added for each behaviour change and each fixed bug (B1–B16).
6. No new `any`; no new `alert/confirm`; no `setInterval` outside the scheduler; no direct Yahoo/Stooq/XE call outside the gateway; no raw palette classes (`bg-slate-*`, `text-cyan-*`…); no text < 12 px.
7. Every new endpoint: zod validation, auth, pagination (max 500), documented error shape, no `SELECT *`.
8. Every list/search UI: 300 ms debounce, abort on unmount, loading/empty/error states, `aria-label` on icon buttons.
9. Performance budgets (measure on the fixture DB and attach numbers): dashboard first paint ≤ 2 s; no critical-path request > 1 s p95; no JSON response > 5 MB; startup to ready ≤ 5 s.
10. Deletions: prove "dead" with `knip`/`ts-prune` plus grep; move to `archive/` first, delete in a later PR; keep a one-release deprecation shim (with warning log) for removed routes after grepping callers.
11. Tax/NRI content (rates, form names, limits): implement only values confirmed in writing by a tax professional; cite the source in the PR.

---

## 11. Implementation plan

| Phase | Time | Scope | Key tasks | Acceptance criteria |
|---|---|---|---|---|
| **P0 Stop the bleeding** | 1–2 days | Security | Delete `deploy-sync`, rotate secret; global auth + startup check; typed confirm + backup + audit on destructive routes; lock database-file/restore; CORS allowlist; remove tunnel files from repo; remove default-email gate | Unauthenticated `/api/*` (except health) → 401; purge without phrase → 400; tests per route; no secret in source |
| **P1 Truth and stability** | 1 week | B1 + data flow | Fix zero-fill (B1) across Portfolio/Dashboard; `AsyncState`; gateway; scheduler; job queue; consistent backup/WAL; mount routers once | Failed load shows error/empty, never ₹0; no overlapping cycles in logs; recalculate returns 202 < 200 ms; ≤1 external call per symbol per TTL (test) |
| **P2 Index and query** | 3–4 days | DB | Migration §7.6 on a copy; rewrite function-wrapped filters; drop duplicates; fix `idx_sd_pan_fy`; cap `limit`; stream exports | `EXPLAIN QUERY PLAN` shows index use for transactions list, FY capital gains, holdings statement; list p95 < 200 ms on fixture |
| **P3 Reports** | 1–2 weeks | Reports | `ReportParams`; one FY parser; capital gains from `RealizedGains`; fix catalog (B2–B6, B11–B12); server-side csv/xlsx/pdf with header block; period XIRR/TWR; FX gain; TDS/FEMA export; audit-trail report | Same FY total in Reports, 112A and TaxView (tolerance ₹1); bad FY → 400; 100k-row export streams without memory spike |
| **P4 Frontend foundation** | 1–2 weeks | Frontend | TanStack Query + abort; keep tabs cached; remove double refresh (B9); polling hook (B10); per-tab ErrorBoundary; replace `alert/confirm`; `NAV_ITEMS` (desktop + mobile); delete confirmed dead files | Revisit within staleTime = 0 requests; no duplicate `/api/portfolios`; navigation aborts in-flight; no `alert(`/`confirm(` |
| **P5 UI polish** | 1–2 weeks | UI | Header redesign; tokens + Light/Dark; Home layout + "needs attention"; Ctrl+K; mobile overflow and branding (B15); contrast fixes; status pills with icons; tab semantics | Contrast ≥ 4.5:1; no horizontal scroll at 375 px; axe/jsx-a11y clean; Lighthouse a11y ≥ 90 on Home |
| **P6 NRI and family-office features** | 2–3 weeks | Features | NRO USD 1M tracker; Form 145/146 stepper (after tax sign-off); ₹/$ switch; RBAC + 2FA; AIF call/distribution ledger; "What changed" tile | Features behind flags; tax content signed off; role tests pass |
| **P7 Consolidation** | ongoing | Cleanup | Merge duplicate stock-analysis/screener views; split 9.6k-line view; one engine per domain; clean repo root; shared formatters | Largest component < 1,500 lines; `knip` 0 unused in `src/components`; no `.db/.zip/.cjs` clutter at root |

**Verification each phase:** run on fixture/copy DB; attach before/after metrics (request counts, query plans, bundle size, p95); log results in `docs/CHANGELOG_REVIEW.md`.

---

## 12. Open decisions for the product owner
1. Access model: single owner, or family roles (decides P0 depth and P6)?
2. Is the Cloudflare tunnel in use? If yes, P0 is urgent today.
3. Which capital-gains figure is authoritative now? A reconciliation sample is needed before P3.
4. Are any of the 17 themes/11 layouts used? If not, remove.
5. Which duplicate engines/views are in production workflows?
6. Who is the tax professional who signs off NRI content (§5.3)?
7. Should the Home/mobile IA change be user-tested (3–5 sessions) before P5 reorders navigation?

## 13. Reviewer's note on process
The static-build runtime check cost nothing in data risk (no backend, no database). To obtain real timings and query plans, run the app against a **copy** of the database (not production) with Node 20 installed, then re-run the checks in §3 and the `EXPLAIN` comparisons in P2.
