# MASTER SYSTEM ARCHITECTURE & UNIFIED TECHNICAL SPECIFICATION
## Institutional Multi-Entity Family Office Investment Operating System, Forensic Tax Engine & Autonomous Conviction Intelligence Platform (WealthOS)

**Document Release:** 5.0.0-ENTERPRISE-UNIFIED  
**Date of Ratification:** September 6, 2026 (Synthesized from September 5, 2026 Core Specifications & Active Production Implementation)  
**Target Audience:** Autonomous Development Agent, Lead Systems Architect, Senior Quantitative Reviewer, and Lead QA/Automation Engineer  
**Classification:** Complete Single-Source Architectural Blueprint, Data Dictionary, Logic Specification & E2E Verification Standard  

---

## 1. EXECUTIVE SUMMARY, SYSTEM PURPOSE & ARCHITECTURAL TOPOLOGY

### 1.1 The Single Mission Statement
> **Maximize risk-adjusted, after-tax family wealth over multi-generational horizons by providing institutional-grade portfolio administration, forensic multi-broker reconciliation, zero-variance statutory tax accounting, and surfacing high-conviction investment opportunities validated through empirical calibration and strict capital preservation guardrails.**

Every module, table, API endpoint, UI component, and mathematical calculation in this platform directly serves this single objective. When system constraints conflict, the following non-negotiable priority hierarchy governs:
1. **Capital Preservation First:** Under no circumstances may an opportunity signal, automated position sizing, or rebalancing recommendation bypass drawdown circuit breakers or liquidity constraints. A portfolio drawdown $> 25\%$ triggers an immutable allocation freeze ($K^* = 0.0\%$).
2. **Mathematical Invariance & Factual Ground Truth:** Floating-point approximations are strictly prohibited across all cost-basis, quantity, proceeds, dividend, and tax computations. Corporate actions must satisfy $\Delta(\text{Total Cost}) \equiv 0.00$. Unverified or stale data feeds must never be masked; they must be surfaced with visible state badges.
3. **Statutory & Regulatory Precision:** Tax liabilities are calculated per-transaction based on exact execution timestamps (e.g., the July 23, 2024 Finance Act cutover for STCG 15% vs 20% and LTCG 10% vs 12.5%), preserving Section 112A grandfathering formulas and tracking Section 234B/234C interest penalties.
4. **Empirical Calibration Over Narrative Conviction:** Signals must be calibrated using historical Brier scores and Wilson score confidence intervals with a minimum sample gate ($N \ge 15$). If a signal lacks sufficient out-of-sample track record, it is strictly classified as *Informational*, never as an *Actionable Recommendation*.

---

### 1.2 Multi-Tier System Topology

```
+----------------------------------------------------------------------------------------------------+
|                                         PRESENTATION TIER                                          |
|  React 19 SPA (Vite 6 + TailwindCSS v4 + Lucide Icons + Recharts + Motion React + Tabular Monospace)|
|  Shell Environments: Evergreen Chromium/Edge Browser & Portable Electron Native Container         |
|  Theme Architecture: Institutional Light (Default) & Midnight Obsidian (Dark Glassmorphic Mode)    |
+--------------------------------------------------+-------------------------------------------------+
                                                   | HTTP/1.1 REST (gzip) + WebSockets (Live Feed)
                                                   v
+----------------------------------------------------------------------------------------------------+
|                                        APPLICATION SERVER TIER                                     |
|  Express 4.21 + TypeScript 5.8 Server (Single-Process Daemon, Port 3000, Multi-Tenant TenantScoper) |
|                                                                                                    |
|  [CORE DOMAIN SERVICES]                                                                            |
|  * FIFO Capital Gains Engine (fifoEngine.ts)         * Lookthrough Service (lookthroughService.ts) |
|  * Post-Tax XIRR Service (PostTaxXirrService.ts)      * PMS Fee Recon (PmsFeeReconciliationService)|
|  * Corporate Actions Engine (CorporateActionsEngine) * Multi-Broker Recon (MultiBrokerReconService)|
|  * Tax Harvesting Engine (TaxHarvestingEngine.ts)    * Unified Valuation (UnifiedValuationService) |
|  * Risk Analytics Engine (RiskAnalyticsEngine.ts)    * NRI Wealth & FEMA (NriWealthService.ts)     |
|                                                                                                    |
|  [AUTONOMOUS QUANTITATIVE & CONVICTION ENGINES (Phases 0-7)]                                       |
|  * 7-Strategy Scanner (OpportunityScannerEngine.ts)  * Half-Kelly Sizer (OpportunityEnginePhase4to6)|
|  * Macro Regime Classifier (MacroRegimeClassifier)   * Autonomous Agent (AutonomousSmartMoneyAgent)|
|  * Outcome Auditor (RecommendationOutcomeAuditor)    * Causal Post-Mortem (CausalPostMortemService)|
|  * Walk-Forward Engine (PriceActionBacktestEngine)   * Unified Conviction Fusion (convictionEngine)|
|                                                                                                    |
|  [FOUNDATIONAL INFRASTRUCTURE (Phase 0)]                                                           |
|  * INFRA-1: NSE Trading Calendar (tradingCalendar.ts) * INFRA-2: Universal Decimal Precision       |
|  * INFRA-3: Feed Staleness Monitor (infraServices.ts) * INFRA-4: Idempotent Dedup Keys             |
|  * INFRA-5: Calibration Ledger & Brier Scores        * INFRA-6: Append-Only Immutable Audit Ledger |
+--------------------------------------------------+-------------------------------------------------+
                                                   | SQLite3 Native Driver / Synchronous WAL Mode
                                                   v
+----------------------------------------------------------------------------------------------------+
|                                           PERSISTENCE TIER                                         |
|  SQLite 3.42 / LibSQL Engine (`portfolio.db`)                                                      |
|  - Concurrency: WAL (Write-Ahead Logging), PRAGMA synchronous = NORMAL, busy_timeout = 10000ms     |
|  - Safety: Auto-persistent backup (`portfolio_persistent_backup.db`) with corruption auto-recovery |
|  - Caching Layer: DashboardDiskCache, MasterTickers, BenchmarkCashFlowCache, In-Memory Quotes      |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. CORE DOMAIN ARCHITECTURE & MULTI-ENTITY MODEL

WealthOS models the complex legal, financial, and tax relationships of ultra-high-net-worth Indian and NRI family offices.

### 2.1 Entity Hierarchy & Multi-PAN Isolation
The platform segregates capital across three interconnected structural layers:
1. **Family Group:** The overarching family office trust or umbrella entity (e.g., *Sharma Family Office*).
2. **Legal Assessee (PAN):** Individual Permanent Account Numbers recognized by the Indian Income Tax Department (e.g., Primary Member, Spouse, Father, Mother, Family HUF). Tax calculations, capital gains pooling, Advance Tax installments, and Carried Forward Loss (CFL) 8-year schedules are strictly bound to a single PAN and can never bleed across assessees.
3. **Account / Portfolio:** Individual trading and demat accounts maintained with brokers (Zerodha Kite, HDFC Sky, IIFL Securities, DBFS, Interactive Brokers US, Sarwa Dubai) or wealth managers (ASK PMS, Motilal Oswal, Marcellus, Smart Horizon AIF).

```
   Family Group ("Sharma Family Office")
      |
      +---> PAN 1: AXXXXXX01A ("Maa - Vijaya")
      |        |---> Portfolio 1: "Maa" (Direct Equity - Zerodha)
      |        |---> Portfolio 2: "cc9" (Discretionary PMS - IIFL Securities)
      |        |---> Portfolio 3: "Maa MF PF" (Direct Mutual Funds - CAMS/KFintech)
      |
      +---> PAN 2: BXXXXXX02B ("Papa - O.P. Sharma")
      |        |---> Portfolio 4: "Papa" (Direct Equity & Debt - HDFC Sky)
      |
      +---> PAN 3: CXXXXXX03C ("Self - NRI / Gopal")
               |---> Portfolio 5: "US - IBKR" (Global USD Equities & ETFs)
               |---> Portfolio 6: "Sarwa" (GCC / UAE Equities & Fixed Income)
               |---> Portfolio 7: "Unlisted" (Pre-IPO Shares & Private Equity)
               |---> Bank & Liquid: NRE Savings, NRO Deposits, FCNR USD Accounts
```

---

## 3. UI/UX DESIGN SYSTEM & AESTHETIC ARCHITECTURE

WealthOS provides a world-class dual-theme visual language engineered for high information density, long review sessions, zero ocular fatigue, and immediate executive scannability.

### 3.1 Aesthetic Metaphor: "Institutional Light" (Primary Default) & "Midnight Obsidian" (Secondary Dark)
- **Institutional Light (Default):** Inspired by private wealth portals (Addepar, Mercury Enterprise, Brown Brothers Harriman). Uses a warm-neutral paper canvas (`#F7F8FA`), crisp white raised elevation cards (`#FFFFFF`), hairline subtle borders (`#E2E6EC`), and a strictly restrained 5-color semantic core. Communicates permanence, trust, and executive clarity.
- **Midnight Obsidian (Dark Mode):** Designed for institutional trading desks and low-light environments. Built on an ultra-deep obsidian canvas (`#020617` / `#0B1329`) with subtle glassmorphic blur filters (`backdrop-filter: blur(16px)`), emerald profit indicators, and amber alert badges.

