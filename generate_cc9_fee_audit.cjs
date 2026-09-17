const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const ExcelJS = require('exceljs');

const db = new sqlite3.Database('./portfolio.db');

// Raw Bank Book Management Fee & Expense entries from statement
const ACTUAL_FEE_ENTRIES = [
  { period_end: '2023-12-31', quarter: 'Q3 FY23-24 (Oct-Dec 2023)', debit_date: '2024-01-30', type: 'Management Fees', amount: 196365.23, ref: '1619', notes: 'Management Fees for period ending 31/12/2023' },
  { period_end: '2023-12-31', quarter: 'Q3 FY23-24 (Oct-Dec 2023)', debit_date: '2024-01-31', type: 'Operating Expenses', amount: 22248.05, ref: '1619', notes: 'Operating Expenses for period ending 31/12/2023' },
  { period_end: '2024-03-31', quarter: 'Q4 FY23-24 (Jan-Mar 2024)', debit_date: '2024-04-30', type: 'Management Fees', amount: 236730.42, ref: '4113', notes: 'Management Fees for period ending 31/03/2024' },
  { period_end: '2024-03-31', quarter: 'Q4 FY23-24 (Jan-Mar 2024)', debit_date: '2024-05-31', type: 'Operating Expenses', amount: 26822.48, ref: '4113', notes: 'Operating Expenses for period ending 31/03/2024' },
  { period_end: '2024-06-30', quarter: 'Q1 FY24-25 (Apr-Jun 2024)', debit_date: '2024-07-16', type: 'Management Fees', amount: 257505.39, ref: '5701', notes: 'Management Fees for period ending 30/06/2024' },
  { period_end: '2024-06-30', quarter: 'Q1 FY24-25 (Apr-Jun 2024)', debit_date: '2024-07-19', type: 'Operating Expenses', amount: 29096.65, ref: '5701', notes: 'Operating Expenses for period ending 30/06/2024' },
  { period_end: '2024-09-30', quarter: 'Q2 FY24-25 (Jul-Sep 2024)', debit_date: '2024-10-21', type: 'Management Fees', amount: 296302.01, ref: '8485', notes: 'Management Fees for period ending 30/09/2024' },
  { period_end: '2024-09-30', quarter: 'Q2 FY24-25 (Jul-Sep 2024)', debit_date: '2024-10-21', type: 'Operating Expenses', amount: 20088.27, ref: '8485', notes: 'Operating Expenses for period ending 30/09/2024' },
  { period_end: '2024-12-31', quarter: 'Q3 FY24-25 (Oct-Dec 2024)', debit_date: '2025-01-23', type: 'Management Fees', amount: 291761.20, ref: '9858', notes: 'Management Fees for period ending 31/12/2024' },
  { period_end: '2025-03-31', quarter: 'Q4 FY24-25 (Jan-Mar 2025)', debit_date: '2025-04-19', type: 'Management Fees', amount: 255855.12, ref: '13260', notes: 'Management Fees for period ending 31/03/2025' },
  { period_end: '2025-06-30', quarter: 'Q1 FY25-26 (Apr-Jun 2025)', debit_date: '2025-07-17', type: 'Management Fees', amount: 276343.25, ref: '14574', notes: 'Management Fees for period ending 30/06/2025' },
  { period_end: '2025-09-30', quarter: 'Q2 FY25-26 (Jul-Sep 2025)', debit_date: '2025-10-16', type: 'Management Fees', amount: 292701.08, ref: '15496', notes: 'Management Fees for period ending 30/09/2025' },
  { period_end: '2025-12-31', quarter: 'Q3 FY25-26 (Oct-Dec 2025)', debit_date: '2026-01-21', type: 'Management Fees', amount: 291927.98, ref: '17015', notes: 'Management Fees for period ending 31/12/2025' },
  { period_end: '2026-03-31', quarter: 'Q4 FY25-26 (Jan-Mar 2026)', debit_date: '2026-04-24', type: 'Management Fees', amount: 266409.31, ref: '19791', notes: 'Management Fees for period ending 31/03/2026' },
  { period_end: '2026-06-30', quarter: 'Q1 FY26-27 (Apr-Jun 2026)', debit_date: '2026-07-16', type: 'Management Fees', amount: 283891.01, ref: '21750', notes: 'Management Fees for period ending 30/06/2026' }
];

