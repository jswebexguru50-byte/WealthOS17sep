# Eight-strategy code review — 22 November 2026 bundle

Reviewed: `EightStrategy_Scan_Code_and_Specs_2026-11-22.zip`, packaged `strategies.mjs`, scan engine, generated spec and S5a definition. This is a static review; no database was included, and no backtest or full test suite was run. Line references below refer to paths inside the archive. The bundle is a dated snapshot; verify against the live checkout before implementing. No strategy change is authorized by this review.

## Findings requiring attention

1. **S4a reports a signal-day open entry using close-dependent information (strategies.mjs:402–432).** Filters include that day's close above the moving averages and the Nifty 500 close above its averages. The reported entry is the same day's open × 1.002. It cannot generally be known at that price once the close-dependent conditions are known. Split the opportunity into a hypothetical intraday rule with intraday-available data and a separately tested next-session rule. Do not treat the current historical entry as executable.

2. **S5a's trigger can fire without reaching its entry (strategies.mjs:567–577).** It tests current high > pivot but reports entry = 1.002 × pivot. A high between these values triggers the strategy without touching the stated entry. Furthermore Stage 2 and the signal bar's values are known at close, after a same-day breakout. Record detection time and observed entry touch separately; define a testable order convention with owner approval.

3. **S3a does not prove higher lows as described (strategies.mjs:303–329).** `lastLow = -Infinity`, and the first eligible local low increments `hlCount`; only one is required. Two compared higher lows are therefore not required. Highs and lows need not alternate, and earlier rejected lower pivots do not update the comparison. Compare actual pivot sequence to intended definition using synthetic charts. Two right bars confirm pivots, so use only after confirmation.

4. **S2a returns an older signal with calculations made on the later evaluation date (strategies.mjs:236–285; engine:191–220).** It searches seven bars, but `vol20avg` uses the end of the evaluation slice and the engine computes ATR at that slice's end. The engine evaluates newest first and deduplicates on signal date. Thus a retained past signal can carry a volume ratio and stop calculated using later bars, and a signal that has aged out of the lookback may instead be retained from an earlier evaluation. This is not a point-in-time representation. Preserve actual evaluation date and calculate each reported signal's metrics from data available on its signal date; treat later recomputation as a separately dated observation. Do not infer that entry was executable on the signal close.

5. **S2a does not check intervening invalidation of the FVG (strategies.mjs:244–270).** It tests only the selected test bar against the gap, not whether the gap was previously filled or invalidated. Whether this is incorrect depends on the owner's precise definition. Test cases should cover touch, full fill, close below and recovery. Its 'institutional' label is an interpretation: volume alone does not establish institutional participation.

6. **S4a1 evaluates a historical gap's volume against the latest 20-bar average (strategies.mjs:686–708).** The average includes bars after the gap and the gap day. It is available on the current evaluation date, so this is not automatically look-ahead at that date, but it is not a gap-day point-in-time baseline and the interpretation changes as later volume changes. Compare against the intended rule; separately test pre-gap baselines as experimental variants.

7. **S4a historical evaluations use current market cap (strategies.mjs:368–370, 407–409).** `MasterTickers.mcap_cr` is not date-indexed. Historical results can change with current market cap and are unsuitable for point-in-time backtesting unless historical membership and market cap are supplied. Missing or non-NSE identifiers also fail the rule.

8. **Universe and minimum-history counts can overstate actual evaluation (engine:58–61, 115–120, 191–197).** Symbols ending -BE/-SM are removed from the set. Names with 30–59 bars are cached, but the common loop skips all strategies until 60 bars even where individual functions need only 30 or 40. Audit against the claimed 1,521 universe and actual data before quantifying exclusions. Report eligible/evaluated/skipped by strategy and date.

