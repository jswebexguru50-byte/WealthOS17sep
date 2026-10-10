# WealthOS — Part 2: Review of Implemented Changes, Portfolio-Manager Functionality Gaps, Richer Design Examples (2026-10-10)

**Lens:** a senior Indian-market portfolio manager (NRI/family-office clients) and a solution architect who wants the app light, secure, contemporary and easy to follow.
**Companion to:** `WEALTHOS_MASTER_REVIEW_AND_SPEC_2026-10-08.md` (still the reference for guard rails, code stubs, phases, benchmark sources). This document does not repeat it; it updates it.
**Rule observed:** review only. The reviewer changed no application code.

---

## 0. Scope, evidence and limits

| Item | Detail |
|---|---|
| What was reviewed | The **uncommitted working tree** on `ai-review` (HEAD `e1c3c9b9`): 33 modified files (+897 / −270 lines) and 4 new services. Reviewed from `git diff` plus targeted greps. These edits are **not on GitHub**. |
| Evidence tags | **[V]** read in the diff/source by the reviewer · **[R]** carried over from the 10-08 sub-audits, not re-checked · **[PM]** reviewer's domain judgement (not benchmarked fact) · **[W]** sourced in the 10-08 master report §8. |
| What could not be done | **No compile, no tests, no run** (Node/Python not installed here). Every "this will break / this works" statement is from reading code. The developer must run `npm run lint`, unit and integration tests before merging anything below. |
| Tax/legal content | Rates, limits, form names and residency rules quoted in §5 are **for the tax professional to confirm**; they are requirements candidates, not facts to code. |

---

## 1. Verdict

**Good:** the team acted on the highest-risk findings quickly. The deploy-by-HTTP route is gone, destructive routes now need a typed phrase, a backup and an audit row, CORS is tightened, fabricated placeholder figures were removed in several places, report errors are visible, search is debounced and cancellable, and the theme picker is down to Light + Dark.

**But the hardening is one-sided.** The backend now demands a password header and typed confirmations that **the front end does not send** (§3, N1). Until that is fixed, the purge/restore/delete-portfolio screens will fail, and — if the tunnel is used — most of the UI will return 401. This is the single most important item in this document.

**Second concern:** several edits touch money logic and governance (FIFO, price sourcing, new tables, a process-spawning route) without evidence of the sign-offs the repo's own constitution requires (§3, N7, N9, N10).

---

## 2. Status of the earlier findings

