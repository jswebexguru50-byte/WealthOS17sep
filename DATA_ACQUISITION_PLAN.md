# Multibagger Discovery Platform Architecture (WealthOS)

## 1. Core Objective & Philosophy
WealthOS is not a forensic scoring engine; it is a **functional investment platform** designed to discover multibaggers, test management execution, and evaluate expectations versus reality. 
The system avoids turning every observation into a "score." Instead, it follows a testable, neutral evidence loop:
*What did management say? -> What actually happened? -> What does the evidence show? -> Has the thesis strengthened, weakened, or broken?*

---

## 2. Platform Funnel & Engine Architecture

### A. Multibagger Discovery Engine (Primary)
Focuses on finding earnings acceleration and structural inflection before they are obvious.
*   **Operating Leverage Inflection:** Detects when EBITDA/PAT grows materially faster than revenue alongside rising capacity utilization.
*   **Growth Acceleration:** Flags persistent quarter-over-quarter and year-over-year acceleration across Revenue, EBITDA, and CFO.
*   **ROCE Trajectory:** Prioritizes improving capital efficiency trajectories over static high-ROCE figures.

### B. Business Inflection Engine
Monitors the mechanisms that could drive 3-5x earnings growth over the next cycle.
*   **Capacity Expansion:** Current vs. New Capacity, expected commissioning dates, and potential revenue capacity.
*   **Order-Book to Revenue Conversion:** Order-book growth relative to historical execution speed and working capital drag.
*   **Earnings Revisions:** Positive surprises relative to historical trends and consensus.

### C. Management Walk-the-Talk Ledger
Extracts and explicitly tracks management commitments against actual delivery.
*   *Structure:* Date | Statement | Target | Deadline | Actual Result | Status (Achieved/Missed/Delayed) | Evidence
*   Eliminates arbitrary "Credibility Scores" in favor of factual track records (e.g., "Management has delivered 4/5 revenue targets but 0/3 debt reduction targets").

### D. Expectations vs. Valuation Engine
Avoids outputting a single "Intrinsic Value." Exposes valuation as scenario ranges and reverse-engineers current market prices.
*   **Reverse DCF:** "At today's price, the market implies X% revenue CAGR and Y% margins." Then tests if the company has ever demonstrated those economics.
*   **Scenario Ranges:** EPV and DCF outputs are presented as Bear / Base / Bull ranges based on distinct, explicit assumptions (e.g., Maintenance Capex assumed at ₹70 vs. ₹95).
*   **Historical & Peer Context:** Values companies against their own 5-year median metrics and direct competitors (ROCE, P/E, EV/EBITDA).

### E. Financial Divergence & Forensic Guardrail (Kill-Switches)
Forensics exist to answer: *"Is there something here that could destroy the thesis?"* 
They are not the primary multibagger discovery tool. We track longitudinal divergence rather than branded heuristic traps (e.g., "Inventory Divergence" instead of "Damani Trap"):
*   Revenue ↔ Receivables/Inventory
*   EBITDA/PAT ↔ Cash From Operations (CFO)
*   CWIP ↔ Commissioned Assets
*   Promoter Holding ↔ Pledge Invocation / Open Market Sales
*   **Rule:** Severe governance events (e.g., auditor resignation, heavy pledge invocation) trigger a `SEVERE_GOVERNANCE_RISK_EVENT` for manual review, rather than an automatic algorithmic sell.

### F. Technical Entry Engine (S1-S12)
Technical analysis identifies **WHEN** to enter, intersecting with the fundamental **WHAT**.
*   *Setup:* Fundamental Inflection + Earnings Acceleration + Technical Breakout + Volume Confirmation.

---

## 3. Data Classification & Handling Missing Data

WealthOS separates data into three distinct tiers of truth:
*   **Tier A (Primary Evidence):** NSE/BSE filings, Annual Reports, Concall Transcripts, Credit Ratings.
*   **Tier B (Structured Secondary Data):** Trendlyne, Upstox API, Kite Connect.
*   **Tier C (Derived Analysis):** WealthOS calculations (Scenario Assumptions, Divergence Checks).

**Handling Missing Information (`DATA_INSUFFICIENT`):**
*   **No Fabrications or Penalized Proxies:** If `maintenance_capex` is not reported, it remains `null` at the Fact layer. It is NOT artificially imputed with a 20-point penalty.
*   **Graceful Degradation:** A missing input does not block the entire dossier. If DCF fails due to missing WACC assumptions, the system still outputs Cash Conversion, Governance, and Technicals as `AVAILABLE`. 
*   **Expose Assumptions:** Instead of hardcoding derived proxies, missing fields can be filled by explicit, user-visible Scenario Assumptions (Low/Base/High).

---

## 4. Anomaly-Triggered Document Investigation
If the Divergence Engine detects an anomaly (e.g., Receivables +63% while Revenue +14%), the system automatically triggers a document search (Annual Reports, Concalls) for keywords (receivables, collections, credit terms) to extract management's explanation for future verification.