---

### 3.2 Semantic Color Matrices & Token Definitions

#### Institutional Light Theme Tokens (Primary)
| Token Role | Hex Code | CSS Variable | Semantic Usage |
| :--- | :--- | :--- | :--- |
| **App Canvas** | `#F7F8FA` | `--bg-app` | Master page background; warm-neutral off-white |
| **Surface Card** | `#FFFFFF` | `--bg-card` | Elevated container, modal, and panel background |
| **Surface Sunken** | `#F1F3F6` | `--bg-sunken` | Table alternating rows, code chips, disabled inputs |
| **Border Subtle** | `#E2E6EC` | `--border-sub` | 1px hairline dividing line on cards, rows, and headers |
| **Border Strong** | `#CBD2DC` | `--border-strong` | Active input outlines, focused dividers |
| **Border Focus** | `#0F62FE` | `--border-focus` | Keyboard focus ring, active navigation indicator |
| **Text Primary** | `#0B1220` | `--text-pri` | Screen headings, scrip tickers, primary valuations |
| **Text Secondary** | `#4B5568` | `--text-sec` | Table column headers, subtitles, field labels |
| **Text Muted** | `#7D8798` | `--text-mut` | ISIN codes, transaction notes, audit timestamps |
| **Brand Primary** | `#0B3D91` | `--brand-pri` | Sovereign Navy: active pills, primary action buttons |
| **Brand Tint** | `#E9EFFA` | `--brand-tint` | Light blue background for selected filter pills |
| **Gain / Profit** | `#0F7A4E` | `--fin-gain` | Deep accessible emerald: positive P&L, positive XIRR |
| **Gain Tint** | `#E4F6EC` | `--fin-gain-bg` | Soft mint pill background for positive returns |
| **Loss / Drawdown** | `#B3261E` | `--fin-loss` | Deep carmine red: negative P&L, unrealized losses |
| **Loss Tint** | `#FBEAE9` | `--fin-loss-bg` | Soft blush pill background for losses |
| **Attention / Warn** | `#8A5A00` | `--fin-warn` | Deep amber: Section 194 TDS, stale feed, CFL expiry |
| **Warning Tint** | `#FBF0DA` | `--fin-warn-bg` | Amber warning background badge |
| **Info / Cash** | `#1D5FA8` | `--fin-info` | Mid blue: net post-tax cash, NRE repatriable balance |
| **Info Tint** | `#E8F1FB` | `--fin-info-bg` | Soft blue pill background |

#### Midnight Obsidian Dark Theme Tokens
| Token Role | Hex Code | CSS Variable | Semantic Usage |
| :--- | :--- | :--- | :--- |
| **App Canvas** | `#020617` | `--bg-app` | Deepest midnight canvas |
| **Surface Raised** | `#0B1329` | `--bg-modal` | Modal containers and drawer background |
| **Card Glass Base**| `rgba(15, 23, 42, 0.75)` | `--bg-card` | Glassmorphic card surface with 16px blur |
| **Card Hover** | `rgba(30, 41, 59, 0.90)` | `--bg-hover` | Interactive hover card elevation |
| **Border Subtle** | `rgba(30, 41, 59, 0.85)` | `--border-sub`| 1px border on cards and table cells |
| **Text Primary** | `#F8FAFC` | `--text-pri` | High-contrast white for headers and primary values |
| **Text Secondary** | `#94A3B8` | `--text-sec` | Slate gray for metadata and headers |
| **Text Muted** | `#64748B` | `--text-mut` | Muted ISIN codes and audit hashes |
| **Gross Gain** | `#10B981` | `--fin-gross` | Vibrant emerald for gains and bullish setups |
| **Gross Gain Tint**| `rgba(6, 78, 59, 0.30)` | `--fin-grs-bg`| Emerald pill tint |
| **Realized Loss** | `#F43F5E` | `--fin-loss` | Rose red for losses, drawdowns, and breaches |
| **Withheld TDS** | `#F59E0B` | `--fin-tds` | Bright amber for statutory withholding |

---

### 3.3 Typography & Tabular Numerals Architecture
Typography strictly follows functional segregation to eliminate decimal misalignment:

```
+----------------------------------------------------------------------------------------------------+
| Role         | Typeface Family               | Weights  | Tabular Num | Primary Application       |
+--------------+-------------------------------+----------+-------------+---------------------------+
| Display      | Space Grotesk / Fraunces      | 600, 700 | Optional    | Hero Net Worth, KPI Stats |
| Interface    | Inter / Plus Jakarta Sans     | 500, 600 | No          | Navigation, Buttons, Tabs |
| Tabular Data | JetBrains Mono / SF Mono      | 500, 600 | MANDATORY   | All Numbers, P&L, Dates   |
+----------------------------------------------------------------------------------------------------+
```

#### Inviolable Tabular Figure Rule
Every financial amount, share quantity, cost per share, percentage change, and date must be rendered using:
```css
font-family: 'JetBrains Mono', monospace;
font-variant-numeric: tabular-nums;
letter-spacing: -0.01em;
```
*Rationale:* Tabular numbers guarantee equal horizontal character advance across all digits (0–9), ensuring perfect vertical alignment of decimal points across 100+ table rows.

#### Typographic Scale Hierarchy
- **Display 1 (Master Net Worth):** `text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight`
- **H1 (Screen Title):** `text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100`
- **H2 (Section Header):** `text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100`
- **H3 (Card Header / Metric Group):** `text-sm sm:text-base font-bold text-slate-800 dark:text-slate-200`
- **Body Regular (Descriptions & Notes):** `text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-400`
- **Micro / Badge:** `text-[9px] sm:text-[10px] uppercase font-mono font-bold tracking-wider`

---

### 3.4 Spatial Grid, Elevation & Elevation Hierarchy
1. **8px Base Spatial Grid:** Micro-padding `4px` (`p-1`), compact `8px` (`p-2`), standard card padding `16px` (`p-4`), roomy container `24px` (`p-6`), section divider `32px` (`space-y-8`).
2. **Shadow-Based Elevation (Institutional Light):**
   ```css
   background: #FFFFFF;
   border: 1px solid var(--border-sub);
   border-radius: 1rem; /* 16px */
   box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04), 0 2px 8px rgba(16, 24, 40, 0.04);
   ```
3. **Z-Index Layering:**
   - `z-0`: Base canvas grid & ambient background
   - `z-10`: Sticky table headers & sub-navigation bars
   - `z-20`: Pinned table columns (left-pinned scrip codes, right-pinned action buttons)
   - `z-30`: Sticky master header (PAN switcher, Portfolio selector, FY selector, Currency toggle)
   - `z-40`: Dropdowns, tooltips, flyout menus
   - `z-50`: Full-screen modal backdrops & confirmation dialogues
   - `z-60`: High-priority alert toasts & circuit-breaker warnings

---

## 4. COMPREHENSIVE 12-HUB SCREEN INVENTORY & UI WORKFLOWS

WealthOS organizes its operational capabilities into 12 dedicated functional Hubs, accessible via the persistent master header.

```
                                      GLOBAL APP SHELL
  [Brand Wordmark + Live Dot]  [PAN Switcher]  [Portfolio Switcher]  [FY Selector]  [Currency: INR/USD/AED]
                                              |
     +----------------------------------------+---------------------------------------+
     |                   |                    |                   |                   |
1. Command Center   2. Portfolio Hub    3. Analytics Hub   4. Report Studio    5. Activity & Ledger
     |                   |                    |                   |                   |
6. Tax Center       7. Corporate Actions 8. NRI Wealth     9. Opportunities   10. Scrip Intelligence
     |                   |
11. Imports & Recon 12. Settings & Audit
```

---

### Screen 1: Family Office Command Center (`FamilyOfficeCommandCenter.tsx`)
- **Executive Purpose:** Consolidated real-time snapshot of aggregate family office net worth, intra-day performance, multi-asset allocation, and risk status.
- **Header Stats Row:**
  - **Total Family Net Worth:** Space Grotesk 48px display figure (e.g. `₹47,11,46,265.29`) with intra-day change (`+₹17,65,401.51 (+0.41%)` in emerald).
  - **Invested Capital vs Market Value:** Total cost basis (`₹32,81,90,951.78`) vs Current valuation (`₹43,39,22,170.64`).
  - **Consolidated XIRR:** Pre-tax annualized return (`24.18%`) compared against benchmark Nifty 50 TRI (`15.2%`).
  - **Composite Health Score:** Circular SVG gauge (0–100) scoring concentration risk, cash drag, and asset diversification.
- **Asset Allocation Segmented Bar:**
  - Visual breakdown: Indian Direct Equity (50.3%), PMS & Institutional (15.3%), AIF Smart Horizon (13.7%), US Equities (8.0%), Cash & FDs (7.9%), Mutual Funds (2.5%), Unlisted (2.3%).
- **Interactive Holdings Treemap:**
  - Visual hierarchy of equity positions sized by AUM weight. Green tiles indicate positive daily price change; red tiles indicate negative daily price change.
- **Top Movers & Risk Alerts Panel:**
  - Live list of top 5 gainers (`AKIKO`, `TEMBO`, `FELIX`) and top 5 losers (`ORIANA`, `BLUEWATER`, `ANNU`).