9. **Stop/target and risk meaning (engine:98–110).** `max(min(patternStop, entry − 2.5 ATR), 0.92 entry)` widens to at least 2.5 ATR unless the 8% floor tightens it. It can override structural stops, and the target is then recomputed from the overridden stop. Retain original and final values, risk and binding reason. Verify whether levels are coherent for every signal; price gaps can produce losses beyond the indicated stop. Any behavior change requires approval.

10. **S1a ATH and setup timing (strategies.mjs:115–127).** The ATH is the maximum high across all loaded history through the evaluation/entry session, not necessarily the historical ATH at the earlier setup date, and completeness of upstream history is unknown. Do not describe it as a verified lifetime ATH. The entry check uses the day's high, while entry-day RSI is known only after the close; first determine when a real decision can be made. Zero signals alone is not proof of a defect.

11. **S4b and S4b1 share the signal bar in their volume average (strategies.mjs:438–455, 743–766).** A high-volume signal elevates its own 20-bar comparison baseline. This is a valid defined rule if intended, but differs from 20 prior sessions. Assess the intended convention. S4b1 also needs 200 closes in practice because `ema(closes, 200)` returns null otherwise despite an initial 60-bar guard.

12. **S5a pattern semantics (strategies.mjs:542–571).** The code requires three contractions and only the last to be smaller than both others; the first two need not decline in sequence. Each is 3–5 bars and requires both up and down candles. This is a narrow operational definition, not proof that it identifies all VCPs. The stage template's '52-week' range can be calculated from 220–251 bars when less than 252 exist. Label actual coverage.

## What to do to improve candidate selection

Start with data integrity, correct signal timing, explicit signal lifecycle and stock-specific liquidity. Test the existing strategy families independently, without treating correlated gap variants as multiple independent votes. Examine whether adding fundamental quality, valuation, relative strength or volume information improves net out-of-sample outcomes after costs. These are proposed research questions, not proven improvements or approved filters. Backtest first, then run paper signals and validate operational behavior. Use human review for governance and business quality; a technical signal does not establish either.

## Prioritised implementation in the parallel scan

1. Ingest exact run IDs and both evaluation and signal dates. Preserve scanner levels and document when a rule became knowable. Flag S4a same-open and S5a entry-not-touched scenarios; do not invent fills. Reconcile actual evaluated universe and price coverage.
2. Display liquidity and corporate-action assurance. Preserve original and capped stops where available; where source outputs omit raw stops, label unavailable until instrumented.
3. Add point-in-time synthetic tests for S2a/S3a/S4a/S5a and timestamp behavior, then shadow baseline versus approved candidate fixes. Evaluate all strategies and portfolio overlap with realistic costs, chronological holdout, point-in-time membership and fundamentals.
4. Use TradingView charts/watchlists for manual quality review, not scripted extraction or an independent confirmation count. Compare exact session, exchange and adjustments when data disagree.

## Database cross-check after review

The main checkout's `portfolio.db` was subsequently located and opened read-only. Its current Tier1Universe version `2026-11-17` contains 1,521 distinct symbols and **zero** names ending `-BE` or `-SM`; therefore that specific code exclusion did not reduce this recorded universe. The common 60-bar gate still requires a strategy-level coverage audit. The adjusted table's latest date is 2026-11-20. These observations reflect the database as inspected, not a separately verified immutable scan snapshot.

For the nine saved S5a results, the signal-day high was at or above each reported rounded entry. Thus the trigger/entry mismatch is a real code-level edge case, but it did **not** occur in these nine saved examples. A touch still does not prove an executable fill.

For S2a, matching the saved results by symbol and signal date directly to the current adjusted table allowed 421 of 423 results to be compared. Recompute Wilder ATR using only bars up to the signal date and compare with the reported ATR: the saved results show widespread differences. Two direct matches could not be evaluated; alias mapping and changes to the database since the scan were not independently verified. The code's later-evaluation behavior provides a plausible explanation, but these comparisons alone do not establish the cause or quantify its effect on final stops. Use a frozen snapshot and the dedupe log for a definitive replay.
