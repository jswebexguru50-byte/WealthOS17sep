const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const files = [
  'src/holdings-PSI722 (8).xlsx',
  'holdings-PSI722 (6).xlsx',
  'src/COMN0005_6820006_CurrentPortfolio2086GT (8).csv',
  'holdings-IPD619 (1).xlsx',
  'uploads/holdings-IPD619 (1).xlsx',
  'Demat Holding Query Stmt_1692_24-08-2026 12.56.XLS',
  'cc9_portfolio_statement_20260823.csv'
];

for (const relPath of files) {
  const fullPath = path.resolve(relPath);
  if (!fs.existsSync(fullPath)) continue;
  console.log(`\n======================================================`);
  console.log(`FILE: ${relPath}`);
  console.log(`======================================================`);
  
  if (relPath.endsWith('.xlsx') || relPath.endsWith('.xls') || relPath.endsWith('.XLS')) {
    const wb = XLSX.readFile(fullPath);
    console.log('Sheets:', wb.SheetNames);
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
    console.log(`Total Rows: ${data.length}`);
    console.log('Header / First 5 rows:');
    data.slice(0, 8).forEach((r, i) => console.log(`Row ${i}:`, JSON.stringify(r)));
  } else if (relPath.endsWith('.csv')) {
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.trim().split('\n');
    console.log(`Total CSV lines: ${lines.length}`);
    console.log('First 8 lines:');
    lines.slice(0, 8).forEach((l, i) => console.log(`Line ${i}:`, l));
  }
}