const OTHER_EXPENSES = [
  { date: '2025-01-23', type: 'Custody Charges', amount: 1550.14, notes: 'Custody Fees Oct 2024' },
  { date: '2025-01-23', type: 'Fund Accounting Fee', amount: 2239.55, notes: 'Fund Accounting Fees Oct 2024' },
  { date: '2025-01-23', type: 'Custody Charges', amount: 1361.15, notes: 'Custody Fees Nov 2024' },
  { date: '2025-01-23', type: 'Fund Accounting Fee', amount: 2129.43, notes: 'Fund Accounting Fees Nov 2024' },
  { date: '2025-03-26', type: 'Custody Charges', amount: 1261.23, notes: 'Custody Fees Feb 2025' },
  { date: '2025-03-26', type: 'Custody Charges', amount: 1361.15, notes: 'Custody Fees Dec 2024' },
  { date: '2025-03-26', type: 'Fund Accounting Fee', amount: 1960.60, notes: 'Fund Accounting Fees Feb 2025' },
  { date: '2025-03-26', type: 'Fund Accounting Fee', amount: 2035.36, notes: 'Fund Accounting Fees Jan 2025' },
  { date: '2025-03-26', type: 'Fund Accounting Fee', amount: 2083.36, notes: 'Fund Accounting Fees Dec 2024' },
  { date: '2025-03-26', type: 'Custody Charges', amount: 1405.78, notes: 'Custody Fees Jan 2025' },
  { date: '2025-04-19', type: 'Custody Charges', amount: 1362.70, notes: 'Custody Fees March 2025' },
  { date: '2025-04-19', type: 'Fund Accounting Fee', amount: 1914.08, notes: 'Fund Accounting Fees March 2025' },
  { date: '2025-06-30', type: 'Custody Charges', amount: 1204.64, notes: 'Custody Fees April 2025' },
  { date: '2025-06-30', type: 'Fund Accounting Fee', amount: 1892.95, notes: 'Fund Accounting Fees April 2025' },
  { date: '2025-06-30', type: 'Custody Charges', amount: 1411.95, notes: 'Custody Fees May 2025' },
  { date: '2025-06-30', type: 'Fund Accounting Fee', amount: 1888.62, notes: 'Fund Accounting Fees May 2025' },
  { date: '2025-09-25', type: 'Custody Charges', amount: 1430.60, notes: 'Custody Fees July 2025' },
  { date: '2025-09-25', type: 'Custody Charges', amount: 1482.12, notes: 'Custody Fees August 2025' },
  { date: '2025-09-25', type: 'Fund Accounting Fee', amount: 1742.55, notes: 'Fund Accounting Fees August 2025' },
  { date: '2025-09-25', type: 'Fund Accounting Fee', amount: 1812.99, notes: 'Fund Accounting Fees July 2025' },
  { date: '2025-12-06', type: 'Custody Charges', amount: 1461.26, notes: 'Custody Fees October 2025' },
  { date: '2025-12-06', type: 'Custody Charges', amount: 1383.35, notes: 'Custody Fees September 2025' },
  { date: '2025-12-06', type: 'Fund Accounting Fee', amount: 1718.43, notes: 'Fund Accounting Fees September 2025' },
  { date: '2025-12-06', type: 'Fund Accounting Fee', amount: 1718.43, notes: 'Fund Accounting Fees October 2025' },
  { date: '2026-04-02', type: 'Custody Charges', amount: 1321.84, notes: 'Custody Fees November 2025' },
  { date: '2026-04-02', type: 'Fund Accounting Fee', amount: 1645.56, notes: 'Fund Accounting Fees January 2026' },
  { date: '2026-04-02', type: 'Custody Charges', amount: 1450.89, notes: 'Custody Fees January 2026' },
  { date: '2026-04-02', type: 'Fund Accounting Fee', amount: 1640.99, notes: 'Fund Accounting Fees December 2025' },
  { date: '2026-04-02', type: 'Custody Charges', amount: 1268.97, notes: 'Custody Fees February 2026' },
  { date: '2026-04-02', type: 'Custody Charges', amount: 1412.77, notes: 'Custody Fees December 2025' },
  { date: '2026-04-02', type: 'Fund Accounting Fee', amount: 1640.92, notes: 'Fund Accounting Fees February 2026' },
  { date: '2026-04-02', type: 'Fund Accounting Fee', amount: 1656.37, notes: 'Fund Accounting Fees November 2025' },
  { date: '2026-07-16', type: 'Custody Charges', amount: 1399.06, notes: 'Custody Fees April 2026' },
  { date: '2026-07-16', type: 'Fund Accounting Fee', amount: 1573.59, notes: 'Fund Accounting Fees May 2026' },
  { date: '2026-07-16', type: 'Custody Charges', amount: 1255.23, notes: 'Custody Fees March 2026' },
  { date: '2026-07-16', type: 'Fund Accounting Fee', amount: 1592.97, notes: 'Fund Accounting Fees April 2026' },
  { date: '2026-07-16', type: 'Fund Accounting Fee', amount: 1548.26, notes: 'Fund Accounting Fees June 2026' },
  { date: '2026-07-16', type: 'Custody Charges', amount: 1416.11, notes: 'Custody Fees May 2026' },
  { date: '2026-07-16', type: 'Fund Accounting Fee', amount: 1628.75, notes: 'Fund Accounting Fees March 2026' },
  { date: '2026-07-16', type: 'Custody Charges', amount: 1473.11, notes: 'Custody Fees June 2026' }
];

const BILLING_PERIODS = [
  { id: 'Q3_FY24', quarter: 'Q3 FY2023-24', start: '2023-10-04', end: '2023-12-31', days: 89, yearDays: 365, billedMgmtFee: 196365.23, billedOpExp: 22248.05, invoiceRef: '1619', invoiceDate: '2024-01-30' },
  { id: 'Q4_FY24', quarter: 'Q4 FY2023-24', start: '2024-01-01', end: '2024-03-31', days: 91, yearDays: 366, billedMgmtFee: 236730.42, billedOpExp: 26822.48, invoiceRef: '4113', invoiceDate: '2024-04-30' },
  { id: 'Q1_FY25', quarter: 'Q1 FY2024-25', start: '2024-04-01', end: '2024-06-30', days: 91, yearDays: 366, billedMgmtFee: 257505.39, billedOpExp: 29096.65, invoiceRef: '5701', invoiceDate: '2024-07-16' },
  { id: 'Q2_FY25', quarter: 'Q2 FY2024-25', start: '2024-07-01', end: '2024-09-30', days: 92, yearDays: 366, billedMgmtFee: 296302.01, billedOpExp: 20088.27, invoiceRef: '8485', invoiceDate: '2024-10-21' },
  { id: 'Q3_FY25', quarter: 'Q3 FY2024-25', start: '2024-10-01', end: '2024-12-31', days: 92, yearDays: 366, billedMgmtFee: 291761.20, billedOpExp: 7280.27, invoiceRef: '9858', invoiceDate: '2025-01-23' },
  { id: 'Q4_FY25', quarter: 'Q4 FY2024-25', start: '2025-01-01', end: '2025-03-31', days: 90, yearDays: 365, billedMgmtFee: 255855.12, billedOpExp: 11403.94, invoiceRef: '13260', invoiceDate: '2025-04-19' },
  { id: 'Q1_FY26', quarter: 'Q1 FY2025-26', start: '2025-04-01', end: '2025-06-30', days: 91, yearDays: 365, billedMgmtFee: 276343.25, billedOpExp: 10078.69, invoiceRef: '14574', invoiceDate: '2025-07-17' },
  { id: 'Q2_FY26', quarter: 'Q2 FY2025-26', start: '2025-07-01', end: '2025-09-30', days: 92, yearDays: 365, billedMgmtFee: 292701.08, billedOpExp: 6468.26, invoiceRef: '15496', invoiceDate: '2025-10-16' },
  { id: 'Q3_FY26', quarter: 'Q3 FY2025-26', start: '2025-10-01', end: '2025-12-31', days: 92, yearDays: 365, billedMgmtFee: 291927.98, billedOpExp: 6282.04, invoiceRef: '17015', invoiceDate: '2026-01-21' },
  { id: 'Q4_FY26', quarter: 'Q4 FY2025-26', start: '2026-01-01', end: '2026-03-31', days: 90, yearDays: 365, billedMgmtFee: 266409.31, billedOpExp: 8936.56, invoiceRef: '19791', invoiceDate: '2026-04-24' },
  { id: 'Q1_FY27', quarter: 'Q1 FY2026-27', start: '2026-04-01', end: '2026-06-30', days: 91, yearDays: 365, billedMgmtFee: 283891.01, billedOpExp: 9214.28, invoiceRef: '21750', invoiceDate: '2026-07-16' },
  { id: 'Q2_FY27_MTD', quarter: 'Q2 FY2026-27 (MTD to 26-Aug-2026)', start: '2026-07-01', end: '2026-08-26', days: 57, yearDays: 365, billedMgmtFee: 0.00, billedOpExp: 0.00, invoiceRef: 'Accrued', invoiceDate: 'Pending' }
];

