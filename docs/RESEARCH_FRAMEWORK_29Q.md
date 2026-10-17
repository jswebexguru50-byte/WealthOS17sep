# 29Q Institutional Research Framework

> NRI WealthOS — Tier-1 Stock Dossier Protocol  
> Version: 1.0 | Created: October 2026  
> Applies to: All Tier-1, Tier-2 stock research runs

---

## Overview

The **29Q Framework** is a structured 29-question institutional analysis protocol applied to every screened stock. It maps directly to the **7 F-Filter quantitative gatekeeping criteria** and extends into qualitative, valuation, risk, and action dimensions.

A stock must be analyzed across all 29 questions to receive an investment recommendation. The F-filter score (0–7) is computed first; questions build the narrative layer on top of the quantitative verdict.

---

## The 7 F-Filters (Quantitative Gates)

These are hard quantitative thresholds. A stock passes a filter or fails — no partial credit.

| # | Filter | Threshold | Data Source | Token |
|---|--------|-----------|-------------|-------|
| **F1** | Promoter holding | ≥ 66.67% | Trendlyne shareholding | `prompct` |
| **F2** | 8-Quarter PAT | All 8 quarters positive (>0) | WealthOS SQLite DB | SQL query |
| **F3** | ROCE | ≥ 35% (TTM preferred; Annual acceptable) | Trendlyne GSPV | `rocea` |
| **F4** | ROE | ≥ 25% (TTM preferred; Annual acceptable) | Trendlyne GSPV | `roea` |
| **F5** | Promoter pledge | ≤ 0.01% | Trendlyne shareholding | `prompledge` |
| **F6** | Institutional holding | FII/DII ≥ 5% AND QoQ change ≥ +0.10pp | Trendlyne GSPV | `fiihold` / `instihold` / `instipct1q` |
| **F7** | Cash flow quality | CFO / EBITDA ≥ 0.5× | Trendlyne GSPV (derived) | `cfoa` / `pbditmargina` / `sra` |

### F7 Derivation (EBITDA not directly available)
```
EBITDA  = sra × (pbditmargina / 100)     # Revenue × EBITDA_margin_pct
F7_ratio = cfoa / EBITDA
Pass if F7_ratio ≥ 0.50
```

### F3/F4 Methodology Note
Trendlyne Annual (`rocea`, `roea`) and TTM values differ. Historical screener used TTM-based ROCE which showed 35%+ for stocks that show 10-20% on Annual. **Always compare on same methodology**. Prefer TTM tokens if available; if not, flag the discrepancy in the dossier.

---

## The 29 Questions

### Pillar 1 — Business Quality (Q1–Q5)

| Q# | Question | Key Sources |
|----|----------|-------------|
| Q01 | Business description — what does the company make/do? What sector? | Overview, news, annual report |
| Q02 | Revenue model — how does it earn money? Key revenue streams? | Overview, financials |
| Q03 | Competitive position — market share, moat, differentiation? | Overview, sector knowledge |
| Q04 | Revenue growth trend — multi-year trajectory and drivers | `sra` (Annual), quarterly progression |
| Q05 | Profitability — ROCE, ROE, EBITDA margin; are they improving? | `rocea`, `roea`, `pbditmargina` |

### Pillar 2 — Earnings & Balance Sheet (Q6–Q9)

| Q# | Question | Key Sources |
|----|----------|-------------|
| Q06 | 8-Quarter PAT quality — trajectory, lumps, consistency | WealthOS DB (8Q PAT query) |
| Q07 | Balance sheet health — D/E, leverage trend, working capital | `debtcea`, `ltdea` |
| Q08 | Cash flow quality — CFO vs EBITDA, CFO trend YoY | `cfoa`, `cfoamy1`, F7 ratio |
| Q09 | F-Filter summary verdict — tabulate F1–F7 pass/fail with values | All of above |

### Pillar 3 — Governance & Ownership (Q10–Q12)

| Q# | Question | Key Sources |
|----|----------|-------------|
| Q10 | Promoter holding & QoQ trend — buying, selling, stable? | `prompct`, `prompct1q`, `prompct4q` |
| Q11 | Pledge and insider activity — any recent SAST/insider transactions? | `prompledge`, SAST data |
| Q12 | Institutional holding — FII, DII, MF trend and F6 assessment | `fiihold`, `instihold`, `mfpct1q`, `instipct1q` |

