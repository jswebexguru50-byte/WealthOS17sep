# MASTER SYSTEM SPECIFICATION — ADDENDUM v4.0
## Multi-Source Intelligence, Sentiment Fusion & Wealth-Maximization Layer
**Extends:** `master_app_specification.md` (v3.0.0-PROD-SPEC) + `dev_spec_opportunity_engine.md` (Phases 0–6)
**Status:** Additive. Nothing below removes or contradicts the existing INFRA/CA/TX/RS/OPP/LRN/LEAD build — it adds Phase 7 and rewrites the mission statement that all of it now serves.
**Target Audience:** Development engine / AI build agent implementing this codebase end-to-end.

---

## 0. Why this addendum exists

The v3.0 spec and its dev-spec build plan are structurally sound: trading-calendar correctness, decimal precision, feed-staleness states, idempotent mutations, an immutable audit ledger, calibrated (not raw) probabilities, walk-forward validation, and lead-lag-tested "leading indicators" are all already first-class citizens (INFRA-1 through INFRA-6, LRN-1 through LRN-4, LEAD-1 through LEAD-3). That discipline is not being relaxed here — it is being extended to cover data the existing spec doesn't yet ingest: **public news, social/retail sentiment, and third-party analyst/technical aggregators (Moneycontrol, Trendlyne, Screener.in, Zerodha Pulse)**, alongside the options/derivatives depth the original LEAD-1 only sketched.

Two things change in this document that matter more than any single feature:

1. **A single, explicit objective statement** (Section 1) that every module — old and new — is now judged against, replacing the more diffuse "institutional-grade platform" framing.
2. **A hard rule that new external sources inherit every existing guardrail** — staleness tagging (INFRA-3), calibration before trust (INFRA-5), look-ahead and lead-lag validation (LRN-3, LEAD-2) — before they are allowed to move a Conviction Score, and long before they touch position sizing (OPP-1). No source gets a shortcut for being "obviously useful."

---

## 1. THE SINGLE OBJECTIVE (restated, non-negotiable)

> **Maximize risk-adjusted, after-tax family wealth over time by surfacing high-confidence, high-yield opportunities in the Indian listed-equity market — where "high-confidence" is defined empirically (calibrated, out-of-sample-validated probability), never asserted by a model badge or a scraped headline.**

Everything else — the 12 hubs, the 7 scanner strategies, the tax engine, the corporate-actions ledger, the new sourcing layer below — exists to serve that sentence, in this priority order when they conflict:

1. **Capital preservation first.** No feature may recommend a position size, entry, or automation that bypasses the drawdown circuit breakers (OPP-1, OPP-10) already specified, regardless of how strong a "signal" from any new source appears.
2. **Truth over confidence theater.** A number the system cannot trace to its source data and cannot later score against the realized outcome does not get shown as a recommendation — it gets shown as raw information, clearly labeled as such (Section 5).
3. **Compounding over frequency.** The system optimizes for the Kelly-sized, tax-aware, cost-basis-correct compounding of family capital — not for the number of "opportunities" it surfaces per day. A quiet day with zero qualifying signals is a correct output, not a failure of the engine.
4. **Every recommendation is falsifiable and audited**, per the existing `PredictionAuditLedger` and `CalibrationLedger` — this now applies identically to sentiment- and news-derived signals, not just technical ones.

This reordering has one direct build consequence: **Section 4 (Unified Conviction Score) is the actual deliverable of this addendum.** Sections 2–3 exist only to feed it clean, provenance-tagged, reliability-scored data.

---

## 2. DATA SOURCE INTEGRATION MATRIX

Every source below must be registered in a new `data_sources` table before any adapter is built, so provenance and reliability are queryable, not implicit in code.

```
table: data_sources
  source_id         TEXT PRIMARY KEY
  display_name      TEXT
  category          TEXT  -- 'MARKET_DATA','FUNDAMENTAL','TECHNICAL_AGGREGATOR','NEWS','SOCIAL','OPTIONS','REGULATORY_FILING'
  access_method     TEXT  -- 'OFFICIAL_API','LICENSED_FEED','RSS','MANUAL_EXPORT','WEBSITE_SCRAPE'
  tos_status        TEXT  -- 'COMPLIANT','REQUIRES_REVIEW','PROHIBITED'
  reliability_tier  INTEGER  -- 1 (primary/official) to 4 (unverified secondary)
  refresh_cadence   TEXT
  notes             TEXT
```

