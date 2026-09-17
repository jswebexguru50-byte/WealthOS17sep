const fs = require('fs');
const path = require('path');

function searchDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (f !== 'node_modules' && f !== '.git' && f !== 'dist') searchDir(full);
    } else if (f.endsWith('.tsx') || f.endsWith('.ts')) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.toLowerCase().includes('cash in hand') || content.includes('pms_cash_in_hand') || content.includes('cashInHand') || content.toLowerCase().includes('net cash')) {
        console.log('FOUND IN:', full);
        const lines = content.split('\n');
        lines.forEach((l, i) => {
          if (l.toLowerCase().includes('cash in hand') || l.includes('pms_cash_in_hand') || l.includes('cashInHand') || l.toLowerCase().includes('net cash')) {
            console.log(`  L${i+1}: ${l.trim()}`);
          }
        });
      }
    }
  }
}

searchDir(path.join(process.cwd(), 'src'));
