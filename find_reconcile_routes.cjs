const fs = require('fs');
const s = fs.readFileSync('server.ts', 'utf8');
const lines = s.split('\n');
lines.forEach((l, i) => {
  if (l.includes('/api/pms/reconcile-holdings')) {
    console.log(i + 1, l);
  }
});