| ID | Finding (from master report) | Status | Evidence / note |
|---|---|---|---|
| S1 | `deploy-sync` remote code execution | **Fixed** | Handler now returns 410 `DEPLOY_SYNC_REMOVED` [V `server.ts` ~6742]. Secret must still be rotated (it lived in git history). |
| S2 | No API authentication | **Partial** | Password required only for Cloudflare-tunnelled or non-loopback requests and for admin routes; loopback is open [V]. Front end does not send the header (N1). |
| S3 | Tunnel tooling in repo | Open | Files unchanged. |
| S4 | Open destructive routes | **Fixed on server, broken in UI** | `requireAdminPassword` + `destructiveLimiter` + `typedConfirmation` + `VACUUM INTO` backup + audit row on purge-*, restore, delete-portfolio [V]. UI sends no `confirmPhrase` (N1). Backup design needs rework (N3). |
| S5 | Database download open | **Fixed on server** | `requireAdminPassword` added [V]; `driveExport.ts:25` raw `fetch` sends no header (N1). |
| S6 | CORS | **Fixed** | Wildcard and no-Origin fallback removed [V]. |
| S7 | Coarse rate limit | Partial | Destructive limiter (10/min) added; heavy non-destructive routes still share the global limit. |
| S8 | Validation / helmet | Open | Some new ad-hoc checks (e.g. `available_cash`); no schema layer, no helmet. |
| S9 | Client-side "verified owner" gate | Open | Not touched. |
| S10 | Secrets in DB | **Worse** | New route stores a request-supplied Kite token in `AppConfig` in plaintext (N10). |
| B1 | Zeros shown on failed loads | **Mostly fixed** | `Unavailable` / `—` in `DashboardView`, `AnalyticsView`, `AdvancedPortfolioAnalyticsDashboard`; hard-coded `IIFL360` figures and dates removed in `commandCenter.ts`; hard-coded as-of dates removed in `forensicRoutes.ts`; `available_cash` default of 100,000 removed [V]. Residual heuristics: N5. |
| B3 | 112A asset-class filter ignored | **Fixed, with a new risk** | Filter now applied [V]; see N6. |
| B5 | Report errors blind | **Fixed** | `res.ok` / `success` checked, error banners added [V]. Banner uses hard-coded dark-theme rose classes. |
| B6 | Bad FY silently ignored | **Fixed, returns 500 not 400** | Throws `INVALID_FINANCIAL_YEAR`; route unchanged so it surfaces as a server error [V/R]. |
| B7 | NRI FY hard-coded `2024-2025` | **Fixed** | `currentIndianFinancialYear()` in `nri.ts`, both report modals [V]. Helper is copy-pasted into three files. |
| B8 | `idx_sd_pan_fy` conflict | Open | `fifoEngine.ts` still creates it on `(portfolio, trigger_sell_date)` [V]. |
| B9 | Double refresh on portfolio select | **Fixed** | `refreshAllCoreData` calls removed from select handlers, effect drives it [V]. Needs a manual test of member switch. |
| B10 | Pollers never pause | Partial | Price poller skips when tab hidden [V]; other pollers untouched. |
| B14 | Search per keystroke | **Fixed** | 300 ms debounce + `AbortController` in `TransactionsView` [V]. |
| B15 | Mobile overflow / device label | Partial | "Samsung S24 Ultra" text removed [V]; overflow not re-tested. |
| Nav | Single nav source | **Partial** | `PRIMARY_NAV_ITEMS` added and used for page title and two prop lists, but the mobile drawer and desktop sidebar still carry their own copies (with icons) [V]. Labels now Home / Ideas / Stock Research / Portfolio / Research / Data & Settings. |
| UI | Themes | **Partial** | Picker shows Obsidian Noir + Institutional Light only; 16 themes remain in CSS and still resolve if saved [V]. `--font-display` fixed to Inter [V]. Risk & VaR / Snapshot button colours not re-checked. |
| Data | Market-data gateway, scheduler, job queue, indexes, report contract | **Not started** | |

---

## 3. New findings from the implemented changes

### N1 — Backend hardened, front end not updated (critical, regression) [V]
- **No `confirmPhrase` anywhere in the UI.** `App.tsx:1244, 1270, 1295` call `purge-bank-book`, `purge-transactions`, `purge-everything` with `{ portfolio, purge_mappings }` only; `SettingsView.tsx:195-284` restore calls and the delete-portfolio call send no phrase. The server now answers `400 CONFIRMATION_REQUIRED`. **These admin actions are currently broken in the UI.**
- **The password header is attached in only 3 files.** `src/lib/apiClient.ts:74` sets `x-app-password`, but only `Analyze360View`, `AnalyzeWorkspace` and `useStockIntelligence` use it. There are **341 raw `fetch(` calls** elsewhere in `src/` (excluding server). For any tunnelled or non-loopback request, the server now returns 401 to all of them, so **the tunnel deployment would effectively be unusable** until a single API layer attaches the credential. `driveExport.ts:25` has the same problem on `admin/database-file`.
- **Fix (spec):** one `api` module (wrapping `fetch`) that attaches the session credential, handles 401 by showing a sign-in prompt, and exposes helpers for the typed-confirmation flow (modal asks the user to type the phrase; request includes `confirmPhrase`). Migrate the 341 call sites incrementally with a lint rule banning raw `fetch` in components. Add an end-to-end test per destructive action.

### N2 — Authentication model is still thin [V + PM]
- Loopback requests skip authentication entirely; a local process or a page running in the user's browser can call the API. CORS blocks cross-origin *reads*, but simple cross-origin POSTs and DNS-rebinding are not addressed (no `Host` header allow-list).
- One static shared password in a header, compared in constant time (good), but no sessions, no expiry, no per-user identity, no lockout, no audit of *who*.
- **Fix:** `Host`/`Origin` allow-list on all mutating routes; session tokens with expiry; user identity on the audit log; roles (§5.8). Keep `APP_PASSWORD_REQUIRED` as a startup error whenever a tunnel or non-loopback bind is configured.

