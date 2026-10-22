import fs from 'fs';
import path from 'path';

const dlDir = 'C:\\Users\\gopal\\Downloads';
const files = fs.readdirSync(dlDir).filter(f => f.toLowerCase().includes('ibkr') || f.toLowerCase().includes('u121') || f.toLowerCase().includes('us etf'));
console.log('IBKR files in Downloads:', files);

files.forEach(f => {
  const p = path.join(dlDir, f);
  const s = fs.statSync(p);
  console.log(`- ${f} (${(s.size/1024).toFixed(1)} KB, modified: ${s.mtime.toISOString().replace('T', ' ').slice(0, 19)})`);
});