### Pillar 4 — Technicals & Quantitative Quality (Q13–Q16)

| Q# | Question | Key Sources |
|----|----------|-------------|
| Q13 | Technical setup — RSI, SMA200 premium/discount, trend direction | `rsi`, SMA200 from overview/technical |
| Q14 | Piotroski F-score deep-dive — what criteria pass/fail? | `pitroskif` |
| Q15 | Altman Z-score — solvency zone (safe/grey/distress) | `altmanzscore` |
| Q16 | Valuation — P/E TTM vs sector, historical range, fair value estimate | `pettm`, `currentprice`, `mcapq` |

### Pillar 5 — Risk Assessment (Q17–Q21)

| Q# | Question | Key Sources |
|----|----------|-------------|
| Q17 | Key operational risks specific to this business | Sector knowledge + overview |
| Q18 | Regulatory/policy risk — sector exposure to government decisions | Sector knowledge + news |
| Q19 | Liquidity & market cap risk — ADTV, small/mid-cap risk premium | `delivery6mavg`, `mcapq` |
| Q20 | Concentration risk — single product, region, customer | Sector knowledge |
| Q21 | Management & governance risk — track record, family control quality | Shareholding + insider data |

### Pillar 6 — Investment Case (Q22–Q26)

| Q# | Question | Key Sources |
|----|----------|-------------|
| Q22 | DVM score interpretation — Durability/Value/Momentum breakdown | Technical type from `get_overview_news_corp_events` |
| Q23 | Sector dynamics — tailwinds and headwinds in the next 12-24 months | News + sector knowledge |
| Q24 | Bull case — what has to go right for a 2-3x return? | Synthesis |
| Q25 | Bear case — what could trigger a 40-60% drawdown? | Synthesis |
| Q26 | Piotroski + Altman composite quality read | `pitroskif` + `altmanzscore` |

### Pillar 7 — Decision (Q27–Q29)

| Q# | Question | Key Sources |
|----|----------|-------------|
| Q27 | Investment thesis summary — one paragraph, 3-4 key pillars | Full synthesis |
| Q28 | Conviction score — 0 to 10, with reasoning | Synthesis |
| Q29 | **Action recommendation** — one of: BUY / ACCUMULATE / HOLD / MONITOR / AVOID | Final verdict |

### Action Recommendation Definitions

| Action | Criteria |
|--------|----------|
| **BUY** | F-score ≥ 5/7, Conviction ≥ 8, Valuation attractive, technicals constructive |
| **ACCUMULATE** | F-score 4-5/7, Conviction 6-8, earnings improving, dips offer entry |
| **HOLD** | F-score 3-4/7, Conviction 5-7, no new position but existing holders stay |
| **MONITOR** | F-score 3/7 with ≥1 red flag (CFO negative, promoter selling, RSI overbought) |
| **AVOID** | F-score ≤ 2/7, or Altman Z grey/distress, or Conviction < 4 |

---

## Scoring Rubric

```
Conviction Score = weighted composite:
  Business quality    : 25%  (moat, margins, sector)
  F-filter score      : 30%  (# of 7 filters passed)
  Valuation           : 20%  (P/E vs sector, fair value discount)
  Earnings momentum   : 15%  (PAT trajectory, CFO trend)
  Technical setup     : 10%  (RSI, SMA200, DVM)
```

---

## Standard Output Format

Each stock dossier must include:
1. **Executive card** — Market cap, LTP, F-badge row, alert box
2. **KPI block** — P/E, ROE, ROCE, CFO/EBITDA, D/E
3. **Q01–Q29 answers** — One paragraph per question minimum
4. **F-filter verdict table** — All 7 with values and pass/fail
5. **Action with triggers** — Specific re-entry conditions and stop-loss levels
6. **Cross-stock comparison table** — All stocks in current run side-by-side

---

## Known Data Gaps & Workarounds

| Gap | Workaround |
|-----|-----------|
| `ebitdaa` returns None for some stocks | Derive: `sra × pbditmargina / 100` |
| F3 Annual vs TTM discrepancy | Always note in dossier; prefer TTM; flag if Annual data used |
| `rocea` is Annual only | Note discrepancy with historical TTM-based screener data |
| News/events data | Use `get_overview_news_corp_events(type='news')` and `type='events'` |

---

*Framework version 1.0 — for questions see DEVELOPER_BOT_PROMPT_2026-10-10.md or session memory*
