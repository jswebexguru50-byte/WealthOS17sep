const fs = require('fs');

let popPath = 'scripts/fundamental/populate_field_catalog.ts';
let code = fs.readFileSync(popPath, 'utf8');

const additionalMappings = `
  { token: 'sramy1', label: 'Rev. Ann. 1Y ago', canonical: 'revenue', statement: 'INCOME', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'sramy2', label: 'Rev. Ann. 2Y ago', canonical: 'revenue', statement: 'INCOME', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'sramy3', label: 'Rev. Ann. 3Y ago', canonical: 'revenue', statement: 'INCOME', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'npamy1', label: 'Net Profit Ann. 1Y ago', canonical: 'pat', statement: 'INCOME', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'npamy2', label: 'Net Profit Ann. 2Y ago', canonical: 'pat', statement: 'INCOME', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'npamy3', label: 'Net Profit Ann. 3Y ago', canonical: 'pat', statement: 'INCOME', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'opmpctq', label: 'OPM latest Qtr %', canonical: 'opm_pct', statement: 'INCOME', period: 'QUARTER', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'opmpctqmq1', label: 'OPM 1Q ago %', canonical: 'opm_pct', statement: 'INCOME', period: 'QUARTER', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'fiipct1q', label: 'FII holding change QoQ %', canonical: 'fii_change_qoq', statement: 'OWNERSHIP', period: 'QUARTER', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'mfpct1q', label: 'MF holding change QoQ %', canonical: 'mf_change_qoq', statement: 'OWNERSHIP', period: 'QUARTER', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'wcq', label: 'Working Capital Qtr', canonical: 'working_capital', statement: 'BALANCE', period: 'QUARTER', unit: 'INR', scale: 'CRORE' },
  { token: 'currentprice', label: 'Current Price', canonical: 'current_price', statement: 'VALUATION', period: 'INSTANT', unit: 'INR', scale: 'ABSOLUTE' },
  { token: 'opma', label: 'OPM Ann. %', canonical: 'operating_margin_annual_pct', statement: 'INCOME', period: 'ANNUAL', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'roaa', label: 'ROA Ann. %', canonical: 'roa_pct', statement: 'RETURNS', period: 'ANNUAL', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'ebita', label: 'EBIT Ann.', canonical: 'ebit', statement: 'INCOME', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'ltdea', label: 'Long Term Debt to Equity Ann.', canonical: 'long_term_debt_to_equity', statement: 'BALANCE', period: 'ANNUAL', unit: 'RATIO', scale: 'ABSOLUTE' },
  { token: 'dividendpayout', label: 'Dividend Payout Ratio', canonical: 'dividend_payout_pct', statement: 'CASH_FLOW', period: 'ANNUAL', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'dividendpersharea', label: 'Dividend Per Share Ann.', canonical: 'dividend_per_share', statement: 'CASH_FLOW', period: 'ANNUAL', unit: 'INR', scale: 'ABSOLUTE' },
  { token: 'cfoagrowth', label: 'CFO Growth Ann. %', canonical: 'cfo_growth_pct', statement: 'CASH_FLOW', period: 'ANNUAL', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'inventoriesq', label: 'Inventories Qtr', canonical: 'inventory', statement: 'BALANCE', period: 'QUARTER', unit: 'INR', scale: 'CRORE' },
  { token: 'tradereceivablesa', label: 'Trade Receivables Ann.', canonical: 'trade_receivables', statement: 'BALANCE', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'contingentliabilitiesa', label: 'Contingent Liabilities Ann.', canonical: 'contingent_liabilities', statement: 'BALANCE', period: 'ANNUAL', unit: 'INR', scale: 'CRORE' },
  { token: 'prompct1q', label: 'Promoter holding change QoQ %', canonical: 'promoter_change_qoq_pct', statement: 'OWNERSHIP', period: 'QUARTER', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
  { token: 'prompledge1q', label: 'Promoter pledge change QoQ %', canonical: 'promoter_pledge_change_qoq_pct', statement: 'OWNERSHIP', period: 'QUARTER', unit: 'PERCENTAGE', scale: 'ABSOLUTE' },
];
`;

if (!code.includes('sramy1')) {
  code = code.replace(/];/, additionalMappings + '\n];');
  fs.writeFileSync(popPath, code);
  console.log("Patched populate_field_catalog.ts");
}