| Source | Category | Recommended access method | ToS status | Reliability tier | Role in pipeline |
|---|---|---|---|---|---|
| NSE/BSE official bhavcopy, corporate announcements, holiday calendar | Market data / Regulatory | Official API / published files | Compliant | 1 | Ground truth for price, volume, corporate actions, calendar (INFRA-1) |
| Zerodha Kite Connect / Upstox API v2 | Market data | Official licensed API | Compliant | 1 | Live quotes, portfolio sync (already in v3.0 §6) |
| Screener.in | Fundamental | Official API where the user holds a paid subscription entitling API/export access; otherwise manual/periodic authenticated export | Requires review per current ToS | 2 | Fundamental ratios, quarterly results, shareholding pattern cross-check |
| Moneycontrol | Fundamental / News / Technical aggregator | RSS feeds where published; otherwise treat as **display-only reference**, not an automated scrape target, until a commercial data/API agreement is confirmed | Requires review | 2–3 | Analyst consensus, news headlines, sector data — corroboration only, never sole source |
| Trendlyne | Technical aggregator / Analyst ratings | Official Trendlyne API (subscription-tier dependent) | Compliant if using their published API/subscription; scraping is not | 2 | SWOT scores, analyst target consensus, momentum scores — corroboration input |
| Zerodha Pulse (news aggregator) | News | Public RSS/aggregation as published | Compliant (it aggregates publicly published RSS by design) | 2 | Headline stream, deduped against direct-publisher RSS |
| Business news (Economic Times, Mint, Business Standard, Reuters India, PTI/ANI wire) | News | Publisher RSS feeds / official news APIs (e.g., licensed wire feed) | Compliant via RSS/licensed feed; full-text scraping requires review | 1–2 | Headline + snippet ingestion for NLP-1 (never full-article reproduction — see Section 6.3) |
| X/Twitter, StockTwits-style retail sentiment | Social | Official platform API (paid tier) | Compliant only via official API; scraping is prohibited | 3–4 | Retail sentiment signal, pump-and-dump detection — lowest trust tier, corroboration-only |
| BSE/NSE corporate filings (bulk/block deals, pledge disclosures, shareholding) | Regulatory filing | Official exchange disclosure feeds | Compliant | 1 | LEAD-1 items 3–4 (bulk/block deals, promoter pledge) |
| Options chain (NSE F&O) | Options/Derivatives | Official exchange feed or licensed vendor (confirm entitlement via broker API first) | Compliant via licensed/broker API | 1–2 | SRC-6 options analytics |
| Credit rating agency actions (CRISIL/ICRA/CARE watch/rating changes) | Regulatory / Credit | Publisher press releases / official rating action feeds | Compliant | 2 | Sector-level leading indicator (LEAD-1 item 6) |

**Hard rule (SRC-0):** Any source whose `tos_status` is not `COMPLIANT` in this table is built as a **manual/periodic import path** (user-driven export, or an explicitly licensed API once procured) and is never wired into an always-on scraper. The system defaults to the most compliant available method per source and degrades gracefully (shows "source unavailable," per INFRA-3) rather than falling back to an unauthorized scrape. This is a build-blocking constraint, not a preference — treat it with the same severity as INFRA-4's idempotency requirement.

---

## 3. PHASE 7 — EXTERNAL INTELLIGENCE & SENTIMENT FUSION ENGINE

Sequenced **after** Phase 6 (Leading Indicators) in the existing Master Build Sequence, because every item here consumes INFRA-1/2/3/5/6 and the LRN-2/LRN-3/LEAD-2 validation discipline already built. Do not build Phase 7 before Phase 0 is complete, for the same reason OPP-1 is sequenced last in the existing plan: a fusion score built on top of ungated inputs just launders bad signal into something that looks authoritative.

### SRC-1: Source Adapter Framework

**Problem:** Six-plus heterogeneous sources (APIs, RSS, licensed feeds, manual exports) need one ingestion contract, not six bespoke pipelines that each handle staleness/retries/rate-limits differently.