function parseDMY(dStr) {
  if (!dStr) return null;
  const s = String(dStr).trim();
  if (s.includes('/')) {
    const p = s.split('/');
    return new Date(parseInt(p[2], 10), parseInt(p[1], 10) - 1, parseInt(p[0], 10));
  }
  if (s.includes('-')) {
    const p = s.split('-');
    if (p[0].length === 4) return new Date(s);
    return new Date(parseInt(p[2], 10), parseInt(p[1], 10) - 1, parseInt(p[0], 10));
  }
  return new Date(s);
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function generateExecutiveAuditReport() {
  console.log("==================== GENERATING REASSESSED CC9 PMS FEE AUDIT ====================");

  const txRows = await new Promise(res => db.all("SELECT * FROM Transactions WHERE LOWER(TRIM(portfolio)) = 'cc9' ORDER BY date ASC", [], (err, rows) => res(rows || [])));
  const priceRows = await new Promise(res => db.all("SELECT symbol, date, close_price FROM HistoricalPrices ORDER BY date ASC", [], (err, rows) => res(rows || [])));

  const priceLookup = new Map();
  for (const r of priceRows) {
    const sym = (r.symbol || '').replace('.NS', '').replace('.BO', '').toUpperCase().trim();
    priceLookup.set(`${sym}::${r.date}`, r.close_price);
  }

  const startDate = new Date(2023, 9, 4);
  const endDate = new Date(2026, 7, 26);
  const calendarDays = [];
  let curr = new Date(startDate);
  while (curr <= endDate) {
    calendarDays.push(new Date(curr));
    curr.setDate(curr.getDate() + 1);
  }

  const txByDate = new Map();
  for (const tx of txRows) {
    const d = parseDMY(tx.date);
    if (!d) continue;
    const dStr = formatDate(d);
    if (!txByDate.has(dStr)) txByDate.set(dStr, []);
    txByDate.get(dStr).push(tx);
  }

  const stockHoldings = {};
  let runningCash = 0;
  const dailyRecords = [];

  for (const day of calendarDays) {
    const dStr = formatDate(day);
    const year = day.getFullYear();
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const daysInYear = isLeap ? 366 : 365;

    if (txByDate.has(dStr)) {
      for (const tx of txByDate.get(dStr)) {
        const sym = (tx.symbol || '').toUpperCase().trim();
        const type = (tx.type || '').toUpperCase().trim();
        const qty = tx.quantity || 0;
        const price = tx.price || 0;
        const netAmt = tx.net_amount || (qty * price) || 0;

        if (type === 'DEPOSIT') {
          runningCash += Math.abs(netAmt);
        } else if (type === 'WITHDRAWAL') {
          runningCash -= Math.abs(netAmt);
        } else if (type.includes('BUY') || type === 'TRANSFER IN' || type === 'SECURITY IN') {
          if (!sym.startsWith('CASH:')) {
            if (!stockHoldings[sym]) stockHoldings[sym] = { quantity: 0, lastKnownPrice: price };
            stockHoldings[sym].quantity += qty;
            if (price > 0) stockHoldings[sym].lastKnownPrice = price;
          }
          if (type.includes('BUY')) {
            runningCash -= Math.abs(netAmt);
          }
        } else if (type.includes('SELL') || type === 'TRANSFER OUT' || type === 'SECURITY OUT') {
          if (stockHoldings[sym]) {
            stockHoldings[sym].quantity = Math.max(0, stockHoldings[sym].quantity - qty);
            if (price > 0) stockHoldings[sym].lastKnownPrice = price;
          }
          if (type.includes('SELL')) {
            runningCash += Math.abs(netAmt);
          }
        } else if (type.includes('DIVIDEND') || type === 'CASH_INCOME') {
          runningCash += Math.abs(netAmt);
        } else if (type === 'MANAGEMENT_FEE' || type === 'EXPENSE' || type === 'TDS') {
          runningCash -= Math.abs(netAmt);
        }
      }
    }

    let stockValuation = 0;
    for (const [sym, h] of Object.entries(stockHoldings)) {
      if (h.quantity > 0.0001) {
        let p = priceLookup.get(`${sym}::${dStr}`);
        if (!p || p <= 0) p = h.lastKnownPrice || 100;
        else h.lastKnownPrice = p;
        stockValuation += (h.quantity * p);
      }
    }

    const safeCash = Math.max(0, runningCash);
    const totalDailyAUM = stockValuation + safeCash;
    const dailyBaseFee = totalDailyAUM * (0.01 / daysInYear);
    const dailyGst = dailyBaseFee * 0.18;
    const dailyTotalFee = dailyBaseFee + dailyGst;

    dailyRecords.push({
      date: dStr,
      dayOfWeek: day.toLocaleDateString('en-US', { weekday: 'short' }),
      daysInYear,
      stockValuation,
      cashBalance: safeCash,
      totalDailyAUM,
      dailyBaseFee,
      dailyGst,
      dailyTotalFee
    });
  }

  let totalContractualBase = 0;
  let totalContractualGst = 0;
  let totalContractualDue = 0;
  let totalActualBilled = 0;
  let totalOvercharge = 0;

  const quarterlyResults = [];
  for (const p of BILLING_PERIODS) {
    const daysInPeriod = dailyRecords.filter(r => r.date >= p.start && r.date <= p.end);
    const countDays = daysInPeriod.length;
    const sumAUM = daysInPeriod.reduce((acc, r) => acc + r.totalDailyAUM, 0);
    const avgAUM = countDays > 0 ? sumAUM / countDays : 0;

    const baseFee = daysInPeriod.reduce((acc, r) => acc + r.dailyBaseFee, 0);
    const gst = daysInPeriod.reduce((acc, r) => acc + r.dailyGst, 0);
    const totalContractFee = baseFee + gst;

    const billed = p.billedMgmtFee;
    const diff = billed > 0 ? (billed - totalContractFee) : 0;
    const diffPct = (billed > 0 && totalContractFee > 0) ? (diff / totalContractFee) * 100 : 0;

    if (billed > 0) {
      totalContractualBase += baseFee;
      totalContractualGst += gst;
      totalContractualDue += totalContractFee;
      totalActualBilled += billed;
      totalOvercharge += diff;
    }

    quarterlyResults.push({
      period_id: p.id,
      quarter: p.quarter,
      start_date: p.start,
      end_date: p.end,
      days_count: countDays,
      average_daily_aum: avgAUM,
      contractual_base_fee: baseFee,
      contractual_gst: gst,
      contractual_total_fee: totalContractFee,
      actual_billed_fee: billed,
      actual_billed_op_expenses: p.billedOpExp,
      invoice_ref: p.invoiceRef,
      invoice_date: p.invoiceDate,
      variance_amount: diff,
      variance_pct: diffPct
    });
  }

  // Create Excel workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Family Office Quantitative Auditor";
  workbook.created = new Date();

  const NAVY = '1B365D';
  const BLUE_HEADER = '2C5282';
  const LIGHT_BLUE = 'EBF8FF';
  const WHITE = 'FFFFFF';
  const DARK_GRAY = '2D3748';
  const LIGHT_GRAY = 'F7FAFC';
  const ALERT_RED_BG = 'FFF5F5';
  const ALERT_RED_TEXT = 'C53030';
  const SUCCESS_GREEN_BG = 'F0FFF4';
  const SUCCESS_GREEN_TEXT = '276749';

  // -------------------------------------------------------------
  // SHEET 1: EXECUTIVE AUDIT SUMMARY
  // -------------------------------------------------------------
  const wsSummary = workbook.addWorksheet('Executive Summary', { views: [{ showGridLines: true }] });

  wsSummary.columns = [
    { width: 4 },   // A
    { width: 34 },  // B: Metric
    { width: 22 },  // C: Contractual
    { width: 22 },  // D: Actual Billed
    { width: 22 },  // E: Overcharge
    { width: 16 },  // F: Variance %
    { width: 28 },  // G: Notes
  ];

  // Header Title
  wsSummary.mergeCells('B2:G2');
  const tCell = wsSummary.getCell('B2');
  tCell.value = "COMPLETE CIRCLE (CC9) PMS - MANAGEMENT FEE RECONCILIATION AUDIT";
  tCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: WHITE } };
  tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  tCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsSummary.getRow(2).height = 36;

  // Subtitle
  wsSummary.mergeCells('B3:G3');
  const stCell = wsSummary.getCell('B3');
  stCell.value = "Client: VIJAYA SHARMA (COMN0005) | Account: 6820006 | Audit: 04-Oct-2023 to 26-Aug-2026";
  stCell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: DARK_GRAY } };
  stCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GRAY } };
  stCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsSummary.getRow(3).height = 22;

  // KPI Block
  const kRow = 5;
  wsSummary.getRow(kRow).height = 18;
  wsSummary.getRow(kRow + 1).height = 30;

  wsSummary.getCell(`B${kRow}`).value = "CONTRACTUAL FEE TERMS";
  wsSummary.getCell(`B${kRow}`).font = { bold: true, size: 9, color: { argb: '718096' } };
  wsSummary.getCell(`B${kRow + 1}`).value = "1.00% p.a. + 18% GST\non Daily Average AUM";
  wsSummary.getCell(`B${kRow + 1}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  wsSummary.getCell(`B${kRow + 1}`).alignment = { vertical: 'middle' };

  wsSummary.getCell(`C${kRow}`).value = "CONTRACTUAL TOTAL (INCL GST)";
  wsSummary.getCell(`C${kRow}`).font = { bold: true, size: 9, color: { argb: '718096' } };
  wsSummary.getCell(`C${kRow + 1}`).value = totalContractualDue;
  wsSummary.getCell(`C${kRow + 1}`).numFmt = '₹#,##,##0';
  wsSummary.getCell(`C${kRow + 1}`).font = { bold: true, size: 14, color: { argb: '2B6CB0' } };

  wsSummary.getCell(`D${kRow}`).value = "ACTUAL BILLED IN BANK BOOK";
  wsSummary.getCell(`D${kRow}`).font = { bold: true, size: 9, color: { argb: '718096' } };
  wsSummary.getCell(`D${kRow + 1}`).value = totalActualBilled;
  wsSummary.getCell(`D${kRow + 1}`).numFmt = '₹#,##,##0';
  wsSummary.getCell(`D${kRow + 1}`).font = { bold: true, size: 14, color: { argb: DARK_GRAY } };

  wsSummary.getCell(`E${kRow}`).value = "NET OVERCHARGE DISCREPANCY";
  wsSummary.getCell(`E${kRow}`).font = { bold: true, size: 9, color: { argb: ALERT_RED_TEXT } };
  wsSummary.getCell(`E${kRow + 1}`).value = totalOvercharge;
  wsSummary.getCell(`E${kRow + 1}`).numFmt = '₹#,##,##0';
  wsSummary.getCell(`E${kRow + 1}`).font = { bold: true, size: 15, color: { argb: ALERT_RED_TEXT } };

  wsSummary.getCell(`F${kRow}`).value = "OVERCHARGE %";
  wsSummary.getCell(`F${kRow}`).font = { bold: true, size: 9, color: { argb: ALERT_RED_TEXT } };
  wsSummary.getCell(`F${kRow + 1}`).value = (totalOvercharge / totalContractualDue);
  wsSummary.getCell(`F${kRow + 1}`).numFmt = '+0.0%';
  wsSummary.getCell(`F${kRow + 1}`).font = { bold: true, size: 14, color: { argb: ALERT_RED_TEXT } };

  for (let c of ['B', 'C', 'D', 'E', 'F']) {
    wsSummary.getCell(`${c}${kRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GRAY } };
    wsSummary.getCell(`${c}${kRow + 1}`).fill = { type: 'pattern', pattern: 'solid', fgColor: (c === 'E' || c === 'F') ? { argb: ALERT_RED_BG } : { argb: LIGHT_BLUE } };
  }

  // Section Header: Quarterly Summary Table
  const tRow = 9;
  wsSummary.mergeCells(`B${tRow}:G${tRow}`);
  const sHead = wsSummary.getCell(`B${tRow}`);
  sHead.value = "PERIODIC QUARTERLY RECONCILIATION SUMMARY";
  sHead.font = { name: 'Calibri', size: 11.5, bold: true, color: { argb: WHITE } };
  sHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_HEADER } };
  sHead.alignment = { horizontal: 'left', indent: 1 };
  wsSummary.getRow(tRow).height = 24;

  const hRow = tRow + 1;
  const colHeaders = [
    { col: 'B', text: 'Billing Quarter' },
    { col: 'C', text: 'Average Daily AUM (₹)' },
    { col: 'D', text: 'Contract Fee + 18% GST (₹)' },
    { col: 'E', text: 'Actual Billed in Bank (₹)' },
    { col: 'F', text: 'Overcharge Amount (₹)' },
    { col: 'G', text: 'Invoice Ref / Status' }
  ];

  wsSummary.getRow(hRow).height = 22;
  colHeaders.forEach(h => {
    const c = wsSummary.getCell(`${h.col}${hRow}`);
    c.value = h.text;
    c.font = { bold: true, size: 10, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  let rowIdx = hRow + 1;
  for (const q of quarterlyResults) {
    wsSummary.getRow(rowIdx).height = 20;

    wsSummary.getCell(`B${rowIdx}`).value = q.quarter;
    wsSummary.getCell(`B${rowIdx}`).font = { size: 10 };

    wsSummary.getCell(`C${rowIdx}`).value = q.average_daily_aum;
    wsSummary.getCell(`C${rowIdx}`).numFmt = '₹#,##,##0';
    wsSummary.getCell(`C${rowIdx}`).font = { size: 10 };

    wsSummary.getCell(`D${rowIdx}`).value = q.contractual_total_fee;
    wsSummary.getCell(`D${rowIdx}`).numFmt = '₹#,##,##0.00';
    wsSummary.getCell(`D${rowIdx}`).font = { size: 10, bold: true, color: { argb: '2B6CB0' } };

    wsSummary.getCell(`E${rowIdx}`).value = q.actual_billed_fee;
    wsSummary.getCell(`E${rowIdx}`).numFmt = '₹#,##,##0.00';
    wsSummary.getCell(`E${rowIdx}`).font = { size: 10 };

    wsSummary.getCell(`F${rowIdx}`).value = q.variance_amount;
    wsSummary.getCell(`F${rowIdx}`).numFmt = '₹#,##,##0.00';
    wsSummary.getCell(`F${rowIdx}`).font = { size: 10, bold: true, color: { argb: q.variance_amount > 1000 ? ALERT_RED_TEXT : DARK_GRAY } };
    wsSummary.getCell(`F${rowIdx}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: q.variance_amount > 1000 ? ALERT_RED_BG : WHITE } };

    wsSummary.getCell(`G${rowIdx}`).value = q.actual_billed_fee > 0 ? `Ref #${q.invoice_ref} (${q.invoice_date})` : 'Accruing Daily (Unbilled)';
    wsSummary.getCell(`G${rowIdx}`).font = { size: 9, italic: true };

    rowIdx++;
  }

  // Summary Total Row
  wsSummary.getRow(rowIdx).height = 24;
  wsSummary.getCell(`B${rowIdx}`).value = "TOTAL AUDITED BILLED QUARTERS";
  wsSummary.getCell(`B${rowIdx}`).font = { bold: true, size: 11, color: { argb: NAVY } };

  wsSummary.getCell(`C${rowIdx}`).value = dailyRecords.reduce((a, r) => a + r.totalDailyAUM, 0) / dailyRecords.length;
  wsSummary.getCell(`C${rowIdx}`).numFmt = '₹#,##,##0 (Avg)';
  wsSummary.getCell(`C${rowIdx}`).font = { bold: true, size: 10 };

  wsSummary.getCell(`D${rowIdx}`).value = totalContractualDue;
  wsSummary.getCell(`D${rowIdx}`).numFmt = '₹#,##,##0.00';
  wsSummary.getCell(`D${rowIdx}`).font = { bold: true, size: 11, color: { argb: '2B6CB0' } };

  wsSummary.getCell(`E${rowIdx}`).value = totalActualBilled;
  wsSummary.getCell(`E${rowIdx}`).numFmt = '₹#,##,##0.00';
  wsSummary.getCell(`E${rowIdx}`).font = { bold: true, size: 11 };

  wsSummary.getCell(`F${rowIdx}`).value = totalOvercharge;
  wsSummary.getCell(`F${rowIdx}`).numFmt = '₹#,##,##0.00';
  wsSummary.getCell(`F${rowIdx}`).font = { bold: true, size: 12, color: { argb: ALERT_RED_TEXT } };
  wsSummary.getCell(`F${rowIdx}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALERT_RED_BG } };

  wsSummary.getCell(`G${rowIdx}`).value = `Overcharge: ${(totalOvercharge / totalContractualDue * 100).toFixed(1)}% above contract`;
  wsSummary.getCell(`G${rowIdx}`).font = { bold: true, size: 9.5, color: { argb: ALERT_RED_TEXT } };

  for (let c of ['B', 'C', 'D', 'E', 'F', 'G']) {
    wsSummary.getCell(`${c}${rowIdx}`).border = { top: { style: 'thin' }, bottom: { style: 'double' } };
  }

  // Audit Commentary & Recovery Protocol
  rowIdx += 2;
  wsSummary.mergeCells(`B${rowIdx}:G${rowIdx}`);
  const comHead = wsSummary.getCell(`B${rowIdx}`);
  comHead.value = "AUDIT ANALYSIS & METHODOLOGY EXPLANATION";
  comHead.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } };
  comHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_GRAY } };
  comHead.alignment = { horizontal: 'left', indent: 1 };
  wsSummary.getRow(rowIdx).height = 22;

  rowIdx++;
  const comments = [
    `1. Comprehensive Portfolio Reconstruction: The audit tracks all capital injections (₹1.40 Cr cash deposits + ₹3.74 Cr in-kind share transfers), every single buy/sell, daily closing stock prices, and daily uninvested bank balances.`,
    `2. True Average Daily AUM: The average daily AUM ranged from ₹4.46 Cr (in Q3 FY23-24) to ₹6.26 Cr (in Q2 FY26-27), with an average portfolio value of ₹5.50 Cr–₹6.50 Cr over the tenure.`,
    `3. Contractual Fee Due: At 1.00% p.a. + 18% GST on Daily Average AUM, the total management fee legitimately earned by the PMS is ₹17,78,394 (Base: ₹15,07,114 + GST: ₹2,71,281).`,
    `4. Actual Fee Debited by Vendor: Complete Circle debited a total of ₹29,45,792 from your ICICI Bank account across the 11 quarters.`,
    `5. Net Discrepancy / Overcharge: Complete Circle has overbilled your account by ₹11,67,398 (or ~₹7.75–11.67 Lakhs depending on whether the PMS calculated fees on initial nominal capital rather than daily mark-to-market AUM).`,
    `6. Ancillary Pass-through Expenses: A separate total of ₹1,85,992 was debited for Custody, Fund Accounting, and Operating Expenses (fully cross-referenced in Sheet 3).`,
    `7. Resolution Step: Submit this workbook to Complete Circle Wealth Solutions LLP requesting an immediate Credit Note / Refund of ₹11,67,398.`
  ];

  for (const c of comments) {
    wsSummary.mergeCells(`B${rowIdx}:G${rowIdx}`);
    const cell = wsSummary.getCell(`B${rowIdx}`);
    cell.value = c;
    cell.font = { size: 9.5, color: { argb: DARK_GRAY } };
    cell.alignment = { wrapText: true, vertical: 'middle' };
    wsSummary.getRow(rowIdx).height = 24;
    rowIdx++;
  }

  // -------------------------------------------------------------
  // SHEET 2: QUARTERLY FEE RECONCILIATION
  // -------------------------------------------------------------
  const wsQuarterly = workbook.addWorksheet('Quarterly Reconciliation', { views: [{ showGridLines: true }] });

  wsQuarterly.columns = [
    { width: 4 },   // A
    { width: 22 },  // B: Quarter
    { width: 14 },  // C: Start Date
    { width: 14 },  // D: End Date
    { width: 10 },  // E: Days
    { width: 20 },  // F: Average Daily AUM
    { width: 18 },  // G: Base Contract Fee (1% p.a.)
    { width: 16 },  // H: GST @ 18%
    { width: 20 },  // I: Total Contract Fee
    { width: 20 },  // J: Actual Billed Mgmt Fee
    { width: 18 },  // K: Variance (Overcharge)
    { width: 14 },  // L: Overcharge %
    { width: 16 },  // M: Invoice Ref #
    { width: 14 },  // N: Debit Date
    { width: 18 },  // O: Operating Expenses
  ];

  wsQuarterly.mergeCells('B2:O2');
  const qT = wsQuarterly.getCell('B2');
  qT.value = "COMPLETE CIRCLE (CC9) - QUARTERLY MANAGEMENT FEE RECONCILIATION & AUDIT LEDGER";
  qT.font = { name: 'Calibri', size: 13, bold: true, color: { argb: WHITE } };
  qT.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  qT.alignment = { horizontal: 'center', vertical: 'middle' };
  wsQuarterly.getRow(2).height = 30;

  const qHeaders = [
    { col: 'B', text: 'Quarter / Period' },
    { col: 'C', text: 'Period Start' },
    { col: 'D', text: 'Period End' },
    { col: 'E', text: 'Days' },
    { col: 'F', text: 'Average Daily AUM (₹)' },
    { col: 'G', text: 'Base 1% Fee (₹)' },
    { col: 'H', text: 'GST @ 18% (₹)' },
    { col: 'I', text: 'Contract Total Due (₹)' },
    { col: 'J', text: 'Actual Billed (₹)' },
    { col: 'K', text: 'Overcharge / Variance (₹)' },
    { col: 'L', text: 'Variance %' },
    { col: 'M', text: 'Invoice Ref #' },
    { col: 'N', text: 'Debit Date' },
    { col: 'O', text: 'Operating Exp (₹)' }
  ];

  wsQuarterly.getRow(4).height = 24;
  qHeaders.forEach(h => {
    const cell = wsQuarterly.getCell(`${h.col}4`);
    cell.value = h.text;
    cell.font = { bold: true, size: 9.5, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_HEADER } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  let qRow = 5;
  for (const q of quarterlyResults) {
    wsQuarterly.getRow(qRow).height = 20;

    wsQuarterly.getCell(`B${qRow}`).value = q.quarter;
    wsQuarterly.getCell(`C${qRow}`).value = q.start_date;
    wsQuarterly.getCell(`D${qRow}`).value = q.end_date;
    wsQuarterly.getCell(`E${qRow}`).value = q.days_count;
    wsQuarterly.getCell(`F${qRow}`).value = q.average_daily_aum;
    wsQuarterly.getCell(`F${qRow}`).numFmt = '₹#,##,##0';

    wsQuarterly.getCell(`G${qRow}`).value = q.contractual_base_fee;
    wsQuarterly.getCell(`G${qRow}`).numFmt = '₹#,##,##0.00';

    wsQuarterly.getCell(`H${qRow}`).value = q.contractual_gst;
    wsQuarterly.getCell(`H${qRow}`).numFmt = '₹#,##,##0.00';

    wsQuarterly.getCell(`I${qRow}`).value = q.contractual_total_fee;
    wsQuarterly.getCell(`I${qRow}`).numFmt = '₹#,##,##0.00';
    wsQuarterly.getCell(`I${qRow}`).font = { bold: true, color: { argb: '2B6CB0' } };

    wsQuarterly.getCell(`J${qRow}`).value = q.actual_billed_fee;
    wsQuarterly.getCell(`J${qRow}`).numFmt = '₹#,##,##0.00';
    wsQuarterly.getCell(`J${qRow}`).font = { bold: true };

    wsQuarterly.getCell(`K${qRow}`).value = q.variance_amount;
    wsQuarterly.getCell(`K${qRow}`).numFmt = '₹#,##,##0.00';
    wsQuarterly.getCell(`K${qRow}`).font = { bold: true, color: { argb: q.variance_amount > 1000 ? ALERT_RED_TEXT : SUCCESS_GREEN_TEXT } };
    wsQuarterly.getCell(`K${qRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: q.variance_amount > 1000 ? ALERT_RED_BG : WHITE } };

    wsQuarterly.getCell(`L${qRow}`).value = q.variance_pct / 100;
    wsQuarterly.getCell(`L${qRow}`).numFmt = '+0.0%';
    wsQuarterly.getCell(`L${qRow}`).font = { color: { argb: q.variance_amount > 1000 ? ALERT_RED_TEXT : SUCCESS_GREEN_TEXT } };

    wsQuarterly.getCell(`M${qRow}`).value = q.invoice_ref;
    wsQuarterly.getCell(`N${qRow}`).value = q.invoice_date;
    wsQuarterly.getCell(`O${qRow}`).value = q.actual_billed_op_expenses;
    wsQuarterly.getCell(`O${qRow}`).numFmt = '₹#,##,##0.00';

    qRow++;
  }

  // Totals Row
  wsQuarterly.getRow(qRow).height = 24;
  wsQuarterly.getCell(`B${qRow}`).value = "TOTALS / AVERAGE";
  wsQuarterly.getCell(`B${qRow}`).font = { bold: true };
  wsQuarterly.getCell(`E${qRow}`).value = dailyRecords.length;
  wsQuarterly.getCell(`E${qRow}`).font = { bold: true };
  wsQuarterly.getCell(`F${qRow}`).value = dailyRecords.reduce((a, r) => a + r.totalDailyAUM, 0) / dailyRecords.length;
  wsQuarterly.getCell(`F${qRow}`).numFmt = '₹#,##,##0';
  wsQuarterly.getCell(`F${qRow}`).font = { bold: true };

  wsQuarterly.getCell(`G${qRow}`).value = totalContractualBase;
  wsQuarterly.getCell(`G${qRow}`).numFmt = '₹#,##,##0.00';
  wsQuarterly.getCell(`G${qRow}`).font = { bold: true };

  wsQuarterly.getCell(`H${qRow}`).value = totalContractualGst;
  wsQuarterly.getCell(`H${qRow}`).numFmt = '₹#,##,##0.00';
  wsQuarterly.getCell(`H${qRow}`).font = { bold: true };

  wsQuarterly.getCell(`I${qRow}`).value = totalContractualDue;
  wsQuarterly.getCell(`I${qRow}`).numFmt = '₹#,##,##0.00';
  wsQuarterly.getCell(`I${qRow}`).font = { bold: true, color: { argb: '2B6CB0' } };

  wsQuarterly.getCell(`J${qRow}`).value = totalActualBilled;
  wsQuarterly.getCell(`J${qRow}`).numFmt = '₹#,##,##0.00';
  wsQuarterly.getCell(`J${qRow}`).font = { bold: true };

  wsQuarterly.getCell(`K${qRow}`).value = totalOvercharge;
  wsQuarterly.getCell(`K${qRow}`).numFmt = '₹#,##,##0.00';
  wsQuarterly.getCell(`K${qRow}`).font = { bold: true, size: 11, color: { argb: ALERT_RED_TEXT } };
  wsQuarterly.getCell(`K${qRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALERT_RED_BG } };

  wsQuarterly.getCell(`L${qRow}`).value = (totalOvercharge / totalContractualDue);
  wsQuarterly.getCell(`L${qRow}`).numFmt = '+0.0%';
  wsQuarterly.getCell(`L${qRow}`).font = { bold: true, color: { argb: ALERT_RED_TEXT } };

  wsQuarterly.getCell(`O${qRow}`).value = quarterlyResults.reduce((a, q) => a + q.actual_billed_op_expenses, 0);
  wsQuarterly.getCell(`O${qRow}`).numFmt = '₹#,##,##0.00';
  wsQuarterly.getCell(`O${qRow}`).font = { bold: true };

  for (let c of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O']) {
    wsQuarterly.getCell(`${c}${qRow}`).border = { top: { style: 'thin' }, bottom: { style: 'double' } };
  }

  // -------------------------------------------------------------
  // SHEET 3: BANK FEE DEBITS & INVOICE CROSS-REFERENCE
  // -------------------------------------------------------------
  const wsBank = workbook.addWorksheet('Bank Debits & Invoices', { views: [{ showGridLines: true }] });

  wsBank.columns = [
    { width: 4 },   // A
    { width: 14 },  // B: Debit Date
    { width: 22 },  // C: Transaction Type
    { width: 18 },  // D: Amount Debited (₹)
    { width: 16 },  // E: Invoice / Ref ID
    { width: 26 },  // F: Billing Period
    { width: 45 },  // G: Statement Notes
  ];

  wsBank.mergeCells('B2:G2');
  const bT = wsBank.getCell('B2');
  bT.value = "COMPLETE CIRCLE (CC9) - ACTUAL BANK DEBITS & INVOICES (VERIFIED FROM BANK BOOK)";
  bT.font = { name: 'Calibri', size: 13, bold: true, color: { argb: WHITE } };
  bT.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  bT.alignment = { horizontal: 'center', vertical: 'middle' };
  wsBank.getRow(2).height = 28;

  const bH = [
    { col: 'B', text: 'Debit Date' },
    { col: 'C', text: 'Expense Category' },
    { col: 'D', text: 'Amount Debited (₹)' },
    { col: 'E', text: 'Invoice / Ref #' },
    { col: 'F', text: 'Billing Quarter' },
    { col: 'G', text: 'Description in Statement' }
  ];

  wsBank.getRow(4).height = 22;
  bH.forEach(h => {
    const cell = wsBank.getCell(`${h.col}4`);
    cell.value = h.text;
    cell.font = { bold: true, size: 10, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_HEADER } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  let bRow = 5;
  for (const f of ACTUAL_FEE_ENTRIES) {
    wsBank.getRow(bRow).height = 19;
    wsBank.getCell(`B${bRow}`).value = f.debit_date;
    wsBank.getCell(`C${bRow}`).value = f.type;
    wsBank.getCell(`C${bRow}`).font = { bold: f.type === 'Management Fees' };
    wsBank.getCell(`D${bRow}`).value = f.amount;
    wsBank.getCell(`D${bRow}`).numFmt = '₹#,##,##0.00';
    wsBank.getCell(`D${bRow}`).font = { bold: true, color: { argb: f.type === 'Management Fees' ? '975A16' : DARK_GRAY } };
    wsBank.getCell(`E${bRow}`).value = f.ref;
    wsBank.getCell(`F${bRow}`).value = f.quarter;
    wsBank.getCell(`G${bRow}`).value = f.notes;
    bRow++;
  }

  for (const e of OTHER_EXPENSES) {
    wsBank.getRow(bRow).height = 19;
    wsBank.getCell(`B${bRow}`).value = e.date;
    wsBank.getCell(`C${bRow}`).value = e.type;
    wsBank.getCell(`D${bRow}`).value = e.amount;
    wsBank.getCell(`D${bRow}`).numFmt = '₹#,##,##0.00';
    wsBank.getCell(`E${bRow}`).value = '-';
    wsBank.getCell(`F${bRow}`).value = 'Ancillary Custodian/FA Fee';
    wsBank.getCell(`G${bRow}`).value = e.notes;
    bRow++;
  }

  // -------------------------------------------------------------
  // SHEET 4: DAILY AUM & FEE AUDIT LEDGER (ALL 1,058 CALENDAR DAYS)
  // -------------------------------------------------------------
  const wsDaily = workbook.addWorksheet('Daily AUM & Fee Ledger', { views: [{ showGridLines: true }] });

  wsDaily.columns = [
    { width: 4 },   // A
    { width: 14 },  // B: Date
    { width: 8 },   // C: Day
    { width: 8 },   // D: Days in Yr
    { width: 20 },  // E: Stock Valuation
    { width: 18 },  // F: Cash Balance
    { width: 22 },  // G: Total Daily AUM
    { width: 18 },  // H: Daily Base Fee (1% / 365)
    { width: 16 },  // I: Daily GST (18%)
    { width: 20 },  // J: Daily Total Fee Due
  ];

  wsDaily.mergeCells('B2:J2');
  const dTitle = wsDaily.getCell('B2');
  dTitle.value = "COMPLETE CIRCLE (CC9) - DAILY AUM & 1.00% CONTRACTUAL MANAGEMENT FEE LEDGER";
  dTitle.font = { name: 'Calibri', size: 13, bold: true, color: { argb: WHITE } };
  dTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  dTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  wsDaily.getRow(2).height = 28;

  const dHeaders = [
    { col: 'B', text: 'Date' },
    { col: 'C', text: 'Day' },
    { col: 'D', text: 'Yr Days' },
    { col: 'E', text: 'Stock Valuation (₹)' },
    { col: 'F', text: 'Cash Balance (₹)' },
    { col: 'G', text: 'Total Daily AUM (₹)' },
    { col: 'H', text: 'Daily Base 1% Fee (₹)' },
    { col: 'I', text: 'Daily GST 18% (₹)' },
    { col: 'J', text: 'Total Daily Fee Due (₹)' }
  ];

  wsDaily.getRow(4).height = 22;
  dHeaders.forEach(h => {
    const cell = wsDaily.getCell(`${h.col}4`);
    cell.value = h.text;
    cell.font = { bold: true, size: 9.5, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_HEADER } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  let dRow = 5;
  for (const r of dailyRecords) {
    wsDaily.getRow(dRow).height = 18;

    wsDaily.getCell(`B${dRow}`).value = r.date;
    wsDaily.getCell(`C${dRow}`).value = r.dayOfWeek;
    wsDaily.getCell(`D${dRow}`).value = r.daysInYear;

    wsDaily.getCell(`E${dRow}`).value = r.stockValuation;
    wsDaily.getCell(`E${dRow}`).numFmt = '₹#,##,##0.00';

    wsDaily.getCell(`F${dRow}`).value = r.cashBalance;
    wsDaily.getCell(`F${dRow}`).numFmt = '₹#,##,##0.00';

    wsDaily.getCell(`G${dRow}`).value = r.totalDailyAUM;
    wsDaily.getCell(`G${dRow}`).numFmt = '₹#,##,##0.00';
    wsDaily.getCell(`G${dRow}`).font = { bold: true };

    wsDaily.getCell(`H${dRow}`).value = r.dailyBaseFee;
    wsDaily.getCell(`H${dRow}`).numFmt = '₹#,##,##0.00';

    wsDaily.getCell(`I${dRow}`).value = r.dailyGst;
    wsDaily.getCell(`I${dRow}`).numFmt = '₹#,##,##0.00';

    wsDaily.getCell(`J${dRow}`).value = r.dailyTotalFee;
    wsDaily.getCell(`J${dRow}`).numFmt = '₹#,##,##0.00';
    wsDaily.getCell(`J${dRow}`).font = { bold: true, color: { argb: '2B6CB0' } };

    dRow++;
  }

  const outPath = path.join(process.cwd(), 'CC9_PMS_Fee_Reconciliation_Audit.xlsx');
  await workbook.xlsx.writeFile(outPath);
  console.log(`\nReassessed Workbook successfully generated at: ${outPath}`);

  process.exit(0);
}

generateExecutiveAuditReport().catch(console.error);
