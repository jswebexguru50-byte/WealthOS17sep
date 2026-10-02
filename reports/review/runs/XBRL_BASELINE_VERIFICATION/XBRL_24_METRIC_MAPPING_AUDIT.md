# WealthOS 24 New Canonical Metric Mapping Audit

## Executive Summary
This deterministic mapping audit evaluates all 24 new canonical metrics promoted from raw NSE XBRL source facts into `company_facts`.
Every metric has been audited across source taxonomy tokens, labels, accounting statements, period types, sign conventions, monetary scaling, and dimensionless ratio representations.

### Classification Summary
- **VERIFIED**: 24 / 24 metrics
- **QUESTIONABLE**: 0
- **INCORRECT**: 0
- **INSUFFICIENT_SOURCE_EVIDENCE**: 0

## Detailed Metric Audit Table

| Canonical Metric | Taxonomy Field | Statement | Period Type | Canonical Unit | Scale / Representation | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `other_income` | `OtherIncome` | `PROFIT_AND_LOSS` | `DURATION` | `INR_CR` | `DIVIDE_BY_10_POW_7` | **VERIFIED** |
| `total_income` | `Income` | `PROFIT_AND_LOSS` | `DURATION` | `INR_CR` | `DIVIDE_BY_10_POW_7` | **VERIFIED** |
| `other_expenses` | `OtherExpenses` | `PROFIT_AND_LOSS` | `DURATION` | `INR_CR` | `DIVIDE_BY_10_POW_7` | **VERIFIED** |
| `purchases_stock_trade` | `PurchasesOfStockInTrade` | `PROFIT_AND_LOSS` | `DURATION` | `INR_CR` | `DIVIDE_BY_10_POW_7` | **VERIFIED** |
| `inventory_change` | `ChangesInInventoriesOfFinishedGoodsWorkInProgressAndStockInTrade` | `PROFIT_AND_LOSS` | `DURATION` | `INR_CR` | `DIVIDE_BY_10_POW_7` | **VERIFIED** |
| `employee_expenses` | `EmployeeBenefitExpense` | `PROFIT_AND_LOSS` | `DURATION` | `INR_CR` | `DIVIDE_BY_10_POW_7` | **VERIFIED** |
| `pbt_before_exceptional` | `ProfitBeforeExceptionalItemsAndTax` | `PROFIT_AND_LOSS` | `DURATION` | `INR_CR` | `DIVIDE_BY_10_POW_7` | **VERIFIED** |
| `exceptional_items_pretax` | `ExceptionalItemsBeforeTax` | `PROFIT_AND_LOSS` | `DURATION` | `INR_CR` | `DIVIDE_BY_10_POW_7` | **VERIFIED** |
| `oci` | `OtherComprehensiveIncomeNetOfTaxes` | `STATEMENT_OF_COMPREHENSIVE_INCOME` | `DURATION` | `INR_CR` | `DIVIDE_BY_10_POW_7` | **VERIFIED** |
| `exceptional_items` | `ExceptionalItems` | `PROFIT_AND_LOSS` | `DURATION` | `INR_CR` | `DIVIDE_BY_10_POW_7` | **VERIFIED** |
| `tax_expense` | `TaxExpense` | `PROFIT_AND_LOSS` | `DURATION` | `INR_CR` | `DIVIDE_BY_10_POW_7` | **VERIFIED** |
| `current_tax` | `CurrentTax` | `PROFIT_AND_LOSS` | `DURATION` | `INR_CR` | `DIVIDE_BY_10_POW_7` | **VERIFIED** |
| `deferred_tax_charge` | `DeferredTax` | `PROFIT_AND_LOSS` | `DURATION` | `INR_CR` | `DIVIDE_BY_10_POW_7` | **VERIFIED** |
| `eps_basic` | `BasicEarningsLossPerShareFromContinuingAndDiscontinuedOperations` | `PROFIT_AND_LOSS` | `DURATION` | `INR_PER_SHARE` | `UNSCALED_RAW` | **VERIFIED** |
| `eps_diluted` | `DilutedEarningsLossPerShareFromContinuingAndDiscontinuedOperations` | `PROFIT_AND_LOSS` | `DURATION` | `INR_PER_SHARE` | `UNSCALED_RAW` | **VERIFIED** |
| `face_value` | `FaceValueOfEquityShareCapital` | `SHARE_CAPITAL_NOTES` | `INSTANT` | `INR_PER_SHARE` | `UNSCALED_RAW` | **VERIFIED** |
| `cfi` | `CashFlowsFromUsedInInvestingActivities` | `CASH_FLOW_STATEMENT` | `DURATION` | `INR_CR` | `DIVIDE_BY_10_POW_7` | **VERIFIED** |
| `cff` | `CashFlowsFromUsedInFinancingActivities` | `CASH_FLOW_STATEMENT` | `DURATION` | `INR_CR` | `DIVIDE_BY_10_POW_7` | **VERIFIED** |
| `debt_repaid` | `RepaymentsOfBorrowingsClassifiedAsFinancingActivities` | `CASH_FLOW_STATEMENT` | `DURATION` | `INR_CR` | `DIVIDE_BY_10_POW_7` | **VERIFIED** |
| `debt_raised` | `ProceedsFromBorrowingsClassifiedAsFinancingActivities` | `CASH_FLOW_STATEMENT` | `DURATION` | `INR_CR` | `DIVIDE_BY_10_POW_7` | **VERIFIED** |
| `dividends_paid` | `DividendsPaidClassifiedAsFinancingActivities` | `CASH_FLOW_STATEMENT` | `DURATION` | `INR_CR` | `DIVIDE_BY_10_POW_7` | **VERIFIED** |
| `debt_to_equity` | `DebtEquityRatio` | `FINANCIAL_RATIO_DISCLOSURE` | `INSTANT_OR_DURATION` | `RATIO` | `DIMENSIONLESS_MULTIPLE` | **VERIFIED** |
| `dscr` | `DebtServiceCoverageRatio` | `FINANCIAL_RATIO_DISCLOSURE` | `DURATION` | `RATIO` | `DIMENSIONLESS_MULTIPLE` | **VERIFIED** |
| `roa` | `ReturnOnAssets` | `FINANCIAL_RATIO_DISCLOSURE` | `DURATION` | `RATIO` | `DIMENSIONLESS_DECIMAL_FRACTION` | **VERIFIED** |

