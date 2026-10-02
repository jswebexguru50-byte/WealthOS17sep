# External Review Input Package Manifest

**Target:** 20 Pilot Companies (PILOT_RUN_002_INPUTS)
**Format:** Clean JSON packages stripped of developer remediation suggestions, RUN_001 verdicts, threshold source code, and expected results.
**Production State:** `POST_REMEDIATION_EXPERIMENT` (since inputs were generated after Batch 1 and Batch 2 candidate remediations were applied to the production tree).

## Included Packages
1. `AAVAS_INPUT.json`
2. `ASTRAL_INPUT.json`
3. `BAJFINANCE_INPUT.json`
4. `CLEAN_INPUT.json`
5. `DEEPAKNTR_INPUT.json`
6. `DYCL_INPUT.json`
7. `HDFCBANK_INPUT.json`
8. `INFY_INPUT.json`
9. `LT_INPUT.json`
10. `LTIM_INPUT.json`
11. `PIDILITIND_INPUT.json`
12. `POLYCAB_INPUT.json`
13. `RAMCOIND_INPUT.json`
14. `RELIANCE_INPUT.json`
15. `STYL_INPUT.json`
16. `SUNPHARMA_INPUT.json`
17. `TATAMOTORS_INPUT.json`
18. `TATASTEEL_INPUT.json`
19. `TCS_INPUT.json`
20. `TITAN_INPUT.json`

## Schema Constraints
Each package explicitly includes:
- `companyIdentity`
- `periodContext`
- `canonicalFinancialFacts`
- `derivedMetrics`
- `evidenceProvenance`
- `missingData`
- `wealthosInterpretations`
- `PRODUCTION_STATE` (labeled `POST_REMEDIATION_EXPERIMENT`)

The packages are ready for independent review by an external LLM.