### N3 — Pre-destructive backup is risky as built [V + R]
`preDestructiveBackup` runs `VACUUM INTO` inside the request handler. On a multi-GB database this (a) can run for minutes, (b) on a synchronous SQLite binding (`database.ts` wraps `better-sqlite3`) can **block the whole Node process**, so health checks and the UI freeze, (c) writes a full copy per call into `./backups` with **no retention or free-space check** (10 calls/min allowed by the limiter), and (d) the backup label is interpolated into a filename (sanitised — fine).
**Fix:** run backups in a worker/child process or the SQLite online-backup API; refuse the operation if free disk < 2× DB size; keep the last N pre-destructive backups and prune; return 202 and poll; verify the backup opens (`PRAGMA quick_check`) before proceeding.

### N4 — Live pricing is now Upstox-only; failures are silent [V + PM]
`yahooFinance.ts`: the Yahoo fallback was removed; when no Upstox quote exists the symbol is added to `failedSymbols`, a warning is logged, and the previous price is left untouched (`return`). As a portfolio manager: a daily-expiring broker token (the repo carries `update_token.cjs` / `exchange_token.py`) means **valuations can freeze without the user knowing**, and the stale number still looks live.
**Fix:** per-holding `price_as_of` and `price_source` shown in the UI; mark rows `STALE` after a threshold (e.g. > 1 trading day or > 15 min in market hours); a top-bar "Prices stale since 09:14 — Upstox token expired" banner with a one-click re-link; optionally allow a *clearly labelled* secondary source (Yahoo/NSE bhavcopy) rather than none. The decision to be Upstox-authoritative is defensible for traceability, but only with visible freshness.

### N5 — Silent numeric manipulation remains in the UI [V]
`DashboardView.tsx` (~1020-1050): `if (Math.abs(rawRet) <= 5) rawRet = rawRet * 100;` guesses whether a value is a fraction or a percent; then `Math.max(-100, Math.min(rawRet, 300))` **clamps XIRR** to −100…300; dividend yield is capped at 50. A genuine 4.2% return stored as `4.2` would display as 420% → clamped to 300%. For a PM this is worse than "Unavailable".
**Fix:** one canonical unit (store percent as percent, with a typed field name `xirr_pct`), no heuristic scaling, no clamps; show out-of-range values with a data-quality flag instead.

### N6 — Schedule 112A asset-class filter can under-report [V + PM]
`ReportsService` now filters sells/buys with `UPPER(COALESCE(m.asset_class,'')) IN (...)`. The 112A modal defaults to `STOCKS`. Any sale whose security has an empty or differently-spelled `asset_class` (the alias list `EQUITY / STOCKS / LISTED EQUITY` is hard-coded and unverified against real data) **silently disappears from the schedule** — a tax under-reporting risk. Also: the `OR` master join (B12) can still duplicate rows; an invalid FY now throws and returns 500, and the accepted FY format (`YYYY-YYYY` with `end = start+1`) differs from the `YYYY-YY` contract proposed in the master spec.
**Fix:** always return an **"Unclassified"** bucket and a reconciliation line ("Total with ALL = Equity + MF + Unclassified"); source asset class from a controlled vocabulary column, not alias lists; unit test on a fixture where ALL equals the sum of the filtered parts; map `INVALID_*` errors to HTTP 400; one shared FY helper instead of three copies.

