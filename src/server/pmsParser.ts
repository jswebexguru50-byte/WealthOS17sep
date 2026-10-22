import { parse } from 'csv-parse/sync';

export interface PMSSection {
  type: 'transactions' | 'bank_book' | 'interest' | 'dividend' | 'holdings';
  data: any[];
}

// ─────────────────────────────────────────────────────────────────────────────
// DEDICATED COMPLETE CIRCLE BANK BOOK PARSER
// ─────────────────────────────────────────────────────────────────────────────
// Handles the standard CC Wealth PMS Bank Book CSV format with this fixed layout:
//  Col 0:  Code
//  Col 1:  Name
//  Col 2:  Bank Account
//  Col 3:  Bank Name
//  Col 4:  Transaction Description  ← the transaction TYPE
//  Col 5:  Tran Date                ← use as the date
//  Col 6:  Set Date (settlement)
//  Col 7:  Tran Account
//  Col 8:  Symbol Code              ← security identifier
//  Col 9:  Security                 ← security name
//  Col 10: Buy/Sell Amount          ← signed: negative=outflow(BUY/TDS/MGMT), positive=inflow(SELL)
//  Col 11: Income                   ← dividends (always positive)
//  Col 12: Expenses                 ← STT, operating expenses (always positive)
//  Col 13: Dep/With                 ← corpus deposit (positive) or withdrawal (negative)
//  Col 14: Balance                  ← running balance — NOT an amount, do NOT use
//  Col 15: Custodian Account
//  Col 16: Tran Ref.
//  Col 17: Desc/Notes
//  Col 18: Account Code
//
// Transaction Description → Type mapping:
//  "Corpus Deposits"   → DEPOSIT       (amount from col 13, Dep/With, positive)
//  "Buy"               → BUY           (amount from col 10, abs value)
//  "Sell"              → SELL          (amount from col 10, abs value)
//  "Sec. Tran. Tax"    → EXPENSE       (amount from col 12, Expenses)
//  "Dividend"          → DIVIDEND      (amount from col 11, Income)
//  "Trf to TDS A/c"    → TDS           (amount from col 10, abs value)
//  "Management Fees"   → MANAGEMENT_FEE(amount from col 10, abs value)
//  "Operating Expenses"→ EXPENSE       (amount from col 12; fallback to col 10)
//  Other deposits      → DEPOSIT       (amount from col 13, positive Dep/With)
//  Other withdrawals   → WITHDRAWAL    (amount from col 13, negative Dep/With, abs)
// ─────────────────────────────────────────────────────────────────────────────

export interface CCBankBookRecord {
  date: string;         // ISO date YYYY-MM-DD (Tran Date)
  setDate: string;      // ISO date YYYY-MM-DD (Set Date / Settlement Date)
  txnType: string;      // original description e.g. "Buy", "Dividend"
  mappedType: string;   // standardised: BUY | SELL | DEPOSIT | WITHDRAWAL | TDS | MANAGEMENT_FEE | EXPENSE | DIVIDEND | INTEREST | STT_EXPENSE
  amount: number;       // always positive absolute value
  securityCode: string; // col 8 (symbol code)
  securityName: string; // col 9
  tranRef: string;      // col 16 (Tran Ref.)
  notes: string;        // col 17
}

export interface CCBankBookColMap {
  desc: number;
  tranDate: number;
  setDate: number;
  secCode: number;
  secName: number;
  buySell: number;
  income: number;
  expenses: number;
  depWith: number;
  tranRef: number;
  notes: number;
}

const DEFAULT_CC_BANK_COL_MAP: CCBankBookColMap = {
  desc: 4,
  tranDate: 5,
  setDate: 6,
  secCode: 8,
  secName: 9,
  buySell: 10,
  income: 11,
  expenses: 12,
  depWith: 13,
  tranRef: 16,
  notes: 17
};

