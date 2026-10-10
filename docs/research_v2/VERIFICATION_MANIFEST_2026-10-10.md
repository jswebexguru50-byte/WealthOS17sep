# WealthOS 29-Question V2 verification manifest

**Branch:** `feat/29q-v2-continuation`  
**Baseline:** `origin/feat/29q-v2-full` (`64d809c`)  
**Tip at verification:** `25f5c35`  
**Purpose:** review handoff for the continuation work. This manifest records measured local results; it does not claim live-provider or production validation.

## Included implementation slices

The continuation branch contains these commits after the saved WIP baseline:

| Commit | Slice |
|---|---|
| `8161361` | Fact normalization guards and validation |
| `d2b86f1` | Statutory source precedence and conflict retention |
| `d9dac1a` | Derived-quarter reconciliation quarantine |
| `a93f59c` | Annual/YTD compatibility views |
| `8e32a65` | S2 fact store, readiness and reporting |
| `d8fa779` | Backfill, schema and validation CLI tools |
| `2524833` | Claim/completeness gate before persistence |
| `6b0d3ba` | Six-scrip fundamental workflow |
| `6d200a9` | Host-agent orchestration |
| `f892381` | Verified FERE export bridge |
| `57755e2` | V2 acquisition/calculator type cleanup |
| `25f5c35` | Persistence rehearsal and end-to-end gate |

## Verification run

Command:

```powershell
node node_modules/tsx/dist/cli.mjs --test tests/research_v2/**/*.test.ts
```

Measured result on 2026-10-10:

* **482 tests discovered**
* **478 passed**
* **3 failed**
* **1 skipped**

The three failures are recorded rather than hidden:

1. Agent parity expects both `UNCLAIMED_NUMBER` and `VALUE_MISMATCH` for one wrong-number path.
2. The hard-link production-path test cannot create a hard link in the restricted Windows test environment (`EPERM`).
3. A legacy provider-unit test expects the removed source-name-based crore heuristic; current catalogue-based semantics correctly preserve the supplied unit.

Type check command:

```powershell
npm run lint
```

Result: **fails with five unresolved imports in legacy services**, all outside `src/server/research_v2/**`:

* `src/server/services/audit/AdversarialAttackSuite.ts`
* `src/server/services/composable/PITContext.ts`
* `src/server/services/dataenrichment/verifiers/DownstreamAuthorizationBoundary.ts`
* `src/server/services/intelligence/CompanyIntelligenceOrchestrator.ts`
* `src/server/services/reference/pkscreener/PKScreenerUniverseAdapter.ts`

No V2 type errors were reported by this command.

## Scope audit

The implementation touches the research V2 modules, their tests, package scripts and the persistence rehearsal documentation. The branch does not modify the canonical Downloads checkout or the production database. The rehearsal command operates on a temporary database copy and asserts that the source remains unchanged.

The production write path remains guarded by explicit database targeting, backup validation and an allow flag. Live Trendlyne acquisition and production persistence are not represented as completed by this manifest.

## Deferred or pending review items

* Live Trendlyne acquisition for the six approved scrips and verification of returned evidence.
* End-to-end host-agent drafts/reviews using live, verified bundles.
* Resolution of the three failing tests above.
* Five legacy service imports blocking a repository-wide type check.
* Rehearsal against the canonical database copy with the owner’s current data, followed by independent review.
* Production persistence and Analyze Scrip/UI integration; these remain deferred by the amended scope until the live run and rehearsal are accepted.
* Merge to `ai-review` only after reviewer acceptance; this branch is not a production release.

## Review request

Review this branch against the amended V2 build specification and the S1/S2 adversarial probes. Treat the measured failures and deferred items above as open findings, not as passed checks.
