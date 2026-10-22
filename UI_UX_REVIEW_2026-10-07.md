# WealthOS — Independent UI/UX Review (2026-10-07)

**Method:** static review of `src/App.tsx`, `src/index.css`, `src/theme.ts`, the workspace/hub components, and the existing UI docs (`UI_INFORMATION_ARCHITECTURE.md`, `UI_DUPLICATION_CATALOG.json`, `ui_ux_design_specification_v5_light.md`). **The app was not run** (Node is not on PATH in this session), so there are no screenshots. Findings about visual rendering are inferred from code and should be confirmed on a live build.

**Companions:** concrete palettes, type, component styles, wireframes and flows are in `UI_DESIGN_EXAMPLES_2026-10-07.md`; a clickable Home mockup (light/dark) is in `UI_MOCKUP_HOME_2026-10-07.html`.

---

## 1. Headline assessment

The underlying design intent is good: a six-step flow (Overview → Discover → Analyze → Portfolio → Research → Audit), a documented token system, and an AAA-contrast "Institutional Light" palette. The problem is that the implementation has drifted from that intent. The result is a UI that is **dense, inconsistent and hard to follow for a non-expert**, even though the plumbing is strong.

| Area | Grade | One-line reason |
|---|---|---|
| Information architecture (top level) | B | 6 numbered steps is clear; names mix jargon and the order doesn't match daily use |
| Information architecture (depth) | D | 7 + 5 + 6 sub-tabs, plus modals, plus 92 components with known duplicates |
| Visual consistency | D | Dark-theme classes hard-coded inside a light design system |
| Colour coding | C | Good semantic tokens exist, but are bypassed and over-diversified |
| Typography / density | D | ~2,800 uses of 8–11px text, ~1,090 `uppercase`, ~2,590 `font-mono` |
| Workflow clarity | C | Strong "Discover → Analyze" handoff; weak "what should I do today" |
| Mobile | C | Bespoke mobile top-bar exists; the content views are desktop-density |

## 2. Evidence (what the code shows)

