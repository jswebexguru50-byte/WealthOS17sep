# Developer handoff: eliminate synthetic and unverified production data

Date: 2026-09-22. Repository: `webapp_portable_release`. This handoff accompanies `APP_SYNTHETIC_DATA_CRITICAL_REVIEW_2026-09-22.md` and the 2,350-line candidate inventory in `APP_SYNTHETIC_CANDIDATE_INVENTORY_2026-09-22.csv`. The CSV contains **unreviewed search candidates**, not 2,350 confirmed defects. The critical review contains the confirmed paths.

## Objective and non-negotiable contract

No production price, financial metric, score, strategy match, order, report, or performance curve may be derived from a demonstration fixture, random number, fixed market value, inferred proxy presented as fact, or an undated/unattributed source. Missing required data must produce `DATA_INSUFFICIENT` or `SOURCE_UNAVAILABLE`, with field names and source status. Keep existing unverified records for audit, but exclude them from actionable decisions. Preserve SQLite transaction state and DuckDB/Parquet OHLCV architecture.

Recommended shared result type:

```ts
export type SourceResult<T> =
  | { status: 'VERIFIED'; value: T; source: string; asOf: string; evidenceId: string }
  | { status: 'DATA_INSUFFICIENT' | 'SOURCE_UNAVAILABLE' | 'STALE';
      missingFields: string[]; source?: string; asOf?: string; reason: string };
```

Do not convert an absent `SourceResult.value` to an optimistic number with `||`, `??`, or `Number(...) ||`. A zero is a legitimate value in several financial fields and must not be replaced.

## Work package 0: preserve evidence and make the build reproducible

1. Start from the current dirty worktree without discarding user changes. Inspect `git status` and avoid broad staging.
2. Run `node scripts/audit_synthetic_candidates.cjs` to regenerate the candidate CSV. Triage candidates by route reachability, whether data is persisted or displayed, and whether the value affects an action. Do not count comments/tests as defects.
3. Record baseline DB counts and dates: `FEREEnrichedLedger` currently has 3,559 rows from 2026-09-16; `HistoricalFinancialStatements` has 2,295 rows across 344 identifiers, zero non-null `period_date`, 25 non-null sales values, and CFO records for 49 identifiers. The current ledger has no row-level source-verification marker.
4. Add a migration marker for the legacy FERE ledger such as `quality_status='LEGACY_UNVERIFIED'` in a separate provenance table or new column. Do not delete the rows.
5. Run `npx tsc --noEmit --pretty false`, targeted unit tests, and a local API smoke test after each package. Run a full test suite after integration, not after every small change.

## Work package 1 (P0): FERE must use real financial filings

Affected paths: `scripts/fere_multi_agent_enrichment_worker.cjs`, `src/server/routes/forensicRoutes.ts`, `src/components/FereForensicDeepDiveModal.tsx`, `src/server/services/adapters/FEREEngineAdapter.ts`, `src/server/services/dataAcquisition/FundamentalEnrichmentEngine.ts`, `src/server/services/dataAcquisition/AcquisitionWorker.ts`.

Already changed in this task: legacy FERE writer exits without modifying the ledger; the fundamental fixture provider reports `FERE_FINANCIAL_SOURCE_UNAVAILABLE`; the acquisition queue marks that condition `SOURCE_UNAVAILABLE`; the adapter no longer emits fixed 88/34 evidence; the FERE API returns 422 `UNVERIFIED_LEGACY_FERE`; the modal clears prior data and shows verification required. Keep these safeguards until real calculations pass.

Build a new deterministic pipeline rather than re-enabling the old worker:

1. **Fetch and archive:** for each ISIN, retrieve official dated annual and quarterly filings/XBRL, cash-flow statements, shareholding/pledge filings, and source corrections. Persist original bytes plus URL, retrieval time, filing timestamp, content hash, issuer ISIN, period end, statement scope (`CONSOLIDATED`/`STANDALONE`), and units. Retry 429/5xx with bounded backoff; never overwrite a successfully archived filing with an error response.
2. **Normalize:** write a `FEREFinancialFacts` table keyed by `(isin, period_end, scope, metric, filing_hash)` with numeric value, original field path, units, and `available_at`. Reject ambiguous units and mismatched periods. A renamed ticker resolves by ISIN.
3. **Calculate:** implement Beneish 8-variable, Altman 5-factor, Piotroski 9-condition, Sloan accruals, cash-conversion cycle, and CFO/EBITDA as separate pure functions. Each returns a value only when every required current/prior period field is available, finite, and methodologically comparable. Do not substitute sector averages or market-cap proxies. Financial companies need their appropriate model or an explicit `NOT_APPLICABLE` result.
4. **Publish:** write `FEREVerifiedMetrics` with formula version, every input fact ID, source filing hashes, period end, available-at time, calculation time, score, and an explicit coverage state. Expose only `VERIFIED` metrics through `/api/forensic/fere-stock/:symbol`; allow partial metrics but do not synthesize a composite verdict from incomplete evidence.
5. **UI:** show the metric period and source link, data age, unavailable fields, and whether a score is complete. Never label a generic company overview URL as proof of the specific numeric input.

