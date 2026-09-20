# WEALTHOS — WAVE 3.3 DATA TRUST PROVENANCE AUDIT

## CONTROL CONSTRAINTS & AUDIT GUIDELINES
- **Read-Only Investigation**: Zero external network requests or data acquisition performed.
- **Acquisition Flags**:
  - `FILTER_DATA_READY`: `false`
  - `EMPIRICAL_ACQUISITION`: `false`
  - `ECONOMIC_REPLAY`: `false`

---

## DEF-004 DATASET PROVENANCE AUDIT & AUTHORITATIVE DOMAIN MAPPING

### 1. `HistoricalFinancialStatements`
- **Target Authoritative Source Domain**: `ISSUER_PRIMARY_FILING` / `PRIMARY_REGULATORY_SOURCE` (BSE/NSE Corporate Announcements & XBRL Filings).
- **Current Acquisition Channel**: `SECONDARY_SOURCE` (Vendor aggregator API scrapes).

| Provenance Pipeline Stage | Pipeline Requirement | Findings & Evidence | Stage Status |
| --- | --- | --- | --- |
| **1. SOURCE AUTHORITY** | Primary regulatory / issuer source | Aggregator vendor payload | `SECONDARY_SOURCE` |
| **2. SOURCE ARTIFACT** | Raw XBRL/PDF filing preserved | No raw filing artifact preserved in repository | `PROVENANCE_UNVERIFIED` |
| **3. SOURCE IDENTITY** | CIK / Exchange Symbol | Symbol mapped in `MasterTickers` | `VERIFIED` |
| **4. RAW ARTIFACT HASH** | SHA-256 of raw source payload | Missing raw SHA-256 ledger entry | `PROVENANCE_UNVERIFIED` |
| **5. ACQUISITION PROVENANCE** | Acquisition timestamp & headers | Missing HTTP response metadata | `PROVENANCE_UNVERIFIED` |
| **6. PARSING** | XBRL parser audit | JSON payload parsed without XBRL schema validation | `PARTIAL` |
| **7. NORMALIZATION** | Chart of accounts normalization | Standardized to internal financial schema | `VERIFIED` |
| **8. CANONICAL HASH** | Structural row hash | Calculated internally upon insert | `PARTIAL` |
| **9. DB MAPPING** | Database schema persistence | Migration v11 in `database.ts` | `VERIFIED` |
| **10. RECONCILIATION** | 3-way balance sheet check | No automated reconciliation check | `PROVENANCE_UNVERIFIED` |
| **11. REVISION DETECTION** | Restatement tracking | Restatements overwrite existing records without audit trail | `PROVENANCE_UNVERIFIED` |
| **12. FRESHNESS** | As-of vs filing timestamp | Filing date present, publication time unverified | `PARTIAL` |
| **13. PIT ELIGIBILITY** | Point-in-time point constraint | No point-in-time publication timestamp recorded | `PROVENANCE_UNVERIFIED` |

**Overall Dataset Classification**: `SECONDARY_SOURCE` / `PROVENANCE_UNVERIFIED`

---

### 2. `HistoricalShareholdingPattern`
- **Target Authoritative Source Domain**: `EXCHANGE_SOURCE` (NSE/BSE Quarterly Shareholding Pattern Filings).
- **Current Acquisition Channel**: `SECONDARY_SOURCE` (Vendor scrapes).

| Provenance Pipeline Stage | Pipeline Requirement | Findings & Evidence | Stage Status |
| --- | --- | --- | --- |
| **1. SOURCE AUTHORITY** | Primary exchange filing | Vendor web scrape | `SECONDARY_SOURCE` |
| **2. SOURCE ARTIFACT** | Raw XML/HTML filing preserved | Raw filing artifact missing | `PROVENANCE_UNVERIFIED` |
| **3. SOURCE IDENTITY** | ISIN / Exchange Ticker | Mapped to `MasterTickers` | `VERIFIED` |
| **4. RAW ARTIFACT HASH** | SHA-256 of raw filing | Missing raw artifact SHA-256 | `PROVENANCE_UNVERIFIED` |
| **5. ACQUISITION PROVENANCE** | Acquisition metadata | Missing response headers | `PROVENANCE_UNVERIFIED` |
| **6. PARSING** | Category breakdown parser | Parsed into Promoter/Public/FII/DII categories | `VERIFIED` |
| **7. NORMALIZATION** | Category normalization | Mapped to standard shareholding schema | `VERIFIED` |
| **8. CANONICAL HASH** | Canonical pattern hash | Calculated internally upon insert | `PARTIAL` |
| **9. DB MAPPING** | Schema persistence | Migration v11 in `database.ts` | `VERIFIED` |
| **10. RECONCILIATION** | Share sum vs Total Capital check | No automated capital structure cross-check | `PROVENANCE_UNVERIFIED` |
| **11. REVISION DETECTION** | Corporate action / share change audit | No revision history ledger | `PROVENANCE_UNVERIFIED` |
| **12. FRESHNESS** | Quarter end vs filing date | Quarter end date recorded, filing date missing | `PARTIAL` |
| **13. PIT ELIGIBILITY** | Point-in-time publication time | Filing publication timestamp unverified | `PROVENANCE_UNVERIFIED` |

**Overall Dataset Classification**: `SECONDARY_SOURCE` / `PROVENANCE_UNVERIFIED`

---

## DATA TRUST SUMMARY & PROGRAM POSITION
- **DATA TRUST**: `PARTIAL`
- **DEF-004 GAP STATUS**: **OPEN — CRITICAL DATA TRUST GAP**
- **Gate Requirement**: DEF-004 is carried forward as a separate evidence track and remains an **absolute prerequisite blocker** before broader P5 integrated data verification or capital deployment.
