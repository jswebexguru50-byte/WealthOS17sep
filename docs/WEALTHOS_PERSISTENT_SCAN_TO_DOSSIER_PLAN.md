# WealthOS Persistent Scan-to-Dossier Lifecycle — Updated Implementation Plan

Updated: 2026-10-04

## Decision

Implement the persistent unified scan-to-dossier lifecycle by wiring and hardening existing components. Do **not** rebuild working services.

## Already present and protected

- `CandidateLifecycleIdService`
- `SevenStrategiesCandidatesService`
- `SevenStrategiesCandidateEnrichmentService`
- `Analyze360Service`
- `QglpScoringService`
- `SectorMomentumService`
- `DossierRunService`
- `dossier_runs`, `dossier_candidates`, `dossier_signals`, `dossier_analysis_snapshots`, `dossier_artifacts`
- fast research server: `server.research.ts`

## Corrected implementation sequence

### Phase 1 — Wire and verify persistence

1. Mount `dossierRouter` in the full server and research server.
2. Fix dossier route ordering so static routes such as `/candidates/:candidateId` and `/company/:symbol` are not swallowed by `/:runId`.
3. Keep all GET routes read-only.

### Phase 2 — Production orchestrator

Create `src/server/services/ScanToDossierOrchestrator.ts`.

The orchestrator must:

- resolve trading sessions from local OHLCV through `NseTradingCalendarService`;
- freeze a cohort from existing seven-strategy candidate payloads;
- generate candidate and signal IDs only through `CandidateLifecycleIdService`;
- persist run, candidates, signals, and analysis snapshots through `DossierRunService`;
- call `Analyze360Service` using stored/local data only;
- register an artifact manifest with content hash and path;
- fail closed on insufficient data.

It must not:

- modify technical strategy definitions;
- call live providers from GET routes;
- fabricate missing fundamentals, QGLP, sector momentum, or dates;
- use runtime timestamps in candidate or signal IDs;
- start background schedulers.

### Phase 3 — Historical library UI

Add a historical dossier run library only after Phase 1 and Phase 2 pass.

### Phase 4 — Acceptance tests

Targeted acceptance checks:

- run can be created;
- run can be listed and read after creation;
- candidates/signals carry the same `dossierRunId`;
- every candidate has a deterministic `candidateId`;
- every signal has a deterministic `signalId`;
- GET routes do not trigger provider refreshes;
- artifact metadata includes hash and a real local file path.

