# WealthOS PILOT_RUN_001 Review Authenticity Report

**Run ID:** `PILOT_RUN_001`

This document records exactly how each of the 100 claim outcomes in PILOT_RUN_001 was produced.

## Statement of Review Authenticity

**None of the outcomes in PILOT_RUN_001 were produced by an independent LLM interpretation review.**

All outcomes were produced deterministically by a developer-authored script (`run_pilot_calibration_run_001.ts`), which hardcoded logical rules for specific metrics (e.g., checking if growth is > 0, if margin bps change > 50, or if businessModel === 'BANK').

## Claim Outcomes Summary

| Outcome | Count | Method |
|---|---|---|
| **REASONABLE** | 22 | DEVELOPER_AUTHORED_RULE |
| **SUPPORTED** | 74 | DEVELOPER_AUTHORED_RULE |
| **QUESTIONABLE** | 3 | DEVELOPER_AUTHORED_RULE |
| **INSUFFICIENT_EVIDENCE** | 1 | DEVELOPER_AUTHORED_RULE |

## Detailed Claim Authenticity Log

### 1. TCS - REVENUE_GROWTH (CLAIM_TCS_GROWTH_01)
- **WealthOS Claim:** STABLE - Revenue trajectory evaluated as STABLE with latest growth of 4.68% (Mar 2026 vs Mar 2025 vs Mar 2024).
- **Outcome Assigned:** **REASONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Revenue evaluated as STABLE.

### 2. TCS - MARGIN_TRAJECTORY (CLAIM_TCS_MARGIN_02)
- **WealthOS Claim:** CONTRACTING - Operating margin trajectory evaluated as CONTRACTING with delta of -107 bps using EBITDA_MARGIN.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Margin status 'CONTRACTING' accurately aligns with -107 bps change (threshold 50 bps for industrial, 15 bps for NIM).

### 3. TCS - RETURN_PROFILE (CLAIM_TCS_RETURN_03)
- **WealthOS Claim:** HIGH_QUALITY - Capital efficiency return profile assessed as HIGH_QUALITY with ROCE at 55.21%.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Return metric 55.21% comfortably clears high-quality hurdle rate (>=18%).

### 4. TCS - DEBT_TRAJECTORY (CLAIM_TCS_DEBT_04)
- **WealthOS Claim:** DATA_INSUFFICIENT - Financial leverage and debt trajectory assessed as DATA_INSUFFICIENT.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Balance sheet debt history currently lacks multi-year snapshot pairing in database; engine correctly abstains.

### 5. TCS - VALUATION_MULTIPLE (CLAIM_TCS_VALUATION_06)
- **WealthOS Claim:** AVAILABLE - Valuation assessment evaluated as AVAILABLE with trailing multiples.
- **Outcome Assigned:** **REASONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Valuation multiple status grounded in available ratio snapshots.

### 6. INFY - REVENUE_GROWTH (CLAIM_INFY_GROWTH_01)
- **WealthOS Claim:** ACCELERATING - Revenue trajectory evaluated as ACCELERATING with latest growth of 9.83% (Mar 2026 vs Mar 2025 vs Mar 2024).
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Trajectory status 'ACCELERATING' is mathematically consistent with 9.83% latest growth vs 5.18% prior growth.

### 7. INFY - MARGIN_TRAJECTORY (CLAIM_INFY_MARGIN_02)
- **WealthOS Claim:** CONTRACTING - Operating margin trajectory evaluated as CONTRACTING with delta of -72 bps using EBITDA_MARGIN.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Margin status 'CONTRACTING' accurately aligns with -72 bps change (threshold 50 bps for industrial, 15 bps for NIM).

### 8. INFY - RETURN_PROFILE (CLAIM_INFY_RETURN_03)
- **WealthOS Claim:** HIGH_QUALITY - Capital efficiency return profile assessed as HIGH_QUALITY with ROCE at 40.54%.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Return metric 40.54% comfortably clears high-quality hurdle rate (>=18%).

### 9. INFY - DEBT_TRAJECTORY (CLAIM_INFY_DEBT_04)
- **WealthOS Claim:** DATA_INSUFFICIENT - Financial leverage and debt trajectory assessed as DATA_INSUFFICIENT.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Balance sheet debt history currently lacks multi-year snapshot pairing in database; engine correctly abstains.

### 10. INFY - VALUATION_MULTIPLE (CLAIM_INFY_VALUATION_06)
- **WealthOS Claim:** AVAILABLE - Valuation assessment evaluated as AVAILABLE with trailing multiples.
- **Outcome Assigned:** **REASONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Valuation multiple status grounded in available ratio snapshots.

