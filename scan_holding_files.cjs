const fs = require('fs');
const path = require('path');

function scanDir(dir, depth = 0) {
  if (depth > 2) return [];
  let results = [];
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name === 'node_modules' || item.name === '.git' || item.name === 'dist') continue;
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        results = results.concat(scanDir(fullPath, depth + 1));
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (['.xlsx', '.xls', '.csv', '.pdf', '.json'].includes(ext)) {
          const stats = fs.statSync(fullPath);
          results.push({
            name: item.name,
            path: fullPath,
            size: stats.size,
            mtime: stats.mtime
          });
        }
      }
    }
  } catch (e) {}
  return results;
}

const currentFiles = scanDir('.');
console.log('=== FILES IN WORKSPACE (CURRENT DIR) ===');
currentFiles.sort((a, b) => b.mtime - a.mtime).forEach(f => {
  console.log(`${f.mtime.toISOString()} | ${(f.size / 1024).toFixed(1).padStart(7)} KB | ${f.name}`);
});

const parentDir = path.resolve('..');
console.log('\n=== FILES IN PARENT DIR (tesr) ===');
const parentFiles = scanDir(parentDir);
parentFiles.sort((a, b) => b.mtime - a.mtime).slice(0, 30).forEach(f => {
  console.log(`${f.mtime.toISOString()} | ${(f.size / 1024).toFixed(1).padStart(7)} KB | ${f.path}`);
});
