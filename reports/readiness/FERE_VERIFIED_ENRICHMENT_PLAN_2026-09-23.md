# FERE: filing-backed, zero-LLM enrichment

Status: implemented in stages. **No complete FERE score is available yet.** The
legacy 3,559-score ledger remains preserved but blocked from the FERE API.

## Verified status snapshot — 23 September 2026

- Universe identities: 3,654
- Filing discoveries: 3,719
- Archived filing documents: 5,977
- Verified NSE XBRL facts: 80,921
- Verified formula metrics: 0
- Metric coverage records: 21,924 (21,921 insufficient; 3 not applicable)
- Authenticated non-filing evidence records: 0
- Latest visible collection-run progress: 100 of 3,019 securities

Focused validation passed: 7/7 TypeScript source-trust and intelligence-boundary
tests, plus 4/4 deterministic Python formula tests. These counts are an audit
snapshot of the local evidence database and logs, not a claim of completed
coverage. Publication remains blocked until every metric has complete,
period-comparable official inputs and exact input-fact lineage.

## Running local data path

1. `verified_filing_pipeline.py` seeds the 3,654-ISIN universe from
   `portfolio.db:MasterTickers`, stores immutable NSE discovery JSON and a
   capped number of recent NSE XBRL XML source files, each with source URL,
   retrieval time and SHA-256. HTTPS certificate verification stays enabled.
   It stops after eight consecutive source failures. A resumed run reuses
   archived discovery and files.
2. `normalize_nse_xbrl.py` extracts only exact known taxonomy fields. Each fact
   retains the original taxonomy field, context, scope, period, INR unit, NSE
   broadcast timestamp, document URL and hash. Historical/current ISIN
   differences are flagged `IDENTITY_REVIEW`; no ticker-only substitution.
3. `publish_verified_metrics.py` tests six pure formulas and stores a score only
   when every input is finite and period-comparable. It writes per-ISIN,
   per-metric missing-field coverage otherwise. Financial-sector industrial
   models are `NOT_APPLICABLE`. No LLM calls occur in any of these scripts.
4. The app API and FERE modal show source document links and partial coverage,
   but do not promote partial facts or the old score ledger to a verdict.

Permanent storage: `data/fere/verified_filings/fere_evidence.db`, with source
bytes in `data/fere/verified_filings/archive/`. Logs:
`reports/readiness/fere_verified_collect_stdout.log`,
`reports/readiness/fere_verified_collect_stderr.log`,
`reports/readiness/fere_normalize_stdout.log` and
`reports/readiness/fere_normalize_stderr.log`.

## Remaining coverage work (not silently inferred)

- Add the NSE **Integrated Filing–Financials** feed used for newer periods;
  the older financial-results endpoint may stop before current filings.
- Add official annual-report and cash-flow filings. Current financial-results
  XBRL often lacks receivables, inventory, payables, assets and operating cash
  flow, so Beneish, Piotroski, Sloan and CCC must remain unavailable until
  those exact fields are present.
- Add official shareholding and pledge filings separately. They cannot be
  inferred from Screener overview ratios or a past percentage.
- Resolve old/current ISINs from an archived NSE/BSE corporate-action record
  and effective date before merging the related filing histories.
- For each formula, store the specific input fact IDs rather than any nearby
  source values; hand-check sample companies and restatements before exposing
  investment verdicts.
- Confirm data-access terms and rate limits before increasing the collector's
  request rate or redistributing archived documents.

## Walk-the-talk (separate from FERE numerical scores)

Screener is a **link-discovery aid**, not proof that a transcript's text is
authentic or a management claim was delivered. Archive the actual transcript
PDF from the issuer/exchange or a verified linked publisher. Record the URL,
hash, call date, company ISIN, fiscal period and page number. Deterministic
extraction may capture numeric guidance with an explicit unit, time horizon and
metric; ambiguous statements remain `UNASSESSED`. Pair each dated guidance
claim with a later official annual/quarterly filing of the same metric and
scope; record the comparison, tolerance policy and both source links. No
guidance-accuracy percentage or letter grade is emitted without matched claim
and outcome IDs. Annual-report MD&A is a different document type, not a
substitute concall transcript.

## Official source entry points

- NSE financial results: https://www.nseindia.com/companies-listing/corporate-filings-financial-results
- NSE integrated financial filings: https://www.nseindia.com/companies-listing/corporate-integrated-filing
- NSE XBRL taxonomy: https://www.nseindia.com/static/companies-listing/xbrl-information
- NSE annual reports, financial-result and shareholding RSS directory:
  https://www.nseindia.com/static/rss-feed
- NSE shareholding patterns: https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern
- SEBI's NSE/BSE corporate filing directory:
  https://www.sebi.gov.in/curation/corporate_filings.html

The source document URL stored per filing is the numerical evidence. A generic
issuer profile, Screener overview, or one of the entry-point links above is not
field-level proof.
