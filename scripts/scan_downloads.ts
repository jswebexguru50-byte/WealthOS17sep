import fs from 'fs';
import path from 'path';

const dlDir = 'C:\\Users\\gopal\\Downloads';
const files = fs.readdirSync(dlDir).filter(f => {
  const ext = path.extname(f).toLowerCase();
  return ['.csv', '.xlsx', '.xls', '.pdf'].includes(ext);
});

console.log('--- ALL STATEMENT FILES IN DOWNLOADS BY PORTFOLIO ---');

const categorized = files.map(f => {
  const full = path.join(dlDir, f);
  const stat = fs.statSync(full);
  let portfolio = 'Other / Uncategorized';
  const u = f.toUpperCase();
  if (u.includes('6820006') || u.includes('COMN') || u.includes('CC9') || u.includes('CURRENT_PORTFOLIO') || u.includes('CURRENTPORTFOLIO')) portfolio = 'cc9';
  else if (u.includes('SARWA') || u.includes('SWI426')) portfolio = 'Sarwa';
  else if (u.includes('PAPA') || u.includes('IPD') || u.includes('VIJAYA') || u.includes('1692')) portfolio = 'Papa';
  else if (u.includes('MAA') || u.includes('PSI') || u.includes('HDFC') || u.includes('1375') || u.includes('4290')) portfolio = 'Maa';
  else if (u.includes('IBKR') || u.includes('U121') || u.includes('ACTIVITY')) portfolio = 'US - IBKR';
  else if (u.includes('UNLISTED') || u.includes('SOLITARIO') || u.includes('SMART')) portfolio = 'Unlisted';
  else if (u.includes('CAS') || u.includes('CAMS') || u.includes('KARVY') || u.includes('MF')) portfolio = 'Mutual Funds';
  
  return {
    filename: f,
    portfolio,
    sizeKB: (stat.size / 1024).toFixed(1),
    mtime: stat.mtime.toISOString().replace('T', ' ').slice(0, 19),
    mtimeMs: stat.mtimeMs
  };
}).sort((a, b) => b.mtimeMs - a.mtimeMs);

// Find latest file per portfolio
const latestByPort: Record<string, any> = {};
for (const item of categorized) {
  if (!latestByPort[item.portfolio]) {
    latestByPort[item.portfolio] = item;
  }
}

console.log('\n--- LATEST STATEMENT FILE FOR EACH PORTFOLIO ---');
console.table(Object.values(latestByPort));

console.log('\n--- Top 30 Recent Files in Downloads ---');
console.table(categorized.slice(0, 30).map(c => ({ filename: c.filename, portfolio: c.portfolio, modified: c.mtime, sizeKB: c.sizeKB })));
