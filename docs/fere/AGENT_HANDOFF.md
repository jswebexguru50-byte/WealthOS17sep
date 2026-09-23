# FERE Company Card — Agent Handoff

Last updated: 2026-09-23 (Asia/Dubai)
Branch: `ai-review`
Repository: `https://github.com/jswebexguru50-byte/WealthOS17sep.git`

## User objective

Build a practical, zero-LLM FERE Company Card and keep all code, findings, and strategy changes in GitHub. The card must ingest official evidence, show when data was revised, support an explicit refresh, track refresh progress, display three-year financial trends and changes since the previous card, monitor governance and credit events, and provide a human review flow for management commitments.

## Required operating rules

- Save and push a checkpoint every few minutes during active work.
- Never fabricate missing values or infer fraud.
- Only an explicit reviewer decision (`ACCEPT`, `EDIT`, or `IGNORE`) can move a detected management claim into the accepted ledger.
- Protect state-changing review and refresh endpoints with `FERE_REVIEW_TOKEN`, supplied through `x-fere-review-token`.
- Treat Screener as a discovery/triangulation source. A fact becomes verified only after matching an official exchange, regulator, issuer filing, or rating-agency source.
- Do not commit generated databases, archived downloads, reports, `__pycache__`, or unrelated dirty files.

## Implemented architecture

- `scripts/fere/company_check.py`: incremental card builder, three-year trends, previous-card comparison, accepted-commitment evaluation, and evidence-backed status.
- `scripts/fere/management_claims.py`: deterministic claim candidates and reviewer-controlled accepted commitment ledger.
- `scripts/fere/red_flags.py`: explicit deterministic red-flag rules with no synthetic composite score.
- `scripts/fere/run_company_checks.py`: 4–8 worker scan, targeted refresh, progress stages, and card build.
- `scripts/fere/official_company_sources.py`: official NSE shareholding/XBRL and corporate-announcement ingestion, exact pledge tags, narrow event classification, source archiving, and candidate extraction from relevant PDFs.
- `scripts/fere/verified_filing_pipeline.py` and `scripts/fere/normalize_nse_xbrl.py`: verified filing ingestion and normalized facts.
- `src/server/services/FereEvidenceService.ts`: card, refresh-job, claim-candidate, and review-decision services.
- `src/server/routes/forensicRoutes.ts`: protected refresh/review routes and read APIs.
- `src/components/FereForensicDeepDiveModal.tsx`: non-technical card UI, revised date, refresh progress, review controls, trends, changes, events, flags, commitments, missing information, and evidence links.

## Database records

The local SQLite workflow uses these FERE tables: `company_check_state`, `company_check_result`, `company_check_history`, `company_material_event`, `shareholding_snapshot`, `official_source_snapshot`, `management_claim_candidate`, `management_commitment`, and `company_refresh_job`.

## Official sources

- NSE financial-result XBRL and integrated financial filings.
- NSE Regulation 31 shareholding master and linked XBRL filings.
- NSE corporate announcements and relevant attachments.
- SEBI corporate-filings directory is a source catalogue/fallback reference.
- Planned fallbacks/expansion: BSE filings, MCA filings, SEBI orders, issuer investor-relations pages, and direct rating-agency releases.

## Latest validation and findings

- Python unit tests: 11 passed at the previous checkpoint.
- TypeScript: `npx tsc --noEmit` passed at the previous checkpoint.
- Six-company validation used holdings `AKIKO`, `ALPEXSOLAR`, `ANLON` and technical candidates `RUBYMILLS`, `LXCHEM`, `USHAMART`.
- `USHAMART` had verified partial FY26 data: revenue INR 36,910.6m, PAT INR 4,663.1m, EBITDA INR 7,570.9m, CFO INR 6,553.4m, revenue growth 6.24%, PAT growth 14.76%, EBITDA margin 20.51%, CFO/PAT 1.405.
- The other five cards were `DATA_INSUFFICIENT`; missing evidence remained missing.
- A live official-source retry exposed excessive PDF downloading. The collector now prefilters announcement subjects, examines at most 100 announcements, and downloads at most 20 relevant attachments per company.

## Checkpoints

- `6955ced` — verified zero-LLM FERE evidence pipeline.
- `c231579` — practical incremental FERE company checker.
- `fa4feb4` — expanded Company Card sources and workflow.

## Resume checklist

1. Run `python -m unittest scripts.fere.test_company_checker`.
2. Run `npx tsc --noEmit`.
3. Commit and push the announcement-prefilter fix plus this handoff file.
4. Retry a targeted live refresh for `USHAMART`; inspect shareholding, material events, claim candidates, refresh-job stages, and the generated card.
5. Add a source-coverage panel/catalog that clearly separates verified official sources from Screener discovery data.
6. Run the broader selected-universe scan, inspect results, then make and push the final checkpoint.