### 11. BAJFINANCE - REVENUE_GROWTH (CLAIM_BAJFINANCE_GROWTH_01)
- **WealthOS Claim:** DECELERATING - Revenue trajectory evaluated as DECELERATING with latest growth of 19.15% (Mar 2026 vs Mar 2025 vs Mar 2024).
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Trajectory status 'DECELERATING' is mathematically consistent with 19.15% latest growth vs 25.17% prior growth.

### 12. BAJFINANCE - MARGIN_TRAJECTORY (CLAIM_BAJFINANCE_MARGIN_02)
- **WealthOS Claim:** CONTRACTING - Operating margin trajectory evaluated as CONTRACTING with delta of -60 bps using EBITDA_MARGIN.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Margin status 'CONTRACTING' accurately aligns with -60 bps change (threshold 50 bps for industrial, 15 bps for NIM).

### 13. BAJFINANCE - RETURN_PROFILE (CLAIM_BAJFINANCE_RETURN_03)
- **WealthOS Claim:** LOW - Capital efficiency return profile assessed as LOW with ROCE at 9.91%.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Return metric 9.91% falls below 12% cost-of-capital benchmark.

### 14. BAJFINANCE - DEBT_TRAJECTORY (CLAIM_BAJFINANCE_DEBT_04)
- **WealthOS Claim:** NOT_APPLICABLE - Financial leverage and debt trajectory assessed as NOT_APPLICABLE.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Correctly identifies that debt-to-equity leverage rules do not apply to financial sector lending books.

### 15. BAJFINANCE - VALUATION_MULTIPLE (CLAIM_BAJFINANCE_VALUATION_06)
- **WealthOS Claim:** AVAILABLE - Valuation assessment evaluated as AVAILABLE with trailing multiples.
- **Outcome Assigned:** **REASONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Valuation multiple status grounded in available ratio snapshots.

### 16. HDFCBANK - REVENUE_GROWTH (CLAIM_HDFCBANK_GROWTH_01)
- **WealthOS Claim:** DECELERATING - Revenue trajectory evaluated as DECELERATING with latest growth of 5.21% (Mar 2026 vs Mar 2025 vs Mar 2024).
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Trajectory status 'DECELERATING' is mathematically consistent with 5.21% latest growth vs 15.42% prior growth.

### 17. HDFCBANK - MARGIN_TRAJECTORY (CLAIM_HDFCBANK_MARGIN_02)
- **WealthOS Claim:** STABLE - Operating margin trajectory evaluated as STABLE with delta of 18 bps using EBITDA_MARGIN.
- **Outcome Assigned:** **QUESTIONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Banking entities have no cost of goods sold; EBITDA margin is meaningless. NIM or Cost-to-Income must be used.

### 18. HDFCBANK - RETURN_PROFILE (CLAIM_HDFCBANK_RETURN_03)
- **WealthOS Claim:** MODERATE - Capital efficiency return profile assessed as MODERATE with ROCE at 13.61%.
- **Outcome Assigned:** **QUESTIONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Banks operate on leverage; ROCE is distorted by deposits. ROE or ROA is the appropriate capital efficiency metric.

### 19. HDFCBANK - DEBT_TRAJECTORY (CLAIM_HDFCBANK_DEBT_04)
- **WealthOS Claim:** DATA_INSUFFICIENT - Financial leverage and debt trajectory assessed as DATA_INSUFFICIENT.
- **Outcome Assigned:** **QUESTIONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Debt trajectory asserted for financial entity where borrowings represent operating capital.

### 20. HDFCBANK - VALUATION_MULTIPLE (CLAIM_HDFCBANK_VALUATION_06)
- **WealthOS Claim:** AVAILABLE - Valuation assessment evaluated as AVAILABLE with trailing multiples.
- **Outcome Assigned:** **REASONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Valuation multiple status grounded in available ratio snapshots.

### 21. RELIANCE - REVENUE_GROWTH (CLAIM_RELIANCE_GROWTH_01)
- **WealthOS Claim:** ACCELERATING - Revenue trajectory evaluated as ACCELERATING with latest growth of 10.53% (Mar 2026 vs Mar 2025 vs Mar 2024).
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Trajectory status 'ACCELERATING' is mathematically consistent with 10.53% latest growth vs 7.15% prior growth.

### 22. RELIANCE - MARGIN_TRAJECTORY (CLAIM_RELIANCE_MARGIN_02)
- **WealthOS Claim:** EXPANDING - Operating margin trajectory evaluated as EXPANDING with delta of 55 bps using EBITDA_MARGIN.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Margin status 'EXPANDING' accurately aligns with 55 bps change (threshold 50 bps for industrial, 15 bps for NIM).

### 23. RELIANCE - RETURN_PROFILE (CLAIM_RELIANCE_RETURN_03)
- **WealthOS Claim:** LOW - Capital efficiency return profile assessed as LOW with ROCE at 10.39%.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Return metric 10.39% falls below 12% cost-of-capital benchmark.

