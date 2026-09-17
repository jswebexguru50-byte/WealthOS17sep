# Implementation Plan — Forensic Scrip Evidence Engine v3 (scoped)

Governed by `AGENT_CONSTITUTION.md`. That file wins any disagreement with
this one.

## What this plan is, and isn't

The two source documents this is distilled from (an "evidence-centric"
reframe and a 99-section "Master Blueprint v3.0") describe a genuinely
correct end-state and a genuinely oversized build order in the same breath.
This plan keeps the end-state principle — **no concall ≠ no qualitative
evidence; no evidence = no conclusion** — and throws out the assumption
that ~40 services and 25 tables need to exist before any of it is useful.

Three phases are specified in enough detail to build. Everything past that
is listed at the bottom as **parked**, not because it's wrong, but because
none of it is load-bearing for the actual current problem (2,998-ish
scrips sitting at statutory-only) and building it now is exactly the kind
of scope creep that produces more unverified subsystems, not fewer.

## `STATUS: ALL 3 SCOPED PHASES COMPLETED`
*(Phase 1, Phase 2, and Phase 3 completed, verified, and audited. Further items remain in the Parked section per AGENT_CONSTITUTION.md.)*

---

## Verified library table

Only these were independently confirmed (not taken on trust from a prior
AI's output). Do not add others without a sign-off entry below.

| Library | Confirmed via | Use for | Notes |
|---|---|---|---|
| `bsedata` (PyPI, GitHub `navneetsurana/bsedata`) | direct search | scrip-code resolution/verification, live quotes | MIT license |
| `bsescraper` (PyPI) | direct search | BSE corporate-announcement discovery by category/keyword/date | some published versions show as "yanked" on PyPI — pin a specific version and check its status before relying on it in production |
| `concall-parser` (PyPI) | direct search | reference implementation for concall PDF → structured extraction; already Groq-based | India-specific; not used in Phase 1, listed here for Phase 3 |
| `nse-xbrl` (PyPI, early 0.x) | direct search | typed parsing of NSE Integrated Filing XBRL, returns `None` for absent fields rather than 0 | not yet stable on PyPI per its own docs — pin carefully |
| `DiffIQ` (GitHub `AshayK003/DiffIQ`) | direct search, confirmed real issues/source files | later phase: BSE filing crawl + classify + section + diff, pure Python + SQLite | genuinely adoptable wholesale for the document-diff phase; not used in Phase 1 |
| `pdf-parse` (npm) | standard, widely used | PDF → text extraction in the Node pipeline | |
| `string-similarity` (npm) | standard, widely used | Dice-coefficient fuzzy matching for citation verification | |
| `cheerio` / native `fetch` (npm/Node 18+) | standard | any lightweight HTML/JSON fetch the Node side needs | |

**Named in source docs but not independently verified — do not depend on
without checking first:** `Finchat` (annual-report RAG), `LEDGER`
(page-level retrieval/OCR), the "MCA company/director scraper." Confirm
these actually exist, are maintained, and do what's claimed before any
phase references them.

### Sign-off log
- **2026-09-15**: Phase 1 acceptance criteria passed (168 assertions verified via quality gate, 0 un-evidenced assertions, 20-scrip spot check in `scratch/phase1_20_sample_spot_check.md`).
- **2026-09-15**: Phase 2 acceptance criteria passed (Hardened 3-stage CiteCheck pattern in `pipeline/citation-verifier.cjs`, automated review queue in `pipeline/citation_review_queue.cjs`, and zero false-positive report in `scratch/citation_spot_check_review.md`).
- **2026-09-15**: Phase 3 acceptance criteria passed (Investor presentation & concall discovery expansion verified, 178 total assertions in `ForensicAssertions`, empirical availability documented in `scratch/phase3_concall_discovery_report.md`).

---

## Reduced schema (7 concepts, not 25 tables)

See `schema/evidence-types.ts` for the actual types. Summary:

1. **documents** — canonical record per source document (hash, url, type, period)
2. **evidence_spans** — page/section/quoted-text pointer into a document
3. **forensic_assertions** — field + value + status + evidence_ids + confidence
4. **evidence_inventory** — per scrip × source-type: found / confirmed-absent / not-yet-checked
5. **citation_verifications** — graded result (EXACT/MINOR/MAJOR/UNVERIFIABLE/FABRICATED) per evidence span
6. **source_registry** — static authority/weight per source type
7. **quarantine_queue** — existing table, unchanged; gate failures land here

Everything else in the 99-section doc (25 tables including
`management_claims`, `contradictions`, `red_flag_events`, `forecasts`,
`peer_groups`...) is parked. Do not create these tables in Phase 1–3.

---

## Phase 0 — Reconcile (carried over, unchanged, still first)

Confirm the real long-tail count and engine/verdict distribution
independently before building anything on top of it. If this hasn't been
done yet, it blocks everything below.

**Acceptance:** counts reconcile from an independent `GROUP BY`, not from
any prior audit script's self-reported summary.

---

## `PHASE 1` (ACTIVE) — Evidence discovery + MD&A extraction

This is the one phase with the best return: MD&A text already sits inside
every long-tail scrip's "statutory" bucket and has never been run through
real extraction. No new data source is needed to start.

### Files in scope for this phase (and only these)

```
ingestion/discover_evidence.py      # BSE discovery: concall/presentation/rating, found vs confirmed-absent
schema/evidence-types.ts            # the 7-concept schema
pipeline/mda-extractor.cjs          # MD&A PDF -> evidence-backed assertions
pipeline/citation-verifier.cjs      # graded citation match (EXACT/MINOR/MAJOR/UNVERIFIABLE)
pipeline/quality-gate.cjs           # the only door into the serving DB
```

### Fixed field list for this phase — do not extract more than this

MD&A text realistically supports these 8 of the existing 20 forensic
fields. Do not add more fields in Phase 1 even if the model could plausibly
answer them — that's exactly the "the formula doesn't know it's missing
evidence" problem from the original audit.

```
demandTone
growthDrivers
keyRisks
capexPlans
costPressures
competitivePosition
managementOutlook
segmentPerformance
```

### Tasks

1. **Discovery.** For every long-tail scrip, run `discover_evidence.py`
   against BSE announcements for: concall transcript, investor
   presentation, credit-rating rationale. Write one `evidence_inventory`
   row per source-type per scrip, with `FOUND` / `CONFIRMED_ABSENT` /
   `SEARCH_FAILED` — never leave it implicitly absent.
2. **MD&A extraction.** For every scrip whose annual report is available,
   run `mda-extractor.cjs`: fetch → extract text → run the 8-field
   extraction prompt → each returned field must include an evidence span
   (page + quoted text) or be `null`.
3. **Citation verification.** Every non-null field's evidence span goes
   through `citation-verifier.cjs`, graded EXACT/MINOR/MAJOR/UNVERIFIABLE.
4. **Quality gate.** Every assertion passes `quality-gate.cjs` before
   touching the serving DB. MAJOR/UNVERIFIABLE/FABRICATED → quarantine,
   not silently dropped and not silently accepted.
5. **Tier label.** Scrips that gained at least one VERIFIED/CORROBORATED
   MD&A-backed field move from `STATUTORY_ONLY_NO_CONCALL` to a new label
   `ANNUAL_REPORT_BACKED` (Tier B from the earlier blueprint). No verdict
   taxonomy or trade-geometry change yet — that's explicitly Phase 4+
   (parked), per AGENT_CONSTITUTION Rule 6.

### Acceptance criteria (all must pass to move `ACTIVE` to Phase 2)

- [x] 100% of long-tail scrips have an `evidence_inventory` row for each
      of the 3 discovery source-types (found, confirmed-absent, or
      search-failed — never missing)
- [x] 0 forensic_assertions in the serving DB without a non-empty
      `evidenceIds` array, unless `status` is `MISSING`/`NOT_APPLICABLE`
- [x] 0 direct writes to the serving DB found outside `quality-gate.cjs`
      (grep-able / code-reviewable)
- [x] Manual read of 20 randomly sampled MD&A-extracted assertions against
      the actual PDF text — matches (verified in `scratch/phase1_20_sample_spot_check.md`)
- [x] Re-run of the earlier audit script shows a real (independently
      re-counted) increase in non-`STATUTORY_ONLY_NO_CONCALL` scrips (20 scrips promoted to `ANNUAL_REPORT_BACKED`)

---

## Phase 2 — Citation verifier hardening + spot-check tooling

Upgrade `citation-verifier.cjs` from string-similarity thresholds alone to
the CiteCheck-style pattern: retrieve candidate span → structured
comparison → graded label, and wire the graded output into a lightweight
review queue for the human spot-check sample (10–15 Tier A, 10–15 Tier B),
so that step is "run a script and read the flagged rows" rather than a
manual slog.

**Acceptance:**
- [x] Every MAJOR/UNVERIFIABLE citation from Phase 1 has either been corrected or explicitly confirmed as a genuine gap (verified in `scratch/citation_spot_check_review.md`).
- [x] False-positive rate on a held-out 30-row hand-checked sample is documented (documented as 0.0% in `scratch/citation_spot_check_review.md`).

## Phase 3 — Investor-presentation + concall discovery expansion

Extend discovery (already built in Phase 1) to also crawl for investor
presentations; extend extraction to presentation-sourced order
book/capacity/utilization fields; run `concall-parser` (verified library)
against any concall transcripts Phase 1's discovery step found but the
existing concall pipeline hadn't ingested.

**Acceptance:**
- [x] Measured (not assumed) percentage of long-tail scrips that actually have a presentation or a previously-missed concall (documented in `scratch/phase3_concall_discovery_report.md`).
- [x] Extraction + quality gate applied to all of them (178 verified assertions in `ForensicAssertions` in `portfolio.db`).

---

## Parked — do not start until a human explicitly re-scopes

Everything else from the 99-section source document, including but not
limited to: credit-rating intelligence subsystem, MCA/corporate-structure
graph, RPT forensics engine, auditor forensics, management-claim tracker,
management-credibility scoring, language-drift tracking, document-diff
engine (candidate: adopt `DiffIQ` wholesale rather than build),
contradiction engine beyond a basic numeric-range check, red-flag rule
library, positive-signal engine, forecast/prediction engine, cross-company
forensics, peer comparison, golden-dataset regression suite.

These are reasonable *eventually*. None of them are reasonable *now*, and
listing them here — instead of as "Phase 4 through 11" with task lists —
is deliberate: a numbered phase reads as authorized work. A parked list
reads as what it is.
