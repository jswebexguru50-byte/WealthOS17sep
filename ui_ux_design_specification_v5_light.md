# NRI WealthOS — UI/UX Design & Architecture Specification v5.0
## "Institutional Light" — Light-Surface, High-Contrast Redesign
**Supersedes:** `ui_ux_design_specification.md` v4.2.0-PROD (dark/glassmorphic) for all visual-language decisions. Screen inventory, navigation structure, data-table behavior, and functional requirements from v4.2 are **retained** — this document replaces Sections 2–4 and 7–8 (color, typography, elevation, components, accessibility) and re-annotates every screen with the new visual treatment.
**Design System Maturity:** Tier-1 Institutional FinTech / Private Banking Operating System
**Aesthetic Metaphor:** "Addepar meets a private bank's digital front door" — light, quiet, high-contrast, zero visual noise. Confidence communicated through restraint and precision, not through a dark "trading terminal" costume.
**Target Reviewer:** Independent Senior UI/UX Designer, Product Architect, Front-End System Engineer.

---

## 0. Critical Review of v4.2 — What Changes and Why

A straight, unflattering read of the previous spec before proposing the replacement:

1. **The dark/glassmorphic direction optimizes for the wrong brand.** "Bloomberg Terminal meets Linear & Stripe" reads as a trading floor tool built for a professional staring at six monitors all day. This platform's actual user is a family principal or an NRI reviewing consolidated wealth for 20 minutes a week, often on a laptop in daylight, sometimes handing the screen to a relative or a CA. Dark, glowing, terminal-styled UI signals "software for specialists," which works against the "commercial deployment, world-class, professional" goal — it reads more hobbyist-quant than private-bank.
2. **Glassmorphism is a solved problem with a real cost, not a free aesthetic upgrade.** `backdrop-filter: blur()` layered under moving numbers (live P&L, ticking LTPs) is a known source of repaint jank on mid-range laptops and a genuine accessibility risk — blurred, semi-transparent text behind content is exactly what WCAG's "distinguishable content" guidance warns against. It also dates fast; a light, flat, shadow-based elevation system ages better and is what most serious 2025-era financial products (Mercury, Ramp, Addepar, most private-banking portals) have converged on.
3. **Fifteen-plus distinct semantic colors is too many to hold in working memory.** The original matrix assigns a bespoke hue to Gross Return, Loss, TDS, Net Cash, NRE, NRO, FX, Bonus, and Split — nine financial-state colors before you even get to LIVE/STALE/circuit-breaker states. A user cannot reliably learn nine hue-to-meaning mappings; in practice they'll fall back to "green good, red bad" and treat the rest as decoration, which defeats the purpose of color-coding. This version consolidates to a **five-color semantic core** (gain, loss, warning/attention, informational-neutral, and one brand accent), with everything else expressed through icon + label + weight, not a new hue.
4. **Dark-mode-only contrast math doesn't transfer.** The original spec's WCAG figures (e.g., "emerald `#10B981` achieves 8.1:1") apply to light-text-on-dark-background specifically; none of it carries over to a light-background system, so it needs to be recomputed from scratch, not just "flipped" (Section 8).
5. **What was right and stays:** the discipline itself. Tabular figures for every number, an 8px spatial grid, permanently visible statutory disclaimers, pinned table columns, and the LIVE/STALE/UNAVAILABLE/circuit-breaker state model are all sound information-architecture decisions independent of dark vs. light — they're carried forward unchanged in spirit, re-skinned for the new palette.

The direction below keeps every functional and statutory requirement from v4.2 and rebuilds the visual language around **light, high-contrast, restrained color, and shadow-based (not blur-based) elevation.**

---

## 1. Design Philosophy: "Precision Clarity"

Four tenets, replacing v4.2 §1.2:

1. **Light by default, calm by design.** A warm-neutral paper-white canvas, not stark pure white and not the previous midnight surface. Long review sessions should feel like reading a well-typeset statement, not staring into a monitor.
2. **Contrast does the work color used to do.** Hierarchy comes first from size, weight, and spacing (per the existing 8px grid and type scale); color is reserved for a small, learnable set of financial-state meanings.
3. **Five colors carry meaning; nothing else fights for attention.** Gain (green), Loss (red), Attention/Warning (amber), Informational accent (navy/blue), and the single brand primary. Corporate-action types, NRE/NRO distinctions, and other categorical (not evaluative) data are shown with icon + text label + neutral gray, never a new hue — a split is not "less true" than a bonus, so they don't need competing colors.
4. **Statutory and data-provenance transparency is structural, not decorative.** Every principle from v4.2 §1.2.4 is retained: Finance Act 2024 cutover banners, Section 112A grandfathering, 234C interest, GAAR 31-day buffers, and now — extended from the Phase 7 addendum — data-source reliability and Conviction Score provenance are permanent, non-collapsible UI citizens, rendered with the same visual seriousness as a bank statement footnote, not a dismissible tooltip.