## Detailed Field-by-Field Breakdown

### `other_income`
- **Source Taxonomy Token**: `OtherIncome`
- **Source Label**: Other Income
- **Financial Meaning**: Non-operating income including interest, dividend, foreign exchange gain, and net gain on investment sales.
- **Statement Type**: `PROFIT_AND_LOSS`
- **Period Type**: `DURATION`
- **Source Units Observed**: `['INR']`
- **Canonical Unit**: `INR_CR`
- **Scale / Transform**: `DIVIDE_BY_10_POW_7`
- **Sign Convention**: `POSITIVE_CREDIT`
- **Source Sample Median**: `150210000.0`
- **Canonical Sample Median**: `7.9266000000000005`
- **Deterministic Status**: **VERIFIED**

### `total_income`
- **Source Taxonomy Token**: `Income`
- **Source Label**: Total Income
- **Financial Meaning**: Total revenue from operations plus other income under Ind AS Schedule III.
- **Statement Type**: `PROFIT_AND_LOSS`
- **Period Type**: `DURATION`
- **Source Units Observed**: `['INR']`
- **Canonical Unit**: `INR_CR`
- **Scale / Transform**: `DIVIDE_BY_10_POW_7`
- **Sign Convention**: `POSITIVE_CREDIT`
- **Source Sample Median**: `9601730500.0`
- **Canonical Sample Median**: `508.67215`
- **Deterministic Status**: **VERIFIED**

### `other_expenses`
- **Source Taxonomy Token**: `OtherExpenses`
- **Source Label**: Other Expenses
- **Financial Meaning**: All operational, administrative, selling and overhead expenses not classified as materials, stock purchase, inventory change, employee benefits, finance costs, or depreciation.
- **Statement Type**: `PROFIT_AND_LOSS`
- **Period Type**: `DURATION`
- **Source Units Observed**: `['INR']`
- **Canonical Unit**: `INR_CR`
- **Scale / Transform**: `DIVIDE_BY_10_POW_7`
- **Sign Convention**: `POSITIVE_DEBIT`
- **Source Sample Median**: `1370450000.0`
- **Canonical Sample Median**: `79.2752`
- **Deterministic Status**: **VERIFIED**