### N7 — FIFO engine edits touch money logic [V]
- **Hard-coded identifiers:** ISIN/symbol alias remaps for `TEMBO`, `APOLLO`, `ORIANA`, and an exclusion keyed on `source` containing `PSI722_` (a specific client statement prefix). Data corrections belong in a table (`SecurityAliases`, `ReconciliationSources`), not in the engine.
- **Runtime DDL:** `CREATE TABLE IF NOT EXISTS ReconciliationExceptions` inside `runFIFO`, with `.catch(() => {})` swallowing failures — a schema change outside the migration system.
- **Behaviour change (good):** unmatched sells are recorded as exceptions and no synthetic lot is created.
- **Refactor risk:** manual `BEGIN/COMMIT` replaced by `withTx`; batched prepared-statement inserts replaced by one `await dbRun` per row for Holdings, RealizedGains (can be 100k+ rows) and CorporateActionAudit. This is probably a large **slowdown**; it must be benchmarked on a fixture before/after.
- `sqliteParams` converts `NaN/Infinity` to `NULL` silently, which can hide calculation errors in cost or P&L.
- `idx_sd_pan_fy` conflict still present (B8).
**Fix:** run the FIFO fixture regression (holdings, realised gains, tax summary identical before/after except documented intentional changes); move aliases/exclusions to data; migrate the new table; count and log coerced values; restore batched inserts inside the transaction.

### N8 — Parameter normalisation can hide bugs [V]
`normalizeSqliteParams` (database.ts) turns non-finite numbers into `NULL` and any other object into `String(value)` (`"[object Object]"`). Better to throw in development and log a counter in production so wrong bindings are found, not stored.

### N9 — Governance gaps against the repo's own constitution [V]
`AGENT_CONSTITUTION.md` rule 3 and `IMPLEMENTATION_PLAN.md` require a sign-off line for new tables and services. The sign-off log's last entry is 2026-09-27. New in the working tree: tables `ResearchAnalysisArchive` and `ResearchAnalysisJobs` (created at runtime by the services), four new services (`Institutional29SynthesisService`, `OnHandResearchCohortService`, `ResearchAnalysisArchiveService`, `ResearchAnalysisJobService`), nine new routes, and eight `fundamental:institutional29:*` npm scripts. The plan also says `AnalyzeWorkspace` should stay unused or be removed only after sign-off; it was **extended by 102 lines**. Phase B (StockScans) is marked *awaiting sign-off* while `stockscansRoutes.ts` gained a new route. **Either the sign-offs exist elsewhere and should be logged, or this work is out of scope.** A human must decide; the bot must not proceed on either assumption.

### N10 — `POST /api/stockscans/ohlcv/refresh` [V]
HTTP route that spawns `python scripts/market_data/update_ohlcv_duckdb_today.py`; accepts an access token in the request body and **writes it to `AppConfig` in plaintext**; `toDate` is passed to the child without format validation; job state is in memory; no authentication beyond the global tunnel rule; requires Python on the server (not present on the review machine). It is a narrower cousin of the removed deploy route.
**Fix:** admin-only; validate `toDate` as `YYYY-MM-DD`; never accept or store tokens from the request body (use the already-linked token or an OS-keychain/env secret); run via the job queue with a timeout and output cap; log without token material.

### N11 — New LLM research jobs need cost and safety limits [V + PM]
`POST /api/research-analysis/jobs` and `/on-hand-jobs` start LLM synthesis (Bedrock, plus Gemini/Groq key paths; `maxTokens: 24000`). Good: provenance is mandatory (provider, model, evidence reference) and status starts `UNVALIDATED`. Missing: per-day/per-job spend cap (the Bedrock ledger starts from a fixed `$100` constant), rate limit and auth, idempotency (same symbol/day), a per-provider data-residency note (client portfolio data may reach three vendors), and a human-review gate before an `LLM_ANALYSIS` can influence a score or an alert.

### N12 — Smaller items
- Lazy DB-open middleware is registered at `server.ts:~1377`, **after** the routers mounted at lines 279-427, so those routers bypass it and rely on their own `getDB()` calls [V]. `MasterTickerService` initialisation is now gated by `ENABLE_STARTUP_DB_MUTATIONS`; the periodic WAL checkpoint was already gated by the same flag [R] — confirm the production environment sets it deliberately.
- `Stock Research` vs `Research` as sibling top-level labels is ambiguous; `Research` holds Quant Studio, backtests and the Knowledge Lab — name it **Strategy Lab**.
- Remaining hard-coded client data: `ReconciliationView.tsx:111` (`14000000` initial cash), `ReportStudioView.tsx:341` (`cc9`/`IIFL360`), `CLOSED_PORTFOLIOS` sets in `fifoEngine.ts:752` and `commandCenter.ts:225` [V]. Move to settings/DB.
- Three copies of `currentIndianFinancialYear()` — put in `src/shared/fy.ts`.
- New error banners use `bg-rose-500/10 text-rose-200` on a light app (readable only on the dark modal).
- Not verified: compile status of `yahooFinance.ts` after the removal (a grep found no leftover references to removed variables in the edited block), and whether any test covers the new routes.