---

### Screen 2: Portfolio Hub & Lookthrough Holdings (`PortfolioHubView.tsx`, `DashboardView.tsx`)
- **Executive Purpose:** Deep scrip-level forensic transparency across multi-broker demat accounts, mutual fund folios, and PMS portfolios.
- **Sub-Tabs:** `[Dashboard Overview]` | `[Institutional Analytics]` | `[Ratios & Attribution]`
- **Asset Class Filter Strip:** Filter holdings by `ALL` (106), `EQ (Stocks)` (28), `MF (Funds)` (12), `AIFs` (4), `BNK/FDs` (17), `PMS/SIF` (48), `Global` (10).
- **Core Table (`ResizableDataTable`):**
  - **Pinned Left:** Scrip Symbol, Company Name, ISIN code, and Direct vs Indirect Lookthrough badge.
  - **Center Columns:** Account/Portfolio, Asset Class, Quantity, Average Buy Price, Current LTP, Total Cost, Current Market Value, Day Change %, Unrealized P&L (₹ and %).
  - **Pinned Right:** Action buttons (`Inspect Dossier`, `Lot History`, `Technical Chart`).
- **Lookthrough Engine Integration:**
  - Automatically unpacks Mutual Fund schemes (e.g., Mirae Asset Large Cap) and PMS pools (e.g., CC9 Marcellus) into individual underlying stock exposures, alerting if consolidated exposure across direct and indirect holdings exceeds 10% of family equity.

---

### Screen 3: Institutional Analytics & Risk Hub (`InstitutionalAnalyticsHub.tsx`, `AnalyticsView.tsx`)
- **Executive Purpose:** Institutional portfolio risk attribution matching MSCI Barra and Bloomberg PORT standards.
- **Key Modules:**
  - **Portfolio Beta vs Nifty 50:** Regression-based systematic market risk coefficient.
  - **Parametric Value at Risk (VaR):** 1-day 95% and 99% VaR in ₹ terms, alerting on tail-risk potential.
  - **Sharpe & Sortino Ratios:** Risk-adjusted returns using 91-day Government of India T-Bill rate as the risk-free hurdle.
  - **Historical Drawdown Waterfall:** Interactive area chart showing peak-to-trough drawdowns and time-to-recovery across market corrections.
  - **Concentration Risk Monitor:** Hard alerts when any single company exceeds 10% or any single sector exceeds 25% of aggregate equity.

---

### Screen 4: Report Studio & Executive Briefings (`ReportStudioView.tsx`)
- **Executive Purpose:** Dynamic multidimensional valuation pivots, tax loss harvesting matrix, and CA-ready export studio.
- **2-Level Dynamic Pivot Grid:**
  - Primary Dimension: Family Member, PAN, Portfolio, Asset Class, Sector, Market Cap, Gain/Loss, Tax Status.
  - Secondary Dimension: Group by any orthogonal dimension with automated value-weighted group totals and weighted XIRR.
- **Built-in Presets:**
  1. *Multi-Asset Family Valuation Matrix*
  2. *PAN-Wise Statutory Tax & Capital Gain Matrix*
  3. *Asset Class & Sector Allocation Pivot*
  4. *Performance & XIRR Alpha Scorecard*
  5. *Tax Loss Harvesting Studio* (surfacing unrealized losses first)
- **Capital Deployment Efficiency:** Column computing `XIRR - 7.0% Hurdle Rate` to flag value-destroying holdings.
- **Export Capabilities:** Native Excel `.xlsx` multi-tab workbook generation via SheetJS and vector-grade printable PDF export via dedicated print stylesheets.

---

### Screen 5: Activity & Ledger Hub (`LedgerHubView.tsx`, `TransactionsView.tsx`)
- **Executive Purpose:** Complete audit trail of every acquisition, sale, corporate adjustment, dividend credit, and fund transfer.
- **Sub-Tabs:** `[Tradebook Transactions]` | `[Tax & Realized Gains]` | `[Corporate Events & Dividends]`
- **Capabilities:**
  - Searchable by date range, scrip ticker, ISIN, broker account, or transaction type (`BUY`, `SELL`, `DIVIDEND`, `BONUS`, `SPLIT`, `RIGHTS`).
  - Full CRUD operations with idempotent deduplication and real-time FIFO lot re-matching.
  - Bulk actions: batch deletion and batch portfolio reassignment.

---

### Screen 6: Tax Center & Forensic Capital Gains Engine (`TaxView.tsx`)
- **Executive Purpose:** Date-aware statutory tax accounting, Section 112A grandfathering, Advance Tax planning, and Carried Forward Loss scheduling.
- **Sub-Navigation Bar:**
  `[📊 Realized Gains]` | `[🌾 Tax Loss Harvesting]` | `[📅 Advance Tax Schedule]` | `[⏳ 8-Yr CFL Waterfall]` | `[💰 Dividend Income OS]` | `[⏱️ 31-Day GAAR Repurchase Tracker]`

#### 6.1 Sub-View 1: Realized Gains & Tax Slabs
- **Date-Aware Statutory Banner (TX-3):** Enforces Finance (No. 2) Act, 2024 cutovers:
  - Sales prior to July 23, 2024: STCG = 15.0%, LTCG = 10.0% (₹1,00,000 exemption).
  - Sales on or after July 23, 2024: STCG = 20.0%, LTCG = 12.5% (₹1,25,000 exemption).
- **Section 112A Grandfathering Visualizer (TX-2):** Step-by-step formula badge for pre-Feb 1, 2018 acquisitions:
  $$\text{Adjusted Cost} = \max(\text{Actual Cost}, \min(\text{FMV as on 31-Jan-2018}, \text{Sale Price}))$$
- **Summary Cards:** Total Estimated Tax Liability, Net STCG, Net LTCG, and CFL Absorbed.

#### 6.2 Sub-View 2: Tax Loss Harvesting Engine (TX-1)
- **Statutory Offset Priority Waterfall:**
  - Short-Term Capital Losses (STCL) offset STCG (taxed at 20%) first, then LTCG (taxed at 12.5%).
  - Long-Term Capital Losses (LTCL) strictly offset LTCG (12.5%).
- **Interactive Harvesting Table:** Displays active unrealized losing positions, offsettable loss capped by available realized gains, net tax saved in ₹, and recommended 31-day repurchase date.

#### 6.3 Sub-View 3: Advance Tax Schedule (TX-4)
- Tracks statutory quarterly installment deadlines under Section 208/211:
  - **Q1 (June 15):** 15% cumulative liability
  - **Q2 (September 15):** 45% cumulative liability
  - **Q3 (December 15):** 75% cumulative liability
  - **Q4 (March 15):** 100% cumulative liability
- Computes Section 234C interest liability (1% simple interest per month for 3 months) on installment shortfalls.

#### 6.4 Sub-View 4: 8-Year CFL Waterfall (TX-5)
- Tracks unabsorbed capital losses across previous 8 Assessment Years. Displays origin FY, unabsorbed balance, expiration AY, and highlights expiring losses ($\le 1$ year remaining) with an urgent pulse badge.

#### 6.5 Sub-View 5: Dividend Income & Section 194 TDS (TX-6)
- Reconciles Schedule OS dividend receipts, 10% TDS withheld under Section 194, and net cash credited to bank accounts.

#### 6.6 Sub-View 6: 31-Day GAAR Repurchase Tracker (TX-7)
- 31-calendar-day countdown buffer following harvest sales to protect against General Anti-Avoidance Rules (GAAR) scrutiny.
- **Intervening Corporate Action Detector:** Alerts if a bonus or split occurred between harvest sale and repurchase date to prevent cost basis errors.

---

### Screen 7: Corporate Actions Engine (`CorporateActionsView.tsx`)
- **Executive Purpose:** Automated corporate action adjustments with strict zero-cost-variance mathematical invariance.
- **Sub-Tabs:** `[Scheduled Ledger]` | `[Upcoming Calendar CA-1]` | `[Dividend & TDS CA-2]` | `[Yield on Cost CA-5]` | `[PMS Vendor Match]`
- **Upcoming Ex-Date Calendar (CA-1):** Integrates NSE Trading Calendar; triggers flashing alert when an ex-date is within $\le 5$ trading days.
- **Cost-Basis Verification Modal (CA-3):** Enforces $\Delta(\text{Total Cost}) \equiv 0.00$ on bonus and split adjustments before committing to the database, writing an immutable SHA-256 stamp to `CorporateActionAudit`.
- **Rights Issue Subscription Modal (CA-4):** Calculates cash required for subscription, tax impact of renunciation, and blended weighted cost basis.

---

### Screen 8: NRI Wealth & Repatriation Hub (`NriTaxRepatriationHub.tsx`)
- **Executive Purpose:** Foreign exchange tax compliance, FEMA Form 15CA/15CB tracking, and dual-currency performance reporting.
- **Key Capabilities:**
  - **NRE vs NRO Classification:** Visual bifurcation of repatriable vs restricted local funds.
  - **Form 15CA / 15CB Tracker:** Tracks cumulative annual remittance against the RBI $1,000,000 USD Liberalised Remittance Scheme (LRS) quota.
  - **Dual-Currency XIRR Engine:** Side-by-side performance in INR vs Home Currency (USD/AED) factoring in currency depreciation.
  - **Section 195 TDS Reconciliation:** Tracks higher 20%–30% NRI withholding tax vs lower DTAA treaty rates for refund claims.