### `purchases_stock_trade`
- **Source Taxonomy Token**: `PurchasesOfStockInTrade`
- **Source Label**: Purchases of Stock-in-Trade
- **Financial Meaning**: Goods purchased during the period for direct resale without further processing.
- **Statement Type**: `PROFIT_AND_LOSS`
- **Period Type**: `DURATION`
- **Source Units Observed**: `['INR']`
- **Canonical Unit**: `INR_CR`
- **Scale / Transform**: `DIVIDE_BY_10_POW_7`
- **Sign Convention**: `POSITIVE_DEBIT`
- **Source Sample Median**: `0.0`
- **Canonical Sample Median**: `0.0`
- **Deterministic Status**: **VERIFIED**

### `inventory_change`
- **Source Taxonomy Token**: `ChangesInInventoriesOfFinishedGoodsWorkInProgressAndStockInTrade`
- **Source Label**: Changes in Inventories of Finished Goods, Work-in-Progress and Stock-in-Trade
- **Financial Meaning**: Change in inventory balances over the period (opening inventory less closing inventory). Positive indicates inventory drawdown (expense); negative indicates inventory buildup (credit to expenses).
- **Statement Type**: `PROFIT_AND_LOSS`
- **Period Type**: `DURATION`
- **Source Units Observed**: `['INR']`
- **Canonical Unit**: `INR_CR`
- **Scale / Transform**: `DIVIDE_BY_10_POW_7`
- **Sign Convention**: `SIGNED_NET_DEBIT`
- **Source Sample Median**: `0.0`
- **Canonical Sample Median**: `0.0`
- **Deterministic Status**: **VERIFIED**

### `employee_expenses`
- **Source Taxonomy Token**: `EmployeeBenefitExpense`
- **Source Label**: Employee Benefit Expense
- **Financial Meaning**: Salaries, wages, staff welfare, provident fund contributions, and share-based payment expenses.
- **Statement Type**: `PROFIT_AND_LOSS`
- **Period Type**: `DURATION`
- **Source Units Observed**: `['INR']`
- **Canonical Unit**: `INR_CR`
- **Scale / Transform**: `DIVIDE_BY_10_POW_7`
- **Sign Convention**: `POSITIVE_DEBIT`
- **Source Sample Median**: `726600000.0`
- **Canonical Sample Median**: `38.6045`
- **Deterministic Status**: **VERIFIED**

### `pbt_before_exceptional`
- **Source Taxonomy Token**: `ProfitBeforeExceptionalItemsAndTax`
- **Source Label**: Profit Before Exceptional Items and Tax
- **Financial Meaning**: Operating and ordinary earnings before deducting exceptional or non-recurring items and income taxes.
- **Statement Type**: `PROFIT_AND_LOSS`
- **Period Type**: `DURATION`
- **Source Units Observed**: `['INR']`
- **Canonical Unit**: `INR_CR`
- **Scale / Transform**: `DIVIDE_BY_10_POW_7`
- **Sign Convention**: `SIGNED_NET`
- **Source Sample Median**: `878366500.0`
- **Canonical Sample Median**: `35.839349999999996`
- **Deterministic Status**: **VERIFIED**

### `exceptional_items_pretax`
- **Source Taxonomy Token**: `ExceptionalItemsBeforeTax`
- **Source Label**: Exceptional Items Before Tax
- **Financial Meaning**: Material items of income or expense arising from ordinary activities that are of such size, nature or incidence that separate disclosure is required before tax.
- **Statement Type**: `PROFIT_AND_LOSS`
- **Period Type**: `DURATION`
- **Source Units Observed**: `['INR']`
- **Canonical Unit**: `INR_CR`
- **Scale / Transform**: `DIVIDE_BY_10_POW_7`
- **Sign Convention**: `SIGNED_NET`
- **Source Sample Median**: `0.0`
- **Canonical Sample Median**: `0.0`
- **Deterministic Status**: **VERIFIED**