---

## 4. Updated top actions (supersedes the master report's order where they differ)

1. **Fix N1 now** (single API layer + typed-confirmation UI), otherwise the hardening breaks the app.
2. Rotate the deploy secret; confirm tunnel/APP_PASSWORD policy; add Host/Origin allow-list (N2).
3. Rework the pre-destructive backup (N3).
4. Price freshness and token-expiry visibility (N4).
5. Remove XIRR heuristics and clamps (N5).
6. 112A "Unclassified" bucket + reconciliation test; HTTP 400 for bad FY (N6).
7. FIFO regression on a fixture; move hard-coded aliases/exclusions to data (N7, N8).
8. Governance: record or reverse the unsigned tables/services/routes (N9); secure the OHLCV and LLM routes (N10, N11).
9. Then the master plan's P1–P7 (gateway, scheduler, job queue, indexes, report contract, UI foundation).

---

## 5. Key functionality to add — portfolio-manager view [PM]

Judgement from running money for NRI and family clients. "Found" means the earlier grep/benchmark; counts for short keywords are unreliable and are noted only where meaningful. **Every tax, FEMA and residency item needs a tax professional's confirmation before coding.**

### 5.1 Must-have for NRI family offices
| # | Feature | Why a PM wants it | Current state |
|---|---|---|---|
| 1 | **Residential-status tracker** (days in India per FY, 182-day and 60+365-day tests, deemed-resident and RNOR flags, projected status) | Everything downstream (taxability, TDS, Schedule FA vs NRI treatment, account re-designation NRE→resident) depends on it; clients get this wrong | Not found |
| 2 | **FEMA/PIS limit monitor** (NRI single-company and aggregate holding limits, RBI caution list) | A breach forces a sell; PM needs warnings before buying | Not found [PM] |
| 3 | **NRO repatriation tracker** (USD 1M/FY, forms 15CA/15CB → Form 145/146 timeline after 1 Apr 2026, per-remittance status) | Differentiator; no competitor showed it [W] | TDS recon and repatriation endpoints exist; no limit tracker |
| 4 | **Tax simulator "if I sell today"**: by lot, STCG/LTCG, grandfathering, 112A exemption used/remaining, TDS on NRI sales, net proceeds repatriable | Pre-trade decision tool | Harvesting and advance-tax views exist; no per-lot simulator |
| 5 | **Loss set-off / carry-forward ledger** (8-year) | PMs plan harvests around it | `CarriedForwardLosses` table exists; not surfaced in reports [R] |
| 6 | **Price and event alerts** (price/threshold, trailing stop, 52-week, volume spike, result date, ex-date) delivered to email/WhatsApp/Telegram | Basic monitoring | Price alerts: not found |
| 7 | **Dividend and results calendar** with expected cash-flow forecast by month | Cash planning, TDS expectation | Dividend calendar: not found; results calendar minimal |
| 8 | **Data-freshness and reconciliation status** on Home (prices as-of, last CAS/DP match, open breaks) | Trust in the numbers | Partial; see N4 |

### 5.2 Portfolio construction and risk (what a PM reviews weekly)
| # | Feature | Notes |
|---|---|---|
| 9 | **Investment Policy Statement (IPS) per family/portfolio**: target bands by asset class/sector/market-cap/style, single-stock cap, liquidity floor, drift and breach alerts | Turns the app from tracker to governance tool |
| 10 | **Concentration and liquidity dashboard**: top-10 weight, sector and market-cap exposure, days-to-liquidate at 10% of ADV, ASM/GSM/T2T surveillance flags | Indian small/micro-cap reality |
| 11 | **Risk panel in PM language**: beta, volatility, max drawdown, downside capture vs Nifty 50 / Nifty 500 **TRI** (total-return index, not price), correlation heat | Existing risk engines (VaR, drawdown) should be surfaced here |
| 12 | **Performance attribution** (allocation vs selection by sector, contribution by holding), **TWR and XIRR** with method label | Orion pattern [W]; TWR currently almost absent |
| 13 | **Tax-aware rebalancing**: trades that restore IPS bands with minimum tax cost | Rebalancing engine exists; add tax cost |
| 14 | **Thesis journal per holding**: entry rationale, target, review date, kill criteria, outcome tag | Links to the existing recommendation-outcome auditor; enforces discipline |
| 15 | **Position sizing helper** using IPS caps and liquidity | A cash-input default was just removed — good; add real sizing rules |

