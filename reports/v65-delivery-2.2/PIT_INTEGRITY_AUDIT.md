# WEALTHOS — POINT-IN-TIME (PIT) & TIMESTAMP INTEGRITY AUDIT (STREAM E)

## 1. OBJECTIVE & MANDATORY INVARIANT
To eliminate future information leakage (lookahead bias) across all historical decisions in WealthOS.

**Mandatory Invariant**:
$$\text{informationAvailableTimestamp} \le \text{decisionTimestamp}$$

---

## 2. TIMESTAMP SEMANTIC DISCOUPLE
WealthOS explicitly decouples and persists six distinct timestamp dimensions per data record:
1. `observationTimestamp`: Time market quote or trade occurred.
2. `publicationTimestamp`: Time official filing or Bhavcopy was released.
3. `effectiveTimestamp`: Date corporate action or financial balance sheet takes effect.
4. `retrievedAt`: System HTTP acquisition time.
5. `persistedAt`: SQLite DB insertion time.
6. `decisionTimestamp`: Timestamp of strategy signal evaluation.

---

## 3. AUDIT FINDINGS BY DATASET
- **`ValuationSnapshots` (DEF-001)**: Verified fixed in `7c5be66`. `observationTimestamp` is extracted directly from market quote metadata rather than `Date.now()`.
- **`DailyOHLCV`**: Verified PIT date boundary enforcement in `DataValidationGate.test.ts`. Future observation or publication timestamps trigger immediate `FAIL_CLOSED`.
- **`HistoricalFinancialStatements`**: PIT verification is `BLOCKED` on primary XBRL publication date verification (`DEF-004`).

---

## 4. VERIFICATION EVIDENCE
Vitest suite `DataValidationGate.test.ts` asserts:
- `verifies complete PIT evidence`: **PASS**
- `blocks missing publication evidence`: **PASS**
- `rejects future observation`: **PASS**
- `rejects future publication`: **PASS**
- `supports explicit NOT_APPLICABLE`: **PASS**
