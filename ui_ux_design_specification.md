# NRI WealthOS — UI/UX Design & Architecture Specification
**Document Version**: 4.2.0-PROD  
**Design System Maturity**: Tier-1 Institutional FinTech / Hedge Fund Operating System  
**Aesthetic Metaphor**: "Bloomberg Terminal meets Linear & Stripe" — Ultra-high information density, dark-mode first, zero-glare, mathematical precision, and glassmorphic depth.  
**Target Reviewer**: Independent Senior UI/UX Designer, Product Architect, and Front-End System Engineer.

---

## 1. Executive Summary & Design System Philosophy

### 1.1 The Problem Space
Modern wealth management platforms for ultra-high-net-worth individuals (HNIs/NRIs) fail in one of two ways:
1. **Consumer Trading Apps (Zerodha, Groww)**: Visually playful, but lack institutional depth (no multi-PAN assesse family consolidation, no 15CA/CB remittance tracking, no date-aware mid-year statutory tax cutovers, no cross-broker corporate action cost-basis invariant enforcement).
2. **Legacy Wealth Portals (PMS/Wealth Spectrum)**: High on calculations, but look like 2004 ERP accounting software with clunky table controls, no visual hierarchy, and zero micro-interactions.

### 1.2 The Core Design Philosophy: "Radical Clarity & Precision"
NRI WealthOS bridges this divide with four inviolable design tenets:
1. **Mathematical Sanctity (No Approximation)**: Every currency value, dividend payout, and tax lot is rendered in fixed-width tabular figures with exact currency symbols (`₹`, `$`, `AED`). No rounding surprises or truncated decimals where tax liability is at stake.
2. **Zero-Glare Dark Surface Architecture**: Portfolios are monitored over extended multi-hour sessions. The interface uses a specialized **Midnight Obsidian** (`#020617` / `#0B1329`) base surface with balanced optical contrast, preventing ocular fatigue.
3. **Information Density without Clutter**: High data density is achieved through hierarchical typographic scales, collapsible forensic accordions, pinned table columns, and glassmorphic elevation cards rather than cramped whitespace.
4. **Statutory & Regulatory Transparency**: Statutory disclaimers (Finance Act 2024 cutover, Section 112A Grandfathering, Section 234C advance tax penalties, and GAAR 31-day repurchase buffers) are permanently integrated into the workflow as authoritative badges and banners, never hidden in obscure settings.

---

## 2. Color Palette & Token Architecture

The design system is built upon semantic CSS variables mapped to Tailwind utility tokens. It enforces strict WCAG AAA contrast ratios for financial text on dark surfaces.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   SEMANTIC COLOR MATRIX                                 │
├───────────────────┬─────────────┬─────────────┬─────────────────────────────────────────┤
│ Token Role        │ Hex Code    │ CSS Variable│ Usage Description                       │
├───────────────────┼─────────────┼─────────────┼─────────────────────────────────────────┤
│ Canvas Canvas     │ #020617     │ --bg-app    │ Deep Midnight Obsidian app canvas       │
│ Surface Raised    │ #0B1329     │ --bg-modal  │ Primary container & modal background    │
│ Card Glass Base   │ #0F172A (75)│ --bg-card   │ Glassmorphic card surface with blur     │
│ Card Hover State  │ #1E293B (90)│ --bg-hover  │ Hover elevation feedback                │
│ Border Subtle     │ #1E293B (85)│ --border-sub│ 1px perimeter border on cards & tables  │
│ Border Focus/Live │ #10B981     │ --border-foc│ Focus rings and active tab indicator    │
├───────────────────┼─────────────┼─────────────┼─────────────────────────────────────────┤
│ Primary Text      │ #F8FAFC     │ --text-pri  │ Screen titles, primary scrip names, P&L │
│ Secondary Text    │ #94A3B8     │ --text-sec  │ Column headers, subtitles, captions     │
│ Muted/Metadata    │ #64748B     │ --text-mut  │ ISIN codes, timestamps, audit tags      │
├───────────────────┼─────────────┼─────────────┼─────────────────────────────────────────┤
│ Gross Return      │ #10B981     │ --fin-gross │ Pre-tax profit, gains, bullish metrics  │
│ Gross Return Bg   │ #064E3B (30)│ --fin-grs-bg│ Soft emerald pill background            │
│ Realized Loss     │ #F43F5E     │ --fin-loss  │ Unrealized/realized loss, drawdown      │
│ Loss Background   │ #881337 (30)│ --fin-lss-bg│ Soft rose pill background               │
│ Withheld TDS (194)│ #F59E0B     │ --fin-tds   │ Section 194/195 tax deducted at source  │
│ TDS Background    │ #78350F (30)│ --fin-tds-bg│ Amber warning background                │
│ Net Post-Tax Cash │ #06B6D4     │ --fin-net   │ Actual cash credited post statutory tax │
│ Repatriable (NRE) │ #3B82F6     │ --fin-nre   │ Freely remittable overseas capital      │
│ Restricted (NRO)  │ #64748B     │ --fin-nro   │ Capital locked under 15CA/CB remittance │
│ FX Drag / Gain    │ #8B5CF6     │ --fin-fx-up │ Currency appreciation component         │
│ Corporate Bonus   │ #A855F7     │ --fin-bonus │ Bonus share issuances                   │
│ Corporate Split   │ #6366F1     │ --fin-split │ Stock split share adjustments           │
└───────────────────┴─────────────┴─────────────┴─────────────────────────────────────────┘
```

### 2.1 State & Status Color Semantics
- **LIVE / REAL-TIME**: `#10B981` (Emerald) + glowing pulse dot (`animate-pulse`).
- **STALE / DECAYING DATA**: `#F59E0B` (Amber) badge: `STALE (> 4 hours)`.
- **CIRCUIT BREAKER ACTIVATED**: `#F43F5E` (Rose/Red) filled pill + hard allocation freeze indicator.
- **INVARIANT VERIFIED ($\Delta = 0$)**: `#10B981` (Emerald) shield badge with solid border.
- **NEAR EXPIRY ($\le 1$ Year)**: `#EF4444` (Bright Red) badge with rhythmic alert pulse.

