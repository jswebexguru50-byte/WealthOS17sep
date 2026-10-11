# Four-Minute 29Q Report SLA

## Decision

An investor-facing 29-question report must render in **four minutes**, with a hard ceiling of **five minutes**, once its issuer evidence packet has been prepared.  A report run must never perform broad web searches, download annual reports, enumerate provider fields, or wait for a regulatory website.  Those are acquisition jobs, not report-generation work.

This separates the previous 60-90 minute first-time research exercise into two products:

1. **Evidence refresh** — asynchronous, cacheable and resumable. It refreshes only changed source documents and unresolved questions.
2. **Report render** — synchronous. It reads one frozen, validated packet and creates the readable 29Q report, an independent review, and a validation manifest.

## Service-level budget

| Step | Maximum | Rule |
|---|---:|---|
| Resolve issuer / load latest approved bundle | 15 sec | Local database only. |
| Deterministic calculations and reconciliation | 30 sec | No provider or internet call. |
| Draft all 29 questions from the frozen packet | 120 sec | One structured draft request, not 29 separate requests. |
| Independent claim and completeness review | 75 sec | Review the claim IDs and citations, not raw documents. |
| Render Markdown/HTML/PDF-ready output and persist | 30 sec | Local write through the guarded route. |
| Buffer / retry | 30 sec | One retry only; otherwise publish the last accepted report with a dated freshness warning. |
| **Total** | **300 sec** | **Five-minute hard ceiling.** |

## What must be precomputed

For every covered symbol, the refresh worker maintains a single `evidence packet` containing:

- identity, ISIN, legal name and source aliases;
- latest statutory quarterly and annual XBRL facts, with prior periods for trends;
- the cached Trendlyne packs and their retrieval timestamp;
- a compact primary-document extract library: annual report, results release, presentation, transcript, shareholding and rating rationale;
- one source-backed claim record per factual statement, including period, scope, unit, source hash and locator;
- a 29-question/sub-question readiness ledger; and
- a conflict ledger. Provider and statutory values are both retained; they are never silently overwritten.

The report service receives only this compact packet. It does not receive raw PDFs, provider catalogues or open-ended search access.

## Refresh policy

Refresh runs outside the user request path:

- **Daily after results hours:** NSE/BSE XBRL, exchange disclosures and shareholding change detection.
- **Weekly:** Trendlyne packet refresh only for fields mapped to an open 29Q sub-question or current valuation/ownership snapshot.
- **Event driven:** annual report, results, investor presentation, concall transcript, rating action, SEBI/NCLT event, or a material corporate announcement.
- **Gap driven:** a narrowly scoped official-source query only when a required sub-question remains `NOT_DISCLOSED` or `PENDING_PRIMARY_SOURCE`.

Each refresh promotes only verified facts and extracts. It updates the readiness ledger, then freezes a new immutable packet. A prior accepted packet remains reportable while an update is being collected.

## Report behaviour when evidence is incomplete

The report must still complete inside the SLA. It must show a precise terminal state for each sub-question:

- `VERIFIED` — supported by a cited, period/scope-appropriate source;
- `PROVIDER_ONLY` — retained from Trendlyne with timestamp and marked as awaiting reconciliation;
- `NOT_DISCLOSED` — prescribed sources were checked and did not disclose it;
- `PENDING_PRIMARY_SOURCE` — an acquisition job is queued; or
- `OUT_OF_SCOPE` — only for the agreed fundamental-only exclusions.

It must not label the whole report “insufficient” and must never wait for a missing source during the five-minute run.

## Efficient LLM use

The current model should receive one JSON packet with claim IDs, calculations and excerpts, and return a structured response for all 29 questions in one call. A second, smaller reviewer call receives the draft plus the claim index and may only approve, reject or request a rewrite by claim ID. The deterministic validator rejects uncited numbers before publication.

This replaces repeated broad prompts and prevents a model from re-reading hundreds of pages for every report.

## Acceptance test

For YUKEN and each subsequent issuer, measure the wall-clock time from selecting an already-frozen packet to writing the reviewed report. The test passes only if it:

1. finishes in at most 300 seconds;
2. makes zero network/provider calls during render;
3. contains all required sub-questions with a terminal evidence state;
4. validates every numerical claim against the packet; and
5. preserves a clear freshness date and a linkable source index.

## Transition for the YUKEN pilot

The current YUKEN work is the one-time packet build. Its next report will use the archived NSE XBRL series, the captured Trendlyne packet, FY25 annual report and CARE rationale. The missing FY26 annual report, current rating rationale and regulatory-search evidence remain asynchronous gap jobs. They must improve the next packet; they must not delay the first properly qualified report.