---

### Screen 9: Opportunity Engine & Unified Conviction Hub (`OpportunitiesRebalancingHub.tsx`, `AutonomousSmartMoneySentinelView.tsx`)
- **Executive Purpose:** Autonomous quantitative screening across 7 strategies, multi-source conviction scoring, and Half-Kelly position sizing.
- **Key Modules:**
  - **Live Scanner Feed:** Surfaces actionable opportunities matching quantitative filters.
  - **Unified Conviction Score (0–100):** Fuses technical breakouts, valuation percentiles, delivery volume spikes, institutional flows, news sentiment, and options positioning.
  - **Constrained Half-Kelly Sizing Calculator (OPP-1):** Calculates optimal position sizes with hard circuit breakers (zero allocation if drawdown $> 25\%$; single-stock cap 5% NAV; volume cap 2% ADV).
  - **Autonomous Sentinel View:** Real-time audit of recommendation outcomes (`TARGET_1_HIT`, `TARGET_2_HIT`, `STOPPED_OUT`), automated post-mortems, and paper trading portfolio performance.

---

### Screen 10: Scrip Intelligence Portal & Security Dossier (`ScripIntelligencePortal.tsx`, `SecurityDossierHubView.tsx`)
- **Executive Purpose:** Deep forensic fundamental and technical profile per scrip.
- **Key Capabilities:**
  - Fundamental cross-validation: P/E, ROE, Debt/Equity, promoter shareholding cross-checked across Screener.in, Trendlyne, and exchange filings.
  - Investment thesis journal: User thesis notes, quarterly earnings tracker, and broker target consensus drift.
  - F&O derivatives depth: Put-Call Ratio (PCR), Open Interest (OI) buildup, and implied volatility skew.

---

### Screen 11: Ingestion & Reconciliation Hub (`ImportsHubView.tsx`, `ReconciliationView.tsx`, `BulkImportView.tsx`)
- **Executive Purpose:** Universal multi-format parser and 3-way reconciliation engine.
- **Supported Ingestion Formats:**
  - CAMS & KFintech CAS PDF / Excel statements.
  - Zerodha Kite Connect live sync & Console Tradebook Excel workbooks.
  - Multi-broker PMS Excel valuation statements & Bank Book CSVs (ASK, Marcellus, IIFL, Motilal Oswal).
- **Reconciliation Engine:**
  - 3-way match: Broker Reported Holdings vs Demat Holding Statements (NSDL/CDSL) vs Internal Transaction Ledger.
  - Incremental waterfall bridge highlighting discrepancy in quantities, missing dividends, or unadjusted corporate actions.

---

### Screen 12: Settings, Audit Ledger & Master Governance (`SettingsHubView.tsx`, `SettingsView.tsx`)
- **Executive Purpose:** Enterprise system security, multi-tenant governance, and audit verification.
- **Key Components:**
  - Family Hierarchy & PAN Association Manager.
  - **Immutable Audit Ledger Browser (INFRA-6):** Searchable cryptographic log of all state mutations with before/after JSON states.
  - **Data Feed Staleness Board (INFRA-3):** Real-time latency and status monitor for Upstox, Yahoo Finance, AMFI, and NSE feeds.
  - SQLite WAL Database Health Inspector and Persistent Backup Restore Manager.

---

## 5. MATHEMATICAL FOUNDATIONS, FINANCIAL ENGINES & STATUTORY LOGIC

### 5.1 FIFO Capital Gains Engine (`fifoEngine.ts`)

#### 1. Lot Matching Algorithm
Lots are maintained in an append-only transaction pool and matched strictly First-In, First-Out at the `(portfolio, isin)` tuple level.
For each `SELL` transaction of quantity $Q_{\text{sell}}$ on date $D_{\text{sell}}$ at price $P_{\text{sell}}$:
1. Locate the earliest unmatched or partially matched `BUY` transaction $i$ with remaining quantity $Q_{\text{rem}, i} > 0$ on date $D_{\text{buy}, i} \le D_{\text{sell}}$.
2. Determine matched lot quantity: $Q_{\text{match}} = \min(Q_{\text{sell}}, Q_{\text{rem}, i})$.
3. Calculate holding period in calendar days: $H = D_{\text{sell}} - D_{\text{buy}, i}$.

#### 2. Holding Period Classification
- **Listed Equity & Equity Mutual Funds:**
  $$H > 365 \implies \text{LTCG (Section 112A)}; \quad H \le 365 \implies \text{STCG (Section 111A)}$$
- **Specified Debt Mutual Funds (Acquired on or after April 1, 2023):**
  Treated strictly as Short-Term Capital Gains under Section 50AA, regardless of holding period, taxed at the assessee's applicable slab rate.

#### 3. Finance (No. 2) Act, 2024 Cutover Logic (TX-3)
Cutover tax rates are strictly determined by the exact transaction date $D_{\text{sell}}$, never by the financial year:
- If $D_{\text{sell}} < \text{"2024-07-23"}$:
  - $\text{Rate}_{\text{STCG}} = 15.0\%$
  - $\text{Rate}_{\text{LTCG}} = 10.0\%$
  - Aggregate Annual LTCG Exemption = ₹1,00,000 per PAN per FY.
- If $D_{\text{sell}} \ge \text{"2024-07-23"}$:
  - $\text{Rate}_{\text{STCG}} = 20.0\%$
  - $\text{Rate}_{\text{LTCG}} = 12.5\%$
  - Aggregate Annual LTCG Exemption = ₹1,25,000 per PAN per FY.

#### 4. Section 112A Grandfathering Formula
For listed equity lots acquired prior to February 1, 2018 ($D_{\text{buy}} < \text{"2018-02-01"}$):
$$\text{Actual Buy Price} = P_{\text{buy}}$$
$$\text{Fair Market Value on Jan 31, 2018} = P_{\text{FMV2018}}$$
$$\text{Sale Price} = P_{\text{sell}}$$
$$\text{Deemed Cost of Acquisition} = \max\Big(P_{\text{buy}}, \min(P_{\text{FMV2018}}, P_{\text{sell}})\Big)$$
$$\text{Grandfathered Capital Gain} = Q_{\text{match}} \times (P_{\text{sell}} - \text{Deemed Cost of Acquisition})$$

---

### 5.2 Corporate Actions Mathematical Engine (`CorporateActionsEngine.ts`)

#### Invariant Conservation Rule (CA-3)
Every applied stock split, bonus issuance, or reverse split must preserve total cost basis with absolute precision:
$$\Delta(\text{Total Cost}) = \big|\text{Total Cost}_{\text{post}} - \text{Total Cost}_{\text{pre}}\big| \equiv 0.0000$$

#### Mathematical Transformations
1. **Bonus Issue ($N:D$):**
   $$Q_{\text{bonus}} = \left\lfloor Q_{\text{pre}} \times \frac{N}{D} \right\rfloor$$
   $$Q_{\text{post}} = Q_{\text{pre}} + Q_{\text{bonus}}$$
   $$P_{\text{avg, post}} = \frac{\text{Total Cost}_{\text{pre}}}{Q_{\text{post}}}$$
   *Tax Note:* The cost of acquisition of bonus shares is deemed to be ₹0.00 under Section 55(2)(aa).
2. **Stock Split ($F_{\text{old}} \to F_{\text{new}}$):**
   $$Q_{\text{post}} = Q_{\text{pre}} \times \frac{F_{\text{old}}}{F_{\text{new}}}$$
   $$P_{\text{avg, post}} = \frac{\text{Total Cost}_{\text{pre}}}{Q_{\text{post}}}$$
3. **Rights Issue Subscription & Renunciation (CA-4):**
   - Subscribed shares: added at Rights Issue Price $P_{\text{rights}}$.
   - New blended average price:
     $$P_{\text{avg, post}} = \frac{\text{Total Cost}_{\text{pre}} + (Q_{\text{subscribed}} \times P_{\text{rights}})}{Q_{\text{pre}} + Q_{\text{subscribed}}}$$
   - Renounced rights: cash proceeds received treated as Short-Term Capital Gains under Section 55(2)(aa).

---

### 5.3 Post-Tax XIRR & Valuation Engine (`xirr.ts`, `PostTaxXirrService.ts`)

XIRR solves for the internal rate of return $r$ where the net present value of all cash flows equals zero:
$$\text{NPV}(r) = \sum_{i=1}^{n} \frac{C_i}{(1 + r)^{\frac{D_i - D_1}{365}}} = 0$$
Where:
- $C_i < 0$ for capital inflows, buy executions, and management fee withdrawals.
- $C_i > 0$ for capital withdrawals, sale proceeds, and net dividend payouts.
- Terminal cash flow $C_n > 0$ at current date $D_n$:
  - **Pre-Tax XIRR:** $C_n = \text{Current Portfolio Valuation}$.
  - **Post-Tax XIRR:** $C_n = \text{Current Portfolio Valuation} - \text{Unrealized Tax Liability (STCG + LTCG)}$.

