# Comprehensive 29Q Dossier Completion Protocol

## Owner requirement

For YUKEN, BECTORFOOD, VMART, TATATECH, OPTIEMUS and ARROWGREEN, render one **independent** 29-question report per symbol. Every sub-question in `WEALTHOS_29Q_SIX_SCRIP_PROGRAM_SPEC_2026-10-10.md` §4 must reach a terminal state. A provider field by itself is never a complete answer.

The report may compare a company only with its direct peers, and only in Q3 and Q17. It must never borrow another selected company's data or narrative.

## Mandatory evidence ladder

For each sub-question, retain the raw item, URL or provider-response hash, retrieval time, period, scope, unit and source tier before synthesis:

1. existing canonical facts and stored evidence;
2. FERE/XBRL and exchange filings for statutory facts;
3. cached Trendlyne packs, then a gap-driven parameter call;
4. company annual report, results, presentation, official concall and exchange/regulator disclosure;
5. reputable secondary coverage as an explicitly labelled lead, never as a replacement for a primary fact.

`ANSWERED`, `PARTIAL` with a named gap/action, `NOT_DISCLOSED` with searched sources, and scope-approved `NOT_APPLICABLE` are the only permitted states. `INSUFFICIENT_DATA` alone is not a report answer.

## Evidence now acquired

The eight Trendlyne packs F01–F08 were fetched for all six symbols on 10 October 2026: 72 successful calls and no unavailable pack. They cover quarterly and annual history, balance sheet, cash/capital, return/quality, valuation, ownership and overview. Their raw responses are retained in the guarded working database copy; no production database was written.

The next run must first normalise and period-anchor those records. Do not request them again. Trendlyne catalogue discovery then determines the *named missing tokens* for each open sub-question. The provider supports at most ten symbols and the actual safe metric batch size must be measured and stored; do not assume the requested fifty-metric limit without a successful probe.

## Primary-source acquisition register

| Symbol | Required first primary documents |
|---|---|
| YUKEN | [Investor hub](https://www.yukenindia.com/investors/), [FY25 annual report](https://www.yukenindia.com/wp-content/uploads/2025/08/Annual-report.pdf), [NSE FY25 annual-report filing](https://nsearchives.nseindia.com/corporate/YUKEN_18082025210001_Notice_and_AR.pdf) |
| BECTORFOOD | [Investor hub](https://www.bectorfoods.com/investors), [FY25 annual report](https://www.bseindia.com/xml-data/corpfiling/AttachLive/762e31b2-bb4f-4c6f-a670-3393e71842c1.pdf), [FY25 iXBRL filing](https://nsearchives.nseindia.com/corporate/ixbrl/INTEGRATED_FILING_INDAS_95804_29052025175744_iXBRL_WEB.html) |
| VMART | [Annual-report archive](https://www.vmart.co.in/gallery/annual-report), [results and disclosures](https://vmart.co.in/results-disclosure/), [official call transcripts](https://vmart.co.in/conference-call-transcripts/) |
| TATATECH | [FY25 annual report](https://ttlwebassets.tatatechnologies.com/app/uploads/2025/05/Annual-Report-FY-2024-25.pdf), [FY25 iXBRL filing](https://nsearchives.nseindia.com/corporate/ixbrl/INTEGRATED_FILING_INDAS_87059_25042025220709_iXBRL_WEB.html), [official call transcript](https://ttlwebassets.tatatechnologies.com/app/uploads/2025/01/Earnings-Call-Transcript.pdf) |
| OPTIEMUS | [FY25 annual report](https://www.optiemus.com/pdf/Optiemus_Annual_Report_2025.pdf), [annual-report archive](https://www.optiemus.com/annualreport.html), [FY25 iXBRL filing](https://nsearchives.nseindia.com/corporate/ixbrl/INTEGRATED_FILING_INDAS_93912_26052025185511_iXBRL_WEB.html) |
| ARROWGREEN | [Investor portal](https://www.arrowgreentech.com/investor-relationship.html), [FY25 annual report](https://nsearchives.nseindia.com/annual_reports/AR_27988_ARROWGREEN_2024_2025_A_3875999_30082025225724.pdf), [FY26 Q1 presentation](https://arrowgreentech.com/images/presentation/2025-26/AGTL%20Investor%20Presentation%20Jun%202025.pdf) |

## Enforced sequence

1. Resolve security identity and premise checks per symbol.
2. Convert the eight cached packs into period/scope/unit-anchored facts and produce a sub-question readiness ledger.
3. Reconcile every numerical claim against FERE/XBRL. Retain conflicts; do not overwrite statutory values.
4. Fetch the registered primary documents only for still-open sub-questions; persist as research items with excerpts and source tiers.
5. Use secondary research only to locate or cross-check primary evidence.
6. Freeze one evidence bundle per symbol. Run a separate drafting agent and an independent review agent against that bundle only.
7. Run claim validation, cross-scrip leakage checks and the completeness gate. Rework failed answers, then archive the accepted report immutably through the guarded database route.

## Existing implementation gaps to close

- Build an evidence-driven gap planner rather than a fixed metric map.
- Promote the eight-pack snapshots to canonical V2 facts only after identity, period, scope, unit and source validation.
- Implement the statutory-first reconciliation pass for the six symbols.
- Add a controlled primary-source executor that feeds the existing research-item import/store; no open-ended crawler.
- Produce actual frozen bundles, drafter/reviewer artifacts and independent reports rather than only framework tests.
- Add the executive seven-filter scorecard. The specification defines seven filters, not eight; the eighth must be supplied by the owner or an authoritative strategy-scan file and must not be invented.

## Publication standard

The current expanded Trendlyne report is a useful provider-evidence baseline, not the investor-ready final release. The final release is permissible only after the sequence above completes for the individual symbol and the validator/reviewer record is stored with it.