### 24. RELIANCE - DEBT_TRAJECTORY (CLAIM_RELIANCE_DEBT_04)
- **WealthOS Claim:** DATA_INSUFFICIENT - Financial leverage and debt trajectory assessed as DATA_INSUFFICIENT.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Balance sheet debt history currently lacks multi-year snapshot pairing in database; engine correctly abstains.

### 25. RELIANCE - VALUATION_MULTIPLE (CLAIM_RELIANCE_VALUATION_06)
- **WealthOS Claim:** AVAILABLE - Valuation assessment evaluated as AVAILABLE with trailing multiples.
- **Outcome Assigned:** **REASONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Valuation multiple status grounded in available ratio snapshots.

### 26. TATAMOTORS - REVENUE_GROWTH (CLAIM_TATAMOTORS_GROWTH_01)
- **WealthOS Claim:** ACCELERATING - Revenue trajectory evaluated as ACCELERATING with latest growth of -8.12% (Mar 2026 vs Mar 2025 vs Mar 2024).
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Trajectory status 'ACCELERATING' is mathematically consistent with -8.12% latest growth vs -15.51% prior growth.

### 27. TATAMOTORS - MARGIN_TRAJECTORY (CLAIM_TATAMOTORS_MARGIN_02)
- **WealthOS Claim:** CONTRACTING - Operating margin trajectory evaluated as CONTRACTING with delta of -813 bps using EBITDA_MARGIN.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Margin status 'CONTRACTING' accurately aligns with -813 bps change (threshold 50 bps for industrial, 15 bps for NIM).

### 28. TATAMOTORS - RETURN_PROFILE (CLAIM_TATAMOTORS_RETURN_03)
- **WealthOS Claim:** LOW - Capital efficiency return profile assessed as LOW with ROCE at 2.52%.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Return metric 2.52% falls below 12% cost-of-capital benchmark.

### 29. TATAMOTORS - DEBT_TRAJECTORY (CLAIM_TATAMOTORS_DEBT_04)
- **WealthOS Claim:** DATA_INSUFFICIENT - Financial leverage and debt trajectory assessed as DATA_INSUFFICIENT.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Balance sheet debt history currently lacks multi-year snapshot pairing in database; engine correctly abstains.

### 30. TATAMOTORS - VALUATION_MULTIPLE (CLAIM_TATAMOTORS_VALUATION_06)
- **WealthOS Claim:** AVAILABLE - Valuation assessment evaluated as AVAILABLE with trailing multiples.
- **Outcome Assigned:** **REASONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Valuation multiple status grounded in available ratio snapshots.

### 31. TATASTEEL - REVENUE_GROWTH (CLAIM_TATASTEEL_GROWTH_01)
- **WealthOS Claim:** ACCELERATING - Revenue trajectory evaluated as ACCELERATING with latest growth of 6.12% (Mar 2026 vs Mar 2025 vs Mar 2024).
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Trajectory status 'ACCELERATING' is mathematically consistent with 6.12% latest growth vs -4.72% prior growth.

### 32. TATASTEEL - MARGIN_TRAJECTORY (CLAIM_TATASTEEL_MARGIN_02)
- **WealthOS Claim:** EXPANDING - Operating margin trajectory evaluated as EXPANDING with delta of 302 bps using EBITDA_MARGIN.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Margin status 'EXPANDING' accurately aligns with 302 bps change (threshold 50 bps for industrial, 15 bps for NIM).

### 33. TATASTEEL - RETURN_PROFILE (CLAIM_TATASTEEL_RETURN_03)
- **WealthOS Claim:** LOW - Capital efficiency return profile assessed as LOW with ROCE at 11.35%.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Return metric 11.35% falls below 12% cost-of-capital benchmark.

### 34. TATASTEEL - DEBT_TRAJECTORY (CLAIM_TATASTEEL_DEBT_04)
- **WealthOS Claim:** DATA_INSUFFICIENT - Financial leverage and debt trajectory assessed as DATA_INSUFFICIENT.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Balance sheet debt history currently lacks multi-year snapshot pairing in database; engine correctly abstains.

### 35. TATASTEEL - VALUATION_MULTIPLE (CLAIM_TATASTEEL_VALUATION_06)
- **WealthOS Claim:** AVAILABLE - Valuation assessment evaluated as AVAILABLE with trailing multiples.
- **Outcome Assigned:** **REASONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Valuation multiple status grounded in available ratio snapshots.

### 36. SUNPHARMA - REVENUE_GROWTH (CLAIM_SUNPHARMA_GROWTH_01)
- **WealthOS Claim:** STABLE - Revenue trajectory evaluated as STABLE with latest growth of 10.8% (Mar 2026 vs Mar 2025 vs Mar 2024).
- **Outcome Assigned:** **REASONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Revenue evaluated as STABLE.