Suggested publication gate:

```ts
const required = ['salesCurrent', 'salesPrior', 'receivablesCurrent', 'receivablesPrior',
  'grossProfitCurrent', 'grossProfitPrior', 'assetsCurrent', 'assetsPrior',
  'depreciationCurrent', 'depreciationPrior', 'sgaCurrent', 'sgaPrior',
  'debtCurrent', 'debtPrior', 'patCurrent', 'cfoCurrent'];
const missing = required.filter(key => !Number.isFinite(facts[key]));
if (missing.length) return { status: 'DATA_INSUFFICIENT', missingFields: missing };
```

Acceptance: zero new rows from `fere_multi_agent_enrichment_worker.cjs`; no FERE recommendation without filing hashes and complete formula inputs; a missing or stale filing yields visible unavailability; a renamed ticker resolves by ISIN; score results can be recomputed exactly from archived facts.

## Work package 2 (P0): replace the synthetic acquisition daemon

Affected paths: `src/server/services/dataAcquisition/{HistoricalDataAcquisitionEngine,CurrentDataAcquisitionEngine,IntradayAcquisitionEngine,ShareholdingAcquisitionEngine,DataAcquisitionDaemon,AcquisitionWorker}.ts`; launcher `scripts/data-acquisition/run_daemon.ts`.

The present providers create MD5-driven daily OHLCV, a fixed quote, a sine-wave intraday series, and fixed quarterly ownership. The daemon can store these as raw provenance and mark them `RESEARCH_READY`. It is separately launched, so audit its persisted snapshots before reuse.

Implement source adapters that return `SourceResult<T>` and carry a real `source`, `asOf`, instrument key, request ID, and raw-response hash. Wire daily/intraday prices to the established DuckDB/Upstox data services and statements/shareholding to verified filings. When no adapter exists, return `SOURCE_UNAVAILABLE` and never call `appendRawRecord` or mark `RESEARCH_READY`. Add an integration test that starts the daemon with all sources unavailable and asserts zero price/statement records are written. Replace the fabricated source-health percentages in `DataAcquisitionDaemon.ts` with counters from actual adapter calls and failures.

## Work package 3 (P0): prevent orders and paper trades from synthetic candles

Affected paths: `src/server/services/MomentumVpaEngine.ts` near `simulatePaperTrade` and `armStaggeredOrder`; routes in `src/server/routes/infra.ts` for `greenfield/simulate-paper-trade`.

Remove both production calls to `generateSyntheticCandles`. Keep that generator only in test fixtures. Required shape:

```ts
const setup = (await this.scanUniverse([cleanSym]))[0];
if (!setup || setup.candleSourceStatus !== 'VERIFIED') {
  throw new DataInsufficientError(cleanSym, ['adjusted_ohlcv', 'verified_vpa_setup']);
}
```

Check adequate candle count, last trade date, adjusted source, and signal-date match before creating a paper position or order record. Acceptance: requesting an unknown symbol returns 422; no position/order row is inserted; a verified setup can still arm normally.

## Work package 4 (P0/P1): strategy, opportunity, and scoring inputs

Affected paths: `src/server/services/OpportunityScannerEngine.ts` near lines 930–942 and 1158; `ConsolidatedOpportunityEngine.ts` near lines 1252–1255, 2261, and 2759; `src/server/routes/quantRoutes.ts` near lines 131–142.

Remove fallback RSI, Bollinger bandwidth, relative volume, PE, ROCE, leverage, margin, candle volume, delivery percentage, and neutral score values where they influence signals. Carry a per-rule `MATCHED`, `FAILED`, or `DATA_INSUFFICIENT` state and require every enabled strategy gate to have observed inputs. Reject incomplete strategy-evaluator HTTP bodies with 400 and a list of missing fields. Preserve legitimate **configuration thresholds**; the ban is on invented **observations**. Acceptance: missing volume never becomes 100,000 or 1,000,000; missing RSI never becomes 50/55; incomplete fundamentals cannot produce an actionable score; rule evidence identifies the actual source and date.

## Work package 5 (P1): exports and dossier views

Affected paths: `src/server/services/CommercialExcelReportService.ts` around lines 151–163 and 380–398; `MasterQuantUniverseService.ts` around lines 564–566, 631–637, 650–655, and 823–829; report route `src/server/routes/infra.ts` near 1993.

Replace optimistic defaults for win rate, float squeeze, triad, ROCE, ROE, CAGR, EBITDA margin, P/E, EPS, and target multiples with `null` and source-status cells. Do not call a dossier “actionable” when a required strategy or risk input is absent. Add a workbook tab listing every field, value, source, as-of date, and `VERIFIED/STALE/MISSING` state. Acceptance: blank inputs produce visibly blank/N.A. cells, no default 85/80/28.5 values, and no valuation label derived from defaults.

