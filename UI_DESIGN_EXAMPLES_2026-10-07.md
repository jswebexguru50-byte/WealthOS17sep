# WealthOS — Design Examples (companion to UI_UX_REVIEW_2026-10-07.md)

A clickable mockup of the Home screen using these values is in `UI_MOCKUP_HOME_2026-10-07.html` (open in any browser; light/dark toggle top right).

Colour values are suggestions with roughly AA contrast on their stated background; verify with a contrast tool before shipping.

## 1. Colour palettes (pick one direction)

### Option 1 — "Ledger Blue" (recommended; evolves today's navy, calm and trustworthy)
| Role | Light | Dark |
|---|---|---|
| App canvas | `#F6F8FB` | `#0B1220` |
| Card | `#FFFFFF` | `#111A2C` |
| Card border | `#E3E8F0` | `#1F2B42` |
| Text primary / secondary / muted | `#0F172A` / `#475569` / `#64748B` | `#E6EBF5` / `#A9B6CE` / `#7D8AA5` |
| Brand (actions, active nav) | `#2457D6` | `#5B8CFF` |
| Brand tint (selected row, chips) | `#E8EFFF` | `#16284F` |
| Gain | `#0E8F5B` on `#E3F6EC` | `#34D399` on `#0F2B22` |
| Loss | `#C73535` on `#FCE9E9` | `#F87171` on `#33161A` |
| Attention | `#B45309` on `#FEF3DC` | `#FBBF24` on `#33270F` |
| Info | `#0E7490` on `#E0F4F8` | `#22D3EE` on `#0E2A33` |

### Option 2 — "Sandstone & Teal" (warmer, private-bank feel)
Canvas `#FAF8F5`, card `#FFFFFF`, ink `#1C1917`, brand teal `#0F766E`, accent gold `#B8860B` (decorative only, e.g. premium badges), gain `#15803D`, loss `#B91C1C`, attention `#C2410C`.

### Option 3 — "Graphite Pro" (dark-first, terminal-adjacent, for the trading side)
Canvas `#0E1116`, panel `#161B22`, border `#262D36`, ink `#E6EDF3`, brand `#58A6FF`, gain `#3FB950`, loss `#F85149`, attention `#D29922`.

### Asset-class colours (muted; identical in tiles, tables and charts)
Equity `#3B6FE0` · Mutual funds `#7C5CD6` · AIF `#C2569A` · Bank/FD `#2A9D8F` · PMS/SIF `#E08E3B` · Global `#4B9CD3` · Cash `#94A3B8`.

### Chart sequence (same order everywhere)
`#2457D6 → #0E8F5B → #E08E3B → #7C5CD6 → #0E7490 → #C2569A`; benchmark always a dashed grey `#94A3B8` line.

### Score / conviction heat scale (Opportunity Engine)
Single-hue blue ramp for score magnitude (`#E8EFFF` → `#1E3FA0`). Use red/green only for good/bad outcomes, never for magnitude.

### Starter tokens
```css
:root {
  --canvas:#F6F8FB; --card:#fff; --line:#E3E8F0;
  --ink:#0F172A; --ink-2:#475569; --ink-3:#64748B;
  --brand:#2457D6; --brand-tint:#E8EFFF;
  --gain:#0E8F5B; --gain-bg:#E3F6EC;
  --loss:#C73535; --loss-bg:#FCE9E9;
  --warn:#B45309; --warn-bg:#FEF3DC;
  --radius:14px; --radius-sm:10px;
  --shadow-pop:0 12px 32px rgba(15,23,42,.14);
}
:root[data-theme="dark"] {
  --canvas:#0B1220; --card:#111A2C; --line:#1F2B42;
  --ink:#E6EBF5; --ink-2:#A9B6CE; --ink-3:#7D8AA5;
  --brand:#5B8CFF; --brand-tint:#16284F;
  --gain:#34D399; --gain-bg:#0F2B22;
  --loss:#F87171; --loss-bg:#33161A;
  --warn:#FBBF24; --warn-bg:#33270F;
  --shadow-pop:0 12px 32px rgba(0,0,0,.5);
}
```

## 2. Typography and numbers
- **Font:** Inter only; enable tabular numbers (`font-variant-numeric: tabular-nums`) on every figure.
- **Scale:** Display 32/40 semibold (net worth) · H1 24/32 · H2 18/28 · Body 14/22 · Small 12/18 · Eyebrow 11/16 uppercase, +0.06em (only above tiles).
- **Indian formatting:** `₹4.82 Cr` in tiles, `₹48,25,000` in tables; negatives as `–₹1.2 L` in the loss colour **and** with ▼.
- **Avoid:** monospace for labels, ALL-CAPS for sentences, text under 12px.

## 3. Component styles (before → after)