### 37. SUNPHARMA - MARGIN_TRAJECTORY (CLAIM_SUNPHARMA_MARGIN_02)
- **WealthOS Claim:** STABLE - Operating margin trajectory evaluated as STABLE with delta of -20 bps using EBITDA_MARGIN.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Margin status 'STABLE' accurately aligns with -20 bps change (threshold 50 bps for industrial, 15 bps for NIM).

### 38. SUNPHARMA - RETURN_PROFILE (CLAIM_SUNPHARMA_RETURN_03)
- **WealthOS Claim:** MODERATE - Capital efficiency return profile assessed as MODERATE with ROCE at 17.33%.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Return metric 17.33% satisfies moderate capital return benchmark (12-18%).

### 39. SUNPHARMA - DEBT_TRAJECTORY (CLAIM_SUNPHARMA_DEBT_04)
- **WealthOS Claim:** DATA_INSUFFICIENT - Financial leverage and debt trajectory assessed as DATA_INSUFFICIENT.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Balance sheet debt history currently lacks multi-year snapshot pairing in database; engine correctly abstains.

### 40. SUNPHARMA - VALUATION_MULTIPLE (CLAIM_SUNPHARMA_VALUATION_06)
- **WealthOS Claim:** AVAILABLE - Valuation assessment evaluated as AVAILABLE with trailing multiples.
- **Outcome Assigned:** **REASONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Valuation multiple status grounded in available ratio snapshots.

### 41. TITAN - REVENUE_GROWTH (CLAIM_TITAN_GROWTH_01)
- **WealthOS Claim:** ACCELERATING - Revenue trajectory evaluated as ACCELERATING with latest growth of 44.62% (Mar 2026 vs Mar 2025 vs Mar 2024).
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Trajectory status 'ACCELERATING' is mathematically consistent with 44.62% latest growth vs 18.07% prior growth.

### 42. TITAN - MARGIN_TRAJECTORY (CLAIM_TITAN_MARGIN_02)
- **WealthOS Claim:** STABLE - Operating margin trajectory evaluated as STABLE with delta of 27 bps using EBITDA_MARGIN.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Margin status 'STABLE' accurately aligns with 27 bps change (threshold 50 bps for industrial, 15 bps for NIM).

### 43. TITAN - RETURN_PROFILE (CLAIM_TITAN_RETURN_03)
- **WealthOS Claim:** HIGH_QUALITY - Capital efficiency return profile assessed as HIGH_QUALITY with ROCE at 24.83%.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Return metric 24.83% comfortably clears high-quality hurdle rate (>=18%).

### 44. TITAN - DEBT_TRAJECTORY (CLAIM_TITAN_DEBT_04)
- **WealthOS Claim:** DATA_INSUFFICIENT - Financial leverage and debt trajectory assessed as DATA_INSUFFICIENT.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Balance sheet debt history currently lacks multi-year snapshot pairing in database; engine correctly abstains.

### 45. TITAN - VALUATION_MULTIPLE (CLAIM_TITAN_VALUATION_06)
- **WealthOS Claim:** AVAILABLE - Valuation assessment evaluated as AVAILABLE with trailing multiples.
- **Outcome Assigned:** **REASONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Valuation multiple status grounded in available ratio snapshots.

### 46. LTIM - REVENUE_GROWTH (CLAIM_LTIM_GROWTH_01)
- **WealthOS Claim:** ACCELERATING - Revenue trajectory evaluated as ACCELERATING with latest growth of 11.29% (Mar 2026 vs Mar 2025 vs Mar 2024).
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Trajectory status 'ACCELERATING' is mathematically consistent with 11.29% latest growth vs 7.67% prior growth.

### 47. LTIM - MARGIN_TRAJECTORY (CLAIM_LTIM_MARGIN_02)
- **WealthOS Claim:** STABLE - Operating margin trajectory evaluated as STABLE with delta of -29 bps using EBITDA_MARGIN.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Margin status 'STABLE' accurately aligns with -29 bps change (threshold 50 bps for industrial, 15 bps for NIM).

### 48. LTIM - RETURN_PROFILE (CLAIM_LTIM_RETURN_03)
- **WealthOS Claim:** HIGH_QUALITY - Capital efficiency return profile assessed as HIGH_QUALITY with ROCE at 25.54%.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Return metric 25.54% comfortably clears high-quality hurdle rate (>=18%).

### 49. LTIM - DEBT_TRAJECTORY (CLAIM_LTIM_DEBT_04)
- **WealthOS Claim:** DATA_INSUFFICIENT - Financial leverage and debt trajectory assessed as DATA_INSUFFICIENT.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Balance sheet debt history currently lacks multi-year snapshot pairing in database; engine correctly abstains.