---

## 3. Typography & Tabular Numerals System

Typography is the foundational backbone of financial credibility. In NRI WealthOS, fonts are strictly separated by function:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   TYPOGRAPHY HIERARCHY                                  │
├──────────────┬─────────────────────────────┬───────────┬────────────┬───────────────────┤
│ Role         │ Typeface Family             │ Weights   │ Tabular    │ Primary Purpose   │
├──────────────┼─────────────────────────────┼───────────┼────────────┼───────────────────┤
│ Display      │ Space Grotesk / Outfit      │ 700, 800  │ No         │ Hero KPIs, AUM    │
│ Interface    │ Inter / Plus Jakarta Sans   │ 500, 600  │ No         │ Labels, Buttons   │
│ Tabular Data │ JetBrains Mono / SF Mono    │ 600, 700  │ Mandatory  │ All Numbers & P&L │
└──────────────┴─────────────────────────────┴───────────┴────────────┴───────────────────┘
```

### 3.1 Strict Tabular Figure Rule
All financial amounts, quantities, holding days, and percentages **MUST** carry:
```css
font-family: 'JetBrains Mono', monospace;
font-variant-numeric: tabular-nums;
letter-spacing: -0.02em;
```
*Design Rationale*: When numbers are aligned vertically in tables, variable-width numbers (like `1` vs `8`) cause unsightly visual jaggedness. Tabular numbers guarantee crisp, Bloomberg-grade vertical decimal alignment.

### 3.2 Type Scale Specification
- **Display 1 (AUM Grand Total)**: `text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight` (36px–48px)
- **H1 (Screen Title)**: `text-2xl sm:text-3xl font-bold tracking-tight text-slate-100` (24px–30px)
- **H2 (Section Header)**: `text-lg sm:text-xl font-bold text-slate-100` (18px–20px)
- **H3 (Card Header / Group)**: `text-sm sm:text-base font-bold text-slate-200` (14px–16px)
- **Body Regular (Descriptions)**: `text-xs sm:text-sm text-slate-400 leading-relaxed` (12px–14px)
- **Micro / Badge**: `text-[9px] sm:text-[10px] uppercase font-mono font-bold tracking-wider` (9px–10px)

---

## 4. Layout, Spacing & Elevation Architecture

### 4.1 The 8px Spatial Grid
All margins, paddings, gaps, and component dimensions adhere strictly to an 8px base grid (with 4px micro-increments):
- Micro-spacing: `4px` (`gap-1`, `p-1`)
- Compact: `8px` (`gap-2`, `p-2`, `py-2`)
- Standard: `16px` (`gap-4`, `p-4`, `rounded-xl`)
- Roomy: `24px` (`gap-6`, `p-6`, `rounded-2xl`)
- Sectional: `32px` (`space-y-8`, `mb-8`)

### 4.2 Glassmorphism Surface Specification
Cards do not use flat opaque gray boxes; they utilize a multi-layered glass recipe:
```css
/* Institutional Dark Glassmorphism Formula */
background: rgba(15, 23, 42, 0.70);
backdrop-filter: blur(16px);
-webkit-backdrop-filter: blur(16px);
border: 1px solid rgba(255, 255, 255, 0.08);
box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
border-radius: 1rem; /* 16px */
```

### 4.3 Z-Index Elevation Hierarchy
- `z-0`: App canvas background grid & glow gradients
- `z-10`: Sticky table headers & sub-navigation bars
- `z-20`: Pinned table columns (left-pinned scrip codes, right-pinned action buttons)
- `z-30`: Sticky top control bar (PAN switcher, FY selector, currency toggle)
- `z-40`: Dropdowns, tooltips, flyout menus
- `z-50`: Full-screen modal backdrops & confirmation dialogues
- `z-60`: High-priority alert toasts & circuit-breaker alerts

---

## 5. Screen Flow, Global Navigation & Context Switchers

The application is structured around a dual-tier navigation system: a **Persistent Global App Shell** and **Modular View Containers**.

```mermaid
flowchart TD
    Shell[Global Shell & Context Switchers] --> TopNav[Top Master Navigation Bar]
    
    Shell --> Ctx1[PAN Entity Selector: All PANs | Maa | Papa | Self | Brother]
    Shell --> Ctx2[Portfolio Selector: Combined | cc9 | IIFL360 | US-IBKR | Unlisted]
    Shell --> Ctx3[Financial Year Selector: FY 2024-25 | FY 2023-24 | All]
    Shell --> Ctx4[Currency Switcher: INR ₹ | USD $ | AED د.إ]

    TopNav --> S1[1. Command Center]
    TopNav --> S2[2. Portfolio Hub]
    TopNav --> S3[3. Institutional Analytics]
    TopNav --> S4[4. Report Studio]
    TopNav --> S5[5. Activity & Ledger]
    TopNav --> S6[6. Tax & Capital Gains]
    TopNav --> S7[7. Corporate Actions]
    TopNav --> S8[8. NRI Wealth & Repatriation]
    TopNav --> S9[9. Opportunity & Conviction]
    TopNav --> S10[10. Ingestion & Imports]
    TopNav --> S11[11. Reconciliation Audit]
    TopNav --> S12[12. Settings & Calibration]

    S5 --> S5_1[Tradebook Transactions Ledger]
    S5 --> S5_2[Consolidated Audit Trail]
    
    S6 --> S6_1[Realized Gains & Tax Slabs]
    S6 --> S6_2[Tax Loss Harvesting TX-1]
    S6 --> S6_3[Advance Tax Schedule TX-4]
    S6 --> S6_4[8-Year CFL Waterfall TX-5]
    S6 --> S6_5[Dividend Schedule OS TX-6]
    S6 --> S6_6[31-Day GAAR Tracker TX-7]

    S7 --> S7_1[Scheduled Ledger]
    S7 --> S7_2[Upcoming Ex-Date Calendar CA-1]
    S7 --> S7_3[Dividend & TDS Rollup CA-2]
    S7 --> S7_4[Yield On Cost Ranking CA-5]
    S7 --> S7_5[Cost Basis Verification Modal CA-3]
    S7 --> S7_6[Rights Issue Subscription Modal CA-4]
