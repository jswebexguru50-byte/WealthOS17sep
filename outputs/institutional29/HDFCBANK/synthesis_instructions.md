# WealthOS Institutional-29 synthesis contract

Evidence policy: INSTITUTIONAL29_EVIDENCE_POLICY_V2
Symbol: HDFCBANK
As of: 2026-10-23

Use only the frozen research_bundle.json and its cited primary documents. Reviewer prose, prior reports and user-supplied narratives are leads, not facts, until corroborated by the bundle.

## Mandatory controls

- Every financial amount must state period, period type and scope. Never silently combine standalone and consolidated figures.
- Prefer primary verified evidence. If sources materially disagree, preserve the conflict and explain which fact governs the conclusion.
- Every numerical or qualitative company claim must cite a factId or a named primary document, page/section and date.
- Missing extraction means “not located in the current evidence bundle”; it does not prove the company omitted the disclosure.
- Do not infer customer/supplier concentration, contractual pass-through, customer funding, TAM, order-book conversion or management quality from ratios, logos or generic industry practice.
- Distinguish reported facts, deterministic calculations, management guidance and analyst inference in the prose.
- Do not annualise backlog without contract-specific delivery schedules. Do not calculate reverse DCF outputs unless every assumption is printed.
- Exceptional items must carry period, scope and economic direction. Quarterly and annual items must not be blended.
- Technical indicators must come from sorted adjusted OHLCV. A mixed moving-average order is not a data error when integrity diagnostics pass.
- Do not issue buy/sell, target-price or probability language from incomplete evidence.

## Global policy

- financialScope: Every financial amount must carry periodType, periodEnd and scope. Prefer PRIMARY_FILING+VERIFIED+CONSOLIDATED; never relabel UNKNOWN or STANDALONE as CONSOLIDATED.
- absenceClaims: Use “not located in the current evidence bundle” unless the named primary document and all relevant sections were searched. Do not convert missing extraction into company non-disclosure.
- concentrationClaims: A customer/supplier threshold requires an exact excerpt, document, page, period and denominator. Historical prospectus evidence must be labelled HISTORICAL_CONTEXT, not current state.
- exceptionalItems: Report annual and quarterly exceptional items separately with period, scope and economic direction. Never infer gain/charge from sign alone without the statement presentation or note.
- technicals: Recompute indicators from chronologically sorted adjusted OHLCV and emit integrity diagnostics. Unusual moving-average ordering is a market state, not automatically a feed error.
- conflicts: Preserve provider conflicts. Prefer primary verified facts for conclusions and explicitly disclose material differences rather than silently averaging or overwriting.

## Question-specific rules

Q4 Customer Concentration Risk:
- Require an exact excerpt, document, page, period and denominator for every concentration percentage.
- Label prospectus-period evidence as HISTORICAL_CONTEXT; do not present it as current concentration.
- A customer logo or named relationship does not establish revenue or order-book concentration.

Q5 Supplier & Vendor Concentration:
- Require a dated supplier table or exact filing excerpt before asserting supplier concentration.
- Do not infer contractual pass-through from stable margins or management of commodity volatility.
- When extraction is incomplete say not located in the current evidence bundle, not that the company did not disclose it.

Q7 Reinvestment Runway:
- Order-book conversion must use contract-specific tenure or execution schedules when disclosed.
- Never annualise the full order book by mechanically dividing it by a generic duration.
- Separate operating reinvestment, qualification inventory, CWIP and surplus cash.

Q8 Capital Allocation Efficiency:
- Reconcile reported and adjusted returns using explicit invested-capital components.
- Show operating assets, CWIP and surplus issue/QIP cash separately; do not remove them without a transparent bridge.

Q14 Quality of Earnings (One-offs):
- Separate annual and quarterly exceptional items by period and scope.
- State whether each item increased or reduced PBT using the statement presentation or note, not sign alone.
- Do not mix a later quarter with the preceding annual period.

Q24 Interest Rate Sensitivity:
- Use disclosed floating-rate debt or the annual-report sensitivity table; never apply the shock to total debt without a rate split.
- Report the exact pretax effect first.
- Report an after-tax effect only when the tax rate is evidenced or clearly labelled as an illustrative assumption.

Q29 Technical Support Levels:
- Recompute indicators from sorted adjusted OHLCV and expose bar-integrity diagnostics.
- Treat unusual moving-average ordering as a market state unless duplicate, invalid or inconsistent bars prove a data error.
- State price date and adjustment basis.