### 50. LTIM - VALUATION_MULTIPLE (CLAIM_LTIM_VALUATION_06)
- **WealthOS Claim:** AVAILABLE - Valuation assessment evaluated as AVAILABLE with trailing multiples.
- **Outcome Assigned:** **REASONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Valuation multiple status grounded in available ratio snapshots.

### 51. LT - REVENUE_GROWTH (CLAIM_LT_GROWTH_01)
- **WealthOS Claim:** DECELERATING - Revenue trajectory evaluated as DECELERATING with latest growth of 12.23% (Mar 2026 vs Mar 2025 vs Mar 2024).
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Trajectory status 'DECELERATING' is mathematically consistent with 12.23% latest growth vs 15.35% prior growth.

### 52. LT - MARGIN_TRAJECTORY (CLAIM_LT_MARGIN_02)
- **WealthOS Claim:** STABLE - Operating margin trajectory evaluated as STABLE with delta of -17 bps using EBITDA_MARGIN.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Margin status 'STABLE' accurately aligns with -17 bps change (threshold 50 bps for industrial, 15 bps for NIM).

### 53. LT - RETURN_PROFILE (CLAIM_LT_RETURN_03)
- **WealthOS Claim:** MODERATE - Capital efficiency return profile assessed as MODERATE with ROCE at 15.13%.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Return metric 15.13% satisfies moderate capital return benchmark (12-18%).

### 54. LT - DEBT_TRAJECTORY (CLAIM_LT_DEBT_04)
- **WealthOS Claim:** DATA_INSUFFICIENT - Financial leverage and debt trajectory assessed as DATA_INSUFFICIENT.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Balance sheet debt history currently lacks multi-year snapshot pairing in database; engine correctly abstains.

### 55. LT - VALUATION_MULTIPLE (CLAIM_LT_VALUATION_06)
- **WealthOS Claim:** AVAILABLE - Valuation assessment evaluated as AVAILABLE with trailing multiples.
- **Outcome Assigned:** **REASONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Valuation multiple status grounded in available ratio snapshots.

### 56. ASTRAL - REVENUE_GROWTH (CLAIM_ASTRAL_GROWTH_01)
- **WealthOS Claim:** ACCELERATING - Revenue trajectory evaluated as ACCELERATING with latest growth of 12.64% (Mar 2026 vs Mar 2025 vs Mar 2024).
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Trajectory status 'ACCELERATING' is mathematically consistent with 12.64% latest growth vs 3.35% prior growth.

### 57. ASTRAL - MARGIN_TRAJECTORY (CLAIM_ASTRAL_MARGIN_02)
- **WealthOS Claim:** CONTRACTING - Operating margin trajectory evaluated as CONTRACTING with delta of -92 bps using EBITDA_MARGIN.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Margin status 'CONTRACTING' accurately aligns with -92 bps change (threshold 50 bps for industrial, 15 bps for NIM).

### 58. ASTRAL - RETURN_PROFILE (CLAIM_ASTRAL_RETURN_03)
- **WealthOS Claim:** HIGH_QUALITY - Capital efficiency return profile assessed as HIGH_QUALITY with ROCE at 18.44%.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Return metric 18.44% comfortably clears high-quality hurdle rate (>=18%).

### 59. ASTRAL - DEBT_TRAJECTORY (CLAIM_ASTRAL_DEBT_04)
- **WealthOS Claim:** DATA_INSUFFICIENT - Financial leverage and debt trajectory assessed as DATA_INSUFFICIENT.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Balance sheet debt history currently lacks multi-year snapshot pairing in database; engine correctly abstains.

### 60. ASTRAL - VALUATION_MULTIPLE (CLAIM_ASTRAL_VALUATION_06)
- **WealthOS Claim:** AVAILABLE - Valuation assessment evaluated as AVAILABLE with trailing multiples.
- **Outcome Assigned:** **REASONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Valuation multiple status grounded in available ratio snapshots.

### 61. POLYCAB - REVENUE_GROWTH (CLAIM_POLYCAB_GROWTH_01)
- **WealthOS Claim:** ACCELERATING - Revenue trajectory evaluated as ACCELERATING with latest growth of 28.76% (Mar 2026 vs Mar 2025 vs Mar 2024).
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Trajectory status 'ACCELERATING' is mathematically consistent with 28.76% latest growth vs 23.85% prior growth.

### 62. POLYCAB - MARGIN_TRAJECTORY (CLAIM_POLYCAB_MARGIN_02)
- **WealthOS Claim:** STABLE - Operating margin trajectory evaluated as STABLE with delta of 47 bps using EBITDA_MARGIN.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Margin status 'STABLE' accurately aligns with 47 bps change (threshold 50 bps for industrial, 15 bps for NIM).

