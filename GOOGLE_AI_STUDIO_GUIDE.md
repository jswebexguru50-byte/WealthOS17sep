# How to Load WealthOS / ITAS v6.3 into Google AI Studio

This package contains the **full application, all capabilities (S1–S20 strategies, execution simulator, ablation engine, FERE forensic engines, portfolio rebalancing, tax engines, test suites)** and the **entire authoritative Phase 2 research dataset**.

---

## 1. Bundle Files Generated

1. **Complete Unified Pack (Codebase + Complete Dataset)**:
   - Path: `data/WealthOS_v6.3_Google_AI_Studio_Complete_Pack.xml`
   - Size: ~2.27 MB (~625,762 tokens)
   - Fits seamlessly in Gemini 1.5 Pro (only ~31.3% of the 2,000,000 token limit!)

2. **Standalone Research Database SQL Dump**:
   - Path: `data/v6.3_pilot_research_dataset_dump.sql`
   - Contains all table DDLs and 100% of data rows for:
     - `DailyOHLCV` (all 645 normalized bars across 5 pilot securities)
     - `authoritative_trading_calendar` (all 182 calendar sessions)
     - `historical_universe_membership`
     - `corporate_actions`
     - `quarterly_financial_disclosures`
     - `shareholding_disclosures`
     - `forensic_accounting_health`

3. **Standalone JSON Dataset**:
   - Path: `data/v6.3_pilot_research_dataset_dump.json`

---

## 2. Step-by-Step Instructions to Load in Google AI Studio

1. Open **[Google AI Studio](https://aistudio.google.com/)** in your browser.
2. In the top-right model selector, choose **Gemini 1.5 Pro** (this provides the full 2,000,000 token context window).
3. In the right-hand panel:
   - Set **Temperature** to `0.1` or `0.0` (for strict deterministic code and data reasoning).
4. In **System Instructions** (left/top panel), paste:
```text
You are the Chief Quantitative Architect and Auditor for WealthOS / ITAS v6.3.
You have been provided with the complete application codebase, all capabilities, and the entire authoritative research dataset.
Enforce all core invariants:
- The 6 production baseline files are frozen.
- All executions strictly use next-tradable-bar open.
- Incomplete datasets fail closed (DATA_INSUFFICIENT).
- Directive B: A record is only leaked if consumed before its availableAt timestamp.
- Directive C: Zero signals or zero trades is a legitimate research outcome; do not synthesize trades.
Answer questions, audit implementations, inspect data, verify math, and run code analyses with mathematical rigor.
```
5. In the chat prompt box, click the **`+` (Insert / Upload)** button or drag and drop:
   - `data/WealthOS_v6.3_Google_AI_Studio_Complete_Pack.xml`
6. Click **Send** or ask any query!

---

## 3. Example Queries You Can Ask Google AI Studio

* **Audit Invariants**: *"Audit the ExecutionSimulator and FrozenSignalAdapter to prove that no same-bar execution can ever occur and that Directive B is strictly enforced."*
* **Inspect Dataset**: *"Query the DailyOHLCV and authoritative_trading_calendar in the embedded dataset to verify if there are any missing sessions or non-positive delivery quantities for CANBK."*
* **Analyze Strategies**: *"Explain how strategies S1 through S11 generate signals and how the SignalQualityOverlay scores their quality."*
* **Verify Replay Math**: *"Walk through the execution simulator transaction cost calculations for a 100-share buy order at open with STT, brokerage, and GST."*