---

## 2. Color Palette & Token Architecture (Replaces v4.2 §2)

### 2.1 Surface & text tokens

| Token Role | Hex | CSS Variable | Usage |
|---|---|---|---|
| App Canvas | `#F7F8FA` | `--bg-app` | Base page background — warm-neutral off-white, not stark `#FFFFFF` (reduces glare vs. pure white without reading as "dark mode lite") |
| Surface Raised (cards, panels) | `#FFFFFF` | `--bg-card` | Pure white, used only for elevated content sitting on the app canvas — this is what creates depth, not blur |
| Surface Sunken (table stripe, input fields) | `#F1F3F6` | `--bg-sunken` | Alternating table rows, disabled fields, code/ISIN chips |
| Border Subtle | `#E2E6EC` | `--border-sub` | 1px hairline on cards, table dividers |
| Border Strong | `#CBD2DC` | `--border-strong` | Input borders, dividers needing more definition |
| Border Focus/Live | `#0F62FE` | `--border-focus` | Focus rings, active tab underline, "LIVE" state accents |
| Primary Text | `#0B1220` | `--text-pri` | Titles, scrip names, primary figures — near-black ink, not pure `#000` |
| Secondary Text | `#4B5568` | `--text-sec` | Column headers, subtitles, captions |
| Muted / Metadata | `#7D8798` | `--text-mut` | ISIN codes, timestamps, audit tags — lightest text tone, still ≥ AA on white |

### 2.2 The five-color semantic core

| Meaning | Text/Icon Hex | Variable | Tint Background Hex | Variable | Usage |
|---|---|---|---|---|---|
| **Brand Primary** | `#0B3D91` (Sovereign Navy) | `--brand-pri` | `#E9EFFA` | `--brand-tint` | Logo, primary buttons, active nav, section accents — the one color that says "this app," used sparingly |
| **Gain** | `#0F7A4E` (deep, accessible emerald) | `--fin-gain` | `#E4F6EC` | `--fin-gain-bg` | All positive P&L, positive XIRR, gains, "invariant verified" states |
| **Loss** | `#B3261E` (deep carmine-red) | `--fin-loss` | `#FBEAE9` | `--fin-loss-bg` | All negative P&L, realized/unrealized loss, drawdown |
| **Attention / Warning** | `#8A5A00` (deep amber-brown, not raw `#F59E0B`) | `--fin-warn` | `#FBF0DA` | `--fin-warn-bg` | TDS withheld, stale data, GAAR reminders, near-expiry CFL, advance-tax shortfall |
| **Informational Accent** | `#1D5FA8` (mid blue) | `--fin-info` | `#E8F1FB` | `--fin-info-bg` | Net post-tax cash, repatriable (NRE) capital, neutral analytic callouts, links |

**What was removed and why:** the v4.2 matrix's separate hues for NRO (was slate — now just Secondary Text + a "NRO" label chip in neutral gray, since "restricted" is a status, not a financial direction requiring its own color), FX drag (was violet — now shown as a signed number in Gain/Loss color with an "FX" icon prefix, since FX impact is still fundamentally a gain or a loss), and Bonus/Split (was purple/indigo — now both render as a neutral gray "Corporate Action" chip with an icon and text label, e.g. `⊕ Bonus 1:1`, `⊘ Split 1:5`, since the *type* of action is categorical information best read as text, not memorized as a color).

### 2.3 State & status semantics (replaces v4.2 §2.1)

- **LIVE / REAL-TIME:** `--border-focus` (`#0F62FE`) small solid dot + subtle pulse animation, label "Live" in `--text-sec`. Blue rather than green here specifically so it's never confused with the Gain color at a glance.
- **STALE / DECAYING DATA:** `--fin-warn` badge, e.g. `Stale · 4h ago`, outlined pill (not filled) to keep it visually quieter than an active warning.
- **UNAVAILABLE:** `--text-mut` on `--bg-sunken`, dashed border — deliberately the least visually assertive state, since it represents absence, not danger.
- **CIRCUIT BREAKER ACTIVATED:** `--fin-loss` filled pill, bold, with a lock icon — the *only* state that uses a fully filled (not tinted) background, reserved for the single highest-severity condition in the system (drawdown-triggered zero-allocation).
- **INVARIANT VERIFIED (Δ = 0):** `--fin-gain` outlined shield badge with a checkmark.
- **NEAR EXPIRY (≤ 1 year, CFL):** `--fin-warn` filled pill (filled, not outlined, to distinguish real urgency from routine staleness) — reserve fully-filled amber for this and advance-tax shortfalls only.