### 63. POLYCAB - RETURN_PROFILE (CLAIM_POLYCAB_RETURN_03)
- **WealthOS Claim:** HIGH_QUALITY - Capital efficiency return profile assessed as HIGH_QUALITY with ROCE at 31.1%.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Return metric 31.1% comfortably clears high-quality hurdle rate (>=18%).

### 64. POLYCAB - DEBT_TRAJECTORY (CLAIM_POLYCAB_DEBT_04)
- **WealthOS Claim:** DATA_INSUFFICIENT - Financial leverage and debt trajectory assessed as DATA_INSUFFICIENT.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Balance sheet debt history currently lacks multi-year snapshot pairing in database; engine correctly abstains.

### 65. POLYCAB - VALUATION_MULTIPLE (CLAIM_POLYCAB_VALUATION_06)
- **WealthOS Claim:** AVAILABLE - Valuation assessment evaluated as AVAILABLE with trailing multiples.
- **Outcome Assigned:** **REASONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Valuation multiple status grounded in available ratio snapshots.

### 66. DEEPAKNTR - REVENUE_GROWTH (CLAIM_DEEPAKNTR_GROWTH_01)
- **WealthOS Claim:** DECELERATING - Revenue trajectory evaluated as DECELERATING with latest growth of -5.01% (Mar 2026 vs Mar 2025 vs Mar 2024).
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Trajectory status 'DECELERATING' is mathematically consistent with -5.01% latest growth vs 7.84% prior growth.

### 67. DEEPAKNTR - MARGIN_TRAJECTORY (CLAIM_DEEPAKNTR_MARGIN_02)
- **WealthOS Claim:** CONTRACTING - Operating margin trajectory evaluated as CONTRACTING with delta of -186 bps using EBITDA_MARGIN.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Margin status 'CONTRACTING' accurately aligns with -186 bps change (threshold 50 bps for industrial, 15 bps for NIM).

### 68. DEEPAKNTR - RETURN_PROFILE (CLAIM_DEEPAKNTR_RETURN_03)
- **WealthOS Claim:** LOW - Capital efficiency return profile assessed as LOW with ROCE at 10.74%.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Return metric 10.74% falls below 12% cost-of-capital benchmark.

### 69. DEEPAKNTR - DEBT_TRAJECTORY (CLAIM_DEEPAKNTR_DEBT_04)
- **WealthOS Claim:** DATA_INSUFFICIENT - Financial leverage and debt trajectory assessed as DATA_INSUFFICIENT.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Balance sheet debt history currently lacks multi-year snapshot pairing in database; engine correctly abstains.

### 70. DEEPAKNTR - VALUATION_MULTIPLE (CLAIM_DEEPAKNTR_VALUATION_06)
- **WealthOS Claim:** AVAILABLE - Valuation assessment evaluated as AVAILABLE with trailing multiples.
- **Outcome Assigned:** **REASONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Valuation multiple status grounded in available ratio snapshots.

### 71. PIDILITIND - REVENUE_GROWTH (CLAIM_PIDILITIND_GROWTH_01)
- **WealthOS Claim:** ACCELERATING - Revenue trajectory evaluated as ACCELERATING with latest growth of 11.05% (Mar 2026 vs Mar 2025 vs Mar 2024).
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Trajectory status 'ACCELERATING' is mathematically consistent with 11.05% latest growth vs 6.91% prior growth.

### 72. PIDILITIND - MARGIN_TRAJECTORY (CLAIM_PIDILITIND_MARGIN_02)
- **WealthOS Claim:** EXPANDING - Operating margin trajectory evaluated as EXPANDING with delta of 125 bps using EBITDA_MARGIN.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Margin status 'EXPANDING' accurately aligns with 125 bps change (threshold 50 bps for industrial, 15 bps for NIM).

### 73. PIDILITIND - RETURN_PROFILE (CLAIM_PIDILITIND_RETURN_03)
- **WealthOS Claim:** HIGH_QUALITY - Capital efficiency return profile assessed as HIGH_QUALITY with ROCE at 29.97%.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Return metric 29.97% comfortably clears high-quality hurdle rate (>=18%).

### 74. PIDILITIND - DEBT_TRAJECTORY (CLAIM_PIDILITIND_DEBT_04)
- **WealthOS Claim:** DATA_INSUFFICIENT - Financial leverage and debt trajectory assessed as DATA_INSUFFICIENT.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Balance sheet debt history currently lacks multi-year snapshot pairing in database; engine correctly abstains.

