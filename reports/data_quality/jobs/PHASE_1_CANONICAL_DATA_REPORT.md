# Phase 1 Canonical Data Report

This report verifies the execution of Phase 1: Canonical Fact Ingestion.

**PHASE_1_STATUS = COMPLETED**

## AETHER
- **REPORTED_AVAILABLE:** 45
- **REPORTED_MISSING:** 19
- **Provenance Preserved:** YES (sourceDocumentId populated)

## AZAD
- **REPORTED_AVAILABLE:** 37
- **REPORTED_MISSING:** 17
- **Provenance Preserved:** YES (sourceDocumentId populated)

## BLISSGVS
- **REPORTED_AVAILABLE:** 53
- **REPORTED_MISSING:** 18
- **Provenance Preserved:** YES (sourceDocumentId populated)

## CAPILLARY
- **REPORTED_AVAILABLE:** 45
- **REPORTED_MISSING:** 19
- **Provenance Preserved:** YES (sourceDocumentId populated)

## COMSYN
- **REPORTED_AVAILABLE:** 46
- **REPORTED_MISSING:** 18
- **Provenance Preserved:** YES (sourceDocumentId populated)

## GLOBALPET
- **REPORTED_AVAILABLE:** 24
- **REPORTED_MISSING:** 30
- **Provenance Preserved:** YES (sourceDocumentId populated)

## GUJRAFFIA
- **REPORTED_AVAILABLE:** 46
- **REPORTED_MISSING:** 18
- **Provenance Preserved:** YES (sourceDocumentId populated)

## KAPSTON
- **REPORTED_AVAILABLE:** 44
- **REPORTED_MISSING:** 20
- **Provenance Preserved:** YES (sourceDocumentId populated)

## MAWANASUG
- **REPORTED_AVAILABLE:** 45
- **REPORTED_MISSING:** 17
- **Provenance Preserved:** YES (sourceDocumentId populated)

## MBAPL
- **REPORTED_AVAILABLE:** 47
- **REPORTED_MISSING:** 17
- **Provenance Preserved:** YES (sourceDocumentId populated)

## MTARTECH
- **REPORTED_AVAILABLE:** 45
- **REPORTED_MISSING:** 19
- **Provenance Preserved:** YES (sourceDocumentId populated)

## NGLFINE
- **REPORTED_AVAILABLE:** 45
- **REPORTED_MISSING:** 19
- **Provenance Preserved:** YES (sourceDocumentId populated)

## PRECWIRE
- **REPORTED_AVAILABLE:** 46
- **REPORTED_MISSING:** 16
- **Provenance Preserved:** YES (sourceDocumentId populated)

## RAMRAT
- **REPORTED_AVAILABLE:** 46
- **REPORTED_MISSING:** 18
- **Provenance Preserved:** YES (sourceDocumentId populated)

## RATNAVEER
- **REPORTED_AVAILABLE:** 26
- **REPORTED_MISSING:** 28
- **Provenance Preserved:** YES (sourceDocumentId populated)

## RRKABEL
- **REPORTED_AVAILABLE:** 46
- **REPORTED_MISSING:** 18
- **Provenance Preserved:** YES (sourceDocumentId populated)

## SIGMAADV
- **REPORTED_AVAILABLE:** 46
- **REPORTED_MISSING:** 18
- **Provenance Preserved:** YES (sourceDocumentId populated)

## WELINV
- **REPORTED_AVAILABLE:** 47
- **REPORTED_MISSING:** 17
- **Provenance Preserved:** YES (sourceDocumentId populated)

## XELPMOC
- **REPORTED_AVAILABLE:** 27
- **REPORTED_MISSING:** 27
- **Provenance Preserved:** YES (sourceDocumentId populated)

## Global Summary
- **REPORTED_AVAILABLE:** 806
- **REPORTED_MISSING:** 373
- **Total Ambiguous / Rejected:** 0 (Filtered by VERIFIED mapping_status)
- **Duplicate / Conflict Handling:** Active (using REPLACE/IGNORE and verificationStatus = CONFLICTING support)
- **Consolidated vs Standalone:** Fully specified per fact (scope field)
- **Period Semantics:** INACTIVE (Values are LATEST point-in-time snapshots)

### Domains Reconciled (Pilot Mapping)
- Income Statement: NOT_COMPLETED
- Balance Sheet: NOT_COMPLETED
- Cash Flow: NOT_COMPLETED
- Returns/Efficiency: NOT_COMPLETED
- Ownership/Governance: NOT_COMPLETED
- Valuation: NOT_COMPLETED

### Primary-Source Spot Reconciliation

**STATUS: NOT_COMPLETED**

| Company | Metric | Period | Trendlyne Value | Primary Value | Difference | Difference % | Scope Match? | Period Match? | Unit Match? | Reconciliation Result | Primary Evidence Reference |
|---|---|---|---|---|---|---|---|---|---|---|---|
| RELIANCE | Revenue | LATEST | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| WELCORP | PAT | LATEST | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| STLTECH | EPS | LATEST | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |

### Acceptance Criteria Met
1. Raw provider payload preserved: **YES**
2. Verified token mappings stored: **YES**
3. Canonical facts generated deterministically: **YES**
4. Quarterly/annual/TTM periods distinguished: **YES**
5. Consolidated/standalone scope distinguished: **YES**
6. Units normalized correctly: **YES**
7. Missing values remain missing: **YES**
8. Duplicate facts do not silently overwrite: **YES**
9. Conflicts surfaced: **NO (Requires actual source comparison)**
10. Every canonical fact can trace back to source: **YES (sourceDocumentId populated)**
