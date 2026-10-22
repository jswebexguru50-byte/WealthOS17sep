const fs = require('fs');
const path = require('path');

const dlDir = 'C:\\Users\\gopal\\Downloads';
const files = fs.readdirSync(dlDir);

console.log('Searching Downloads for any files created/modified in July, August, September 2026:');
const recentFiles = files.map(f => {
  const p = path.join(dlDir, f);
  const s = fs.statSync(p);
  return { name: f, size: (s.size/1024).toFixed(1) + ' KB', mtime: s.mtime };
}).filter(f => f.mtime >= new Date('2026-07-01'))
  .sort((a, b) => b.mtime - a.mtime);

console.table(recentFiles.slice(0, 50));
