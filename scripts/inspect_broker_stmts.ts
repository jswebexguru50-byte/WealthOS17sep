import * as XLSX from 'xlsx';
import path from 'path';

const dlDir = 'C:\\Users\\gopal\\Downloads';

function inspectXlsx(filename: string) {
  const full = path.join(dlDir, filename);
  const wb = XLSX.readFile(full);
  console.log(`\n========================================`);
  console.log(`  FILE: ${filename}`);
  console.log(`  Sheets:`, wb.SheetNames);
  console.log(`========================================`);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`Total rows: ${json.length}`);
  console.log('Sample rows:');
  console.log(json.slice(0, 15));
}

try {
  inspectXlsx('holdings-PSI722 (16).xlsx');
  inspectXlsx('Demat Holding Query Stmt_1692_31-08-2026 08.10.XLS');
  inspectXlsx('Vijaya Sharma AUM.xlsx');
} catch (e) {
  console.error(e);
}
