# WealthOS Fundamental Intelligence Calibration Pilot — UI Evidence & Verification

## 1. Overview
The approved canonical UI component (`StockIntelligenceView.tsx`) renders fundamental intelligence for all 200 pilot companies via the authenticated canonical endpoint:
```text
GET /api/v2/company-intelligence/:symbol
```
No mock data, duplicate UI, or synthetic fallbacks are used.

## 2. Tab-by-Tab Contract Verification
1. **Overview Tab**: Displays identity, sector, industry, market cap in ₹ Cr, market cap bucket badge, and high-level module status badges.
2. **Financials Tab**: Renders actual reported values for Revenue, EBITDA / Operating Profit, PAT, Net Margin, and CFO. If a metric is absent or unverified, it renders explicitly as `DATA_INSUFFICIENT` with provenance tooltips.
3. **Valuation Tab**: Displays P/E, P/B, EV/EBITDA, and historical percentiles only when $\ge 2$ dated observations exist; otherwise shows `INSUFFICIENT` coverage.
4. **FERE Tab**: Cites primary source filings; emits `DATA_INSUFFICIENT` when filings are absent rather than claiming false clearance.
5. **QGLP Tab**: Shows detailed pillar evaluations. If Capex/FCF or red flag clearance is missing, returns `DATA_INSUFFICIENT` with exact itemized missing inputs.
6. **Management Tab**: Cites board and executive events with dated statutory provenance.
7. **Business Tab**: Renders business model description and evidenced segment drivers.

## 3. UI Invariant Checks
- **No Zero Substitution**: Missing CFO or debt is never rendered as "₹0 Cr" or "0.00".
- **Explicit Missingness**: Clear badges indicating `DATA_INSUFFICIENT` or `SOURCE_UNAVAILABLE`.
- **Model-Aware Presentation**: Banking and NBFC institutions receive ALM/Prudential metrics rather than manufacturing working capital ratios.