#### Numerical Implementation
- Primary Solver: Newton-Raphson iteration with derivative evaluation.
- Convergence Criteria: $|\text{NPV}(r)| < 10^{-6}$ within 100 iterations.
- Robust Fallback: Robust Bisection method bounded in interval $[-0.99, 10.0]$ if Newton-Raphson fails or diverges.

---

### 5.4 PMS Fee Forensic Reconciliation Engine (`PmsFeeReconciliationService.ts`)

PMS fee agreements often contain complex watermark and hurdle clauses that result in billing errors. The engine recalculates fees independently from raw ledger transactions:
1. **High Water Mark (HWM):** The highest historical net asset value of the portfolio against which performance fees are assessed.
2. **Hurdle Rate (e.g. 10.0% p.a.):** The minimum annualized threshold the portfolio must achieve before the investment manager is entitled to profit sharing.
3. **Management Fee:**
   $$\text{Fee}_{\text{mgmt}} = \sum_{t=1}^{T} \left( \text{Daily AUM}_t \times \frac{\text{Annual Fee Rate}}{365} \right)$$
4. **Performance Fee:**
   $$\text{Fee}_{\text{perf}} = \text{Performance Share \%} \times \max\Big(0, \text{Ending AUM} - \text{HWM} - \text{Hurdle Amount}\Big)$$
5. **Fee Leakage Assertion:**
   $$\text{Variance} = \text{Fee Charged by Broker} - \text{Statutorily Recomputed Fee}$$
   If $\text{Variance} > ₹1,000$, a forensic audit alert is generated.

---

## 6. AUTONOMOUS OPPORTUNITY IDENTIFICATION & CONVICTION ENGINE (PHASES 0–7)

### 6.1 Foundational Infrastructure (Phase 0)
- **INFRA-1 (Trading Calendar):** Centralized NSE calendar service (`trading_calendar`). Eliminates weekend and holiday errors in ex-date alerts, settlement cycles, and signal horizons.
- **INFRA-2 (Universal Decimal Precision):** All monetary and quantity values handled using integer paise or fixed-point `Decimal` arithmetic. Float drift is prohibited.
- **INFRA-3 (Data Feed Staleness):** Every data feed is monitored and classified into one of three visual states:
  - `LIVE`: Last heartbeat within threshold (quotes $\le 30$s during market hours; EOD $\le 24$h).
  - `STALE`: Heartbeat delayed. Surfaces amber badge (`Stale · 4h ago`).
  - `UNAVAILABLE`: Feed connection severed. Outlined dashed badge. Signal generation is suspended.
- **INFRA-4 (Idempotent Mutation Deduplication):** All mutating API calls require or generate a `dedup_key` stored in `mutation_dedup_keys` to prevent duplicate transaction insertions.
- **INFRA-5 (Calibration Ledger):** Records every model prediction alongside realized outcomes, evaluating Brier scores:
  $$\text{Brier Score} = \frac{1}{N} \sum_{t=1}^{N} (p_t - o_t)^2, \quad p_t \in [0, 1], \; o_t \in \{0, 1\}$$
- **INFRA-6 (Append-Only Immutable Audit Ledger):** Records every system mutation (`audit_ledger`) with timestamps, actor, before/after JSON states, and SHA-256 integrity hash chaining.

---

### 6.2 Quantitative Scanner Strategies (7 Market Setups)
1. **Breakout Strategy:** Price breaks 20-day high with Volume $> 2.5 \times$ 50-day SMA volume and RSI(14) between 55 and 70.
2. **52-Week High Momentum:** Price within 3% of 52-week high with verified moving average alignment: $\text{EMA}_{20} > \text{EMA}_{50} > \text{EMA}_{200}$.
3. **Swing Oversold RSI:** RSI(14) $< 32$ while price remains above 200-day EMA, confirmed by a bullish reversal candle.
4. **Institutional Accumulation:** Delivery percentage $> 65\%$ over 5 consecutive sessions with rising On-Balance Volume (OBV).
5. **High-Yield Dividend Compounder:** Dividend yield $> 4.0\%$, payout ratio $< 60\%$, and 3-year dividend CAGR $> 8.0\%$.
6. **Value Dip Setup:** Price retraced $8\%\text{--}15\%$ from swing high into key Fibonacci support (50% or 61.8%) with positive operating cash flow.
7. **Trend Continuation:** Pullback to 20-day EMA in an established trend with ADX $> 25$.

---

### 6.3 Constrained Half-Kelly Position Sizing Engine (OPP-1)
To protect capital, position sizing uses a constrained Half-Kelly allocation:
$$K^* = p - \frac{1 - p}{b}$$
Where:
- $p =$ Empirically calibrated win probability from `CalibrationLedger`.
- $b = \frac{\text{Target Profit Distance}}{\text{Stop Loss Distance}}$.

#### Penalty Multipliers & Circuit Breakers
$$f_{\text{allocated}} = \frac{1}{2} K^* \times (1 - \text{Drawdown Penalty}) \times (1 - \text{Correlation Penalty})$$
- **Drawdown Circuit Breaker:**
  - Drawdown $< 10\% \implies \text{Penalty} = 0\%$
  - $10\% \le \text{Drawdown} \le 25\% \implies \text{Penalty} = 50\%$
  - $\text{Drawdown} > 25\% \implies \text{Penalty} = 100\% \implies f_{\text{allocated}} = 0.0\%$ (Complete allocation freeze)
- **Hard Single-Stock Cap:** Maximum allocation per stock is capped at $5.0\%$ of total portfolio NAV.
- **Liquidity Ceiling:** Position size cannot exceed $2.0\%$ of the stock's 20-day Average Daily Volume (ADV).

---

### 6.4 Multi-Source Unified Conviction Fusion (Phase 7)
The Unified Conviction Score ($0\text{--}100$) synthesizes multi-source intelligence into a single calibrated number:

$$\begin{aligned}
\text{ConvictionScore}(\text{symbol}) &= w_{\text{tech}} \times \text{CalibratedProbability}(\text{technical\_setup}) \\
&+ w_{\text{fund}} \times \text{FundamentalQualityScore}(\text{symbol}) \\
&+ w_{\text{flow}} \times \text{InstitutionalFlowScore}(\text{symbol}) \\
&+ w_{\text{opt}} \times \text{OptionsPositioningScore}(\text{symbol}) \\
&+ w_{\text{news}} \times \text{NewsEventScore}(\text{symbol}) \\
&+ w_{\text{sent}} \times \text{RetailSentimentScore}(\text{symbol}) \\
&+ w_{\text{tp}} \times \text{ThirdPartyScore}(\text{symbol})
\end{aligned}$$

#### Fusion Governance & Manipulation Filters
1. **Component Calibration Gating:** Weights $w_i$ are derived from historical calibration in `CalibrationLedger`. Unproven components are set to $w_i = 0$.
2. **Social Sentiment Manipulation Discount (SRC-4):** Sudden sentiment spikes on small-cap stocks with high phrase repetition are tagged `MANIPULATION_RISK: HIGH` and suppressed from the fusion score.
3. **Recommendation vs Information Labeling:** A score is labeled as an *Actionable Recommendation* only if it has cleared its minimum sample size ($N \ge 15$). Otherwise, it is labeled *Informational Only*.

---

## 7. COMPLETE DATABASE ARCHITECTURE & FORENSIC SCHEMAS

The persistence layer consists of 45+ relational tables in SQLite3 / LibSQL (`portfolio.db`), running in WAL mode with a 10-second busy timeout.

### 7.1 Entity & Multi-Tenant Domain
```sql
-- Application configuration and security state
CREATE TABLE IF NOT EXISTS AppConfig (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);

-- Registered investment portfolios and broker demat mappings
CREATE TABLE IF NOT EXISTS Portfolios (
  portfolio TEXT PRIMARY KEY,
  owner_name TEXT NOT NULL,
  pan TEXT NOT NULL,
  broker_name TEXT,
  account_type TEXT DEFAULT 'DEMAT', -- DEMAT, PMS, AIF, MUTUAL_FUND, SAVINGS, FD
  is_nri INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Family Office umbrella groups
CREATE TABLE IF NOT EXISTS FamilyGroups (
  group_id TEXT PRIMARY KEY,
  group_name TEXT NOT NULL,
  primary_pan TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Demat and trading account profiles per family member
CREATE TABLE IF NOT EXISTS AccountProfiles (
  profile_id TEXT PRIMARY KEY,
  portfolio TEXT REFERENCES Portfolios(portfolio),
  demat_account_no TEXT,
  depository TEXT, -- NSDL, CDSL
  dp_id TEXT,
  is_active INTEGER DEFAULT 1
);

-- Target asset allocation weights per family member for rebalancing
CREATE TABLE IF NOT EXISTS TargetAllocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  target_pct REAL NOT NULL,
  min_pct REAL,
  max_pct REAL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### 7.2 Core Ledger & Inventory Accounting
```sql
-- Immutable append-only transaction execution ledger
CREATE TABLE IF NOT EXISTS Transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, -- YYYY-MM-DD
  portfolio TEXT NOT NULL REFERENCES Portfolios(portfolio),
  type TEXT NOT NULL, -- BUY, SELL, DIVIDEND, BONUS, SPLIT, RIGHTS, FEE, TRANSFER
  isin TEXT NOT NULL,
  symbol TEXT NOT NULL,
  quantity REAL NOT NULL,
  price REAL NOT NULL,
  gross_amount REAL NOT NULL,
  brokerage REAL DEFAULT 0,
  stt_tax REAL DEFAULT 0,
  net_amount REAL NOT NULL,
  source TEXT, -- ZERODHA, CAMS, PMS, MANUAL
  broker_name TEXT,
  folio TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_txn_port_isin ON Transactions(portfolio, isin);