**Design rule carried forward and tightened:** exactly one element on any given screen may use a *filled* (saturated) semantic background at a time as the "most important thing here" signal (the circuit breaker, or a near-expiry alert). Tinted/outlined badges are the default; filled badges are reserved for the single most urgent fact on screen, so they keep their power to interrupt.

---

## 3. Typography & Tabular Numerals (Replaces v4.2 §3)

The typographic backbone is unchanged in principle — tabular figures remain mandatory — with weights and colors rebalanced for light surfaces, and the display face reconsidered for a private-banking register.

| Role | Typeface Family | Weights | Tabular | Purpose |
|---|---|---|---|---|
| Display | **Fraunces** (serif, restrained) or Space Grotesk as a sans alternative | 600 | No | Hero KPIs (AUM), report cover pages — a light serif for the single largest number on a page reads as considered and editorial rather than "app-y"; use sparingly (1–2 instances per screen max) |
| Interface | Inter / Plus Jakarta Sans | 500, 600 | No | Labels, buttons, nav, body |
| Tabular Data | JetBrains Mono / SF Mono | 500, 600 | Mandatory | All numbers, P&L, quantities, dates |

*Rationale for the serif display option:* on a light, "private bank" surface, an all-sans-heavy-weight hero number (as in v4.2) reads like a SaaS dashboard. A single restrained serif numeral for the headline AUM figure — used nowhere else — is a common private-wealth-brand device (annual reports, statements) and immediately differentiates this from a generic fintech template. It's optional: if the build team prefers an all-sans system for engineering simplicity, Space Grotesk 700 is the fallback and loses none of the functional requirements below.

### 3.1 Strict Tabular Figure Rule (unchanged from v4.2 §3.1)
```css
font-family: 'JetBrains Mono', monospace;
font-variant-numeric: tabular-nums;
letter-spacing: -0.01em;
```
Weight increases slightly (500/600 minimum, not 400) versus the dark-mode version, since mono figures at light weight on a light background lose the crispness that heavier weight against dark surfaces gave them for free.

### 3.2 Type Scale (unchanged sizes from v4.2 §3.2, colors updated)
- **Display 1 (AUM Grand Total):** `text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight`, color `--text-pri`
- **H1 (Screen Title):** `text-2xl sm:text-3xl font-bold tracking-tight`, color `--text-pri`
- **H2 (Section Header):** `text-lg sm:text-xl font-bold`, color `--text-pri`
- **H3 (Card Header):** `text-sm sm:text-base font-bold`, color `--text-pri`
- **Body Regular:** `text-xs sm:text-sm leading-relaxed`, color `--text-sec`
- **Micro / Badge:** `text-[9px] sm:text-[10px] uppercase font-mono font-bold tracking-wider`, color varies by semantic state per Section 2.3

---

## 4. Layout, Spacing & Elevation Architecture (Replaces v4.2 §4)

### 4.1 The 8px Spatial Grid — unchanged
Retained exactly as v4.2 §4.1 (4px micro-increments, 8/16/24/32px steps). This was never a dark-mode-specific decision.

### 4.2 Shadow-Based Elevation (replaces Glassmorphism, v4.2 §4.2)

Blur-based glass is removed entirely. Elevation on a light surface is communicated with a restrained shadow + a 1px border, which is cheaper to render, more accessible, and reads as "considered" rather than "decorative":

```css
/* Institutional Light Elevation Formula */
background: #FFFFFF;
border: 1px solid var(--border-sub);      /* #E2E6EC */
border-radius: 1rem;                      /* 16px, unchanged from v4.2 */
box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04),
            0 2px 8px rgba(16, 24, 40, 0.04);
```
- **Hover elevation:** shadow deepens slightly (`0 4px 16px rgba(16,24,40,0.06)`) and border shifts to `--border-strong` — no color shift, no glow.
- **Modal elevation:** a single stronger shadow tier (`0 12px 32px rgba(16,24,40,0.12)`) plus a scrim (`rgba(11,18,32,0.32)`) behind it — dark enough to focus attention on the modal without the heavy near-black scrims dark-mode systems can get away with.
- **No backdrop blur anywhere in the system.** If a designer wants a "frosted" look for a specific marketing surface, that's a deliberate one-off exception documented separately — it is not a platform-wide default, precisely because it was the previous system's biggest practical liability (Section 0.2).

