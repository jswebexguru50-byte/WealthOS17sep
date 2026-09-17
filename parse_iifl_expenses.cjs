const fs = require('fs');

const txt = fs.readFileSync('C:/Users/QB661XW/.gemini/antigravity/brain/614dcefa-2cb4-4d0c-9491-f455a709b364/scratch/bankbook_text.txt', 'utf8');
const lines = txt.split('\n');

const expenses = [];
let totalExpense = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  // Check for Expense lines: Management Fees, Entry load, Custody Charges, AUDIT CHARGES, DP Charges, Trf to TDS A/c, Sec. Tran. Tax
  const isMgmt = line.startsWith('Management Fees');
  const isEntry = line.startsWith('Entry load');
  const isCust = line.startsWith('Custody Charges');
  const isAudit = line.startsWith('AUDIT CHARGES');
  const isDP = line.startsWith('DP Charges');
  const isTds = line.startsWith('Trf to TDS A/c');
  const isStt = line.startsWith('Sec. Tran. Tax');

  if (isMgmt || isEntry || isCust || isAudit || isDP || isTds || isStt) {
    // Parse fields
    // Look at tabs or whitespace
    const parts = line.split('\t');
    let type = 'EXPENSE';
    if (isMgmt) type = 'MANAGEMENT_FEE';
    else if (isEntry) type = 'ENTRY_LOAD';
    else if (isCust) type = 'CUSTODY_CHARGES';
    else if (isAudit) type = 'AUDIT_CHARGES';
    else if (isDP) type = 'DP_CHARGES';
    else if (isTds) type = 'TDS';
    else if (isStt) type = 'STT';

    // Find date DD/MM/YYYY
    const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{4})/);
    const dateStr = dateMatch ? dateMatch[1] : null;

    // Parse amount
    // In the PDF layout: line has "... Expenses ... Balance"
    // Let's find numbers with commas
    const numMatches = line.match(/-?[\d,]+\.\d{2}/g);
    if (numMatches && numMatches.length > 0) {
      // Find the non-zero expense amount
      for (const rawNum of numMatches) {
        const val = parseFloat(rawNum.replace(/,/g, ''));
        if (Math.abs(val) > 0 && Math.abs(val) < 10000000) {
          // Check if this is the expense amount
        }
      }
    }
  }
}

console.log('Done scanning.');