```

### 5.1 The Global Sticky Header & Switchers
Located permanently at the top of every screen:
1. **Brand Identity**: `NRI WealthOS` in bold Space Grotesk with an emerald status pulse indicating live NSE/BSE connectivity.
2. **Global Assesse PAN Switcher**: Segmented pill dropdown showing all PANs with aggregate trade count and net realized P&L.
3. **Global Portfolio Switcher**: Single demat/PMS vs Combined consolidated family view.
4. **FY Switcher**: Indian financial year (April 1 to March 31).
5. **Currency Mode**: Instant conversion using live RBI/Forex rates between INR, USD, and AED.

---

## 6. Detailed Screen-by-Screen UI Specifications

---

### Screen 1: Command Center (Executive Family Office Dashboard)
- **Visual Goal**: Instant executive clarity across consolidated family wealth, multi-asset allocation, daily P&L, and portfolio health.
- **Header Stats Row**:
  - **Total Family Net Worth**: ₹-formatted display typography (e.g. `₹48,29,14,500`) with Day Change (`+₹14,20,400 / +0.82%` in emerald).
  - **Invested Capital**: Baseline cost vs Current Market Value.
  - **Family XIRR / CAGR**: Pre-tax and post-tax institutional return compared against Nifty 50 TRI.
  - **Health Score**: Circular gauge (0–100) assessing asset diversification, cash drag, and concentration risk.
- **Multi-Asset Allocation Breakdown**:
  - Horizontal stacked progress bar with segment labels: Listed Equity (62%), Mutual Funds (18%), PMS Accounts (12%), Fixed Income & FDs (5%), Cash & Remittable (3%).
- **Interactive Holdings Treemap**:
  - Color-coded tiles sized by position weight. Green = Positive Day P&L, Red = Negative Day P&L.

---

### Screen 2: Portfolio Hub & Lookthrough Holdings
- **Visual Goal**: Deep scrip-level forensic transparency, eliminating the opacity of mutual fund and PMS holdings.
- **Tabular Architecture (`ResizableDataTable`)**:
  - **Pinned Left**: Scrip Symbol (e.g. `INFY`, `TCS`, `HDFCBANK`) + Company Name + ISIN code.
  - **Direct Equity vs Lookthrough**: Badges indicating whether the stock is held directly in Demat or indirectly via Mutual Funds / PMS portfolios.
  - **Effective Family Exposure**: Consolidated quantity, current market price (LTP), total position value, portfolio weight %, and unrealized gain/loss with color coding.
  - **Pinned Right**: Quick action buttons (`Inspect Dossier`, `View Tax Lots`, `Technical Chart`).
- **Interactive Filter Bar**:
  - Search input with instantaneous debounce filtering on Symbol, ISIN, Sector, or Demat Account.
  - Multi-select Sector dropdown (Financials, IT, Auto, Capital Goods, Pharma).

---

### Screen 3: Institutional Analytics & Risk Engine
- **Visual Goal**: Institutional risk attribution matching Bloomberg PORT and MSCI Barra capabilities.
- **Risk Attribution Metrics**:
  - **Portfolio Beta vs Nifty 50**: Gauge card showing market sensitivity.
  - **Historical Drawdown Waterfall**: Interactive area chart illustrating the depth and duration of recovery from peak AUM.
  - **VaR (Value at Risk)**: Parametric 95% and 99% 1-day Value at Risk in ₹ amounts.
  - **Sharpe & Sortino Ratios**: Risk-adjusted performance against the risk-free rate (91-day T-Bill).
- **Concentration Risk Monitor**:
  - Alerts if any single scrip exceeds 10% of portfolio equity or any sector exceeds 25%.

---

### Screen 4: Report Studio & Executive Briefings
- **Visual Goal**: Ultra-professional, printable and exportable wealth summaries.
- **Key Features**:
  - Dynamic Owner & PAN selection (fully un-hardcoded, dynamically populated from database).
  - Configurable report sections: Executive Summary, Capital Gains, Tax Harvesting Opportunities, Dividend Cashflow, Asset Allocation, and Performance vs Benchmark.
  - One-click exports to vector-grade PDF and comprehensive Excel (`.xlsx`) workbooks.

---

### Screen 5: Activity & Ledger (Tradebook)
- **Visual Goal**: Flawless record of every acquisition, sale, corporate adjustment, and fee deduction.
- **Sub-Tabs**:
  1. **Tradebook Transactions Ledger**
  2. **Tax & Realized Gains** (Opens the full Tax Center)
  3. **Corporate Events & Dividends** (Opens the Corporate Actions Engine)
- **Transaction Table**:
  - Date (YYYY-MM-DD), Exchange, Scrip Symbol, Trade Type (`BUY`, `SELL`, `DIVIDEND`, `RIGHTS`), Quantity, Unit Price, Brokerage/STT, Net Total, Linked Portfolio.

---

### Screen 6: Tax Center & Capital Gains Engine (TX-1 to TX-7)
The Tax Center is the crown jewel of the platform's compliance intelligence. It contains 6 dedicated views accessible via a sub-navigation bar:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           TAX CENTER SUB-NAVIGATION BAR                                 │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ [📊 Realized Gains]  [🌾 Tax Loss Harvesting]  [📅 Advance Tax]  [⏳ 8-Yr CFL]         │
│ [💰 Dividend Schedule OS]  [⏱️ 31-Day GAAR Repurchase Tracker]                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 6.1 Sub-View 1: Realized Gains & Tax Slabs
- **Date-Aware Statutory Banner (TX-3)**: Permanent alert explaining the July 23, 2024 Finance Act cutover (15% vs 20% STCG; 10% vs 12.5% LTCG with ₹1.25L exemption).
- **Section 112A Grandfathering Visualizer (TX-2)**:
  - Step-by-step formula card:
    $$\text{Adjusted Cost} = \max(\text{Actual Buy Price}, \min(\text{FMV as on 31-Jan-2018}, \text{Sale Price}))$$
  - Table badges explicitly highlighting grandfathered pre-2018 acquisitions.
- **Four KPI Cards**:
  1. Net Estimated Tax Payable (Green if ₹0, Amber if liability exists).
  2. Realized STCG Gains & Tax.
  3. Realized LTCG Gains & Tax.
  4. Carried Forward Losses Absorbed vs Remaining.

#### 6.2 Sub-View 2: Tax Loss Harvesting Engine (TX-1)
- **Statutory Priority Waterfall**:
  - STCL offset priority: First against STCG (20%), then against LTCG (12.5%).
  - LTCL offset rule: Strictly against LTCG (12.5%).
  - Shared gain pool without double counting.
- **Harvesting Table**:
  - Scrip Symbol / Portfolio / PAN.
  - Current Price vs Average Acquisition Price.
  - Unrealized Loss (₹).
  - Offsettable Loss (capped by the active gain pool).
  - Estimated Tax Saved (₹).
  - 31-Day Repurchase Eligible Date (YYYY-MM-DD).
  - Action Button: `Record Harvest` (calls `/api/tax/harvest-action`).
- **31-Day GAAR Buffer Banner**:
  - Non-dismissable notice stating that 31 days is a precautionary buffer to mitigate General Anti-Avoidance Rules scrutiny, not a statutory Indian tax rule.

#### 6.3 Sub-View 3: Advance Tax Schedule (TX-4)
- **Four Statutory Installment Cards**:
  - **Q1 (June 15)**: 15% cumulative liability.
  - **Q2 (September 15)**: 45% cumulative liability.
  - **Q3 (December 15)**: 75% cumulative liability.
  - **Q4 (March 15)**: 100% cumulative liability.
- **Section 234C Interest Risk Note**:
  - For each past due installment with a shortfall, displays: *"Shortfall in this installment attracts simple interest @ 1% per month for 3 months under Section 234C."*

#### 6.4 Sub-View 4: 8-Year CFL Waterfall (TX-5)
- **Statutory Loss Tracking Table**:
  - Origin FY and Assessment Year.
  - Loss Type (`STCL`, `LTCL`, `BUSINESS_LOSS`).
  - Original Loss Amount vs Remaining Unabsorbed.
  - Expiry Assessment Year (Origin AY + 8 years).
  - Years Remaining to Expire.
  - **Urgent Expiry Alert Badge**: Red pulse badge if $\le 1$ year remains, prioritizing this lot for immediate capital gain offset.
  - Estimated Tax Benefit if utilized.

#### 6.5 Sub-View 5: Dividend Income & Section 194 TDS (TX-6)
- **ITR Schedule OS Reporting**:
  - Gross Dividend Received across the FY.
  - 10% TDS Withheld at source under Section 194.
  - Net Cash Credited to Bank Account.
  - Scrip-wise dividend breakdown table with payout event counts.

#### 6.6 Sub-View 6: 31-Day GAAR Repurchase Reminders (TX-7)
- **Holding Buffer Calendar**:
  - Active harvested positions list with countdown to the 31st calendar day.
  - **Intervening Corporate Action Detector**: If a stock split or bonus issue was declared between the harvest sale date and today, an amber/red warning flags: `INTERVENING_CA_ALERT: <Details>` to prevent cost basis distortion upon repurchase.

---

### Screen 7: Corporate Actions Engine (CA-1 to CA-6)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        CORPORATE ACTIONS SUB-NAVIGATION BAR                             │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ [📑 Scheduled Ledger]  [📅 Upcoming Calendar CA-1]  [💰 Dividend & TDS CA-2]           │
│ [📈 Yield On Cost CA-5]  [🔄 Legacy Reconcile]  [📋 PMS Vendor Match]                  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 7.1 Sub-View 1: Upcoming Ex-Date Calendar (CA-1)
- **Trading Day Calendar**: Uses the NSE trading calendar (excluding Saturday/Sunday and statutory Indian market holidays).
- **Urgent Ex-Date Badges**: If the ex-date is within $\le 5$ trading days, a flashing red/amber badge alerts the user: `CRITICAL: Ex-Date within X trading days!`.
- Displays: Scrip, Action Type (`DIVIDEND`, `SPLIT`, `BONUS`, `RIGHTS`), Record Date, Ex-Date, Eligible Quantity Held in Portfolio, and Projected Value Impact.

#### 7.2 Sub-View 2: Dividend Rollup & TDS (CA-2)
- Consolidated gross dividends, Section 194 TDS, and net credited cash broken down by Scrip, PAN, Portfolio, and FY.

#### 7.3 Sub-View 3: Yield on Cost Ranking (CA-5)
- Ranked table of all equity holdings sorted by **Yield on Cost (YOC%)**.
- Highlights how historical splits and bonus issuances increase share count while preserving cost basis, driving double-digit YOC returns on long-term compounders.

#### 7.4 Modal 1: Cost-Basis Verification Report (CA-3)
- When applying a split or bonus, the engine executes a strict runtime invariant assertion:
  $$\Delta(\text{Total Cost}) = |\text{Post Cost} - \text{Pre Cost}| = 0.00$$
- If verified, renders an institutional green shield modal displaying:
  - Scrip Symbol, Action Type, Ratio.
  - Pre-action shares vs Post-action shares.
  - Pre-action cost basis vs Post-action cost basis: `₹0.00 drift`.
  - New adjusted average acquisition price per share.
  - Immutable SHA-256 audit ledger stamp.

#### 7.5 Modal 2: Rights Issue Subscription Dialog (CA-4)
- Form to process rights issues:
  - Inputs: Rights Ratio, Issue Price, Shares Subscribed, Shares Renounced, Renunciation Proceeds.
  - Real-time calculator showing total subscription cash required and capital gains tax impact on renunciation.
  - Adjusts holding quantity and calculates blended weighted average cost of acquisition.

---

### Screen 8: NRI Wealth & Repatriation Hub
- **Visual Goal**: Foreign exchange tax reporting and FEMA compliance for Non-Resident Indians.
- **Key Modules**:
  - **NRE vs NRO Classification**: Visually bifurcated capital accounts.
  - **Form 15CA / 15CB Remittance Workflow**: Tracking the $1,000,000 annual repatriation limit under the LRS/FEMA portfolio scheme.
  - **Dual-Currency XIRR Engine**: Side-by-side performance in INR vs Home Currency (USD/AED) factoring in FX drag.
  - **TDS Reconciliation & Section 195 Refunds**: Tracking higher 20%-30% NRI TDS withheld vs actual lower treaty (DTAA) tax liability.

---

### Screen 9: Opportunity Engine & Unified Conviction (Phase 7)
- **Visual Goal**: Quantitative, disciplined portfolio rebalancing without human emotional bias.
- **Key Capabilities**:
  - **Unified Conviction Score (0–100)**: Synthesizes technical breakouts, valuation percentiles, delivery volume spikes, institutional bulk deals, and news sentiment.
  - **Hard Drawdown Circuit Breaker**: If portfolio drawdown exceeds 25%, the engine automatically locks the maximum Kelly sizing to `0.0%`, displaying a red warning banner.
  - **Bayesian Wilson Score Calibration**: If historical signal count $N < 15$, sizing recommendations are gated and labeled `INFORMATIONAL ONLY`.

---

### Screen 10: Reconciliation & Multi-Broker Audit
- **Visual Goal**: Zero-error reconciliation between internal tradebooks and external custodian statements.
- **Capabilities**:
  - Waterfall change bridge comparing internal transactions against broker contract notes (Zerodha, IIFL, HDFC Sky, DBFS).
  - Automated duplicate transaction detector and scrip alias normalizer.

---

### Screen 11: Ingestion & Import Hub
- **Visual Goal**: Frictionless drag-and-drop ingestion of real-world statements.
- **Supported Formats**:
  - CAMS & KFintech Consolidated Account Statements (CAS PDF/Excel).
  - Zerodha Kite API live sync & Console Tradebook Excel.
  - PMS Vendor Valuation Statements & Bank CSVs.

---

### Screen 12: Settings, Audit Ledger & Master Hierarchy
- **Visual Goal**: Enterprise governance, multi-tenant database safety, and full traceability.
- **Components**:
  - Family Hierarchy Editor (Defining legal owners, PAN numbers, and demat linkages).
  - **Immutable Audit Ledger Viewer (INFRA-6)**: View append-only ledger entries for all transactions, mutations, and reconciliations.
  - **Data Feed Staleness Monitor (INFRA-3)**: Visual status board showing latency and freshness for Upstox, Yahoo Finance, AMFI, and NSE feeds.

---

## 7. Interactive Components & Micro-Interactions

### 7.1 ResizableDataTable Component
- **Header Resizing**: Draggable splitter handles on each column header with a visual hover line (`w-1 bg-emerald-500`).
- **Sorting State**:
  - Unsorted: Neutral double chevron (`opacity-30`).
  - ASC: Vibrant emerald up arrow (`text-emerald-400`).
  - DESC: Vibrant emerald down arrow (`text-emerald-400`).
- **Pinned Columns**:
  - Left-pinned columns carry a subtle right-border gradient shadow to indicate horizontal scrollability.
  - Right-pinned columns carry a matching left-border gradient shadow.

### 7.2 Micro-Animations & State Transitions
- **Tab Switching**: Smooth layout transitions powered by `motion/react` (duration 200ms, ease-out).
- **Modal Entry**: `initial={{ scale: 0.95, opacity: 0 }}` $\to$ `animate={{ scale: 1, opacity: 1 }}` (duration 180ms).
- **Urgent Ex-Date Alerts**: Subtle rhythmic pulse (`animate-pulse`) on badges with $\le 5$ trading days.
- **Button Click Feedback**: Instant scale-down (`active:scale-95`) with smooth recovery.

---

## 8. Accessibility, Contrast & Responsive Design

1. **WCAG AAA Compliance**:
   - Primary white text (`#F8FAFC`) on midnight background (`#020617`) achieves a contrast ratio of **18.2:1** (exceeding the 7:1 AAA requirement).
   - Emerald profit text (`#10B981`) achieves **8.1:1** on dark surfaces.
   - Amber TDS text (`#F59E0B`) achieves **7.4:1** on dark surfaces.
