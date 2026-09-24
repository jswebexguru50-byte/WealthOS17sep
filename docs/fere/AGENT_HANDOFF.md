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

- Python unit tests: 7 passed at the latest checkpoint.
- TypeScript: `npx tsc --noEmit` passed at the previous checkpoint.
- Six-company validation used holdings `AKIKO`, `ALPEXSOLAR`, `ANLON` and technical candidates `RUBYMILLS`, `LXCHEM`, `USHAMART`.
- `USHAMART` had verified partial FY26 data: revenue INR 36,910.6m, PAT INR 4,663.1m, EBITDA INR 7,570.9m, CFO INR 6,553.4m, revenue growth 6.24%, PAT growth 14.76%, EBITDA margin 20.51%, CFO/PAT 1.405.
- The other five cards were `DATA_INSUFFICIENT`; missing evidence remained missing.
- A live official-source retry exposed excessive PDF downloading. The collector now prefilters announcement subjects, examines at most 100 announcements, and downloads at most 5 relevant attachments per company during batch refresh. Remaining official documents stay discoverable for an on-demand review.
- The guarded live retry completed for `USHAMART` on 2026-09-23. It stored a verified 2026-06-30 shareholding snapshot (promoter 40.28%, public 59.60%, pledge unavailable), archived one announcement response and 20 relevant attachments, found no narrowly classified governance/credit event, and produced review-only management claim candidates. The rebuilt card recorded promoter holding as the only change from its prior revision.
- Official shareholding submission dates are normalized to ISO before storage so card freshness comparisons remain chronological.

## Checkpoints

- `6955ced` — verified zero-LLM FERE evidence pipeline.
- `c231579` — practical incremental FERE company checker.
- `fa4feb4` — expanded Company Card sources and workflow.
- `4deec67` — safe announcement prefilter, download cap, and this persistent handoff.

## Resume checklist

1. Run `python -m unittest scripts.fere.test_company_checker`.
2. Run `npx tsc --noEmit`.
3. Validate and push the source-coverage panel/catalog, which separates official/primary sources from Screener discovery data.
4. Run the broader selected-universe scan, inspect results, then make and push the final checkpoint.

## 25-company holdings pilot

- Selection rule: top current-value INR holdings whose ISIN begins `INE` and whose symbol matches an NSE-safe symbol format; fund, insurance, US and unresolved entries are excluded rather than force-matched.
- First attempted cold run showed that 20 inline attachments per company was unsuitable for batching and was stopped safely after archived writes. The cap is now 5 per company before the timed retry.
- Pilot symbols: `AKIKO, APOLLO, MUFIN, BLUEWATER, TEMBO, OBSCP, KALYANI, MRP, BLS, GPECO, ANLON, SOLARINDS, COSMICCRF, ANNU, ORIANA, LAURUSLABS, SONUINFRA, ALPEXSOLAR, INVICTA, HIRECT, UNOMINDA, SJLOGISTIC, POLYCAB, JGCHEM, BHARTIARTL`.
- Local UI safety: `server.ts` now accepts `BIND_HOST`; use `BIND_HOST=127.0.0.1` for local viewing so portfolio data is not exposed on the LAN.
- UI issue found during demonstration: `#analyze` displayed the Opportunity Engine even though `App.tsx` maps `ANALYZE` to `MasterQuantDossier11TabsView`, where the `FERE 360°` button lives. The card API and USHAMART result exist, but this route/render mismatch needs correction before the demonstration path is reliable.
- Fast-track refresh: `--fast-card` reuses archived financial XBRL and refreshes official shareholding plus announcement metadata. PDF extraction is off by default and enabled only with `--deep-evidence`. Existing shareholding XBRL and announcement attachments are reused from the archive. The UI refresh endpoint invokes `--fast-card`.
- Overnight runner: `scripts/fere/run_overnight_fetch.py` processes eligible INR holdings first and the archived official Nifty 500 next, de-duplicates symbols, uses batches of 25, checkpoints every batch, resumes completed batches, applies a 45-minute batch timeout, and fails integrity when any card reports nonzero `synthetic_values` or `ghost_sources`.
- Overnight progress: `data/fere/verified_filings/overnight_progress.json`. Log: `data/fere/verified_filings/overnight_fetch.log`. Generated evidence/progress files remain local and are not committed.
- Full-population continuation: after holdings and the official Nifty 500 file, the runner continues through every remaining active NSE/`INE` identity with a valid uppercase exchange symbol. Official endpoints remain the authority; unavailable or unmatched identities stay missing.
- Self-healing: `run_overnight_watchdog.py` restarts the resumable runner until all batches complete. Completed batches are skipped, failed/timed-out batches are retried, and progress writes are atomic. `generate_status_report.py` refreshes JSON and Markdown status reports after each batch.
- Existing work is reused: archived discovery responses, filing documents, shareholding XBRL and announcement attachments are checked before download. As of 2026-09-24 the store contains 87,929 verified XBRL facts across 1,146 ISINs and 8,973 archived files (691,316,638 bytes), with zero card integrity violations.