1. **Light theme with dark-theme widgets.** The default is `institutional-light`, but the top action bar (`App.tsx` ~1660–1700) uses `bg-slate-900/90`, `border-slate-700/80`, `text-white`, `text-cyan-400`, `bg-purple-950/40`. On a white canvas these render as black/purple blobs and each button has a different hue (amber, purple, blue, amber, cyan, emerald, slate). Across `src/components` there are **~17,500 hard-coded Tailwind palette classes** versus ~1,190 inline `var()` styles, so the token system is the minority.
2. **Page title bug.** `App.tsx:1630` re-renders `'6. Audit, Provenance & Settings'` when `activeTab === 'PORTFOLIO'` (the condition lists `'AUDIT'` three times, then `'PORTFOLIO'`). On the Portfolio tab the heading shows both "4. Portfolio Risk & Ledger" and "6. Audit, Provenance & Settings". Delete that line.
3. **Navigation is defined four times** (mobile drawer, desktop sidebar, a third list near line 1917, and the title map) with slightly different copy. Any rename needs four edits and they already disagree ("Overview" vs "Overview & System Status").
4. **17 colour themes + 11 "widescreen layouts"** are selectable from the header. This is a lot of surface for a product whose users are family-office principals, not designers; every extra theme multiplies the QA matrix and increases the chance of unreadable combinations (several are neon/"cyber-matrix"/"tokyo-neon").
5. **Gold token is actually blue.** `--accent-gold: #0B3D91` (navy). The names say gold, the value is blue, and the sidebar active state is a 16% navy tint on a dark slate sidebar (low contrast). This will confuse every future contributor.
6. **Sub-navigation is a second, unrelated nav system.** Discover (7 sub-tabs), Research (5), Audit (6) each carry their own sub-tab bar, with names such as "StockScans Parity", "7 Strategies (90D)", "S1–S26 scanner", "FERE Deep Dive", "ITAS S1–S10". These are internal engineering/project names, not user concepts.
7. **Known duplication** (from the repo's own catalog): four stock-analysis views and three screeners. The Opportunity Engine view alone is 9,617 lines; the next four are 2,000–3,300 lines. Large single-file views almost always mean the page is one very long scroll of tiles.
8. **Utility controls crowd the header.** Alerts, Risk & VaR, Snapshot, Reports, Layout, Theme, Preferences plus family-member and portfolio selectors, plus a "LIVE" pill and a monospace "WORKSPACE:" line — 9+ controls in two rows before any content.

## 3. Recommendations

### 3.1 Look and feel — "one calm light theme, one accent"
- **Make light the only default and ship two themes: Light and Dark.** Keep the others behind an "Advanced → Appearance" setting or remove them. Drop neon themes entirely.
- **Rename and re-value the tokens** so the names tell the truth: `--accent-gold` → `--brand` (navy `#0B3D91`). Reserve a real gold/amber only for "warning".
- **Fix the sidebar**: either a light sidebar (white, hairline border, navy active pill) to match the canvas, or a clearly dark one with a *solid* active state (`#1E3A8A`, white text). Avoid a translucent navy on dark slate.
- **Type scale:** set a 5-step scale (12 / 13 / 14 / 16 / 24 / 32) and ban sub-12px text for anything the user must read. Use `uppercase tracking-widest` only for tiny section eyebrows, not titles, buttons or table cells. Use `font-mono` (tabular figures) **only for numbers in tables**, not for labels and breadcrumbs.
- **Use Inter for everything** and Space Grotesk, if at all, for the page title only. Four web fonts are loaded today (Inter, Space Grotesk, JetBrains Mono, Outfit, Plus Jakarta — five); that is a performance and consistency cost.
- **Elevation:** cards = white, 1px `#E2E6EC` border, 12px radius, no shadow; modals = shadow. Remove the `animate-ping`/`animate-pulse` indicators (they pull attention constantly); keep one subtle dot for "live data".

### 3.2 Colour coding — fewer meanings, used consistently
Adopt a strict semantic palette and use nothing else for status:

| Meaning | Colour | Where |
|---|---|---|
| Gain / positive / healthy | Emerald `#0A6640` on `#E4F6EC` | P&L, XIRR, reconciled |
| Loss / negative / breach | Crimson `#9B1C1C` on `#FBEAE9` | P&L, drawdown, failed |
| Needs attention | Amber `#92400E` on `#FBF0DA` | Stale data, pending recon, alerts |
| Information / selected | Navy/cobalt | Links, active tab, focus |
| Neutral / inactive | Slate greys | Everything else |

Rules: (a) **never colour a nav item or a button by "section"** (today cyan, amber, emerald, purple, blue are all used for buttons) — colour is for *status*, not decoration; (b) **never rely on colour alone** — pair ▲/▼ and +/– with red/green (colour-blind safe and print-safe); (c) one chart palette of ~6 hues, reused in the same order everywhere; (d) asset classes (EQ, MF, AIF, BNK, PMS, Global) get fixed, muted category colours that appear identically in tiles, tables and charts.

### 3.3 Information architecture and workflow
**Simplify the top level to what a family-office user does**, not how the engine is built:

| Today | Proposed | Notes |
|---|---|---|
| 1. Overview | **Home** | Net worth, today's change, what needs attention |
| 4. Portfolio | **Portfolio** (move to #2) | Most-used screen should be second, not fourth |
| 2. Discover + 5. Research | **Ideas** | Screeners, opportunity engine, strategies, backtests |
| 3. Analyze | **Stock Research** | Opened from anywhere (search / click a ticker), not a tab you must visit first |
| (inside Audit) Tax & Repatriation | **Tax & NRI** | NRI tax is the product's differentiator — promote it |
| 6. Audit & System | **Data & Settings** | Imports, reconciliation, mappings, provenance, preferences |

- **Drop the numbering** ("1.", "2." …). The numbers imply a forced sequence, but Analyze is really a drill-down and Audit is a utility.
- **Global search (⌘K / Ctrl+K)** for tickers, portfolios, reports and settings. This removes most of the need to know where things live.
- **Persistent context bar** (one row): Family member · Portfolio scope · As-of date/currency (INR/USD) · data freshness chip. Everything else moves into a "⋯" or a profile menu.
- **Group the utilities**: Alerts (bell with count) stays visible; Risk & VaR, Snapshot, Reports become tabs/sections *inside* Portfolio or Home, not global modals; Theme/Layout/Preferences collapse into one "Appearance & Preferences" entry.
- **Rename sub-tabs in plain language** and move project codenames into tooltips:
  - "StockScans Parity" → *Market scans*; "7 Strategies (90D)" → *Strategy picks*; "Opportunity Engine / ITAS S1–S10" → *Scored opportunities*; "Smart Money Sentinel" → *Institutional activity*; "Greenfield Portal" → *Early-stage themes*; "Quant Studio S1–S26" → *Strategy lab*; "Provenance Logs" → *Data audit trail*.
- **Merge the duplicates** already identified (4 stock views → one; 3 screeners → one with filters), and make **a ticker click open the same Stock Research panel everywhere**.
- **Next-best-action strip on Home**: "3 holdings have stale prices · 1 reconciliation break · FY tax harvest available ₹X". This answers "what do I do now?" — the biggest gap for ease of use.

### 3.4 Tile organisation (Home and Portfolio)
Use a consistent 3-row structure, top to bottom, most important first:

1. **Hero row (4 KPI tiles, equal size):** Net Worth · Day change · Total gain (₹ and %, XIRR) · Cash & FDs. Big number (24–32px), small label, delta chip with ▲/▼.
2. **Insight row (2 wide tiles):** Allocation (donut by asset class, with legend list) and Performance vs benchmark (line chart with 1M/3M/1Y/All toggle).
3. **Action row:** Needs attention (alerts/recon/stale data), Top movers, Upcoming (corporate actions, tax dates).
4. **Detail:** holdings table with sticky header, asset-class filter chips (already exist — keep), column chooser, and row-click → drawer.

Rules: one tile = one question; max ~8 tiles above the fold; progressive disclosure ("View all →") instead of long scrolls; right-hand **drawer** for drill-down rather than stacked modals (the app has ~68 modal references in `App.tsx`; limit to one overlay at a time and prefer side drawers for detail).

### 3.5 Tables and numbers
- Right-align and use tabular figures for all numbers; left-align text; sticky header; zebra off, hairline rows on.
- Show lakh/crore or million consistently according to the preference, with the unit in the column header, not on every cell.
- Default to 6–8 columns with a "More columns" chooser; the user's most-used columns remembered per table.
- Virtualise long tables (CLAUDE.md already notes lag above ~10K rows).

### 3.6 Accessibility, mobile, states
- Minimum 12px text, 44px touch targets on mobile, visible focus ring (already tokenised: `--border-focus`).
- Provide **loading skeletons, empty states with a next step, and plain-English errors** per view (a shared `<EmptyState>` / `<ErrorState>`), instead of spinners and raw messages.
- On mobile, show Home and Portfolio in single-column, KPI tiles in a 2×2 grid, bottom tab bar for the top 5 destinations.
- Add one "Guided tour / what's new" overlay for first run, and an inline "?" explaining jargon (XIRR, FIFO, grandfathered cost, 112A, DTAA).

## 4. Prioritised roadmap

**Quick wins (1–2 days)**
1. Fix the duplicated Portfolio/Audit heading (`App.tsx:1630`).
2. Replace hard-coded `bg-slate-900/90 … text-white` on the header toolbar with token-based ghost buttons; remove per-button colours.
3. Single `NAV_ITEMS` constant used by mobile, desktop and title; remove the numbering.
4. Rename tokens `--accent-gold*`; fix sidebar active state contrast.
5. Remove `animate-ping`, drop 3+ of the 5 loaded fonts.

**Short term (1–2 weeks)**
6. Header redesign (context bar + Alerts + overflow menu); move Risk/Snapshot/Reports into Portfolio.
7. Ship Light + Dark only; archive the rest behind a flag.
8. Home page re-layout per §3.4 with a "needs attention" strip; global search.
9. Rename sub-tabs; add tooltips for codenames.

**Medium term (1–2 months)**
10. Merge duplicate stock-analysis and screener views; single Stock Research drawer.
11. Create shared primitives (`KpiTile`, `DeltaChip`, `DataTable`, `EmptyState`, `Drawer`) and migrate the five largest views onto them (Opportunity Engine, Opportunities/Rebalancing, Institutional Analytics, Dashboard, Greenfield). Split the 9.6K-line Opportunity Engine view by tab.
12. Lint rule banning raw palette classes (`bg-slate-*`, `text-cyan-*`, …) in favour of tokens, so the system can't drift again.

## 5. Caveats
- Based on static code only; actual rendering, spacing and data-dependent states are unverified.
- The grep counts are indicative (they include dark-theme variants intentionally styled), but the direction is unambiguous.
- Several statements about user behaviour ("most-used screen") are assumptions; validate with 3–5 sessions with real users before committing to the re-ordering in §3.3.