### 5.3 Asset coverage gaps (Indian household reality)
| # | Feature | Notes |
|---|---|---|
| 16 | **Bonds/NCD/G-Sec/T-bill/SGB ladder** with YTM, maturity and coupon calendar | SGB, NPS, PPF/EPF, REIT/InvIT: not found in code (short keyword counts low); NCD/bond minimal |
| 17 | **FD ladder and TDS tracker** (NRO FD TDS, maturity alerts) | FD views exist; add alerts and TDS |
| 18 | **Mutual-fund analytics**: direct vs regular detection (expense leak), rolling returns, SIP XIRR, exit-load and LTCG status per lot, ELSS lock-in, overlap view | INDmoney overlap pattern [W]; overlap in code appears only in a sentinel view |
| 19 | **AIF/PMS**: cash-call and distribution ledger, IRR/TVPI/DPI, performance-fee audit with high-water mark | PMS fee reconciliation exists; AIF ledger not confirmed |
| 20 | **IPO/OFS pipeline and allotment tracking** | IPO engine exists; add personal allotments |
| 21 | **ESOP/RSU and foreign-asset holdings** with FX cost basis | Needed for NRI executives |

### 5.4 Family-office governance and trust
| # | Feature | Notes |
|---|---|---|
| 22 | **Roles and sharing**: owner, family view-only, accountant read-only; revocable; 2FA | Masttro/Kubera/Addepar pattern [W]; RBAC and 2FA not found |
| 23 | **Nominee / joint-holder / succession register** per demat, folio, bank, FD | Not found; high value, low effort |
| 24 | **Document vault with expiry reminders** (KYC, PAN-Aadhaar, TRC, Form 10F, FIRC, POA) | Vault not found |
| 25 | **Compliance calendar**: advance tax, FD maturities, TRC expiry, 15CA/CB, ITR due dates | Advance-tax windows exist in part |
| 26 | **Quarterly family review pack** (PDF: allocation, performance vs benchmark, attribution, tax position, actions) | Institutional norm; none today |
| 27 | **Immutable audit trail and report history** | Tables exist (`DataChangeLog`, `ActionHistory`); no UI |

### 5.5 Data and import
| # | Feature | Notes |
|---|---|---|
| 28 | MF Central consent import and NSDL/CDSL CAS parsing; contract-note parser for major brokers | INDmoney/MProfit pattern [W]; MF Central appears in one modal |
| 29 | Broker-agnostic holdings import with automatic reconciliation to depository statements | Reconciliation engines exist; productise |
| 30 | Corporate-action review queue (splits, bonus, mergers, demergers) with approve/override and impact preview | Engine exists; review UI to confirm |

**Suggested priority:** P0 = items 1, 3, 4, 8, 22 (+ N1 fix); P1 = 2, 5, 6, 7, 9, 10, 23, 25; P2 = 11-15, 18, 19, 24, 26; P3 = the rest.

---

## 6. More design examples (colour, style, flow)

The first set (Ledger Blue / Sandstone & Teal / Graphite Pro, tokens, components, wireframes) remains in `UI_DESIGN_EXAMPLES_2026-10-07.md`. Additional options and patterns follow.