| Component | Today (inferred) | Proposed |
|---|---|---|
| Header buttons | Dark slate pills, each a different hue | Ghost buttons: transparent, 1px border, icon + label, hover brand tint; one filled primary per screen |
| KPI tile | Dense card, mono labels | 16px padding, eyebrow label, 28px value, delta chip, 40px sparkline |
| Status | Coloured text | Pill: dot + label (● Reconciled / ● Stale 2d / ● Break) on tinted background |
| Sub-tabs | Many long tabs with captions | Underline tabs, max 6, rest under "More ▾"; captions become tooltips |
| Tables | Heavy rows, small mono text | 44px rows, hairlines, sticky header, right-aligned tabular numbers, sparkline column, row click opens right drawer |
| Cards | Mixed radii/borders | 14px radius, 1px border, no shadow (shadow only on popovers/drawers) |
| Charts | Per-view palettes | One sequence, light gridlines, shared tooltip, dashed benchmark |
| Empty state | Blank/spinner | Icon + one line + primary action ("No FDs yet — Import statement") |
| Loading | Spinner | Skeletons shaped like the final tiles |
| Toasts | Mixed | Bottom-right, 4s, icon + message + Undo where possible |

## 4. Layout wireframes

### Home (desktop 1440px)
```
┌ Sidebar ┬──────────────────────────────────────────────────────────────┐
│ Home    │ [Search Ctrl+K]   Family ▾  Portfolio ▾  ₹/$ ▾  ● Data 2m ago 🔔3 │
│ Portf.  ├──────────────────────────────────────────────────────────────┤
│ Ideas   │ Good morning                                                 │
│ Tax&NRI │ ┌ Net worth ┐┌ Today ─────┐┌ Total gain ┐┌ Cash & FDs ┐       │
│ Data    │ │ ₹48.2 Cr  ││ +₹3.1 L ▲  ││ +₹14 Cr ▲  ││ ₹6.4 Cr    │       │
│         │ └───────────┘└────────────┘└────────────┘└────────────┘       │
│         │ ┌ Needs attention (3) ───────────────────────────────────┐   │
│         │ │ ● 4 stale prices  ● 1 recon break  ● FY harvest ₹2.1 L │   │
│         │ └─────────────────────────────────────────────────────────┘   │
│         │ ┌ Allocation ┐┌ Performance vs Nifty ───────────────────┐    │
│         │ ┌ Top movers ┐┌ Upcoming (dividends, CAs, tax) ┐┌ Ideas ┐     │
└─────────┴──────────────────────────────────────────────────────────────┘
```
### Portfolio
Scope header + asset-class chips (All · Equity · MF · AIF · FD · PMS · Global) → KPI strip → tabs **Holdings | Performance | Risk | Income | Transactions** → table; row click opens a right drawer (chart, lots, tax, news, "Open full research").

### Stock Research (drawer or page)
Sticky header: ticker · price · day change · Add to watchlist. Four verdict chips (Quality · Momentum · Valuation · Smart money) each with a dot and one-line reason. Tabs: **Summary | Technicals | Fundamentals | Ownership | Your position | Evidence**. "Your position" links research to holdings.

### Mobile (390px)
Bottom bar: Home · Portfolio · Ideas · Tax · More. Home = 2×2 KPI grid → attention list → stacked allocation bar → movers. Tables become cards showing the 3 key fields.

## 5. Flow examples
1. **Daily check (about 60s):** Home → net worth and day change → "Needs attention" → "4 stale prices" → one-click Refresh → toast → back on Home.
2. **Find and act on an idea:** Ideas → preset ("High conviction, quality") → filter chips → row → Stock Research drawer → Add to watchlist / See in my portfolio → back returns to the same filtered list.
3. **Import and reconcile:** Data → wizard: ① choose source (Zerodha, CAMS, PMS, CSV cards) → ② drop file, auto-detect → ③ preview with row warnings → ④ confirm → ⑤ result: ✓ matched / ⚠ breaks each with "Fix"; Undo batch available.
4. **Year-end NRI tax:** Tax & NRI stepper **Gains → Deductions → Repatriation limits → Schedule 112A / Form 15CA-CB** with a pinned "tax payable" card and Download pack at the end.
5. **Explain a number:** every KPI has an ⓘ popover with formula, source and as-of time ("XIRR 14.2% — cash-flow weighted, 312 flows, as of 07-Oct 15:30") and a "See transactions" link.

## 6. Contemporary touches (low effort, high effect)
- 14px-radius cards, 24px gutters, 8px spacing grid.
- 150ms transitions (opacity + 4px translate); honour `prefers-reduced-motion`.
- Sparklines in KPI tiles and table rows; stacked-bar allocation strips.
- Segmented controls for range (1D · 1M · 6M · 1Y · All) and ₹/$.
- Command palette (Ctrl+K) with recent items and actions.
- Friendly greeting plus "as of" timestamp; fewer ALL-CAPS labels.
- Density switch (Comfortable / Compact) replacing 11 layouts.
- Print/PDF-ready light theme for family statements.