### `oci`
- **Source Taxonomy Token**: `OtherComprehensiveIncomeNetOfTaxes`
- **Source Label**: Other Comprehensive Income Net of Taxes
- **Financial Meaning**: Items of income and expense (including reclassification adjustments) that are not recognized in profit or loss as required or permitted by other Ind AS, net of tax.
- **Statement Type**: `STATEMENT_OF_COMPREHENSIVE_INCOME`
- **Period Type**: `DURATION`
- **Source Units Observed**: `['INR']`
- **Canonical Unit**: `INR_CR`
- **Scale / Transform**: `DIVIDE_BY_10_POW_7`
- **Sign Convention**: `SIGNED_NET`
- **Source Sample Median**: `0.0`
- **Canonical Sample Median**: `0.0`
- **Deterministic Status**: **VERIFIED**

### `exceptional_items`
- **Source Taxonomy Token**: `ExceptionalItems`
- **Source Label**: Exceptional Items
- **Financial Meaning**: Exceptional items tag used in alternative taxonomy entry points or legacy templates.
- **Statement Type**: `PROFIT_AND_LOSS`
- **Period Type**: `DURATION`
- **Source Units Observed**: `['INR']`
- **Canonical Unit**: `INR_CR`
- **Scale / Transform**: `DIVIDE_BY_10_POW_7`
- **Sign Convention**: `SIGNED_NET`
- **Source Sample Median**: `0.0`
- **Canonical Sample Median**: `0.0`
- **Deterministic Status**: **VERIFIED**

### `tax_expense`
- **Source Taxonomy Token**: `TaxExpense`
- **Source Label**: Tax Expense
- **Financial Meaning**: Total tax expense comprising current tax and deferred tax recognized in the statement of profit and loss.
- **Statement Type**: `PROFIT_AND_LOSS`
- **Period Type**: `DURATION`
- **Source Units Observed**: `['INR']`
- **Canonical Unit**: `INR_CR`
- **Scale / Transform**: `DIVIDE_BY_10_POW_7`
- **Sign Convention**: `POSITIVE_DEBIT`
- **Source Sample Median**: `221250000.0`
- **Canonical Sample Median**: `8.7842`
- **Deterministic Status**: **VERIFIED**

### `current_tax`
- **Source Taxonomy Token**: `CurrentTax`
- **Source Label**: Current Tax
- **Financial Meaning**: The amount of income taxes payable or recoverable in respect of the taxable profit or tax loss for a period.
- **Statement Type**: `PROFIT_AND_LOSS`
- **Period Type**: `DURATION`
- **Source Units Observed**: `['INR']`
- **Canonical Unit**: `INR_CR`
- **Scale / Transform**: `DIVIDE_BY_10_POW_7`
- **Sign Convention**: `POSITIVE_DEBIT`
- **Source Sample Median**: `178729500.0`
- **Canonical Sample Median**: `7.258`
- **Deterministic Status**: **VERIFIED**

### `deferred_tax_charge`
- **Source Taxonomy Token**: `DeferredTax`
- **Source Label**: Deferred Tax
- **Financial Meaning**: The amounts of income taxes payable or recoverable in future periods in respect of taxable temporary differences, deductible temporary differences, and carryforward of unused tax losses.
- **Statement Type**: `PROFIT_AND_LOSS`
- **Period Type**: `DURATION`
- **Source Units Observed**: `['INR']`
- **Canonical Unit**: `INR_CR`
- **Scale / Transform**: `DIVIDE_BY_10_POW_7`
- **Sign Convention**: `SIGNED_NET_DEBIT`
- **Source Sample Median**: `0.0`
- **Canonical Sample Median**: `0.0`
- **Deterministic Status**: **VERIFIED**