function parseDateToIso(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const dateParts = trimmed.split(/[\/\-]/);
  if (dateParts.length === 3) {
    let [d, m, y] = dateParts;
    if (d.length === 4) { [y, d, m] = [dateParts[0], dateParts[2], dateParts[1]]; }
    if (y.length === 2) y = '20' + y;
    return `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
}

// Returns null if the row should be skipped (header, preamble, empty, zero-amount)
function parseCCBankBookRow(cols: string[], colMap: CCBankBookColMap = DEFAULT_CC_BANK_COL_MAP): CCBankBookRecord | null {
  if (cols.length < 10) return null;

  const parseSignedAmt = (v: string): number => {
    if (!v || v.trim() === '' || v.trim() === '-') return 0;
    return parseFloat(v.replace(/,/g, '')) || 0;
  };
  const parseAbs = (v: string): number => Math.abs(parseSignedAmt(v));

  const txnType    = (cols[colMap.desc] || '').trim();
  const rawDate    = (cols[colMap.tranDate] || '').trim();
  const rawSetDate = (cols[colMap.setDate] || '').trim();
  const buySellRaw = (cols[colMap.buySell] || '').trim();
  const incomeRaw  = (cols[colMap.income] || '').trim();
  const expenseRaw = (cols[colMap.expenses] || '').trim();
  const depWithRaw = (cols[colMap.depWith] || '').trim();

  // Skip header rows and preamble
  const lc = txnType.toLowerCase();
  if (
    lc === '' ||
    lc === 'transaction description' ||
    lc === 'code' ||
    lc === 'complete circle' ||
    lc.includes('bank book') ||
    lc.startsWith('from ')
  ) return null;

  const dateStr = parseDateToIso(rawDate);
  if (!dateStr) return null;
  const setDateStr = parseDateToIso(rawSetDate) || dateStr;

  const upper = txnType.toUpperCase();
  let mappedType = '';
  let amount = 0;

  if (upper === 'CORPUS DEPOSITS' || upper === 'CORPUS DEPOSIT') {
    // Cash corpus from client → DEPOSIT, read from Dep/With
    const dw = parseSignedAmt(depWithRaw);
    if (dw <= 0) return null;
    mappedType = 'DEPOSIT';
    amount = dw;

  } else if (upper === 'BUY') {
    // Buy trade → BUY, read from Buy/Sell (always negative, take abs)
    amount = parseAbs(buySellRaw);
    if (amount === 0) return null;
    mappedType = 'BUY';

  } else if (upper === 'SELL') {
    // Sell trade → SELL, read from Buy/Sell (always positive)
    amount = parseAbs(buySellRaw);
    if (amount === 0) return null;
    mappedType = 'SELL';

  } else if (upper === 'SEC. TRAN. TAX' || upper === 'SECURITIES TRANSACTION TAX' || upper === 'STT') {
    // Securities Transaction Tax → STT_EXPENSE, read from Expenses col
    amount = parseAbs(expenseRaw) || parseAbs(buySellRaw);
    if (amount === 0) return null;
    mappedType = 'STT_EXPENSE';

  } else if (upper === 'DIVIDEND') {
    // Cash dividend → DIVIDEND, read from Income col
    amount = parseAbs(incomeRaw);
    if (amount === 0) return null;
    mappedType = 'DIVIDEND';

  } else if (upper === 'TRF TO TDS A/C' || upper === 'TDS' || upper.includes('TAX DEDUCTED') || upper.includes('TRF TO TDS')) {
    // TDS transfer → TDS, read from Buy/Sell (negative, take abs)
    amount = parseAbs(buySellRaw) || parseAbs(depWithRaw);
    if (amount === 0) return null;
    mappedType = 'TDS';

  } else if (upper === 'MANAGEMENT FEES' || upper === 'MANAGEMENT FEE' || upper.includes('CUSTODY') ||
             upper.includes('FUND ACCOUNTING') || upper.includes('PORTFOLIO FEE') || upper.includes('PERFORMANCE FEE')) {
    // Management/custody fees → MANAGEMENT_FEE, read from Buy/Sell (negative, take abs)
    amount = parseAbs(buySellRaw) || parseAbs(expenseRaw) || parseAbs(depWithRaw);
    if (amount === 0) return null;
    mappedType = 'MANAGEMENT_FEE';

  } else if (upper === 'OPERATING EXPENSES' || upper.includes('OPERATING EXP') || upper.includes('BANK CHARGES') || upper.includes('OTHER EXPENSE')) {
    // Operating expenses → EXPENSE, read from Expenses; fallback to Buy/Sell
    amount = parseAbs(expenseRaw) || parseAbs(buySellRaw);
    if (amount === 0) return null;
    mappedType = 'EXPENSE';

  } else if (upper === 'INTEREST' || upper.includes('INTEREST INCOME')) {
    // Interest income → INTEREST
    amount = parseAbs(incomeRaw) || parseAbs(buySellRaw);
    if (amount === 0) return null;
    mappedType = 'INTEREST';

  } else if (upper === 'OTHER INCOME' || upper.includes('OTHER INCOME')) {
    // Other income → CASH_INCOME
    amount = parseAbs(incomeRaw) || parseAbs(buySellRaw) || parseAbs(depWithRaw);
    if (amount === 0) return null;
    mappedType = 'CASH_INCOME';

  } else {
    // Generic fallback: use Dep/With to determine DEPOSIT or WITHDRAWAL
    const dw = parseSignedAmt(depWithRaw);
    if (dw !== 0) {
      amount = Math.abs(dw);
      mappedType = dw > 0 ? 'DEPOSIT' : 'WITHDRAWAL';
    } else {
      // Last resort: if any amount column is non-zero, log as EXPENSE
      const anyAmt = parseAbs(buySellRaw) || parseAbs(expenseRaw) || parseAbs(incomeRaw);
      if (anyAmt === 0) return null;
      amount = anyAmt;
      mappedType = 'EXPENSE';
    }
  }

  return {
    date: dateStr,
    setDate: setDateStr,
    txnType,
    mappedType,
    amount,
    securityCode: (cols[colMap.secCode] || '').trim(),
    securityName: (cols[colMap.secName] || '').trim(),
    tranRef: (cols[colMap.tranRef] || '').trim(),
    notes: (cols[colMap.notes] || '').trim(),
  };
}

// Parse the full CC Wealth bank book CSV content
// Returns structured records, skipping preamble/header/zero-amount rows
export function parseCCBankBookCSV(fileContent: string): CCBankBookRecord[] {
  const lines = fileContent.split(/\r?\n/);
  const records: CCBankBookRecord[] = [];
  let headerFound = false;
  const colMap: CCBankBookColMap = { ...DEFAULT_CC_BANK_COL_MAP };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Parse CSV columns (handling quoted fields with embedded commas)
    const cols: string[] = [];
    let inQuotes = false;
    let curr = '';
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; }
      else if (char === ',' && !inQuotes) { cols.push(curr.trim()); curr = ''; }
      else { curr += char; }
    }
    cols.push(curr.trim());

    // Detect header row and map columns dynamically
    if (!headerFound) {
      const lowerCols = cols.map(c => c.toLowerCase());
      const rawLower = rawLine.toLowerCase();
      if ((rawLower.includes('transaction description') || rawLower.includes('particular') || rawLower.includes('tran ref')) &&
          (rawLower.includes('buy/sell') || rawLower.includes('buy') || rawLower.includes('sell') || rawLower.includes('dep/with') || rawLower.includes('expenses') || rawLower.includes('income'))) {
        headerFound = true;
        lowerCols.forEach((col, idx) => {
          if (col.includes('transaction description') || col.includes('description') || col.includes('particular')) colMap.desc = idx;
          else if (col.includes('tran date') || (col.includes('date') && !col.includes('set'))) colMap.tranDate = idx;
          else if (col.includes('set date') || col.includes('settlement date')) colMap.setDate = idx;
          else if (col.includes('symbol code') || col.includes('security code')) colMap.secCode = idx;
          else if (col.includes('security') || col.includes('scrip name')) colMap.secName = idx;
          else if (col.includes('buy/sell')) colMap.buySell = idx;
          else if (col.includes('income')) colMap.income = idx;
          else if (col.includes('expenses') || col.includes('expense')) colMap.expenses = idx;
          else if (col.includes('dep/with') || col.includes('deposit')) colMap.depWith = idx;
          else if (col.includes('tran ref') || col.includes('ref')) colMap.tranRef = idx;
          else if (col.includes('desc/notes') || col.includes('notes') || col.includes('narration')) colMap.notes = idx;
        });
        continue; // skip the header row itself
      }
      continue; // skip preamble rows before header
    }

    // Parse data row
    const record = parseCCBankBookRow(cols, colMap);
    if (record) records.push(record);
  }

  return records;
}


// ─────────────────────────────────────────────────────────────────────────────
// COMPLETE CIRCLE PDF TEXT → BANK BOOK RECORDS PARSER
// ─────────────────────────────────────────────────────────────────────────────
// PDFs from Complete Circle have columns rendered as space-separated text lines.
// Each data row contains a DD/MM/YYYY date, a txn description, and 1-4 numeric
// amount fields plus a running balance at the end.
// ─────────────────────────────────────────────────────────────────────────────
export function parseCCBankBookFromPdfText(pdfText: string): CCBankBookRecord[] {
  const records: CCBankBookRecord[] = [];

  const DATE_RE = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/;
  const AMT_RE = /^-?[\d,]+(\.\d{1,2})?$/;

  const parseNum = (s: string) => {
    if (!s) return 0;
    return parseFloat(s.replace(/,/g, '')) || 0;
  };

  const parseDateStr = (raw: string): string => {
    const parts = raw.split(/[\/\-]/);
    if (parts.length !== 3) return '';
    let [d, m, y] = parts;
    if (d.length === 4) { [y, d, m] = [parts[0], parts[2], parts[1]]; }
    if (y.length === 2) y = '20' + y;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  };

  const mapTxnType = (text: string): { mappedType: string; originalType: string } => {
    const upper = text.toUpperCase();
    if (upper.includes('CORPUS DEPOSIT') || upper.includes('CORPUS INFLOW') || upper.includes('ADDITIONAL SUBSCRIPTION') || (upper.includes('CORPUS') && upper.includes('DEP'))) {
      return { mappedType: 'DEPOSIT', originalType: 'Corpus Deposits' };
    }
    if (upper.includes('CORPUS WITHDRAWAL') || upper.includes('REDEMPTION') || upper.includes('PAYOUT') || (upper.includes('CORPUS') && upper.includes('WITH'))) {
      return { mappedType: 'WITHDRAWAL', originalType: 'Corpus Withdrawals' };
    }
    if (upper.includes('BUY') || upper.includes('PURCHASE')) {
      return { mappedType: 'BUY', originalType: 'Buy' };
    }
    if (upper.includes('SELL') || upper.includes('SALE')) {
      return { mappedType: 'SELL', originalType: 'Sell' };
    }
    if (upper.includes('DIVIDEND')) {
      return { mappedType: 'DIVIDEND', originalType: 'Dividend' };
    }
    if (upper.includes('INTEREST')) {
      return { mappedType: 'INTEREST', originalType: 'Interest' };
    }
    if (upper.includes('TRF TO TDS') || upper.includes('TDS') || upper.includes('TAX DEDUCTED')) {
      return { mappedType: 'TDS', originalType: 'Trf to TDS A/c' };
    }
    if (upper.includes('MANAGEMENT FEE') || upper.includes('MGMT FEE') || upper.includes('CUSTODY') || upper.includes('FUND ACCOUNTING') || upper.includes('PORTFOLIO FEE') || upper.includes('PERFORMANCE FEE')) {
      return { mappedType: 'MANAGEMENT_FEE', originalType: 'Management Fees' };
    }
    if (upper.includes('SEC. TRAN. TAX') || upper.includes('SECURITIES TRANSACTION TAX') || upper.includes('STT')) {
      return { mappedType: 'EXPENSE', originalType: 'Sec. Tran. Tax' };
    }
    if (upper.includes('OPERATING EXPENSE') || upper.includes('OPERATING EXP') || upper.includes('BANK CHARGE') || upper.includes('AUDIT FEE') || upper.includes('EXPENSE')) {
      return { mappedType: 'EXPENSE', originalType: 'Operating Expenses' };
    }
    if (upper.includes('TRANSFER IN') || upper.includes('SECURITY IN')) {
      return { mappedType: 'TRANSFER IN', originalType: 'Transfer In' };
    }
    if (upper.includes('TRANSFER OUT') || upper.includes('SECURITY OUT')) {
      return { mappedType: 'TRANSFER OUT', originalType: 'Transfer Out' };
    }
    return { mappedType: '', originalType: text.substring(0, 30) };
  };

  const lines = pdfText.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Skip preamble or header lines
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('complete circle') || lowerLine.includes('bank book') || lowerLine.includes('page ') || lowerLine.includes('portfolio valuation') || lowerLine.startsWith('from ')) {
      continue;
    }

    const dateMatch = line.match(DATE_RE);
    if (!dateMatch) continue;

    const dateStr = parseDateStr(dateMatch[1]);
    if (!dateStr || dateStr.includes('NaN')) continue;

    const tokens = line.split(/\s+/).filter(Boolean);

    const numericTokens: { value: number; raw: string; index: number }[] = [];
    const textTokens: string[] = [];
    
    tokens.forEach((tok, idx) => {
      if (DATE_RE.test(tok)) return;
      if (AMT_RE.test(tok)) {
        const num = parseNum(tok);
        numericTokens.push({ value: num, raw: tok, index: idx });
      } else {
        textTokens.push(tok);
      }
    });

    if (numericTokens.length === 0) continue;

    const joinedText = textTokens.join(' ');
    const { mappedType, originalType } = mapTxnType(joinedText);
    if (!mappedType) continue;

    // In CC Bank Book PDF:
    // If multiple numeric tokens exist, the LAST one is typically the running balance (which should NOT be used as the transaction amount)
    let amount = 0;
    if (numericTokens.length === 1) {
      amount = Math.abs(numericTokens[0].value);
    } else {
      // Exclude the trailing running balance if there are 2 or more numeric tokens
      const candidateAmounts = numericTokens.slice(0, -1).map(n => Math.abs(n.value)).filter(v => v > 0);
      if (candidateAmounts.length > 0) {
        if (mappedType === 'DEPOSIT' || mappedType === 'WITHDRAWAL') {
          amount = candidateAmounts[candidateAmounts.length - 1] || candidateAmounts[0];
        } else {
          amount = candidateAmounts[0];
        }
      } else {
        // Fallback if all preceding were zero
        amount = Math.abs(numericTokens[0].value);
      }
    }

    if (amount <= 0) continue;

    const txnKeywords = new Set([
      'BUY', 'SELL', 'DIVIDEND', 'DEPOSIT', 'WITHDRAWAL', 'CORPUS', 'INTEREST',
      'MANAGEMENT', 'FEES', 'FEE', 'TDS', 'STT', 'EXPENSE', 'EXPENSES', 'OPERATING',
      'INCOME', 'INFLOW', 'PURCHASE', 'SALE', 'CORPUS DEPOSITS', 'CORPUS DEPOSIT',
      'REDEMPTION', 'CHARGES', 'TAX', 'DEDUCTED', 'TRANSFER', 'SECURITY'
    ]);
    const secTokens = textTokens.filter(t => !txnKeywords.has(t.toUpperCase()) && t.length > 2 && !/^\d+$/.test(t));
    const securityName = secTokens.slice(0, 5).join(' ').substring(0, 50);

    records.push({
      date: dateStr,
      txnType: originalType || textTokens.slice(0, 3).join(' '),
      mappedType,
      amount,
      securityCode: '',
      securityName,
      setDate: dateStr,
      tranRef: '',
      notes: line.substring(0, 120),
    });
  }

  return records;
}


// ─────────────────────────────────────────────────────────────────────────────
// COMPLETE CIRCLE PDF TEXT → TRADE REGISTER RECORDS PARSER
// ─────────────────────────────────────────────────────────────────────────────
export function parseCCTradeRegisterFromPdfText(pdfText: string): PMSTradeRecord[] {
  const records: PMSTradeRecord[] = [];

  const DATE_RE = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/;
  const AMT_RE = /^-?[\d,]+(\.\d+)?$/;

  const parseNum = (s: string) => Math.abs(parseFloat(s.replace(/,/g, '')) || 0);

  const parseDateStr = (raw: string): string => {
    const parts = raw.split(/[\/\-]/);
    if (parts.length !== 3) return '';
    let [d, m, y] = parts;
    if (d.length === 4) { [y, d, m] = [parts[0], parts[2], parts[1]]; }
    if (y.length === 2) y = '20' + y;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  };

  const lines = pdfText.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('complete circle') || lowerLine.includes('shares - listed') || lowerLine.includes('page ') || lowerLine.startsWith('from ')) {
      continue;
    }

    const dateMatch = line.match(DATE_RE);
    if (!dateMatch) continue;

    const dateStr = parseDateStr(dateMatch[1]);
    if (!dateStr || dateStr.includes('NaN')) continue;

    const tokens = line.split(/\s+/).filter(Boolean);

    const numericTokens: number[] = [];
    const textTokens: string[] = [];
    for (const tok of tokens) {
      if (DATE_RE.test(tok)) continue;
      if (AMT_RE.test(tok)) {
        numericTokens.push(parseNum(tok));
      } else {
        textTokens.push(tok);
      }
    }

    const joined = textTokens.join(' ').toUpperCase();
    let txnType: 'BUY' | 'SELL' = 'BUY';
    if (joined.includes('SELL') || joined.includes('SALE') || joined.includes('TRANSFER OUT') || joined.includes('SECURITY OUT')) {
      txnType = 'SELL';
    } else if (joined.includes('BUY') || joined.includes('PURCHASE') || joined.includes('TRANSFER IN') || joined.includes('SECURITY IN') || joined.includes('BONUS') || joined.includes('SPLIT')) {
      txnType = 'BUY';
    } else {
      continue;
    }

    if (numericTokens.length < 1) continue;

    // Quantity heuristic: look for reasonable integer or float units
    let qty = 0;
    let price = 0;
    let netAmt = 0;

    if (numericTokens.length >= 3) {
      // Layout usually: [Quantity] [Rate/Price] [Brokerage] [STT] [Net Amount]
      qty = numericTokens[0];
      price = numericTokens[1];
      netAmt = numericTokens[numericTokens.length - 1];
    } else if (numericTokens.length === 2) {
      qty = Math.min(...numericTokens);
      netAmt = Math.max(...numericTokens);
      price = qty > 0 ? netAmt / qty : 0;
    } else {
      netAmt = numericTokens[0];
      qty = 1;
      price = netAmt;
    }

    if (qty <= 0 && netAmt <= 0) continue;
    if (qty <= 0 && price > 0) qty = 1;
    if (price <= 0 && qty > 0 && netAmt > 0) price = netAmt / qty;
    if (netAmt <= 0 && qty > 0 && price > 0) netAmt = qty * price;

    const isinToken = tokens.find(t => /^IN[A-Z0-9]{10}$/.test(t)) || '';
    const nonSecKeywords = new Set(['BUY', 'SELL', 'PURCHASE', 'SALE', 'SECURITY', 'TRANSFER', 'IN', 'OUT', 'BONUS', 'SPLIT']);
    const secTokens = textTokens.filter(t => !nonSecKeywords.has(t.toUpperCase()) && t.length > 1);
    const securityName = secTokens.slice(0, 5).join(' ').substring(0, 60);

    records.push({
      tradeDate: dateStr,
      settlementDate: dateStr,
      securityName: securityName || isinToken || 'PMS_SECURITY',
      isin: isinToken,
      symbol: isinToken ? '' : (secTokens[0] || ''),
      transactionType: txnType,
      quantity: qty,
      price,
      grossAmount: netAmt,
      brokerage: 0,
      stt: 0,
      otherCharges: 0,
      netAmount: netAmt,
      sourcePms: 'COMPLETE_CIRCLE',
    });
  }

  return records;
}
// ─────────────────────────────────────────────────────────────────────────────
// ORIGINAL GENERIC PMS FILE PARSER (kept for non-bank-book sections)
// ─────────────────────────────────────────────────────────────────────────────
export function parsePMSFile(fileContent: string, portfolio: string, fallbackType?: PMSSection['type']): PMSSection[] {
  // Check if file is a Complete Circle Bank Book CSV
  if (fallbackType === 'bank_book' || fileContent.includes('BANK BOOK') || fileContent.toLowerCase().includes('tran ref') || fileContent.toLowerCase().includes('dep/with')) {
    const ccBankRecords = parseCCBankBookCSV(fileContent);
    if (ccBankRecords && ccBankRecords.length > 0) {
      return [{
        type: 'bank_book',
        data: ccBankRecords.map(r => [
          r.mappedType,
          r.date,
          r.setDate || r.date,
          r.securityName || r.txnType,
          r.securityCode || '',
          0, 0, 0, 0,
          r.amount,
          r.notes,
          r.tranRef
        ])
      }];
    }
  }

  const lines = fileContent.split('\n');
  const result: PMSSection[] = [];
  
  // Check if file has any custom section header lines
  const hasHeaders = lines.some(line => 
    line.includes('TRANSACTION STATEMENT') || 
    line.includes('Shares - Listed') || 
    line.includes('BANK BOOK') || 
    line.includes('STATEMENT OF INTEREST') || 
    line.includes('STATEMENT OF DIVIDEND') || 
    line.includes('CURRENT PORTFOLIO')
  );

  let defaultType: PMSSection['type'] = fallbackType || 'transactions';
  if (!fallbackType) {
    const hasHoldingKeywords = lines.some(line => {
      const lower = line.toLowerCase();
      return lower.includes('security') && lower.includes('quantity');
    });
    if (hasHoldingKeywords) {
      defaultType = 'holdings';
    }
  }

  let currentSection: PMSSection['type'] | null = fallbackType || (hasHeaders ? null : defaultType);
  let sectionData: any[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const lower = line.toLowerCase();
    let detectedType: PMSSection['type'] | null = null;

    // 1. Explicit Section Titles (Highest Priority)
    if (line.includes('BANK BOOK') || line.includes('STATEMENT OF BANK') || line.includes('CASH & BANK')) {
      detectedType = 'bank_book';
    } else if (line.includes('TRANSACTION STATEMENT') || line.includes('Shares - Listed')) {
      detectedType = 'transactions';
    } else if (line.includes('STATEMENT OF INTEREST')) {
      detectedType = 'interest';
    } else if (line.includes('STATEMENT OF DIVIDEND')) {
      detectedType = 'dividend';
    } else if (line.includes('CURRENT PORTFOLIO')) {
      detectedType = 'holdings';
    } 
    // 2. Column Header Sniffing (Fallback for header rows)
    else if (lower.includes('dep/with') || lower.includes('buy/sell amount') || lower.includes('bank account') || lower.includes('bank name') || lower.includes('vouch type') || (lower.includes('particulars') && (lower.includes('dr') || lower.includes('cr') || lower.includes('debit') || lower.includes('credit')))) {
      detectedType = 'bank_book';
    } else if (lower.includes('transaction description') || lower.includes('tran date') || lower.includes('settlement date')) {
      if (currentSection === 'interest') detectedType = 'interest';
      else if (currentSection === 'dividend') detectedType = 'dividend';
      else if (currentSection === 'bank_book') detectedType = 'bank_book';
      else if (fallbackType) detectedType = fallbackType;
      else detectedType = 'transactions';
    } else if (
      lower.includes('unit cost') ||
      lower.includes('market price') ||
      lower.includes('market value') ||
      lower.includes('total cost') ||
      lower.includes('%assets') ||
      lower.includes('irr%')
    ) {
      detectedType = 'holdings';
    }

    if (detectedType && detectedType !== currentSection) {
      if (currentSection && sectionData.length > 0) {
        result.push({ type: currentSection, data: sectionData });
      }
      currentSection = detectedType;
      sectionData = [];
      
      const isCsvRow = line.includes(',');
      if (!isCsvRow) {
        continue; // skip section titles like "TRANSACTION STATEMENT"
      }
    }

    if (currentSection) {
      const row: string[] = [];
      let inQuotes = false;
      let curr = '';
      for (const char of line) {
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) {
          row.push(curr.trim());
          curr = '';
        } else {
          curr += char;
        }
      }
      row.push(curr.trim());

      const cleanRow = row.map(s => s.replace(/^"|"$/g, ''));
      if (cleanRow.length >= 2) {
        const firstCol = (cleanRow[0] || '').trim().toLowerCase();
        const secondCol = (cleanRow[1] || '').trim().toLowerCase();
        if (
          firstCol === '' ||
          firstCol === 'transaction description' ||
          firstCol === 'current period transactions' ||
          firstCol === 'current period settled  transactions' ||
          firstCol === 'current period settled transactions' ||
          firstCol === 'current period not settled transactions' ||
          firstCol === 'shares - listed' ||
          firstCol === 'other assets - others' ||
          firstCol === 'bank total' ||
          firstCol === 'grand total' ||
          firstCol === 'total' ||
          firstCol.startsWith('from ') ||
          firstCol.startsWith('account :') ||
          firstCol.startsWith('complete circle') ||
          firstCol.includes('tolstoy') ||
          secondCol.startsWith('- 110')
        ) {
          continue;
        }

        sectionData.push(cleanRow);
      }
    }
  }

  if (currentSection && sectionData.length > 0) {
    result.push({ type: currentSection, data: sectionData });
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 360 ONE (IIFL WEALTH) PMS BANK BOOK / CASH LEDGER PARSER
// ─────────────────────────────────────────────────────────────────────────────
export interface IIFLBankBookRecord {
  date: string;
  description: string;
  mappedType: 'DEPOSIT' | 'WITHDRAWAL' | 'MANAGEMENT_FEE' | 'EXPENSE' | 'DIVIDEND' | 'INTEREST' | 'BUY' | 'SELL';
  amount: number;
  debit: number;
  credit: number;
  runningBalance: number;
  voucherNo: string;
  scripName: string;
  notes: string;
}

export function parseIIFLBankBookCSV(csvContent: string): IIFLBankBookRecord[] {
  const records: IIFLBankBookRecord[] = [];
  const lines = csvContent.split(/\r?\n/);
  let headerIdx = -1;

  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const l = lines[i].toLowerCase();
    if ((l.includes('date') || l.includes('tran')) && (l.includes('particular') || l.includes('description') || l.includes('narration') || l.includes('debit') || l.includes('credit'))) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) return records;

  const headerCols = lines[headerIdx].split(',').map(c => c.trim().toLowerCase().replace(/^"|"$/g, ''));
  const colMap: Record<string, number> = {};
  headerCols.forEach((col, idx) => {
    colMap[col] = idx;
  });

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols: string[] = [];
    let inQuotes = false;
    let curr = '';
    for (const char of line) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) {
        cols.push(curr.trim());
        curr = '';
      } else {
        curr += char;
      }
    }
    cols.push(curr.trim());

    if (cols.length < 3) continue;

    // Find date, particulars, debit, credit
    let rawDate = '';
    let particulars = '';
    let debit = 0;
    let credit = 0;
    let balance = 0;
    let voucher = '';

    for (const [colName, idx] of Object.entries(colMap)) {
      const val = (cols[idx] || '').replace(/^"|"$/g, '').trim();
      if (colName.includes('date')) rawDate = val;
      else if (colName.includes('particular') || colName.includes('desc') || colName.includes('narration')) particulars = val;
      else if (colName.includes('debit') || colName.includes('dr')) debit = Math.abs(parseFloat(val.replace(/,/g, '')) || 0);
      else if (colName.includes('credit') || colName.includes('cr')) credit = Math.abs(parseFloat(val.replace(/,/g, '')) || 0);
      else if (colName.includes('bal')) balance = parseFloat(val.replace(/,/g, '')) || 0;
      else if (colName.includes('vouch') || colName.includes('ref')) voucher = val;
    }

    if (!rawDate && cols[0]) rawDate = cols[0];
    if (!particulars && cols[1]) particulars = cols[1];

    // Standardise Date
    let dateStr = '';
    const dateParts = rawDate.split(/[-/]/);
    if (dateParts.length === 3) {
      if (dateParts[0].length === 4) {
        dateStr = `${dateParts[0]}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}`;
      } else {
        const [d, m, y] = dateParts;
        dateStr = `${y.length === 2 ? '20' + y : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    if (!dateStr || dateStr.includes('NaN')) continue;

    const pUpper = particulars.toUpperCase();
    let mappedType: IIFLBankBookRecord['mappedType'] = 'EXPENSE';
    let amount = debit > 0 ? debit : credit;

    if (pUpper.includes('CORPUS') || pUpper.includes('FUNDS RECEIVED') || pUpper.includes('DEPOSIT') || pUpper.includes('CAPITAL INFLOW') || credit > debit && (pUpper.includes('CHEQUE') || pUpper.includes('NEFT') || pUpper.includes('RTGS'))) {
      mappedType = 'DEPOSIT';
      amount = credit || debit;
    } else if (pUpper.includes('WITHDRAWAL') || pUpper.includes('REDEMPTION') || pUpper.includes('PAYOUT') || pUpper.includes('FUNDS PAID')) {
      mappedType = 'WITHDRAWAL';
      amount = debit || credit;
    } else if (pUpper.includes('DIVIDEND') || pUpper.includes('DIV REC')) {
      mappedType = 'DIVIDEND';
      amount = credit || debit;
    } else if (pUpper.includes('INTEREST')) {
      mappedType = 'INTEREST';
      amount = credit || debit;
    } else if (pUpper.includes('MANAGEMENT') || pUpper.includes('MGMT FEE') || pUpper.includes('ADVISORY')) {
      mappedType = 'MANAGEMENT_FEE';
      amount = debit || credit;
    } else if (pUpper.includes('BUY') || pUpper.includes('PURCHASE')) {
      mappedType = 'BUY';
      amount = debit || credit;
    } else if (pUpper.includes('SELL') || pUpper.includes('SALE')) {
      mappedType = 'SELL';
      amount = credit || debit;
    }

    if (amount > 0) {
      records.push({
        date: dateStr,
        description: particulars,
        mappedType,
        amount,
        debit,
        credit,
        runningBalance: balance,
        voucherNo: voucher,
        scripName: particulars,
        notes: `360 ONE (IIFL) PMS Ledger: ${particulars}`
      });
    }
  }

  return records;
}