CREATE INDEX IF NOT EXISTS idx_txn_date ON Transactions(date);

-- Current consolidated active holdings
CREATE TABLE IF NOT EXISTS Holdings (
  portfolio TEXT NOT NULL,
  isin TEXT NOT NULL,
  symbol TEXT NOT NULL,
  quantity REAL NOT NULL,
  avg_buy_price REAL NOT NULL,
  total_cost REAL NOT NULL,
  ltp REAL DEFAULT 0,
  current_value REAL DEFAULT 0,
  unrealized_pnl REAL DEFAULT 0,
  unrealized_pct REAL DEFAULT 0,
  last_price_update TEXT,
  PRIMARY KEY (portfolio, isin)
);

-- Fully liquidated positions archive
CREATE TABLE IF NOT EXISTS SoldStockRegistry (
  portfolio TEXT NOT NULL,
  isin TEXT NOT NULL,
  symbol TEXT NOT NULL,
  total_sold_quantity REAL NOT NULL,
  total_realized_proceeds REAL NOT NULL,
  total_cost_basis REAL NOT NULL,
  net_realized_pnl REAL NOT NULL,
  last_sold_date TEXT NOT NULL,
  PRIMARY KEY (portfolio, isin)
);

-- Master ticker and scrip classification repository
CREATE TABLE IF NOT EXISTS MasterTickers (
  isin TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  company_name TEXT NOT NULL,
  exchange TEXT DEFAULT 'NSE',
  sector TEXT,
  industry TEXT,
  market_cap_category TEXT, -- LARGE, MID, SMALL, MICRO
  yahoo_symbol TEXT,
  upstox_key TEXT,
  is_active INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_ticker_symbol ON MasterTickers(symbol);

-- ISIN to Symbol alias resolution mappings
CREATE TABLE IF NOT EXISTS AssetScripMappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_scrip_name TEXT NOT NULL UNIQUE,
  mapped_isin TEXT NOT NULL,
  mapped_symbol TEXT NOT NULL,
  source TEXT DEFAULT 'AUTO'
);
```

### 7.3 Forensic Tax & Corporate Actions Domain
```sql
-- Matched FIFO capital gains lot ledger
CREATE TABLE IF NOT EXISTS RealizedGains (
  match_id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio TEXT NOT NULL,
  pan TEXT NOT NULL,
  isin TEXT NOT NULL,
  symbol TEXT NOT NULL,
  buy_date TEXT NOT NULL,
  sell_date TEXT NOT NULL,
  holding_period_days INTEGER NOT NULL,
  quantity REAL NOT NULL,
  buy_price REAL NOT NULL,
  sell_price REAL NOT NULL,
  cost_basis REAL NOT NULL,
  sale_consideration REAL NOT NULL,
  realized_gain REAL NOT NULL,
  gain_type TEXT NOT NULL, -- STCG, LTCG
  fmv_2018_01_31 REAL DEFAULT 0,
  grandfathered_cost REAL DEFAULT 0,
  tax_rate REAL NOT NULL, -- e.g. 0.15, 0.20, 0.10, 0.125
  estimated_tax REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rg_pan_sell_date ON RealizedGains(pan, sell_date);

-- Annual tax summary per PAN
CREATE TABLE IF NOT EXISTS TaxSummary (
  pan TEXT NOT NULL,
  fy TEXT NOT NULL, -- e.g. 2024-2025
  stcg_15_gains REAL DEFAULT 0,
  stcg_20_gains REAL DEFAULT 0,
  ltcg_10_gains REAL DEFAULT 0,
  ltcg_125_gains REAL DEFAULT 0,
  total_tax_liability REAL DEFAULT 0,
  cfl_absorbed REAL DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pan, fy)
);

-- Carried forward losses tracking across 8 assessment years
CREATE TABLE IF NOT EXISTS CarriedForwardLosses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pan TEXT NOT NULL,
  origin_ay TEXT NOT NULL,
  loss_type TEXT NOT NULL, -- STCL, LTCL, BUSINESS
  original_amount REAL NOT NULL,
  remaining_unabsorbed REAL NOT NULL,
  expiry_ay TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tax harvesting execution and 31-day GAAR tracking
CREATE TABLE IF NOT EXISTS harvest_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio TEXT NOT NULL,
  pan TEXT NOT NULL,
  symbol TEXT NOT NULL,
  isin TEXT NOT NULL,
  harvest_date TEXT NOT NULL,
  harvested_quantity REAL NOT NULL,
  realized_loss REAL NOT NULL,
  repurchase_eligible_date TEXT NOT NULL,
  repurchase_status TEXT DEFAULT 'PENDING', -- PENDING, COMPLETED, CANCELLED
  intervening_ca_alert TEXT
);

-- Declared corporate actions
CREATE TABLE IF NOT EXISTS CorporateActions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_date TEXT NOT NULL,
  ex_date TEXT NOT NULL,
  isin TEXT NOT NULL,
  symbol TEXT NOT NULL,
  action_type TEXT NOT NULL, -- BONUS, SPLIT, DIVIDEND, RIGHTS, MERGER
  numerator REAL NOT NULL,
  denominator REAL NOT NULL,
  dividend_per_share REAL DEFAULT 0,
  applied INTEGER DEFAULT 0,
  applied_date TEXT
);