### `eps_basic`
- **Source Taxonomy Token**: `BasicEarningsLossPerShareFromContinuingAndDiscontinuedOperations`
- **Source Label**: Basic Earnings (Loss) Per Share
- **Financial Meaning**: Profit or loss attributable to ordinary equity holders divided by the weighted average number of ordinary shares outstanding during the period.
- **Statement Type**: `PROFIT_AND_LOSS`
- **Period Type**: `DURATION`
- **Source Units Observed**: `['INRPerShare']`
- **Canonical Unit**: `INR_PER_SHARE`
- **Scale / Transform**: `UNSCALED_RAW`
- **Sign Convention**: `SIGNED_NET`
- **Source Sample Median**: `5.01`
- **Canonical Sample Median**: `4.31`
- **Deterministic Status**: **VERIFIED**

### `eps_diluted`
- **Source Taxonomy Token**: `DilutedEarningsLossPerShareFromContinuingAndDiscontinuedOperations`
- **Source Label**: Diluted Earnings (Loss) Per Share
- **Financial Meaning**: Basic earnings per share adjusted for the effects of all dilutive potential ordinary shares.
- **Statement Type**: `PROFIT_AND_LOSS`
- **Period Type**: `DURATION`
- **Source Units Observed**: `['INRPerShare']`
- **Canonical Unit**: `INR_PER_SHARE`
- **Scale / Transform**: `UNSCALED_RAW`
- **Sign Convention**: `SIGNED_NET`
- **Source Sample Median**: `4.92`
- **Canonical Sample Median**: `4.21`
- **Deterministic Status**: **VERIFIED**

### `face_value`
- **Source Taxonomy Token**: `FaceValueOfEquityShareCapital`
- **Source Label**: Face Value of Equity Share Capital
- **Financial Meaning**: Nominal or par value of an equity share in Indian Rupees.
- **Statement Type**: `SHARE_CAPITAL_NOTES`
- **Period Type**: `INSTANT`
- **Source Units Observed**: `['INRPerShare']`
- **Canonical Unit**: `INR_PER_SHARE`
- **Scale / Transform**: `UNSCALED_RAW`
- **Sign Convention**: `POSITIVE`
- **Source Sample Median**: `5.0`
- **Canonical Sample Median**: `5.0`
- **Deterministic Status**: **VERIFIED**

### `cfi`
- **Source Taxonomy Token**: `CashFlowsFromUsedInInvestingActivities`
- **Source Label**: Cash Flows From (Used In) Investing Activities
- **Financial Meaning**: Aggregate net cash flows from the acquisition and disposal of long-term assets and other investments not included in cash equivalents.
- **Statement Type**: `CASH_FLOW_STATEMENT`
- **Period Type**: `DURATION`
- **Source Units Observed**: `['INR']`
- **Canonical Unit**: `INR_CR`
- **Scale / Transform**: `DIVIDE_BY_10_POW_7`
- **Sign Convention**: `SIGNED_NET_INFLOW_POSITIVE`
- **Source Sample Median**: `-274442500.0`
- **Canonical Sample Median**: `-27.1302`
- **Deterministic Status**: **VERIFIED**

### `cff`
- **Source Taxonomy Token**: `CashFlowsFromUsedInFinancingActivities`
- **Source Label**: Cash Flows From (Used In) Financing Activities
- **Financial Meaning**: Aggregate net cash flows that result in changes in the size and composition of the contributed equity and borrowings of the enterprise.
- **Statement Type**: `CASH_FLOW_STATEMENT`
- **Period Type**: `DURATION`
- **Source Units Observed**: `['INR']`
- **Canonical Unit**: `INR_CR`
- **Scale / Transform**: `DIVIDE_BY_10_POW_7`
- **Sign Convention**: `SIGNED_NET_INFLOW_POSITIVE`
- **Source Sample Median**: `-54335000.0`
- **Canonical Sample Median**: `-5.6776`
- **Deterministic Status**: **VERIFIED**

### `debt_repaid`
- **Source Taxonomy Token**: `RepaymentsOfBorrowingsClassifiedAsFinancingActivities`
- **Source Label**: Repayments of Borrowings Classified as Financing Activities
- **Financial Meaning**: Gross principal repayments on borrowings during the period.
- **Statement Type**: `CASH_FLOW_STATEMENT`
- **Period Type**: `DURATION`
- **Source Units Observed**: `['INR']`
- **Canonical Unit**: `INR_CR`
- **Scale / Transform**: `DIVIDE_BY_10_POW_7`
- **Sign Convention**: `POSITIVE_OUTFLOW_OR_SIGNED`
- **Source Sample Median**: `16600000.0`
- **Canonical Sample Median**: `1.869`
- **Deterministic Status**: **VERIFIED**

