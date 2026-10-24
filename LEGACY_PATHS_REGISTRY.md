# WealthOS Legacy Paths Registry

This document tracks deprecated API paths and service implementations scheduled for retirement. All legacy paths will emit RFC 8594-compliant deprecation headers and are monitored for usage telemetry.

## Legacy API Paths

### /api/audit → /api/reconciliation-audit (Canonical)

- **Old Path:** `/api/audit`
- **Canonical Path:** `/api/reconciliation-audit`
- **Status:** Deprecated
- **Sunset Date:** 90 days from deprecation timestamp
- **Migration Guide:** `/docs/MIGRATION_GUIDE_AUDIT.md`
- **Parameter Mapping:**
  - `ticker` → `symbol`
  - `strategy_id` → `strategy_key`
- **Deprecation Headers:**
  - `Deprecation: true`
  - `Link: </api/reconciliation-audit>; rel="deprecation"`
  - `Sunset: <HTTP-date>`
  - `X-WealthOS-Legacy-Path: true`
- **Response Shape:** Unchanged for backward compatibility
- **Usage Tracking:** `audit_legacy_path_calls` table tracks hits, IPs, user-agents

### Future Deprecated Paths

- `/api/opportunities/scanner` → `/api/v1/opportunities` (TBD)
- `/api/technical-analysis` → `/api/v1/technical-strategies` (TBD)
- `/api/reports/generate` → `/api/v1/reports/generate` (TBD)

## Deprecated Backend Services

### TechnicalAnalysisEngine (Canonical)

- **Canonical Implementation:** `TechnicalAnalysisEngine`
- **Deprecated Variants:**
  - `TechnicalMomentumEngine` (Phase-out candidate)
  - `NewTechnicalStrategiesEngine` (Phase-out candidate)
- **Usage Count:** 1+ routes
- **Coverage Equivalence:** Verified (all features replicated)
- **Migration Path:** Import `TechnicalAnalysisEngine` directly
- **Status:** Will accept deprecation PRs targeting canonical

### ReportsService (CommercialExcelReportService is Canonical)

- **Canonical Implementation:** `CommercialExcelReportService`
- **Deprecated Variants:**
  - `ReportsService` (legacy CSV/PDF export)
  - `InstitutionalDossierReportGenerator` (Phase-out candidate)
- **Usage Count:** 3+ routes
- **Coverage Equivalence:** Verified (CSV format preserved, Excel templates improved)
- **Database Schema:** Legacy columns retained for historical queries
- **Migration Path:** Migrate to `CommercialExcelReportService.generate()`
- **Status:** Dual-run mode supported for 7-day variance validation

### Strategy Engine Variants

- **Canonical:** `PureTechnicalStrategiesEngine` (v5.0)
- **Deprecated:** `S110StrategyReplayEngine`, `StrategyCalibrationEngine` (pre-v5.0 variants)
- **Coverage Status:** Feature parity audit in progress
- **Sunset:** 30 days after v5.0 goes live

## Deprecated Frontend Components

### DashboardView (Canonical)

- **Canonical:** `src/components/DashboardView.tsx`
- **Deprecated:** `Analyze360View.tsx`
- **Import Count:** Track via ESLint rule `no-deprecated-component-imports`
- **Visual Regression:** Minimal (same Tailwind theme)
- **Sunset Date:** 30 days from deprecation

### OpportunityEngineMasterView (Canonical)

- **Canonical:** `src/components/OpportunityEngineMasterView.tsx`
- **Deprecated:** `OpportunityHubView.tsx`
- **UI/UX Notes:** Master view consolidates all scanning modes
- **Migration Guide:** Use tab system instead of separate views
- **Sunset Date:** 45 days from deprecation

### StockIntelligenceView (Canonical)

- **Canonical:** `src/components/StockIntelligenceView.tsx`
- **Deprecated:** `StockDossierView.tsx`, `SecurityDossierHubView.tsx`
- **Coverage Parity:** All tabs available in canonical view
- **CSS Class Changes:**
  - Old: `.stock-dossier-header` → New: `.intelligence-header-primary`
  - Old: `.dossier-sidebar` → New: `.intelligence-sidebar-lg`
- **Migration:** Use canonical imports, update CSS class references
- **Sunset Date:** 60 days from deprecation

## Deprecation Audit Reports

All legacy paths are logged to the `audit_legacy_path_calls` table with:
- Timestamp (ISO 8601)
- Route (e.g., `/api/audit/waterfall`)
- User ID (if authenticated)
- Client IP
- Browser User-Agent
- Response time (ms)
- Canonical path mapping

### Risk Assessment Logic

| Hit Count (30d) | Risk Level | Recommendation |
|---|---|---|
| < 10 | Low | Safe to retire immediately |
| 10-50 | Medium | Communicate migration deadline, extend if needed |
| 50-100 | High | Plan migration sprint, coordinate with clients |
| > 100 | Critical | Extend sunset by 30 days, mandatory migration notifications |

### Dual-Run Mode (LEGACY_DUAL_RUN=true)

When enabled, both legacy and canonical implementations execute:
- Results are compared and hashed
- Variance logged to `audit_implementation_variance` table
- Safe to retire after 7 days with zero variance detected
- Used to validate new implementation before deprecation

## Migration Guides

Generated MIGRATION_GUIDE_*.md files are created per deprecated path with:
- Old API endpoint and parameters
- New API endpoint and parameters
- Parameter mapping table
- Before/after code examples
- Troubleshooting section
- Support contact

Example: `MIGRATION_GUIDE_AUDIT.md`

## Build-Time Deprecation Enforcement

ESLint rule `no-deprecated-service-imports` blocks new imports of:
- `TechnicalMomentumEngine`
- `ReportsService` (legacy)
- `OpportunityHubView`
- etc.

Requires `@ts-expect-error` comment for exceptions.

## Roadmap

- **Phase 1 (Week 1):** Emit deprecation headers, log usage
- **Phase 2 (Week 2-3):** Enable dual-run mode, collect variance data
- **Phase 3 (Week 4+):** Migrate clients, sunset old paths at 90+ days
- **Phase 4:** Remove deprecated code entirely from codebase

---

Last updated: 2026-10-24
Maintained by: CloudOps Team
Support: support@wealthos.example.com