**Data model:**
```
table: source_adapter_runs
  run_id            TEXT PRIMARY KEY
  source_id         TEXT REFERENCES data_sources
  started_at_utc    TIMESTAMPTZ
  completed_at_utc  TIMESTAMPTZ
  records_ingested  INTEGER
  status            TEXT  -- 'SUCCESS','PARTIAL','FAILED'
  error_detail      TEXT NULLABLE
```

**Logic:** Every adapter implements `fetch() -> RawRecord[]`, `normalize(RawRecord) -> CanonicalRecord`, and `rate_limit_policy()`. Every `CanonicalRecord` carries `{source_id, entity_key (ISIN or symbol or 'MARKET'/'SECTOR:x'), as_of, value, state}` — the same provenance envelope already required platform-wide (Global Convention, dev spec §"Data provenance"). No adapter writes directly into any table a signal or the UI reads from; it writes into a per-source staging table, and a separate normalizer promotes it after validation.

**Edge cases:**
- A licensed API rate-limits or 429s → adapter backs off exponentially, marks `data_feed_status` for that source as `STALE`, never `UNAVAILABLE`→retry-loop-forever.
- A source changes its schema/format silently → normalizer fails closed (rejects the batch, alerts) rather than ingesting malformed data as if valid.

**Acceptance criteria:**
- [ ] Every source in Section 2 has a registered adapter with a passing contract test (fetch → normalize → staging table) before it feeds anything downstream.
- [ ] No adapter for a `REQUIRES_REVIEW` or `PROHIBITED` source is scheduled on a cron; it runs only on explicit manual trigger until its `tos_status` is updated to `COMPLIANT`.

---

### SRC-2: Fundamental Cross-Validation (Screener.in ⇄ Moneycontrol ⇄ Filings)

**Problem:** Fundamental ratios (P/E, ROE, debt/equity, promoter holding) differ slightly across aggregators due to timing and restatement lags. A single-source fundamental filter can silently rank a stock wrong.

**Logic:**
```
for each metric (e.g., promoter_holding_pct, debt_to_equity, roe_ttm):
    collect value from each available reliability-tier-1/2 source
    if max_deviation across sources > threshold (metric-specific, e.g. 2pp for promoter holding):
        flag CONFLICT, do not auto-resolve — surface both values + sources in UI
    else:
        use tier-1 source value if present, else highest-tier available; tag with all contributing sources
```

**Data model:** `fundamental_metric_conflicts`: `symbol, metric, source_a, value_a, source_b, value_b, as_of, resolved (bool), resolution_note`.

**UI requirement:** Scrip Intelligence Portal shows a small "sources agree / sources differ — tap to compare" indicator next to any fundamental figure sourced from more than one aggregator.

**Acceptance criteria:**
- [ ] No fundamental screen (Value Dip, High-Yield Dividend strategies) uses a single-source metric without a corroboration attempt logged, even if corroboration ultimately fails and the single source is used with a `SINGLE_SOURCE` provenance tag.

---

### SRC-3: News & Corporate Announcement Ingestion Pipeline

**Problem:** News is currently absent from the scanner entirely. Naive ingestion (keyword match on headlines) produces false positives (e.g., "Company X unrelated to sector news mentioning it") and duplicate signal spam (the same PTI wire story republished by five outlets).

**Data model:**
```
table: news_events
  event_id        TEXT PRIMARY KEY
  published_at    TIMESTAMPTZ
  source_id       TEXT
  headline        TEXT
  entity_keys     TEXT[]   -- resolved ISIN(s)/symbol(s), can be empty pending resolution
  event_type      TEXT     -- 'EARNINGS','M&A','REGULATORY','LITIGATION','MANAGEMENT_CHANGE','GUIDANCE','OTHER'
  dedup_cluster_id TEXT    -- groups the same underlying story across publishers
  sentiment_score REAL NULLABLE  -- populated by SRC-4/NLP pipeline
```

**Logic:**
1. **Entity resolution:** map headline/company mentions to ISIN via the existing `MasterTickers`/`AssetScripMapping` tables (v3.0 §3, Hub 11) — never fuzzy-match on name alone without a confidence threshold; ambiguous matches (e.g., "Tata" mentions) go to a manual resolution queue rather than auto-attaching to a random Tata-group ISIN.
2. **Deduplication:** cluster near-identical headlines published within a short window (same wire story syndicated) using a text-similarity threshold; a `dedup_cluster_id` prevents the same underlying event from counting as five independent corroborating signals.
3. **Event classification:** classify into the `event_type` enum above; only `EARNINGS`, `REGULATORY`, `M&A`, and `GUIDANCE` events are eligible to feed the Conviction Score initially — `OTHER` is logged but not scored, to avoid noise until the classifier is validated.