### 6.1 More palette options
| Option | Mood | Brand | Canvas / Card | Gain / Loss | Use when |
|---|---|---|---|---|---|
| **4. "Saffron & Slate"** | Distinctly Indian, warm, confident | Deep slate `#1F2A44` + saffron accent `#E07B00` (accent only for primary actions and highlights) | `#FAF7F2` / `#FFFFFF` | `#1B8A5A` / `#C0392B` | Client-facing family reports |
| **5. "Colour-blind-safe"** | Accessibility first | Blue `#1F5FBF` | `#F6F8FB` / `#FFFFFF` | **Blue `#1F5FBF` / Orange `#D9480F`** with ▲ / ▼ and +/− | Default for users who need it; switchable "Gain/loss colours" setting |
| **6. "Obsidian Dark"** | Low-glare evening use | `#6EA8FE` | `#0B1220` / `#111A2C` | `#34D399` / `#F87171` | Dark theme (pairs with Ledger Blue) |
| **7. "Print / PDF"** | Greyscale-safe | Navy `#0B3D91` | White | Bold ▲ / ▼, green/red only as thin underline | Statements and review packs |

**Status vocabulary (use the same words and colours everywhere):** Reconciled (gain), Stale / Pending (attention), Break / Overdue (loss), Info / Selected (brand), Archived / Inactive (neutral).

**Semantic spacing/elevation tokens:** radius 14 px (cards), 10 px (inputs/buttons), 999 px (pills); spacing scale 4-8-12-16-24-32; shadows only for popovers/drawers; focus ring 2 px brand + 2 px offset.

### 6.2 Style examples
- **KPI tile anatomy:** eyebrow label (11 px, +0.06em) → value (28 px semibold, tabular) → delta chip (▲ 0.64% today) → 36 px sparkline → ⓘ (formula, source, as-of). *Never* show a tile value without an as-of tooltip.
- **Table density modes:** Comfortable 44 px rows, Compact 32 px rows; sticky header; numeric columns right-aligned; negative numbers `–₹1.2 L` plus ▼; first column pinned; column chooser remembers per user.
- **Charts:** line = brand, benchmark = dashed grey, area fill 8% alpha; allocation as stacked bar + legend list (avoid 3-D/donut with many slices); drawdown chart in loss tint; range switch 1M · 6M · 1Y · 3Y · 5Y · ITD.
- **Micro-copy:** replace jargon with plain words and keep the term in a tooltip — "Money-weighted return (XIRR)", "Cost after 31-Jan-2018 adjustment (grandfathered)", "Stale price — last update 09:14".
- **Empty state:** icon + one line + action ("No AIFs yet — Add a fund or import a statement"). **Error state:** what failed, what it affects, Retry, and "Copy details". **Loading:** skeletons shaped like the tile.
- **Motion:** 150 ms fade/translate 4 px; no looping pulses; honour reduced-motion (already added).
- **Iconography:** one set (Lucide), 16/20 px, stroke 1.75, never colour-coded by section.

### 6.3 More flow examples
1. **PM Monday routine (5 minutes):** Home → "What changed" (week attribution) → "Needs attention" (stale prices, IPS breaches, results this week) → open breach → see suggested tax-aware trade → add to **Order ticket draft** (not executed) → export draft to the broker.
2. **New idea → decision:** Ideas → filter → stock page → "Fit with IPS?" panel (sector weight after buy, liquidity, tax impact) → thesis note (rationale, target, kill criteria, review date) → add to watchlist or paper trade.
3. **Quarterly review:** Reports → "Family review pack" wizard (period, members, benchmark TRI, include attribution/tax) → preview → PDF → share read-only link (expiring).
4. **Client onboarding:** Welcome → add member → residency status and tax country → link accounts/import (CAS, broker, PMS) → reconcile → set IPS (3 questions: horizon, risk, liquidity) → first Home.
5. **NRI remittance:** Tax & NRI → "Repatriate" stepper: pick account (NRO/NRE) → amount in USD/INR → limit used / remaining → taxes and TDS → forms checklist → record remittance → updates tracker.
6. **Data trust loop:** a freshness chip on every screen → click → source table (price source, as-of, token status) → "Re-link Upstox" or "Switch to labelled secondary source".
7. **Destructive action pattern:** Danger zone → choose action → modal shows impact counts and backup status → type the phrase → confirm → toast with Undo (restore backup) link for 24 h.