// ─────────────────────────────────────────────────────────────────────────────
// 360 ONE (IIFL) & COMPLETE CIRCLE PMS TRADE REGISTER PARSER
// ─────────────────────────────────────────────────────────────────────────────
export interface PMSTradeRecord {
  tradeDate: string;
  settlementDate: string;
  securityName: string;
  isin: string;
  symbol: string;
  transactionType: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  grossAmount: number;
  brokerage: number;
  stt: number;
  otherCharges: number;
  netAmount: number;
  sourcePms: string;
}

export function parsePMSTradeRegisterCSV(csvContent: string, sourcePms: string = '360_ONE'): PMSTradeRecord[] {
  const records: PMSTradeRecord[] = [];
  const lines = csvContent.split(/\r?\n/);
  let headerIdx = -1;

  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const l = lines[i].toLowerCase();
    if ((l.includes('security') || l.includes('scrip') || l.includes('symbol') || l.includes('isin')) && (l.includes('qty') || l.includes('quantity') || l.includes('rate') || l.includes('price') || l.includes('buy') || l.includes('sell'))) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) return records;

  const headerCols = lines[headerIdx].split(',').map(c => c.trim().toLowerCase().replace(/^"|"$/g, ''));
  const colMap: Record<string, number> = {};
  headerCols.forEach((col, idx) => {
    colMap[col] = idx;
  });

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols: string[] = [];
    let inQuotes = false;
    let curr = '';
    for (const char of line) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) {
        cols.push(curr.trim());
        curr = '';
      } else {
        curr += char;
      }
    }
    cols.push(curr.trim());

    let rawDate = '';
    let secName = '';
    let isin = '';
    let sym = '';
    let txnType: 'BUY' | 'SELL' = 'BUY';
    let qty = 0;
    let price = 0;
    let netAmt = 0;
    let brokerage = 0;
    let stt = 0;

    for (const [colName, idx] of Object.entries(colMap)) {
      const val = (cols[idx] || '').replace(/^"|"$/g, '').trim();
      if (colName.includes('trade date') || colName.includes('tran date') || (colName === 'date' && !rawDate)) rawDate = val;
      else if (colName.includes('security') || colName.includes('scrip') || colName.includes('description') || colName.includes('name')) secName = val;
      else if (colName.includes('isin')) isin = val.toUpperCase();
      else if (colName.includes('symbol') || colName.includes('code')) sym = val.toUpperCase();
      else if (colName.includes('type') || colName.includes('action') || colName.includes('buy/sell')) {
        txnType = val.toUpperCase().includes('SELL') || val.toUpperCase().includes('SALE') ? 'SELL' : 'BUY';
      }
      else if (colName.includes('qty') || colName.includes('quantity')) qty = Math.abs(parseFloat(val.replace(/,/g, '')) || 0);
      else if (colName.includes('rate') || colName.includes('price')) price = Math.abs(parseFloat(val.replace(/,/g, '')) || 0);
      else if (colName.includes('amount') || colName.includes('value') || colName.includes('consideration') || colName.includes('net')) netAmt = Math.abs(parseFloat(val.replace(/,/g, '')) || 0);
      else if (colName.includes('brokerage')) brokerage = Math.abs(parseFloat(val.replace(/,/g, '')) || 0);
      else if (colName.includes('stt')) stt = Math.abs(parseFloat(val.replace(/,/g, '')) || 0);
    }

    if (!secName && !sym && !isin) continue;
    if (qty <= 0) continue;

    // Date parsing
    let dateStr = '';
    const dateParts = rawDate.split(/[-/]/);
    if (dateParts.length === 3) {
      if (dateParts[0].length === 4) {
        dateStr = `${dateParts[0]}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}`;
      } else {
        const [d, m, y] = dateParts;
        dateStr = `${y.length === 2 ? '20' + y : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    if (!dateStr || dateStr.includes('NaN')) continue;

    if (netAmt <= 0 && price > 0 && qty > 0) {
      netAmt = price * qty;
    }

    records.push({
      tradeDate: dateStr,
      settlementDate: dateStr,
      securityName: secName || sym || isin,
      isin,
      symbol: sym || secName.split(/[\s-]+/)[0],
      transactionType: txnType,
      quantity: qty,
      price: price || (netAmt / qty),
      grossAmount: netAmt,
      brokerage,
      stt,
      otherCharges: 0,
      netAmount: netAmt,
      sourcePms
    });
  }

  return records;
}

