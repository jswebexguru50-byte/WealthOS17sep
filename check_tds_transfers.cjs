const fs = require('fs');

const bbText = fs.readFileSync('C:\\Users\\QB661XW\\.gemini\\antigravity\\brain\\614dcefa-2cb4-4d0c-9491-f455a709b364\\scratch\\bankbook_text.txt', 'utf8');
const bbLines = bbText.split('\n');

function cleanNum(s) {
  if (!s) return 0;
  return parseFloat(String(s).replace(/,/g, '').trim()) || 0;
}

let tdsSum = 0;
let tdsCount = 0;

for (let i = 0; i < bbLines.length; i++) {
  const line = bbLines[i].trim();
  if (!line || !line.includes('\t')) continue;
  const parts = line.split('\t').map(p => p.trim());
  const first = parts[0] || '';

  if (first.startsWith('Trf to TDS A/c')) {
    // Look for negative amount in Buy/Sell Amount column or elsewhere
    const nums = line.match(/-?[\d,]+\.\d{2}/g);
    if (nums) {
      for (const n of nums) {
        const val = cleanNum(n);
        if (val < 0 && val > -100000) {
          tdsSum += Math.abs(val);
          tdsCount++;
          break;
        }
      }
    }
  }
}

console.log('TDS_SUMMARY:', { tdsCount, tdsSum });