### 75. PIDILITIND - VALUATION_MULTIPLE (CLAIM_PIDILITIND_VALUATION_06)
- **WealthOS Claim:** AVAILABLE - Valuation assessment evaluated as AVAILABLE with trailing multiples.
- **Outcome Assigned:** **REASONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Valuation multiple status grounded in available ratio snapshots.

### 76. AAVAS - REVENUE_GROWTH (CLAIM_AAVAS_GROWTH_01)
- **WealthOS Claim:** ACCELERATING - Revenue trajectory evaluated as ACCELERATING with latest growth of 25.43% (Mar 2024 vs Mar 2023 vs Mar 2022).
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Trajectory status 'ACCELERATING' is mathematically consistent with 25.43% latest growth vs 23.33% prior growth.

### 77. AAVAS - MARGIN_TRAJECTORY (CLAIM_AAVAS_MARGIN_02)
- **WealthOS Claim:** CONTRACTING - Operating margin trajectory evaluated as CONTRACTING with delta of -310 bps using EBITDA_MARGIN.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Margin status 'CONTRACTING' accurately aligns with -310 bps change (threshold 50 bps for industrial, 15 bps for NIM).

### 78. AAVAS - RETURN_PROFILE (CLAIM_AAVAS_RETURN_03)
- **WealthOS Claim:** LOW - Capital efficiency return profile assessed as LOW with ROCE at 9.91%.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Return metric 9.91% falls below 12% cost-of-capital benchmark.

### 79. AAVAS - DEBT_TRAJECTORY (CLAIM_AAVAS_DEBT_04)
- **WealthOS Claim:** DATA_INSUFFICIENT - Financial leverage and debt trajectory assessed as DATA_INSUFFICIENT.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Balance sheet debt history currently lacks multi-year snapshot pairing in database; engine correctly abstains.

### 80. AAVAS - VALUATION_MULTIPLE (CLAIM_AAVAS_VALUATION_06)
- **WealthOS Claim:** AVAILABLE - Valuation assessment evaluated as AVAILABLE with trailing multiples.
- **Outcome Assigned:** **REASONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Valuation multiple status grounded in available ratio snapshots.

### 81. CLEAN - REVENUE_GROWTH (CLAIM_CLEAN_GROWTH_01)
- **WealthOS Claim:** DECELERATING - Revenue trajectory evaluated as DECELERATING with latest growth of -1.6% (Mar 2026 vs Mar 2025 vs Mar 2024).
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Trajectory status 'DECELERATING' is mathematically consistent with -1.6% latest growth vs 20.71% prior growth.

### 82. CLEAN - MARGIN_TRAJECTORY (CLAIM_CLEAN_MARGIN_02)
- **WealthOS Claim:** CONTRACTING - Operating margin trajectory evaluated as CONTRACTING with delta of -418 bps using EBITDA_MARGIN.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Margin status 'CONTRACTING' accurately aligns with -418 bps change (threshold 50 bps for industrial, 15 bps for NIM).

### 83. CLEAN - RETURN_PROFILE (CLAIM_CLEAN_RETURN_03)
- **WealthOS Claim:** HIGH_QUALITY - Capital efficiency return profile assessed as HIGH_QUALITY with ROCE at 19.52%.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Return metric 19.52% comfortably clears high-quality hurdle rate (>=18%).

### 84. CLEAN - DEBT_TRAJECTORY (CLAIM_CLEAN_DEBT_04)
- **WealthOS Claim:** DATA_INSUFFICIENT - Financial leverage and debt trajectory assessed as DATA_INSUFFICIENT.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Balance sheet debt history currently lacks multi-year snapshot pairing in database; engine correctly abstains.

### 85. CLEAN - VALUATION_MULTIPLE (CLAIM_CLEAN_VALUATION_06)
- **WealthOS Claim:** AVAILABLE - Valuation assessment evaluated as AVAILABLE with trailing multiples.
- **Outcome Assigned:** **REASONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Valuation multiple status grounded in available ratio snapshots.

### 86. RAMCOIND - REVENUE_GROWTH (CLAIM_RAMCOIND_GROWTH_01)
- **WealthOS Claim:** DECELERATING - Revenue trajectory evaluated as DECELERATING with latest growth of 6.97% (Mar 2026 vs Mar 2025 vs Mar 2024).
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Trajectory status 'DECELERATING' is mathematically consistent with 6.97% latest growth vs 11.48% prior growth.

### 87. RAMCOIND - MARGIN_TRAJECTORY (CLAIM_RAMCOIND_MARGIN_02)
- **WealthOS Claim:** EXPANDING - Operating margin trajectory evaluated as EXPANDING with delta of 270 bps using EBITDA_MARGIN.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Margin status 'EXPANDING' accurately aligns with 270 bps change (threshold 50 bps for industrial, 15 bps for NIM).