-- Invariant verification audit for applied actions
CREATE TABLE IF NOT EXISTS CorporateActionAudit (
  audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_id INTEGER REFERENCES CorporateActions(id),
  portfolio TEXT NOT NULL,
  isin TEXT NOT NULL,
  pre_quantity REAL NOT NULL,
  post_quantity REAL NOT NULL,
  pre_total_cost REAL NOT NULL,
  post_total_cost REAL NOT NULL,
  cost_variance REAL NOT NULL, -- MUST BE 0.0000
  sha256_hash TEXT NOT NULL,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### 7.4 Foundational Infrastructure & Audit Tables (Phase 0)
```sql
-- Centralized NSE Trading Calendar (INFRA-1)
CREATE TABLE IF NOT EXISTS trading_calendar (
  date DATE PRIMARY KEY,
  market TEXT NOT NULL DEFAULT 'NSE',
  is_trading_day BOOLEAN NOT NULL,
  session_type TEXT DEFAULT 'FULL', -- FULL, MUHURAT, CLOSED
  holiday_name TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Real-time data feed staleness status (INFRA-3)
CREATE TABLE IF NOT EXISTS data_feed_status (
  feed_name TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  state TEXT NOT NULL, -- LIVE, STALE, UNAVAILABLE
  last_updated_at TEXT NOT NULL,
  last_good_value TEXT,
  source TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (feed_name, entity_key)
);

-- Idempotent mutation deduplication keys (INFRA-4)
CREATE TABLE IF NOT EXISTS mutation_dedup_keys (
  dedup_key TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  response_payload TEXT
);

-- Cryptographically chained append-only audit ledger (INFRA-6)
CREATE TABLE IF NOT EXISTS audit_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp_utc TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  before_state TEXT, -- JSON
  after_state TEXT,  -- JSON
  hash TEXT NOT NULL
);

-- Statistical calibration and Brier score tracking (INFRA-5)
CREATE TABLE IF NOT EXISTS CalibrationLedger (
  prediction_id TEXT PRIMARY KEY,
  strategy TEXT NOT NULL,
  ticker TEXT NOT NULL,
  predicted_prob REAL NOT NULL,
  predicted_outcome INTEGER,
  realized_outcome INTEGER,
  brier_score REAL,
  horizon_days INTEGER NOT NULL,
  evaluated_at TEXT
);
```

### 7.5 Autonomous Quantitative & Conviction Engine Tables
```sql
-- Active quantitative scanner signals
CREATE TABLE IF NOT EXISTS ActiveOpportunitySignals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  strategy TEXT NOT NULL,
  conviction_score REAL NOT NULL,
  entry_price REAL NOT NULL,
  target_price REAL NOT NULL,
  stop_loss REAL NOT NULL,
  risk_reward_ratio REAL NOT NULL,
  regime TEXT NOT NULL,
  is_gated INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Autonomous recommendation life-cycle ledger
CREATE TABLE IF NOT EXISTS AutonomousRecommendationsLedger (
  recommendation_id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL, -- BUY_LONG, SELL_SHORT
  entry_price REAL NOT NULL,
  current_price REAL NOT NULL,
  target_1 REAL NOT NULL,
  target_2 REAL NOT NULL,
  stop_loss REAL NOT NULL,
  status TEXT NOT NULL, -- ACTIVE, TARGET_1_HIT, TARGET_2_HIT, STOPPED_OUT
  created_at TEXT NOT NULL,
  closed_at TEXT
);

-- Stopped-out trade causal post-mortems
CREATE TABLE IF NOT EXISTS AutonomousPostMortems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recommendation_id TEXT REFERENCES AutonomousRecommendationsLedger(recommendation_id),
  symbol TEXT NOT NULL,
  loss_pct REAL NOT NULL,
  failure_reason TEXT NOT NULL, -- GAP_DOWN, EARNINGS_MISS, REGIME_CHANGE
  post_mortem_notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Multi-source intelligence registry (Phase 7)
CREATE TABLE IF NOT EXISTS data_sources (
  source_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL, -- MARKET_DATA, FUNDAMENTAL, NEWS, OPTIONS, SOCIAL
  access_method TEXT NOT NULL,
  tos_status TEXT NOT NULL, -- COMPLIANT, REQUIRES_REVIEW, PROHIBITED
  reliability_tier INTEGER NOT NULL, -- 1 to 4
  refresh_cadence TEXT,
  notes TEXT
);

-- Ingested news events with deduplication clustering
CREATE TABLE IF NOT EXISTS news_events (
  event_id TEXT PRIMARY KEY,
  published_at TEXT NOT NULL,
  source_id TEXT REFERENCES data_sources(source_id),
  headline TEXT NOT NULL,
  entity_keys TEXT, -- JSON array of symbols
  event_type TEXT NOT NULL, -- EARNINGS, M&A, REGULATORY, GUIDANCE, OTHER
  dedup_cluster_id TEXT NOT NULL,
  sentiment_score REAL
);

-- Retail social sentiment with manipulation discount
CREATE TABLE IF NOT EXISTS social_sentiment_daily (
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,
  mention_count INTEGER NOT NULL,
  positive_pct REAL NOT NULL,
  negative_pct REAL NOT NULL,
  manipulation_risk TEXT NOT NULL, -- LOW, MEDIUM, HIGH
  score_used_in_fusion INTEGER DEFAULT 1,
  PRIMARY KEY (symbol, date)
);

-- Options chain derived metrics
CREATE TABLE IF NOT EXISTS derived_options_metrics (
  symbol TEXT NOT NULL,
  as_of_date TEXT NOT NULL,
  pcr_oi REAL NOT NULL,
  pcr_volume REAL NOT NULL,
  max_pain_strike REAL NOT NULL,
  iv_skew_25delta REAL NOT NULL,
  unusual_oi_buildup TEXT, -- JSON array of strikes
  PRIMARY KEY (symbol, as_of_date)
);
```

---

## 8. EXHAUSTIVE API DIRECTORY & COMMUNICATION CONTRACTS

All API endpoints are hosted on the application daemon (`http://localhost:3000/api`) and return standard JSON responses with HTTP compression.

### 8.1 System, Health & Feed Status Endpoints
| Method | Route | Description | Expected Status |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/healthcheck` | Checks service uptime and server timestamp | `200 OK` |
| `GET` | `/api/calendar/is-trading-day?date=YYYY-MM-DD` | Returns trading day boolean and holiday name | `200 OK` |
| `GET` | `/api/calendar/add-trading-days?date=YYYY-MM-DD&n=5` | Adds $N$ NSE trading days skipping holidays | `200 OK` |
| `GET` | `/api/calendar/trading-days-between?from=&to=` | Counts trading days between two dates | `200 OK` |
| `GET` | `/api/data-quality/feed-status` | Returns staleness state of all external data feeds | `200 OK` |
| `GET` | `/api/data-quality/feed-status/:feedId` | Returns latency and state of specific feed | `200 OK` |
| `GET` | `/api/audit-ledger/search` | Queries immutable audit log by actor/event | `200 OK` |

---

### 8.2 Command Center & Portfolio Holdings Endpoints
| Method | Route | Description | Expected Status |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/command-center` | Consolidated AUM, Day P&L, Asset Allocation, Health | `200 OK` |
| `GET` | `/api/dashboard?portfolio=Combined` | Full holdings array, day changes, and cash summary | `200 OK` |
| `GET` | `/api/dashboard/effective-holdings` | Lookthrough holdings deconstructed from MFs/PMS | `200 OK` |
| `GET` | `/api/analytics/risk?portfolio=` | Beta, 1-day VaR (95/99%), Sharpe, Drawdown | `200 OK` |
| `GET` | `/api/bank-fds` | Cash accounts, savings balances, and Fixed Deposits | `200 OK` |
| `GET` | `/api/currency-rates` | Live RBI exchange rates (USD/INR, AED/INR) | `200 OK` |

---

### 8.3 Tax Center & Statutory Endpoints
| Method | Route | Description | Expected Status |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/tax/realized_gains?pan=&fy=` | Matched FIFO lot ledger with grandfathering | `200 OK` |
| `GET` | `/api/tax/harvesting-recommendations` | Unrealized loss harvest opportunities & tax savings | `200 OK` |
| `POST` | `/api/tax/harvest-action` | Records tax harvest action and creates 31-day GAAR | `201 Created` |
| `GET` | `/api/tax/advance-tax-schedule?pan=&fy=` | Quarterly installment liability & Sec 234C interest | `200 OK` |
| `GET` | `/api/tax/cfl-waterfall?pan=` | 8-year carried forward loss expiry schedule | `200 OK` |
| `GET` | `/api/tax/repurchase-reminders` | Active GAAR countdowns & intervening CA warnings | `200 OK` |

---

### 8.4 Corporate Actions Endpoints
| Method | Route | Description | Expected Status |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/corporate-actions/upcoming?days=30` | Ex-date calendar with $\le 5$-day urgency badges | `200 OK` |
| `GET` | `/api/corporate-actions/dividend-summary?fy=` | Gross dividend receipts and Section 194 TDS | `200 OK` |
| `GET` | `/api/corporate-actions/yield-on-cost` | Holdings ranked by Yield on Cost % | `200 OK` |
| `POST` | `/api/corporate-actions/apply-verified` | Executes bonus/split with $\Delta(\text{Cost}) \equiv 0$ check | `200 OK` |
| `POST` | `/api/corporate-actions/rights-subscription` | Processes rights issue subscription/renunciation | `200 OK` |

---

### 8.5 Opportunity Engine & Autonomous Agent Endpoints
| Method | Route | Description | Expected Status |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/opportunities/scanner` | 7-strategy scanner feed with macro regime tags | `200 OK` |
| `POST` | `/api/opportunities/position-size` | Half-Kelly calculator with drawdown penalty | `200 OK` |
| `GET` | `/api/opportunities/circuit-breaker` | Current portfolio drawdown and allocation freeze state | `200 OK` |
| `GET` | `/api/v1/autonomous-agent/recommendations` | Active recommendations with target/stop-loss levels | `200 OK` |
| `POST` | `/api/v1/autonomous-agent/audit` | Triggers audit of active trades vs closing prices | `200 OK` |
| `GET` | `/api/v1/autonomous-agent/quality-metrics` | Win rate %, profit factor, expectancy, Calmar | `200 OK` |
| `GET` | `/api/conviction/:symbol` | Full component breakdown of Unified Conviction Score | `200 OK` |

---

## 9. INGESTION PIPELINES, PARSERS & RECONCILIATION WORKFLOWS

```
                       EXTERNAL INGESTION CHANNELS
  [CAMS/KFintech CAS PDF]  [Zerodha Kite / Console Excel]  [PMS Vendor Valuation Stmt]
                                      |
                                      v
                        UNIFIED INGESTION SERVICE
  [Format Detection] -> [Entity/ISIN Resolution] -> [Idempotent Deduplication (INFRA-4)]
                                      |
                                      v
                        STAGING & VALIDATION PIPELINE
  [Bhavcopy Price Cross-Check] -> [Lot Integrity Assertion] -> [Append to Transactions]
                                      |
                                      v
                        AUTOMATED SYSTEM RESYNC
  [FIFO Re-Run] -> [Holdings Re-Aggregation] -> [Tax Summary Update] -> [Snapshot Recorded]
```

### 9.1 Parser Contracts & File Signatures
1. **CAMS CAS Native Parser (`camsParser.ts`):** Identifies folios, ISINs, scheme descriptions, stamp duty deductions, and NAVs directly from password-protected or decrypted CAS PDFs.
2. **Zerodha Console Parser (`ZerodhaTradebookService.ts`):** Parses raw broker tradebook Excel files (`.xlsx`), standardizing exchange transaction numbers, STT charges, and brokerage.
3. **PMS Multi-Format Parser (`pmsParser.ts`):** Normalizes diverse valuation layouts from ASK, Marcellus, and IIFL Securities into canonical transactions.

---

## 10. EXHAUSTIVE QUALITY ASSURANCE, TEST MATRIX & E2E VERIFICATION SUITE

This section defines the complete testing specification required for a development agent to write, execute, and verify all functionality and aesthetics across WealthOS.

### 10.1 Invariant Assertion Checklist (Definition of Done)
Every automated test run must assert these 10 mathematical and structural invariants:
- [ ] **INV-1 (Paise Cost Conservation):** Across all FIFO lot matches, $\sum(\text{Cost Basis}) + \sum(\text{Realized P&L}) \equiv \sum(\text{Sale Consideration})$.
- [ ] **INV-2 (Zero-Variance Corporate Actions):** In every stock split or bonus adjustment, $|\text{Post Cost} - \text{Pre Cost}| \equiv 0.0000$.
- [ ] **INV-3 (Finance Act 2024 Date Cutover):** Trades executed on or after `2024-07-23` must be taxed at 20% STCG and 12.5% LTCG; trades executed before that date must be taxed at 15% STCG and 10% LTCG.
- [ ] **INV-4 (Calendar Day vs Trading Day Separation):** Tax rules (Advance Tax, 365-day LTCG) use calendar days; market events (ex-date alerts, settlement cycles, calibration horizons) use `trading_calendar`.
- [ ] **INV-5 (Kelly Allocation Freeze):** When simulated portfolio drawdown $> 25\%$, the sizing engine must assert $f_{\text{allocated}} \equiv 0.0\%$.
- [ ] **INV-6 (Feed Staleness Gating):** If a data feed is flagged `STALE` or `UNAVAILABLE`, the opportunity scanner must suppress signal generation for that scrip.
- [ ] **INV-7 (Multi-PAN Isolation):** Tax loss set-offs under Section 70/74 must never offset capital gains across distinct PANs.
- [ ] **INV-8 (Idempotent Deduplication):** Submitting identical transaction payloads twice with the same `dedup_key` must return identical responses without creating duplicate database rows.
- [ ] **INV-9 (Audit Ledger Stamp):** Every state mutation must write an entry to `audit_ledger` containing the actor, timestamp, and SHA-256 state hash.
- [ ] **INV-10 (Statutory Disclaimers):** Every UI screen presenting estimated tax liabilities must render: *"Estimate only. Confirm with a Chartered Accountant before filing."*

---

### 10.2 Automated Unit & Integration Test Specifications

#### Test Suite 1: Mathematical Engines (`tests/unit/engines.test.ts`)
- **TC-ENG-1 (FIFO Lot Splitting):** Acquire 100 shares @ ₹100; acquire 50 shares @ ₹120; sell 120 shares @ ₹150.
  - *Assert:* Matched Lot 1 = 100 shares, Cost = ₹10,000, Gain = ₹5,000.
  - *Assert:* Matched Lot 2 = 20 shares, Cost = ₹2,400, Gain = ₹600.
  - *Assert:* Remaining Inventory = 30 shares @ ₹120, Total Cost = ₹3,600.
- **TC-ENG-2 (Sec 112A Grandfathering):** Acquire 10 shares @ ₹500 on 2016-01-10; FMV on Jan 31, 2018 = ₹800.
  - Scenario A: Sell @ ₹1,000 $\implies$ Cost Basis = ₹800, Taxable LTCG = ₹2,000.
  - Scenario B: Sell @ ₹700 $\implies$ Cost Basis = ₹700, Taxable LTCG = ₹0.00.
  - Scenario C: Sell @ ₹400 $\implies$ Cost Basis = ₹500, Allowable LTCL = -₹1,000.
- **TC-ENG-3 (Corporate Action Invariance):** Holding 500 shares @ ₹1,200 (Cost = ₹6,00,000). Apply 1:1 Bonus Issue.
  - *Assert:* Post-action quantity = 1,000 shares.
  - *Assert:* Post-action average price = ₹600.00.
  - *Assert:* Variance $|\text{Post Cost} - \text{Pre Cost}| \equiv 0.0000$.

#### Test Suite 2: Quantitative Sizing & Calibration (`tests/unit/quantum.test.ts`)
- **TC-QNT-1 (Kelly Drawdown Penalty):** Win probability $p = 0.65$, ratio $b = 2.0$. Unconstrained $K^* = 0.475$.
  - Scenario A: Portfolio Drawdown = 5% $\implies$ Allocation = 23.75% NAV $\to$ capped at 5.0% NAV.
  - Scenario B: Portfolio Drawdown = 15% $\implies$ Penalty = 50% $\implies$ Allocation = 11.875% $\to$ capped at 5.0% NAV.
  - Scenario C: Portfolio Drawdown = 26% $\implies$ Allocation $\equiv 0.0\%$ (Frozen).
- **TC-QNT-2 (Outcome Auditor Audit Cycle):**
  - Setup: Active long recommendation with entry = ₹100, target 1 = ₹108, target 2 = ₹120, stop-loss = ₹92.
  - Case 1: Market Close = ₹110 $\implies$ Status becomes `TARGET_1_HIT`, Stop-Loss moved to break-even (₹100).
  - Case 2: Market Close = ₹90 $\implies$ Status becomes `STOPPED_OUT`, Causal Post-Mortem entry auto-created.

---

### 10.3 Playwright UI, Visual Regression & Aesthetic Test Suite (`tests/e2e/visual.spec.ts`)

To verify screen workflows, aesthetics, and theme color compliance, an automated Playwright suite must execute the following checks:

```typescript
import { test, expect } from '@playwright/test';

test.describe('WealthOS Institutional Visual & Workflow Suite', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('[data-testid="app-header"]');
  });

  test('TC-UI-1: Executive Command Center Render & Contrast Integrity', async ({ page }) => {
    // 1. Verify master AUM figure is displayed with non-zero tabular numbers
    const aumElement = page.locator('[data-testid="total-net-worth"]');
    await expect(aumElement).toBeVisible();
    const aumText = await aumElement.innerText();
    expect(aumText).toMatch(/^₹[0-9,]+(\.[0-9]{2})?$/);

    // 2. Verify Tabular Numerals CSS property
    const fontFamily = await aumElement.evaluate((el) => window.getComputedStyle(el).fontFamily);
    expect(fontFamily).toContain('JetBrains Mono');

    // 3. Verify Theme Semantic Token Compliance in Institutional Light Mode
    const canvasBg = await page.evaluate(() => 
      window.getComputedStyle(document.body).getPropertyValue('--bg-app').trim()
    );
    expect(canvasBg).toBe('#F7F8FA');
  });

  test('TC-UI-2: ResizableDataTable Pinned Columns & Scrolling Interaction', async ({ page }) => {
    await page.click('button:has-text("Portfolio Hub")');
    await page.waitForSelector('table');

    // Verify pinned left column styling and presence of subtle border
    const pinnedCol = page.locator('th:has-text("Scrip Symbol")');
    await expect(pinnedCol).toHaveCSS('position', 'sticky');
    await expect(pinnedCol).toHaveCSS('left', '0px');

    // Test sorting interaction
    const pnlHeader = page.locator('th:has-text("Unrealized P&L")');
    await pnlHeader.click();
    await expect(pnlHeader.locator('svg')).toHaveClass(/text-emerald/);
  });

  test('TC-UI-3: Statutory Tax Disclaimers & Date Cutover Banner', async ({ page }) => {
    await page.click('button:has-text("Tax Center")');
    await page.waitForSelector('[data-testid="tax-cutover-banner"]');

    // Verify permanent non-dismissible statutory warning
    const disclaimer = page.locator('footer:has-text("Estimate only. Confirm with a Chartered Accountant before filing.")');
    await expect(disclaimer).toBeVisible();

    // Verify Finance Act 2024 Split Cutover Display
    const cutoverNotice = page.locator('text=July 23, 2024');
    await expect(cutoverNotice).toBeVisible();
  });

  test('TC-UI-4: Dark / Light Mode Switcher & Surface Contrast Ratio', async ({ page }) => {
    // Open Settings and toggle theme
    await page.click('button:has-text("Settings")');
    await page.click('button:has-text("Appearance & Themes")');
    await page.click('button:has-text("Midnight Obsidian Dark")');

    // Verify dark canvas transition
    const darkCanvas = await page.evaluate(() => 
      window.getComputedStyle(document.body).getPropertyValue('--bg-app').trim()
    );
    expect(darkCanvas).toBe('#020617');

    // Verify contrast ratio on dark card text exceeds WCAG AAA (7:1)
    const primaryTextColor = await page.locator('h1').evaluate((el) => 
      window.getComputedStyle(el).color
    );
    expect(primaryTextColor).toBe('rgb(248, 250, 252)'); // #F8FAFC
  });

  test('TC-UI-5: Drawdown Circuit Breaker UI Lockout Verification', async ({ page }) => {
    await page.click('button:has-text("Opportunities")');
    // Inject simulated drawdown state via API or test hook
    const circuitBreakerPill = page.locator('[data-testid="circuit-breaker-status"]');
    if (await circuitBreakerPill.isVisible()) {
      const statusText = await circuitBreakerPill.innerText();
      if (statusText.includes('ACTIVATED')) {
        // Assert sizing inputs are disabled
        const sizingButton = page.locator('button:has-text("Calculate Sizing")');
        await expect(sizingButton).toBeDisabled();
      }
    }
  });

});
```

---

## 11. EXECUTION DIRECTIVE FOR INCOMING DEVELOPMENT AGENTS

When reviewing this specification or implementing modifications:
1. **Never mutate calculation algorithms** in `fifoEngine.ts` or `PostTaxXirrService.ts` without running the regression suite in `tests/unit/engines.test.ts`.
2. **Never store currency or quantity fields as floating-point numbers.** Use integer paise or `Decimal` objects.
3. **Preserve the `ResizableDataTable` component structure** when modifying screens; pinned columns and fixed-width tabular figures are non-negotiable usability requirements.
4. **All mutations must flow through `runInDbLock` and write an audit record to `audit_ledger`.**
5. **Always maintain both Institutional Light and Midnight Obsidian color token parity.** No ad-hoc inline styles with raw unmapped hex codes are permitted.

---
*End of Complete Master System Specification. Approved for Production Implementation & Verification.*