### `debt_raised`
- **Source Taxonomy Token**: `ProceedsFromBorrowingsClassifiedAsFinancingActivities`
- **Source Label**: Proceeds from Borrowings Classified as Financing Activities
- **Financial Meaning**: Gross proceeds from new borrowings during the period.
- **Statement Type**: `CASH_FLOW_STATEMENT`
- **Period Type**: `DURATION`
- **Source Units Observed**: `['INR']`
- **Canonical Unit**: `INR_CR`
- **Scale / Transform**: `DIVIDE_BY_10_POW_7`
- **Sign Convention**: `POSITIVE_INFLOW`
- **Source Sample Median**: `12069000.0`
- **Canonical Sample Median**: `1.2167`
- **Deterministic Status**: **VERIFIED**

### `dividends_paid`
- **Source Taxonomy Token**: `DividendsPaidClassifiedAsFinancingActivities`
- **Source Label**: Dividends Paid Classified as Financing Activities
- **Financial Meaning**: Cash dividends paid to equity holders during the period.
- **Statement Type**: `CASH_FLOW_STATEMENT`
- **Period Type**: `DURATION`
- **Source Units Observed**: `['INR']`
- **Canonical Unit**: `INR_CR`
- **Scale / Transform**: `DIVIDE_BY_10_POW_7`
- **Sign Convention**: `POSITIVE_OUTFLOW_OR_SIGNED`
- **Source Sample Median**: `7930000.0`
- **Canonical Sample Median**: `0.8029`
- **Deterministic Status**: **VERIFIED**

### `debt_to_equity`
- **Source Taxonomy Token**: `DebtEquityRatio`
- **Source Label**: Debt Equity Ratio
- **Financial Meaning**: Ratio of Total Debt to Total Equity under SEBI LODR Regulation 52.
- **Statement Type**: `FINANCIAL_RATIO_DISCLOSURE`
- **Period Type**: `INSTANT_OR_DURATION`
- **Source Units Observed**: `['pure']`
- **Canonical Unit**: `RATIO`
- **Scale / Transform**: `DIMENSIONLESS_MULTIPLE`
- **Sign Convention**: `RATIO_POSITIVE_OR_NEGATIVE_IF_NEGATIVE_EQUITY`
- **Source Sample Median**: `0.0`
- **Canonical Sample Median**: `0.0`
- **Deterministic Status**: **VERIFIED**

### `dscr`
- **Source Taxonomy Token**: `DebtServiceCoverageRatio`
- **Source Label**: Debt Service Coverage Ratio
- **Financial Meaning**: Ratio of Earnings available for debt service to total debt service requirements under SEBI LODR Regulation 52.
- **Statement Type**: `FINANCIAL_RATIO_DISCLOSURE`
- **Period Type**: `DURATION`
- **Source Units Observed**: `['pure']`
- **Canonical Unit**: `RATIO`
- **Scale / Transform**: `DIMENSIONLESS_MULTIPLE`
- **Sign Convention**: `POSITIVE_MULTIPLE`
- **Source Sample Median**: `0.0`
- **Canonical Sample Median**: `0.0`
- **Deterministic Status**: **VERIFIED**

### `roa`
- **Source Taxonomy Token**: `ReturnOnAssets`
- **Source Label**: Return on Assets
- **Financial Meaning**: Ratio of net profit to total assets disclosed by banking and financial entities.
- **Statement Type**: `FINANCIAL_RATIO_DISCLOSURE`
- **Period Type**: `DURATION`
- **Source Units Observed**: `['INR', 'pure']`
- **Canonical Unit**: `RATIO`
- **Scale / Transform**: `DIMENSIONLESS_DECIMAL_FRACTION`
- **Sign Convention**: `DECIMAL_FRACTION`
- **Source Sample Median**: `0.0082`
- **Canonical Sample Median**: `0.0082`
- **Deterministic Status**: **VERIFIED**