### 6.4 Navigation proposal (updated for the new labels)
Home · Portfolio · Ideas · **Strategy Lab** (rename of Research) · Tax & NRI · Data & Settings; "Stock Research" becomes a drawer/page opened from any ticker, not a top-level tab. Desktop sidebar, mobile bar and page title all read `PRIMARY_NAV_ITEMS`.

---

## 7. Benchmark summary (unchanged sources; see master report §8)
Strong against peers: NRI tax depth, PMS/AIF reconciliation, FIFO with grandfathering, research breadth. Behind peers: authentication/RBAC/2FA/audit UI, onboarding clarity, report builder and exports, scheduled reports, visible data freshness, mobile consistency. UX conventions (tile design, command palette, gain/loss colours) were not found in sources and remain design judgement. Competitor claims are partly snippet-level; "not found" means not verified.

---

## 8. Guard rails (additions to the master report §10)
1. **No merge of the current uncommitted changes without:** `npm run lint`, unit and integration tests, FIFO fixture regression, and a manual test of purge/restore/delete-portfolio against a **copy** database.
2. **Every route that changes data or spawns a process** (`ohlcv/refresh`, research jobs, purge, restore) is admin-only, validated, rate-limited, audited, and never accepts secrets in the body.
3. **No silent coercion of numbers.** No clamping, no unit guessing, no `NaN → NULL` without a counted, logged warning. Missing = "Unavailable".
4. **No hard-coded client, portfolio, ISIN or statement identifiers in code.** Use data tables with an audit trail.
5. **No runtime DDL.** Schema changes only through numbered migrations with a recorded sign-off.
6. **Every new tax/FEMA rule** carries a citation and a tax-professional sign-off in the PR.
7. **Prices always carry source and as-of;** stale prices are labelled, never presented as live.
8. **LLM output is advisory:** stored with provenance, flagged `UNVALIDATED`, never feeds a score, alert or report figure without a human-approved validation step; per-day spend cap enforced.
9. **Frontend:** one `api` module; raw `fetch` banned in components (lint rule); destructive UI always uses the typed-confirmation modal.

## 9. Revised implementation plan (delta to master §11)
| Step | Scope | Exit criteria |
|---|---|---|
| **P0a (now)** | N1 single API layer + typed-confirmation modal; test every admin action | Purge/restore/delete work with `APP_PASSWORD` set; 401 flow shows a sign-in prompt; no raw `fetch` in components for `/api/admin/*` |
| **P0b** | N2, N3, rotate secret; remove tunnel tooling from repo; Host/Origin allow-list | Backup runs off the request thread, prunes, checks disk; tunnel requires credential |
| **P1a** | N4 freshness UI + token-expiry banner; N5 remove heuristics/clamps | Every price shows as-of and source; no clamped XIRR |
| **P1b** | N6 "Unclassified" bucket + 112A reconciliation test; FY helper; 400 for invalid input | ALL = sum of parts on fixture |
| **P1c** | N7/N8 FIFO fixture regression, move aliases to data, restore batched inserts, migrate `ReconciliationExceptions` | Identical outputs except documented; FIFO time not worse than baseline |
| **P2** | N9–N11 governance decisions; secure OHLCV and LLM routes with caps | Sign-off log updated or work reverted; spend cap enforced |
| **P3+** | Master plan P1–P7, then §5 features in the priority order above | As in master report |

## 10. Decisions needed from the product owner
1. Are the new research-analysis tables, services and routes **approved** (sign-off log), or should they be paused?
2. Is the Upstox-only pricing a deliberate policy? If yes, accept N4's freshness UI as a condition.
3. Is the tunnel in production use? (decides urgency of N1/N2)
4. Which tax professional signs off residency, FEMA/PIS and repatriation content?
5. Priority among §5 features for the next two quarters.
6. Should the working-tree changes be committed to a branch for CI before further work? Right now they exist only on one machine.

## 11. Limits of this review
No compile/test/run; the working-tree diff is large and was read selectively (most of `Analyze360View`, `AnalyzeWorkspace`, `StockScansWorkspace`, `Institutional29SynthesisService` and the four new services were skimmed, not line-reviewed); PM feature gaps are domain judgement checked only by keyword search; competitor benchmark remains partly snippet-level.