**Edge cases:**
- Same story from a Tier-1 wire and a Tier-3 blog aggregator → keep both records, but weight only the Tier-1 source in scoring (see SRC-8).
- Headline mentions a company only in passing (e.g., sector roundup) → entity resolution confidence below threshold → do not attach to that ISIN's signal feed.

**Acceptance criteria:**
- [ ] Dedup cluster false-merge rate and false-split rate both measured against a manually labeled sample set before this feeds any live score.
- [ ] Entity resolution precision measured and reported; ambiguous cases logged to a resolution queue, never silently guessed.

---

### SRC-4: Social/Retail Sentiment Engine with Manipulation Detection

**Problem:** Retail sentiment (X/Twitter, retail forums) is the least reliable, most manipulable source in this stack — pump-and-dump chatter, coordinated posting, and bot amplification are common in Indian small/mid-cap social chatter. Treating raw sentiment volume as a bullish signal is actively dangerous for a "maximize family wealth, minimize error" system.

**Logic:**
1. Ingest only via the official platform API (Section 2 — scraping is explicitly out per SRC-0).
2. Compute raw sentiment (positive/negative/neutral classification) per mention, then apply a **manipulation-risk discount** before any aggregate sentiment score is trusted:
   - Sudden volume spike (>Nx baseline) with low account-age/high-repetition-of-phrasing on a low-liquidity, low-market-cap stock → flag `MANIPULATION_RISK: HIGH`, suppress the sentiment signal entirely rather than score it.
   - Sentiment volume concentrated in a handful of accounts rather than broad-based → downweight proportionally.
3. Only symbols where sentiment passes the manipulation-risk filter get a `retail_sentiment_score` written to the same provenance-tagged pipeline as everything else.

**Data model:** `social_sentiment_daily`: `symbol, date, mention_count, positive_pct, negative_pct, manipulation_risk (LOW/MEDIUM/HIGH), score_used_in_fusion (bool)`.

**UI requirement:** Where social sentiment is shown at all, a `HIGH` manipulation-risk flag is displayed as a **warning**, not filtered silently — the user should be able to see "sentiment spiked but looks coordinated/inorganic" as information in its own right, distinct from a bullish signal.

**Acceptance criteria:**
- [ ] Manipulation-risk heuristic back-tested against at least a handful of known historical pump-and-dump episodes in Indian small-caps (as a sanity check, not a formal validation) before going live.
- [ ] `social_sentiment_daily` never feeds OPP-1 sizing directly — it only ever contributes to the Conviction Score (Section 4), which itself has its own gating.

---

### SRC-5: Technical & Analyst-Rating Aggregator Ingestion (Trendlyne / Moneycontrol)

**Problem:** Third-party "scores" (Trendlyne's SWOT/momentum/valuation scores, Moneycontrol's analyst consensus) are attractive because they're pre-digested — but they're black boxes from the system's point of view and must not be trusted more than the platform's own validated signals.

**Logic:** Ingest as a **corroborating input only** — a `third_party_score` record per symbol per provider, timestamped and versioned (providers revise their own methodology without notice). These scores can raise or lower the Conviction Score's corroboration term (Section 4) but never substitute for the platform's own technical/fundamental computation, and never bypass LRN-3's look-ahead audit — if a third-party score's methodology is opaque enough that look-ahead cannot be ruled out, it is capped at a low weight rather than excluded outright (documented as a known limitation).

**Acceptance criteria:**
- [ ] Every third-party score used carries a `provider_methodology_confidence` field (HIGH/MEDIUM/LOW, set manually based on how transparent the provider is about their formula) that directly scales its weight in Section 4.

---

### SRC-6: Options & F&O Chain Deep Analytics

**Problem:** v3.0's Scrip Intelligence Portal mentions "F&O open interest analysis" and the original LEAD-1 lists options positioning as the highest-value-but-hardest leading indicator. This item makes it concrete.