### 88. RAMCOIND - RETURN_PROFILE (CLAIM_RAMCOIND_RETURN_03)
- **WealthOS Claim:** LOW - Capital efficiency return profile assessed as LOW with ROCE at 4.64%.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Return metric 4.64% falls below 12% cost-of-capital benchmark.

### 89. RAMCOIND - DEBT_TRAJECTORY (CLAIM_RAMCOIND_DEBT_04)
- **WealthOS Claim:** DATA_INSUFFICIENT - Financial leverage and debt trajectory assessed as DATA_INSUFFICIENT.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Balance sheet debt history currently lacks multi-year snapshot pairing in database; engine correctly abstains.

### 90. RAMCOIND - VALUATION_MULTIPLE (CLAIM_RAMCOIND_VALUATION_06)
- **WealthOS Claim:** AVAILABLE - Valuation assessment evaluated as AVAILABLE with trailing multiples.
- **Outcome Assigned:** **REASONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Valuation multiple status grounded in available ratio snapshots.

### 91. DYCL - REVENUE_GROWTH (CLAIM_DYCL_GROWTH_01)
- **WealthOS Claim:** DATA_INSUFFICIENT - Revenue trajectory evaluated as DATA_INSUFFICIENT with latest growth of N/A% (unknown periods).
- **Outcome Assigned:** **INSUFFICIENT_EVIDENCE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Revenue growth trajectory cannot be validated due to absence of prior period revenue.

### 92. DYCL - MARGIN_TRAJECTORY (CLAIM_DYCL_MARGIN_02)
- **WealthOS Claim:** DATA_INSUFFICIENT - Operating margin trajectory evaluated as DATA_INSUFFICIENT with delta of N/A bps using EBITDA_MARGIN.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Correctly abstains from asserting margin trajectory when historical revenue/EBITDA pairs are missing.

### 93. DYCL - RETURN_PROFILE (CLAIM_DYCL_RETURN_03)
- **WealthOS Claim:** HIGH_QUALITY - Capital efficiency return profile assessed as HIGH_QUALITY with ROCE at 24.89%.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Return metric 24.89% comfortably clears high-quality hurdle rate (>=18%).

### 94. DYCL - DEBT_TRAJECTORY (CLAIM_DYCL_DEBT_04)
- **WealthOS Claim:** DATA_INSUFFICIENT - Financial leverage and debt trajectory assessed as DATA_INSUFFICIENT.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Balance sheet debt history currently lacks multi-year snapshot pairing in database; engine correctly abstains.

### 95. DYCL - VALUATION_MULTIPLE (CLAIM_DYCL_VALUATION_06)
- **WealthOS Claim:** AVAILABLE - Valuation assessment evaluated as AVAILABLE with trailing multiples.
- **Outcome Assigned:** **REASONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Valuation multiple status grounded in available ratio snapshots.

### 96. STYL - REVENUE_GROWTH (CLAIM_STYL_GROWTH_01)
- **WealthOS Claim:** ACCELERATING - Revenue trajectory evaluated as ACCELERATING with latest growth of -1.21% (Mar 2026 vs Mar 2025 vs Mar 2024).
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Trajectory status 'ACCELERATING' is mathematically consistent with -1.21% latest growth vs -6.12% prior growth.

### 97. STYL - MARGIN_TRAJECTORY (CLAIM_STYL_MARGIN_02)
- **WealthOS Claim:** EXPANDING - Operating margin trajectory evaluated as EXPANDING with delta of 257 bps using EBITDA_MARGIN.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Margin status 'EXPANDING' accurately aligns with 257 bps change (threshold 50 bps for industrial, 15 bps for NIM).

### 98. STYL - RETURN_PROFILE (CLAIM_STYL_RETURN_03)
- **WealthOS Claim:** HIGH_QUALITY - Capital efficiency return profile assessed as HIGH_QUALITY with ROCE at 23.16%.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Return metric 23.16% comfortably clears high-quality hurdle rate (>=18%).

### 99. STYL - DEBT_TRAJECTORY (CLAIM_STYL_DEBT_04)
- **WealthOS Claim:** DATA_INSUFFICIENT - Financial leverage and debt trajectory assessed as DATA_INSUFFICIENT.
- **Outcome Assigned:** **SUPPORTED**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Balance sheet debt history currently lacks multi-year snapshot pairing in database; engine correctly abstains.

### 100. STYL - VALUATION_MULTIPLE (CLAIM_STYL_VALUATION_06)
- **WealthOS Claim:** AVAILABLE - Valuation assessment evaluated as AVAILABLE with trailing multiples.
- **Outcome Assigned:** **REASONABLE**
- **Review Method:** `DEVELOPER_AUTHORED_RULE`
- **Review Implementation:** run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.
- **Deterministic Logic Used:** Valuation multiple status grounded in available ratio snapshots.