2. **Keyboard Navigation**:
   - All modal dialogs trap focus and close on `Escape`.
   - Table rows and action buttons possess visible focus rings: `focus:ring-2 focus:ring-emerald-500/50`.
3. **Responsive Breakpoints**:
   - **Desktop (1440px+)**: Full widescreen 4-column KPI grids, visible pinned table columns, persistent left navigation sidebar.
   - **Laptop (1024px–1439px)**: 3-column KPI grids, horizontal table scrolling with pinned key columns.
   - **Tablet & Mobile (< 1024px)**: Collapsible hamburger menu, single-column KPI metric stacks, touch-friendly scrollable table containers.

---

## 9. Independent Reviewer's Evaluation Rubric

This specification invites an independent UI/UX designer to evaluate the application against the following 5 criteria:

| Evaluation Dimension | Passing Benchmark | Inspection Target |
| :--- | :--- | :--- |
| **1. Visual Hierarchy & Scannability** | 9/10+ | Can an executive discern consolidated AUM, Day P&L, and immediate tax liability within 3 seconds? |
| **2. Financial Precision & Numerals** | 10/10 | Are all numbers rendered in tabular fixed-width fonts with clean decimal alignment and sign indicators? |
| **3. Regulatory & Statutory Transparency** | 10/10 | Are statutory disclaimers (Budget 2024 cutover, GAAR 31-day buffer, Sec 234C interest) seamlessly embedded? |
| **4. Surface Cohesion & Dark Elegance** | 9/10+ | Is the glassmorphic midnight theme consistent across all 12 modules without jarring borders or clashing colors? |
| **5. Information Density vs Simplicity** | 9/10+ | Does the ResizableDataTable allow examining 50+ holdings effortlessly without horizontal fatigue? |

---
*End of Design Specification. Generated for independent architectural review.*
