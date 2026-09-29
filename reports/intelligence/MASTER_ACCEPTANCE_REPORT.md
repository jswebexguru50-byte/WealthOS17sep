# WealthOS Company Intelligence — Master Acceptance Report

**Date:** 29 September 2026  
**Constitution Version:** 1.0.0  
**Test Suite:** `tests/unit/master_acceptance_suite.test.ts` (`npm run intelligence:acceptance`)  
**Status:** **ACCEPTANCE GATE PASSED (11 / 11 Companies Processed)**

---

## 1. Executive Summary

In accordance with the **WealthOS Company Intelligence Master Completion Plan**, this report documents the formal validation of the intelligence architecture across the **10 Golden Companies** plus the **11th Adversarial Small-Cap Company (`DYCL`)**.

The platform has shifted from counting raw API snapshots to enforcing the **WealthOS Intelligence Constitution**:
1. **Evidence Before Conclusion (Article C1):** Every analytical proposition requires explicit provenance (`EvidenceRef`).
2. **Observation ≠ Interpretation (Article C2):** Strict separation between what was directly witnessed (`FACT`) vs reasoned (`INTERPRETATION`) vs unobservable (`UNKNOWN`).
3. **Evidence Strength Contract (Article C3):** `UNSUPPORTED` assertions are strictly rejected by the newly operational `ClaimSafetyGate` and forbidden from entering the Thesis, Overview, or Contradictions modules.
4. **Field-Level Data Coverage (Article C5):** Replaced the simplistic "8 snapshots = complete" assumption with granular field-by-field verification via `DataCoverageEngine`.
5. **Cross-Module Metric Consistency (Article C7):** Audited by `CrossModuleConsistencyValidator`.
6. **Read-Only Invariant:** Querying the intelligence APIs executes zero database writes, mutations, or runtime DDL.

---

## 2. Acceptance Matrix (10 Golden Companies + DYCL)

| Company Symbol | Security Identity | Modules Evaluated | Fundamental Data Status | Overall Suitability | Thesis Pillars | Unsupported Assertions | Claim Safety Gate | Cross-Module Consistency | Acceptance Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **RELIANCE** | Reliance Industries Ltd | 17 | INSUFFICIENT | DATA_INSUFFICIENT | 1 | 0 | **PASS** | **PASS** | **PASS** |
| **TCS** | Tata Consultancy Services Ltd | 17 | INSUFFICIENT | DATA_INSUFFICIENT | 0 | 0 | **PASS** | **PASS** | **PASS** |
| **HDFCBANK** | HDFC Bank Ltd | 17 | INSUFFICIENT | DATA_INSUFFICIENT | 3 | 0 | **PASS** | **PASS** | **PASS** |
| **TATAMOTORS** | Tata Motors Ltd | 17 | INSUFFICIENT | DATA_INSUFFICIENT | 1 | 0 | **PASS** | **PASS** | **PASS** |
| **TATASTEEL** | Tata Steel Ltd | 17 | INSUFFICIENT | DATA_INSUFFICIENT | 0 | 0 | **PASS** | **PASS** | **PASS** |
| **INFY** | Infosys Ltd | 17 | INSUFFICIENT | DATA_INSUFFICIENT | 1 | 0 | **PASS** | **PASS** | **PASS** |
| **ICICIBANK** | ICICI Bank Ltd | 17 | INSUFFICIENT | DATA_INSUFFICIENT | 2 | 0 | **PASS** | **PASS** | **PASS** |
| **SUNPHARMA** | Sun Pharmaceutical Industries Ltd | 17 | INSUFFICIENT | DATA_INSUFFICIENT | 1 | 0 | **PASS** | **PASS** | **PASS** |
| **TITAN** | Titan Company Ltd | 17 | INSUFFICIENT | DATA_INSUFFICIENT | 1 | 0 | **PASS** | **PASS** | **PASS** |
| **BEL** | Bharat Electronics Ltd | 17 | INSUFFICIENT | DATA_INSUFFICIENT | 0 | 0 | **PASS** | **PASS** | **PASS** |
| **DYCL** *(Adversarial)* | Dynamic Cables Ltd | 17 | INSUFFICIENT | DATA_INSUFFICIENT | 0 | 0 | **PASS** | **PASS** | **PASS** |

---

## 3. Key Invariant Audits

### 3.1 ClaimSafetyGate Audit Results
* **Total Assertions Audited:** 11 companies audited
* **Violations Triggered in Unsanitized Code:** 0 entering Thesis / Synthesis
* **Forbidden Pattern Verification:**
  * Rejected: Motive/psychological assumptions ("institutions distrust", "promoters intend to dump")
  * Rejected: Unadjudicated market manipulation claims ("float is manipulated", "operator game")
  * Rejected: Speculative governance collapse narratives ("management crisis")
  * Rejected: Promotional superlatives ("obviously undervalued", "screaming buy", "flawless business")
  * Rejected: Definitive price predictions ("₹420 will hold")

### 3.2 Cross-Module Metric Consistency
* **Validator:** `CrossModuleConsistencyValidator`
* **Result:** **0 Conflicts Detected** across evaluated modules for all 11 companies.
* When fundamental metrics are absent, downstream engines correctly report `DATA_INSUFFICIENT` rather than manufacturing fallback values or redistributing weights.

### 3.3 Data Coverage Integrity
* The engine acknowledged that while raw snapshot blobs exist in the database, the detailed time series in tables like `company_facts` and `management_claim_candidate` remain unpopulated for golden companies.
* Under Constitution Article C5, the engine honestly returns `overallSuitability: DATA_INSUFFICIENT` rather than falsely declaring "Fundamentals Complete".

---

## 4. Verification Command
To reproduce this entire acceptance suite independently at any time:
```bash
npm run intelligence:acceptance
```
All 11 companies evaluate cleanly in ~20 seconds with 100% test pass rate.
