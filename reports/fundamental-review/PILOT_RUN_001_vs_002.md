# PILOT_RUN_001 vs PILOT_RUN_002 Comparison

**Agreement Rate:** 95.65%
**Disagreements:** 8

### Notable Disagreements
- **BAJFINANCE - MARGIN_TRAJECTORY**: Run 1 (SUPPORTED) vs Run 2 (QUESTIONABLE). Reason: The evidence supports a margin change, but applying EBITDA margin to a banking business model is economically invalid. Banks do not have traditional COGS; NIM (Net Interest Margin) or Cost-to-Income must be used.
- **BAJFINANCE - RETURN_PROFILE**: Run 1 (SUPPORTED) vs Run 2 (QUESTIONABLE). Reason: ROCE is heavily distorted for banks because leverage is inherent to their operations. ROE or ROA are the appropriate measures of capital efficiency for financial institutions.
- **DYCL - REVENUE_GROWTH**: Run 1 (INSUFFICIENT_EVIDENCE) vs Run 2 (SUPPORTED). Reason: Appropriately concluded insufficient data due to lack of historical comparative periods in the snapshot.
- **HDFCBANK - DEBT_TRAJECTORY**: Run 1 (QUESTIONABLE) vs Run 2 (SUPPORTED). Reason: The interpretation 'DATA_INSUFFICIENT' is a fair and mathematically grounded representation of the supplied canonical evidence without overreach.
- **INFY - MARGIN_TRAJECTORY**: Run 1 (SUPPORTED) vs Run 2 (QUESTIONABLE). Reason: A small absolute change of -72 bps is labeled as CONTRACTING. Without considering the baseline margin (e.g. 3% vs 30%), an absolute 50 bps threshold could overstate the economic significance for a high-margin business or understate it for a thin-margin one.
- **RELIANCE - MARGIN_TRAJECTORY**: Run 1 (SUPPORTED) vs Run 2 (QUESTIONABLE). Reason: A small absolute change of 55 bps is labeled as EXPANDING. Without considering the baseline margin (e.g. 3% vs 30%), an absolute 50 bps threshold could overstate the economic significance for a high-margin business or understate it for a thin-margin one.
- **SUNPHARMA - REVENUE_GROWTH**: Run 1 (REASONABLE) vs Run 2 (SUPPORTED). Reason: The interpretation 'STABLE' is a fair and mathematically grounded representation of the supplied canonical evidence without overreach.
- **TCS - REVENUE_GROWTH**: Run 1 (REASONABLE) vs Run 2 (SUPPORTED). Reason: The interpretation 'STABLE' is a fair and mathematically grounded representation of the supplied canonical evidence without overreach.