### 4.3 Z-Index Elevation Hierarchy — unchanged
Retained exactly as v4.2 §4.3 (z-0 through z-60). Z-index stacking is layout logic, not a visual-language decision, so it carries over untouched.

---

## 5. Screen Flow & Global Navigation (Retained from v4.2 §5, re-skinned)

The dual-tier navigation structure, the 12-hub top navigation, the PAN/Portfolio/FY/Currency context switchers, and the Mermaid flow diagram in v4.2 §5 are **functionally unchanged.** Visual re-skin notes only:

- **Global Sticky Header:** now a `#FFFFFF` bar with a `1px` bottom border (`--border-sub`) and the same soft shadow as a card — not a dark bar with a glowing pulse. The "live NSE/BSE connectivity" indicator becomes a small solid blue dot (Section 2.3's LIVE token) next to the wordmark, not an emerald glow.
- **PAN/Portfolio/FY/Currency switchers:** segmented pill controls, unselected state = `--bg-sunken` background with `--text-sec` text; selected state = `--brand-tint` background with `--brand-pri` text and a 1.5px `--brand-pri` bottom accent — no drop-shadow, no glassmorphism.
- **Active nav item (top nav):** `--brand-pri` text with a 2px solid underline in the same color, sitting on the plain white header — replaces v4.2's emerald focus-ring treatment.

---

## 6. Component & Screen-Level Color Application

The 12-screen inventory, sub-navigation structure, and functional content from v4.2 §6 (Command Center through Settings) are **retained in full** — no screen, sub-tab, or modal described there is removed or renamed. What changes on every screen is exclusively the palette mapping below; screen-specific notes follow only where the color change affects something structural.

### 6.1 Universal mapping (applies to every screen)
- Any element previously colored **emerald `#10B981`** for gains → **Gain `#0F7A4E`** (Section 2.2), on a white or `--fin-gain-bg` tint background, never on dark.
- Any element previously **rose/red `#F43F5E`** for losses → **Loss `#B3261E`**.
- Any element previously **amber `#F59E0B`** for TDS/warnings → **Attention `#8A5A00`**.
- Any element previously **cyan `#06B6D4`** (net cash) or **blue `#3B82F6`** (NRE) → both consolidated into **Informational Accent `#1D5FA8`**, differentiated by label text ("Net post-tax", "Repatriable · NRE"), not by a second hue.
- Any element previously **slate `#64748B`** (NRO) → **Secondary Text `#4B5568`** + a neutral gray "Restricted · NRO" chip.
- Any element previously **violet `#8B5CF6`** (FX) → signed Gain/Loss color + an "FX" prefix icon/label.
- Any element previously **purple `#A855F7`** (Bonus) or **indigo `#6366F1`** (Split) → neutral gray chip with icon + text label (`⊕ Bonus`, `⊘ Split`) per Section 2.2.
- **Interactive Holdings Treemap (Screen 1):** tile fill uses Gain/Loss tints (`--fin-gain-bg` / `--fin-loss-bg`) with Gain/Loss-colored borders and `--text-pri` labels — legible directly on the tile without needing a saturated fill, which is the single biggest readability win of moving this component to a light system (dark-mode treemaps with saturated red/green fills are a common source of visual fatigue on dashboards people watch for hours).
- **Circular Health Score gauge (Screen 1):** track in `--bg-sunken`, progress arc in `--brand-pri`, numeric center label in `--text-pri` — the gauge itself is brand-colored, not evaluative-colored, since "health score" is a composite the user should read the number for, not infer from a red/amber/green arc alone (which invites over-trusting a single composite number — consistent with the Phase 7 addendum's "recommendation vs. information" discipline).
- **Opportunity Engine / Unified Conviction Score (Screen 9):** the 0–100 Conviction Score renders as a horizontal bar in `--brand-pri` with component sub-scores (technical, fundamental, flow, options, news, sentiment) as smaller labeled ticks beneath it in Gain/Loss/neutral coloring per component direction — never a single traffic-light color for the composite, directly reflecting the "show the breakdown, not an opaque number" requirement from the Phase 7 spec.
- **Drawdown Circuit Breaker banner (Screen 9):** the one screen-level element explicitly permitted a fully filled `--fin-loss` background per the Section 2.3 "one filled badge" rule — this is deliberately the most visually assertive thing the system ever shows, because it is the single highest-stakes state (automated sizing frozen).
- **Data Feed Staleness Monitor (Screen 12):** status board rows use the LIVE/STALE/UNAVAILABLE tokens from Section 2.3 directly — LIVE rows get the small blue dot, STALE rows get the outlined amber pill, UNAVAILABLE rows are visually quietest (dashed border, muted text), reinforcing that "unavailable" is a lower-alarm state than "stale," which is itself lower-alarm than an active circuit breaker.

### 6.2 Statutory & compliance banners (Screens 6, 7, 8) — unchanged placement, re-skinned
All non-dismissable statutory banners (Finance Act 2024 cutover, Section 112A grandfathering, 234C interest, GAAR 31-day buffer, source-reliability disclosures from the Phase 7 addendum) render as a `--fin-info-bg` tinted full-width strip with `--fin-info` icon and `--text-pri` body text — informational in tone (blue), not alarming (never amber/red) unless the specific fact is itself urgent (e.g., an actual 234C shortfall, which does use the Attention token). This distinguishes "this is a permanent disclosure you should know" from "this requires action now," a distinction v4.2's uniform badge styling didn't make.

---

## 7. Interactive Components & Micro-Interactions (Replaces v4.2 §7)

### 7.1 ResizableDataTable Component
- **Header Resizing:** draggable splitter with hover line in `--brand-pri` (was emerald) at `w-1`.
- **Sorting State:** unsorted = neutral double chevron at `--text-mut`; ASC/DESC = `--brand-pri` arrow — sort affordances use the brand color, not a financial-semantic color, since sorting isn't a gain/loss statement.
- **Row striping:** alternate rows `#FFFFFF` / `--bg-sunken` (`#F1F3F6`) for scanability across 50+ rows — a light-mode-native technique that has no dark-mode equivalent in the original spec and directly serves the "examine 50+ holdings effortlessly" rubric target.
- **Pinned Columns:** left/right-pinned columns keep the original shadow-gradient scroll affordance, rendered as a soft `rgba(16,24,40,0.06)` gradient rather than a light-on-dark glow.

### 7.2 Micro-Animations & State Transitions — mechanics unchanged, easing/duration retained from v4.2 §7.2
Tab switching, modal entry/exit timings, and button-click feedback (`active:scale-95`) are unchanged; only colors used within those transitions follow Section 2. One addition: **near-expiry and circuit-breaker pulses use a slower, lower-amplitude pulse** (`opacity 0.85→1, 1.6s ease-in-out infinite`) than the original spec's default, since a fast, high-contrast pulse against a light background reads as considerably more alarming than the same animation against dark — recalibrated so "urgent" still feels urgent but doesn't feel like an error state on every visit.

---

## 8. Accessibility, Contrast & Responsive Design (Replaces v4.2 §8)

### 8.1 Contrast — recomputed for light surfaces, not inherited from v4.2

| Pairing | Approx. contrast ratio | Target level |
|---|---|---|
| `--text-pri` (`#0B1220`) on `--bg-app` (`#F7F8FA`) | ≈ 17.5:1 | Exceeds AAA (7:1) |
| `--text-pri` on `--bg-card` (`#FFFFFF`) | ≈ 18.5:1 | Exceeds AAA |
| `--text-sec` (`#4B5568`) on white | ≈ 8.0:1 | Exceeds AAA |
| `--text-mut` (`#7D8798`) on white | ≈ 4.6:1 | Meets AA (normal text); use at ≥14px |
| `--fin-gain` (`#0F7A4E`) on white | ≈ 5.4:1 | Meets AA; comfortably passes for badge/table text |
| `--fin-loss` (`#B3261E`) on white | ≈ 6.1:1 | Exceeds AA, close to AAA |
| `--fin-warn` (`#8A5A00`) on white | ≈ 5.2:1 | Meets AA |
| `--fin-info` (`#1D5FA8`) on white | ≈ 5.6:1 | Meets AA |
| `--brand-pri` (`#0B3D91`) on white | ≈ 8.6:1 | Exceeds AAA |

**Process note:** these are calculated approximations from standard relative-luminance formulas, not a substitute for automated verification. Before ship, run every token pairing above (and every tinted-background + colored-text combination in Section 2.2/2.3) through an automated contrast checker (e.g., Stark, axe, or Chrome DevTools' contrast panel) as a CI-gated step — treat a failing pairing the same as a failing unit test, not a design nitpick to fix later.

### 8.2 Keyboard Navigation — unchanged from v4.2 §8.2
Focus traps, `Escape`-to-close, and visible focus rings are retained; focus-ring color updates to `--border-focus` (`#0F62FE`) at `focus:ring-2 focus:ring-blue-600/40` to stay visible against white/light-gray surfaces (the original emerald ring at 50% opacity was tuned for a dark background and would be noticeably fainter on white).

### 8.3 Responsive Breakpoints — unchanged from v4.2 §8.3
Desktop (1440px+), Laptop (1024–1439px), Tablet & Mobile (< 1024px) behavior carries over exactly; breakpoint logic is layout, not palette.

### 8.4 Color-blindness resilience (new — not addressed in v4.2)
The original nine-hue system had real color-vision-deficiency risk (e.g., emerald/rose is a difficult pair for deuteranopia, and violet/indigo for bonus/split were nearly indistinguishable to begin with). The five-color core in this version is deliberately built so that **no two semantic colors rely on hue alone**: Gain vs. Loss always ships with a `+`/`–` sign and directional arrow icon, Warning always ships with a distinct icon (triangle) rather than relying on amber-vs-red discrimination, and the Attention/Informational pair (amber-brown vs. blue) sits far enough apart on the color wheel to remain distinguishable under the most common CVD profiles. Run the final palette through a deuteranopia/protanopia simulator (e.g., Stark or Sim Daltonism) as part of the same CI-gated accessibility check in 8.1.

---

## 9. Independent Reviewer's Evaluation Rubric (Updated from v4.2 §9)

| Evaluation Dimension | Passing Benchmark | Inspection Target |
|---|---|---|
| **1. Visual Hierarchy & Scannability** | 9/10+ | Can an executive discern consolidated AUM, Day P&L, and immediate tax liability within 3 seconds — on a laptop in a bright room, not just a dim office? |
| **2. Financial Precision & Numerals** | 10/10 | Are all numbers rendered in tabular fixed-width fonts with clean decimal alignment and sign indicators, at full contrast on light surfaces? |
| **3. Regulatory & Statutory Transparency** | 10/10 | Are statutory disclaimers embedded with a visual tone (informational blue) distinct from active-alert tone (amber/red), so urgency isn't diluted by routine disclosure noise? |
| **4. Surface Cohesion & Light-Mode Elegance** | 9/10+ | Is the flat, shadow-based light theme consistent across all 12 modules with no leftover dark-mode residue (no accidental blur, no glow effects), and no jarring hue transitions between screens? |
| **5. Information Density vs. Simplicity** | 9/10+ | Does the ResizableDataTable's row-striping and pinned-column treatment allow examining 50+ holdings effortlessly in daylight-bright ambient light? |
| **6. Semantic Color Discipline (new)** | 10/10 | Can a first-time user correctly state what each of the five semantic colors means after a single pass through the Command Center, without a legend? Does exactly one element per screen ever use a fully filled/saturated badge? |
| **7. Commercial/Brand Readiness (new)** | 9/10+ | Would this screen, shown to a private banking client or included in an investor pitch deck, read as a considered financial product — or as a repurposed internal engineering tool? |

---

## 10. Build Notes for the Development Engine

1. Sections 2–4 and 7–8 of this document **replace** the corresponding sections in `ui_ux_design_specification.md` v4.2.0 wholesale. Section 6 of v4.2 (the 12 detailed screens) stays as the functional source of truth; apply the Section 6 mapping above during implementation rather than re-describing every screen's layout from scratch.
2. Implement the token table in Section 2 as CSS custom properties / Tailwind theme extension exactly as named (`--bg-app`, `--fin-gain`, etc.) so a future palette adjustment is a token-file change, not a component-by-component hunt for hardcoded hex values — this was implicit in v4.2 but is worth stating as an explicit acceptance criterion given the full palette swap this document represents.
3. Do not reintroduce `backdrop-filter` anywhere in the base component library (Section 4.2) — if a future design pass wants a frosted effect for a specific marketing/onboarding surface, that is a scoped exception requiring its own performance and accessibility sign-off, not a return to the platform-wide default this version deliberately removes.
4. Run the full contrast and CVD-simulation pass (Section 8.1, 8.4) before this ships to any external reviewer or client — the ratios above are a design-time estimate, and the acceptance bar is the automated tool's number, not this document's.
