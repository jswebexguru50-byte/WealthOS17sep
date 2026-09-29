# DYCL Adversarial Small-Cap Case Report

**Security:** Dynamic Cables Limited (`NSE: DYCL` / `BSE: 540795` / `ISIN: INE600Y01019`)  
**Evaluation Horizon:** 29 September 2026  
**Role:** 11th Adversarial Stress-Test Case for WealthOS Intelligence Constitution

---

## 1. Why DYCL was Selected as the Adversarial Benchmark

While the 10 Golden Companies (RELIANCE, TCS, HDFCBANK, etc.) are mega-caps with deep institutional coverage, liquid order books, and stable analyst consensus, **Dynamic Cables Limited (`DYCL`)** stresses the intelligence stack across all realistic small-cap failure modes:
1. **Low / Zero Institutional Holding:** 0.00% Mutual Funds, <1% DII, <1% FII.
2. **Proprietary Trading & Microstructure Noise:** Intraday high-frequency trading (HFT) and algo churn (e.g. Microcurves, Junomoneta, QE Securities round-tripping lakhs of shares).
3. **Recent Executive Exits:** Dual resignations of senior management personnel within two weeks in September 2026.
4. **Regulatory Inquiries & Code of Conduct Breaches:** Exchange price clarification letter (02-Sep-2026) and SEBI (PIT) contra-trade reporting (28-Sep-2026).
5. **Peer Valuation Discrepancies:** Trading at ~23x P/E vs. peer leaders (Polycab, KEI) at 43x–45x.

---

## 2. Adversarial Language Checks: Corrected vs. Forbidden Discourse

Under **Article C2 (Observation ≠ Interpretation)** and **Section 22 (Claim Safety Gate)**, the system enforced strict analytical discipline on DYCL:

| Analytical Event | Forbidden Interpretation (Adversarial Trap) | Approved Constitutional Statement (Factual Observation) | ClaimSafetyGate Status |
| :--- | :--- | :--- | :---: |
| **Institutional Shareholding** | *"Institutional investors distrust the company."* | *"No reported mutual-fund ownership in source dataset as of June 2026 shareholding pattern."* | **ENFORCED** |
| **High Intraday Churn** | *"The float is being manipulated by operators conducting circular trading."* | *"Substantial same-day proprietary trading activity observed across four quantitative broker entities."* | **ENFORCED** |
| **Senior Management Exits** | *"A management crisis is developing after back-to-back departures."* | *"Two disclosed departures of senior management personnel occurred during September 2026; operational implication currently unknown."* | **ENFORCED** |
| **Valuation Gap** | *"The stock is obviously undervalued compared to Polycab and is a screaming buy."* | *"Current P/E of 23.1x is 46% lower than selected peer median of 43.1x, reflecting business mix differences and tender exposure."* | **ENFORCED** |
| **Price Support** | *"The major technical support at ₹420 will hold against further downside."* | *"₹416–420 has recently acted as a traded support area across the evaluated lookback window."* | **ENFORCED** |
| **SEBI PIT Breach** | *"Promoters engaged in insider trading."* | *"Procedural contra-trade infraction by a non-promoter technical executive involving 100 shares; warning letter issued."* | **ENFORCED** |

---

## 3. Data Completeness & Reality Check on DYCL

* **P&L / Balance Sheet:**
  * FY26 PAT: ₹84.44 Cr (+30.3% YoY)
  * TTM PAT: ₹91.18 Cr (+27.7% YoY)
  * Q1FY27 PAT: ₹24.95 Cr (+37.1% YoY)
  * Total Debt/Equity: **0.09x** (Virtually debt-free)
  * Altman Z-Score: **8.96** (Safe solvency)
  * Piotroski F-Score: **7 / 9** (Strong operationally)
* **Data Coverage Verdict:**
  * `FUNDAMENTALS`: SUFFICIENT / PARTIAL (standalone history available; detailed consolidated schedules missing)
  * `MANAGEMENT`: **INSUFFICIENT** (Honest: no transcribed conference call commitment rows in `management_claim_candidate`)
  * `Suitability`: **CONDITIONAL_ANALYSIS** (No false claims of complete data)

---

## 4. Conclusion

DYCL serves as the permanent adversarial fixture in `tests/unit/intelligence_constitution_adversarial.test.ts` and `tests/unit/master_acceptance_suite.test.ts`. Any regression that introduces speculation, moralizing, or unevidenced motive attribution will fail the automated CI test gate.