## Work package 6 (P1): performance, FX, and cash

Affected paths: `src/server/services/PaperTradingPotService.ts` near `getFallbackEquityCurve`; `src/server/routes/nri.ts`, `transactions.ts`, `reconciliationAudit.ts`, `infra.ts`; `src/server/services/FamilyBenchmarkService.ts`.

Return an empty NAV history with an unavailable message when none exists; never draw the random benchmark curve. Add one dated FX quote service using the existing database quote table or a verified provider. Refuse conversion when missing/stale unless the user explicitly supplies an override recorded in the calculation audit. Require cash amount as input or a stored balance; do not replace zero with ₹100,000. Acceptance: empty NAV has no line, FX absence produces a clear error, an actual zero cash balance remains zero.

## Work package 7 (P2): identity and ancillary research

Affected paths: `src/server/camsParser.ts` near line 1133; `src/server/quantEngine.ts` near line 207; `src/server/services/phase2fasttrack/EconomicStatisticsEngine.ts` near line 55; UI claims in `src/components/OpportunityEngineMasterView.tsx` near line 3430.

Store unresolved mutual-fund/security identity in a provisional namespace, never as a broker-valid ISIN. Remove fixed Piotroski or mocked profit factor from production output. Change absolute UI claims such as “100% Real Live Market Data” to measured source coverage and as-of time, updated from the catalog.

## Related functional and architectural gaps confirmed in this pass

These are separate from synthetic data but affect whether the user can trust a fresh scan:

| Priority | Gap | Code change and acceptance |
|---|---|---|
| P1 | Scan API/UI contract mismatch | `src/server/routes/infra.ts` near line 2153 returns `status` and `isScanning` when a background scan starts. `src/components/OpportunityEngineMasterView.tsx` near line 1130 expects `json.data` and otherwise displays “Scan completed with partial results” immediately. Change UI to display `RUNNING`, poll `/api/opportunity-engine/scan-status` (or a job endpoint), then load the completed report by scan ID. Tests: start, duplicate 429, failure, and completion states. |
| P1 | “Fresh” report can be stale | `ConsolidatedOpportunityEngine.getDashboardReport(forceFresh)` near lines 1627–1637 starts a background scan and returns cached output. Add `scanId`, `generatedAt`, `dataThrough`, and `isStale` to the response; UI must label the old snapshot until completion. |
| P1 | Portable DuckDB worker runtime | `DuckDbAdjustedOhlcvService.ts` near line 63 embeds a machine-specific Python path. Resolve a bundled runtime, configured interpreter, or PATH executable with a startup health check. Test a clean checkout on another Windows profile. |
| P2 | Manual on-demand evaluation differs from universe scan | `ConsolidatedOpportunityEngine.evaluateScripOnDemand` near line 3812 is a direct research path. Label its output `ON_DEMAND_RESEARCH`; never silently merge it into strict strategy-gated scan results. The historical `OpportunityScripEvaluations` merge has already been removed in current code and should remain removed. |

## OHLCV work continuing alongside this review

The adjusted DuckDB catalog remains Kite-first. `app_adjusted_ohlcv` currently contains 4,413,473 Kite rows and 807,198 TejHQ fallback rows; unverified Upstox rows are not published. Ten same-ISIN ticker aliases were materialized for old-name queries. The 42 rejected Upstox keys were checked against current/suspended masters: 12 suspended, 30 absent, no replacement key. The 68 staged Upstox series add zero dates beyond adjusted history. Official NSE archives for 2025–2026 now total 425 ZIPs and 15,989 raw rows for 78 target ISINs. These raw rows remain quarantined pending official corporate-action adjustment and overlap validation; do not call them adjusted or merge them into app history yet. See `nse_official_gap_audit/raw_extraction_manifest.json` and the readiness CSVs.

## Required regression suite

- Missing field and zero-value tests for every strategy/FERE financial input.
- A no-source run of the acquisition daemon that writes no market/fundamental facts.
- A FERE calculation fixture with real published statement numbers and an expected hand-calculated score; a missing prior period must return `DATA_INSUFFICIENT`.
- Broker/exchange candle identity test across a symbol rename, split, and delisting; Kite adjusted row wins on the same date.
- A report snapshot with missing fundamentals that shows N.A. and no actionable verdict.
- Unknown-symbol paper trade/order request yields 422 and zero database writes.
- Source-health display reflects actual request counts and failures.

## Deliverables to request from the developer bot

1. Code changes in small, reviewable commits by work package, preserving unrelated dirty files.
2. A migration and remediation report for the existing 3,559 legacy FERE rows and any daemon-produced snapshots.
3. Source catalog with URLs/contracts, authentication needs, rate limits, data rights, and field-level lineage.
4. Tests and before/after screenshots or API samples demonstrating unavailable versus verified states.
5. A final route-to-source audit for every remaining line in the candidate inventory, marking each `CONFIRMED_DEFECT`, `SAFE_PARAMETER`, `TEST_ONLY`, or `NOT_REACHABLE`.