**Data model:** `options_chain_snapshot`: `symbol, expiry, strike, option_type (CE/PE), oi, oi_change, iv, volume, ltp, as_of_timestamp`. `derived_options_metrics`: `symbol, as_of_date, pcr_oi, pcr_volume, max_pain_strike, iv_skew_25delta, unusual_oi_buildup_strikes[]`.

**Logic:**
- **PCR (Put-Call Ratio)** by OI and by volume, tracked as a time series per symbol and index-level.
- **Unusual OI buildup:** flag strikes where OI change in a session exceeds a rolling-baseline multiple, especially away-from-money strikes (early positioning signal).
- **IV skew:** track skew between OTM puts and calls as a fear/greed proxy per symbol.
- **Max pain:** computed and shown for context (weak predictive value alone — surfaced as informational, not scored into Conviction directly, unless/until LEAD-2 validates it).

**Acceptance criteria:**
- [ ] PCR and unusual-OI-buildup signals go through the same LEAD-2 lead-lag validation gate as every other "leading indicator" before being scored — options chatter "feeling predictive" is exactly the kind of in-sample illusion LEAD-2 exists to catch.

---

### SRC-7: Broker Research Report Aggregation

**Problem:** v3.0 mentions "broker research aggregation" as a feature but no ingestion mechanism. Sell-side target prices and ratings are a distinct, useful, and legally straightforward-to-use input (most brokers publish these for their own clients — ingest only reports the user's own broker accounts entitle them to, e.g., via Zerodha/Upstox/ICICI research sections already accessible through those broker relationships).

**Data model:** `broker_research_reports`: `symbol, broker_name, report_date, rating (BUY/HOLD/SELL/ACCUMULATE/REDUCE), target_price, target_horizon_months, source_account`.

**Logic:** Aggregate into a consensus (median target, rating distribution) per symbol; track consensus drift over time (upgrades/downgrades) as its own signal, since a *change* in consensus is often more informative than the level.

**Acceptance criteria:**
- [ ] Only ingest reports the user is contractually entitled to view via their own broker relationship — no third-party redistribution of paywalled research.

---

### SRC-8: Source Reliability Scoring & Conflict Resolution

**Problem:** With 8+ source categories now feeding the system, something has to decide what happens when they disagree — this is the generalized version of CA-6's "CA data source conflict resolution," extended platform-wide.

**Logic:**
```
reliability_weight(source) = base_tier_weight(source.reliability_tier)
                            × historical_accuracy_adjustment(source)  -- from CalibrationLedger-style tracking of that source's own signal quality over time
                            × recency_decay(as_of)
```
Every fused figure (Conviction Score inputs) carries the full list of contributing sources and their individual weights — visible on demand in the Security Dossier, not just a single blended number with no way to inspect it.

**Acceptance criteria:**
- [ ] A "sources disagree" state is a first-class, displayable state (parallel to LIVE/STALE/UNAVAILABLE) — never silently averaged away without the disagreement being visible to the user.

---

## 4. THE UNIFIED CONVICTION SCORE

This is where Sections 2–3 (and the existing OPP/LRN/LEAD machinery) converge into the single number the family actually acts on.

**Principle:** The Conviction Score is a **fusion of independently-validated components**, not a single model retrained end-to-end on everything — this keeps each component auditable and stops one noisy source (e.g., social sentiment) from silently dominating a fused black box.

```
ConvictionScore(symbol) =
    w_technical   × CalibratedProbability(technical_setup)        [from existing OPP scanner + INFRA-5]
  + w_fundamental × FundamentalQualityScore(symbol)                [SRC-2, cross-validated]
  + w_flow        × InstitutionalFlowScore(symbol)                 [LEAD-1 items 2–4: FII/DII, bulk/block, pledge]
  + w_options     × OptionsPositioningScore(symbol)                [SRC-6, gated by LEAD-2]
  + w_news        × NewsEventScore(symbol)                         [SRC-3, only EARNINGS/REGULATORY/M&A/GUIDANCE types]
  + w_sentiment   × RetailSentimentScore(symbol)                   [SRC-4, only if manipulation_risk != HIGH]
  + w_thirdparty  × ThirdPartyCorroborationScore(symbol)           [SRC-5, capped by provider_methodology_confidence]
```

**Hard gating rules (all must hold, or the corresponding term is set to 0 and excluded — never imputed):**
1. Every component weight `w_x` is itself sourced from a per-component historical calibration record (extend `CalibrationLedger` with a `component` column) — a component that hasn't demonstrated predictive value gets down-weighted automatically, not manually tuned once and left static.
2. `w_sentiment` starts at a deliberately low ceiling (e.g., capped well below any single technical or fundamental component) given its Tier 3–4 reliability, and can only rise if its own component-level calibration earns it more weight over a sustained out-of-sample window — same walk-forward discipline as LRN-2, applied per-component here.
3. No component sourced from a `REQUIRES_REVIEW` or `PROHIBITED` data source (Section 2) contributes to `ConvictionScore` while pending manual/compliant sourcing — it can be shown as raw informational context only.
4. `ConvictionScore` is only exposed to the user (and only eligible to feed OPP-1 Kelly sizing) once it has its own `n`-gated calibration record (same `MIN_N` discipline as LRN-1/LEAD-3) — below that threshold, the UI shows the individual components with "insufficient combined history for a fused score" rather than a fabricated blend.
5. **`ConvictionScore` never overrides OPP-1's existing hard circuit breakers** (drawdown-based zero-allocation, 5% NAV cap, 2% ADV liquidity cap). A maximum-conviction signal during a >25% portfolio drawdown still sizes to zero. This is the same principle as the Section 1 priority ordering, made concrete: capital preservation outranks conviction, always.

**UI requirement:** The Security Dossier shows `ConvictionScore` as a breakdown (stacked/component view), each component's own calibration stats, and its contributing sources with reliability weights — never as a single opaque number. This satisfies both LEAD-3's "show the lead time, not just the signal" principle and the general "falsifiable and audited" requirement from Section 1.

**Acceptance criteria:**
- [ ] `ConvictionScore` computation is fully reconstructable from `audit_ledger` entries for any historical date — i.e., you can prove what the score was and why on any past day, not just query the current value.
- [ ] A regression test suite freezes at least 20 historical symbol/date combinations with known component inputs and asserts exact expected fused scores, to catch any future silent change to the fusion weights.

---

## 5. LABELING DISCIPLINE: RECOMMENDATION vs. INFORMATION

New rule, applicable platform-wide from this addendum forward: every piece of data surfaced in the UI is one of exactly two things, and the UI must visually distinguish them:

- **A Recommendation** — carries a calibrated `ConvictionScore` (or a validated single-strategy probability, pre-fusion, per the existing OPP scanner) that has passed its `MIN_N` gate. Eligible to appear in the Opportunities Hub feed and to size a position.
- **Information** — raw news, an unvalidated third-party score, a sub-`MIN_N` sentiment reading, options chatter that hasn't cleared LEAD-2. Shown in context (Security Dossier, news panel) but never in the ranked opportunity feed, and never sized.

This directly operationalizes Section 1's "truth over confidence theater" priority and prevents the most likely failure mode of adding six new data sources: scope creep where "interesting" quietly becomes "actionable" without earning it.

---

## 6. COMPLIANCE, LEGAL & SAFETY GUARDRAILS

### 6.1 Regulatory framing (carried over and reinforced from the original review)
`ConvictionScore`, "STRONG_BUY"-style labels, and any automated sizing output are for the family office's own decision-making. If this system's outputs are ever shown to, or acted on by, anyone outside the immediate family/entity ownership, it brushes against SEBI Investment Adviser regulations — get a compliance read before that happens. This is a one-line reinforcement of the original review's point, not a new position.

### 6.2 Data licensing & ToS
Per Section 2/SRC-0: no adapter scrapes a website whose terms prohibit it. Where a source's official API/subscription doesn't yet exist or isn't procured, the corresponding signal ships as a manual-import path or is simply absent, never silently scraped as a stopgap. Budget for the licensing cost of Trendlyne's API tier and any options-chain data vendor as part of the Phase 7 build estimate, not as an afterthought.

### 6.3 Copyright & content reproduction
News ingestion (SRC-3) stores headlines, short snippets, structured metadata (event type, entity, sentiment score), and a link back to the original publisher — never full article text. The UI links out to the source for the user to read the full piece; the system's own storage and display footprint is metadata, not republished journalism.

### 6.4 Misinformation & manipulation resilience
SRC-4's manipulation-risk discount is the primary control here, but it's reinforced by a platform-wide principle: **no single social/news event alone can move `ConvictionScore` enough to change a sizing decision.** A coordinated post storm can move `RetailSentimentScore` (one component, capped weight); it cannot, by itself, produce a high fused conviction, because the fusion requires independent corroboration across technical/fundamental/flow components that a social campaign can't fabricate.

---

## 7. UPDATED REVIEW VECTORS (append to the existing 10 in the master spec §8)

11. **Source ToS Compliance:** Verify no production adapter accesses a `REQUIRES_REVIEW`/`PROHIBITED` source on an automated schedule; confirm licensing status of every live adapter matches `data_sources.tos_status`.
12. **Entity Resolution Precision:** Sample news/social events attached to an ISIN and verify the attachment is actually about that company, not a name collision or sector mention.
13. **Sentiment Manipulation Blind Spots:** Confirm the manipulation-risk heuristic is actually suppressing scored sentiment on synthetic/spiky volume patterns, not just logging a flag nobody reads.
14. **Conviction Score Reconstructability:** Pick any historical date/symbol with a shown `ConvictionScore` and verify it can be exactly rebuilt from `audit_ledger` + component calibration records as of that date.
15. **Component Weight Drift:** Verify per-component weights in the fusion formula are being updated from calibration data on the intended cadence, not hardcoded once and forgotten (the same complacency risk the original review flagged for the self-learning engine's static weights).
16. **Recommendation/Information Boundary Leakage:** Audit the Opportunities Hub feed and confirm nothing below its `MIN_N`/calibration gate has leaked into the ranked, actionable list (Section 5).

---

## 8. MASTER BUILD SEQUENCE — PHASE 7 INSERTION

Extends the existing 13-step sequence in `dev_spec_opportunity_engine.md` §10:

| Order | Item(s) | Why this position |
|---|---|---|
| 13 (unchanged) | LEAD-1, LEAD-2, LEAD-3 | As originally sequenced — last of the pre-existing build. |
| 14 | SRC-0, SRC-1, Section 2 `data_sources` registry | Establishes provenance/compliance scaffolding before any new external adapter is written; zero external dependency itself. |
| 15 | SRC-3 (news pipeline), SRC-7 (broker research) | Lowest-risk, highest-compliance-clarity sources (RSS/official feeds, own-broker research entitlements) — ship first. |
| 16 | SRC-2 (fundamental cross-validation), SRC-5 (Trendlyne/Moneycontrol corroboration) | Requires licensing decisions (Section 6.2) but no novel validation methodology beyond what SRC-8 defines. |
| 17 | SRC-6 (options analytics) | Gated by LEAD-2 lead-lag validation before any component is scored — sequence after the validation framework is proven on simpler sources. |
| 18 | SRC-4 (social sentiment) | Deliberately last and most cautious — highest manipulation risk, lowest reliability tier, smallest starting weight ceiling. |
| 19 | SRC-8 (reliability scoring/conflict resolution) | Needs at least two live sources with real disagreement history to tune against — build after 15–18 produce actual data. |
| 20 | Section 4 (Unified Conviction Score fusion + its own `MIN_N` gate) | The capstone — deliberately sequenced after every component has its own independent calibration track record, mirroring why OPP-1 was sequenced last in the original plan. |

**Do not expose `ConvictionScore` in the Opportunities Hub, and do not let it feed OPP-1 sizing, before step 20's own acceptance criteria are met independently of the components' individual gates.** Same severity as the existing "do not build OPP-1 before steps 1–10" rule — a fused score is a new claim requiring its own evidence, not something that inherits trust from its ingredients.

---

## 9. BOTTOM LINE

The existing v3.0 architecture and its 6-phase dev spec already do the hard, unglamorous work — calendar correctness, decimal precision, staleness handling, idempotency, calibration, walk-forward validation — that most "AI trading" builds skip. This addendum's only job is to make sure that when the system starts listening to Moneycontrol, Trendlyne, Screener, news wires, and social chatter, **that same discipline extends to the new inputs instead of being quietly bypassed because the new data feels compelling.** A high Conviction Score should mean the same thing whether it came from a clean technical breakout or a fused blend of six sources: this specific number has been checked against what actually happened, enough times, to be trusted with the family's capital — and if it hasn't been checked yet, the UI says so instead of pretending otherwise.
