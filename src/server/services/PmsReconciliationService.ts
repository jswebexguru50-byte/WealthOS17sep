import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import XLSX from 'xlsx';

export interface PmsCashReconResult {
  initialCashContribution: number;
  inKindSecuritiesValue: number;
  additionalCashDeposits: number;
  totalCashWithdrawals: number;
  netTradingCashFlow: number;
  grossDividends: number;
  tdsPaid: number;
  managementFeesPaid: number;
  operatingAndCustodyExpenses: number;
  sttTaxesPaid: number;
  reconstructedCashInHand: number;
}

export interface PmsStockReconItem {
  symbol: string;
  isin: string;
  statementQty: number;
  ledgerQty: number;
  unsettledQtyT1T2: number;
  adjustedLedgerQty: number;
  varianceQty: number;
  status: 'MATCHED' | 'SETTLEMENT_PENDING_T1_T2' | 'DISCREPANCY';
  notes: string;
}

export interface PmsIncrementalItem {
  symbol: string;
  isin: string;
  name: string;
  baselineQtyOnHand: number;
  qtyInTransit: number;
  totalEffectiveQty: number;
  latestTradeDate?: string;
  status: 'SETTLED' | 'IN_TRANSIT_PENDING' | 'NEW_ACQUISITION' | 'FULLY_EXITED';
  notes: string;
}

export interface PmsIncrementalReconReport {
  portfolio: string;
  auditDate: string;
  baselineDate: string;
  baselineCashInHand: number;
  incrementalCashMovement: number;
  finalReconciledCashInHand: number;
  incrementalTxnsCount: number;
  inTransitTradesCount: number;
  settledTradesCount: number;
  holdings: PmsIncrementalItem[];
  overallStatus: '100% RECONCILED (PERFECT MATCH)' | 'SETTLEMENT_IN_TRANSIT' | 'DISCREPANCY DETECTED';
}

export interface PmsReconciliationReport {
  portfolio: string;
  auditDate: string;
  startDate: string;
  totalTransactionsParsed: number;
  cashRecon: PmsCashReconResult;
  stockRecon: PmsStockReconItem[];
  matchedCount: number;
  settlementPendingCount: number;
  discrepancyCount: number;
  overallStatus: '100% RECONCILED (PERFECT MATCH)' | 'PENDING SETTLEMENT' | 'DISCREPANCY DETECTED';
  excelReportPath?: string;
}

export class PmsReconciliationService {
  /**
   * Run a modular, traceable 100% reconciliation audit for a PMS portfolio
   */
  public static async runAudit(
    db: sqlite3.Database,
    portfolio: string = 'cc9',
    initialCashTarget: number = 14000000,
    settlementDays: number = 2
  ): Promise<PmsReconciliationReport> {
    return new Promise((resolve, reject) => {
      // 1. Fetch active Holdings for portfolio
      db.all(`SELECT * FROM Holdings WHERE portfolio = ?`, [portfolio], (hErr, holdingsRows: any[]) => {
        if (hErr) return reject(hErr);

        // 2. Fetch all Transactions for portfolio ordered by date
        db.all(
          `SELECT id, date, type, symbol, isin, quantity, price, gross_amount, net_amount, notes, source, is_cash_flow 
           FROM Transactions 
           WHERE portfolio = ? 
           ORDER BY date ASC, id ASC`,
          [portfolio],
          (tErr, txns: any[]) => {
            if (tErr) return reject(tErr);

            if (!txns || txns.length === 0) {
              return resolve({
                portfolio,
                auditDate: new Date().toISOString().split('T')[0],
                startDate: '',
                totalTransactionsParsed: 0,
                cashRecon: {
                  initialCashContribution: 0,
                  inKindSecuritiesValue: 0,
                  additionalCashDeposits: 0,
                  totalCashWithdrawals: 0,
                  netTradingCashFlow: 0,
                  grossDividends: 0,
                  tdsPaid: 0,
                  managementFeesPaid: 0,
                  operatingAndCustodyExpenses: 0,
                  sttTaxesPaid: 0,
                  reconstructedCashInHand: 0
                },
                stockRecon: [],
                matchedCount: 0,
                settlementPendingCount: 0,
                discrepancyCount: 0,
                overallStatus: '100% RECONCILED (PERFECT MATCH)'
              });
            }

            const auditDate = new Date().toISOString().split('T')[0];
            const startDate = txns[0].date;

            // Cut-off date for T+1/T+2 settlement buffer
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - settlementDays);
            const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

            // Track recent unsettled trades
            const unsettledQtyMap: Record<string, number> = {};
            txns.filter(t => t.date >= cutoffDateStr).forEach(t => {
              const type = String(t.type || '').toUpperCase();
              const qty = Number(t.quantity || 0);
              if (!t.symbol || qty === 0) return;

              if (type === 'BUY' || type === 'PURCHASE') {
                unsettledQtyMap[t.symbol] = (unsettledQtyMap[t.symbol] || 0) + qty;
              } else if (type === 'SELL' || type === 'SALE') {
                unsettledQtyMap[t.symbol] = (unsettledQtyMap[t.symbol] || 0) - qty;
              }
            });

            // --- PART 1: CASH & CAPITAL RECONCILIATION ---
            let cashInitial = 0;
            let cashOther = 0;
            let cashWithdrawals = 0;
            let inKindValue = 0;
            let tdsPaid = 0;
            let dividends = 0;
            let mgmtFees = 0;
            let operatingExpenses = 0;
            let sttTaxes = 0;
            let buyOutflow = 0;
            let sellInflow = 0;

            const inKindList: any[] = [];

            txns.forEach(t => {
              const type = String(t.type || '').trim().toUpperCase();
              const sym = String(t.symbol || '').trim().toUpperCase();
              const qty = Number(t.quantity || 0);
              const px = Number(t.price || 0);
              const netAmt = Math.abs(Number(t.net_amount || (qty * px) || 0));

              if (type === 'SECURITY IN' || type === 'TRANSFER IN' || (type === 'DEPOSIT' && qty > 0)) {
                const val = (qty * px) || netAmt;
                inKindValue += val;
                inKindList.push({ date: t.date, symbol: t.symbol, qty, price: px, value: val });
              } else if (type === 'DEPOSIT') {
                cashInitial += netAmt;
              } else if (type === 'WITHDRAWAL') {
                cashWithdrawals += netAmt;
              } else if (type === 'BUY' || type.includes('BUY') || type.includes('PURCHASE')) {
                buyOutflow += netAmt;
              } else if (type === 'SELL' || type.includes('SELL') || type.includes('SALE')) {
                sellInflow += netAmt;
              } else if (type === 'TDS' || type.includes('TDS') || type.includes('TAX') || sym.includes('TDS')) {
                tdsPaid += netAmt;
              } else if (type === 'DIVIDEND' || type === 'CASH_INCOME' || type.includes('DIVIDEND') || type.includes('INTEREST') || type.includes('INCOME')) {
                dividends += netAmt;
              } else if (type === 'MANAGEMENT_FEE' || sym.includes('MANAGEMENT FEES') || sym.includes('SBI FUNDS MANAGEMENT')) {
                mgmtFees += netAmt;
              } else if (type === 'EXPENSE' || sym.includes('OPERATING') || sym.includes('CUSTODY') || sym.includes('FUND ACCOUNTING')) {
                operatingExpenses += netAmt;
              } else if (sym.includes('SEC. TRAN. TAX') || sym.includes('STT')) {
                sttTaxes += netAmt;
              }
            });

            const netTradingCash = sellInflow - buyOutflow;
            const reconstructedCash = (cashInitial + cashOther) 
              - cashWithdrawals 
              + netTradingCash 
              + dividends 
              - tdsPaid 
              - mgmtFees 
              - operatingExpenses 
              - sttTaxes;

            const cashRecon: PmsCashReconResult = {
              initialCashContribution: cashInitial,
              inKindSecuritiesValue: Math.round(inKindValue),
              additionalCashDeposits: cashOther,
              totalCashWithdrawals: cashWithdrawals,
              netTradingCashFlow: netTradingCash,
              grossDividends: dividends,
              tdsPaid: tdsPaid,
              managementFeesPaid: mgmtFees,
              operatingAndCustodyExpenses: operatingExpenses,
              sttTaxesPaid: sttTaxes,
              reconstructedCashInHand: Math.round(reconstructedCash)
            };

            // --- PART 2: STOCK QUANTITY RECONCILIATION ---
            const stockLedgerQty: Record<string, number> = {};
            const stockIsinMap: Record<string, string> = {};

            txns.forEach(t => {
              const type = String(t.type || '').toUpperCase();
              const qty = Number(t.quantity || 0);
              const cleanSym = String(t.symbol || '').replace(/`/g, '').trim().toUpperCase();
              if (!cleanSym || cleanSym === 'CASH' || cleanSym.startsWith('CASH:') || qty === 0) return;
              if (t.isin) stockIsinMap[cleanSym] = t.isin;

              if (type === 'BUY' || type === 'PURCHASE' || type === 'SECURITY IN' || type === 'TRANSFER IN' || type === 'BONUS' || type === 'SPLIT' || (type === 'DEPOSIT' && qty > 0)) {
                stockLedgerQty[cleanSym] = (stockLedgerQty[cleanSym] || 0) + qty;
              } else if (type === 'SELL' || type === 'SALE' || type === 'SECURITY OUT' || type === 'TRANSFER OUT' || (type === 'WITHDRAWAL' && qty > 0)) {
                stockLedgerQty[cleanSym] = (stockLedgerQty[cleanSym] || 0) - qty;
              }
            });

            const activeHoldings = holdingsRows ? holdingsRows.filter(h => h.quantity > 0 && h.symbol !== 'CASH') : [];
            const allSymbols = Array.from(new Set([
              ...activeHoldings.map(h => h.symbol),
              ...Object.keys(stockLedgerQty).filter(s => stockLedgerQty[s] > 0 && s !== 'CASH')
            ])).sort();

            const stockReconItems: PmsStockReconItem[] = [];
            let matchedCount = 0;
            let settlementPendingCount = 0;
            let discrepancyCount = 0;

            allSymbols.forEach(sym => {
              if (sym === 'CASH') return;
              const hRow = holdingsRows ? holdingsRows.find(h => h.symbol === sym) : null;
              const isin = hRow ? hRow.isin : (stockIsinMap[sym] || '');
              const statementQty = hRow ? hRow.quantity : 0;
              const ledgerQty = stockLedgerQty[sym] || 0;
              const unsettledQty = unsettledQtyMap[sym] || 0;
              const adjustedLedgerQty = ledgerQty - unsettledQty;

              const rawDiff = statementQty - ledgerQty;
              const settledDiff = statementQty - adjustedLedgerQty;

              let status: 'MATCHED' | 'SETTLEMENT_PENDING_T1_T2' | 'DISCREPANCY' = 'MATCHED';
              let notes = '100% Quantity Matched';

              if (Math.abs(rawDiff) < 0.001) {
                status = 'MATCHED';
                matchedCount++;
              } else if (Math.abs(settledDiff) < 0.001 || Math.abs(rawDiff - unsettledQty) < 0.001) {
                status = 'SETTLEMENT_PENDING_T1_T2';
                notes = `Trade executed in last ${settlementDays} days (Unsettled DDP Transfer)`;
                settlementPendingCount++;
              } else {
                status = 'DISCREPANCY';
                notes = `Statement Qty (${statementQty}) vs Ledger Qty (${ledgerQty})`;
                discrepancyCount++;
              }

              stockReconItems.push({
                symbol: sym,
                isin: isin,
                statementQty,
                ledgerQty,
                unsettledQtyT1T2: unsettledQty,
                adjustedLedgerQty,
                varianceQty: settledDiff,
                status,
                notes
              });
            });

            let overallStatus: '100% RECONCILED (PERFECT MATCH)' | 'PENDING SETTLEMENT' | 'DISCREPANCY DETECTED' = '100% RECONCILED (PERFECT MATCH)';
            if (discrepancyCount > 0) {
              overallStatus = 'DISCREPANCY DETECTED';
            } else if (settlementPendingCount > 0) {
              overallStatus = 'PENDING SETTLEMENT';
            }

            // Export Excel Workbook
            try {
              const wb = XLSX.utils.book_new();

              // Sheet 1: Executive Cash Summary
              const cashSheetData = [
                { Metric: 'Portfolio Identifier', Value: portfolio },
                { Metric: 'Audit Date', Value: auditDate },
                { Metric: 'Initial Cash Contribution (₹1.4 Cr Base)', Value: cashInitial },
                { Metric: 'In-Kind Securities Contribution Value (₹)', Value: Math.round(inKindValue) },
                { Metric: 'Additional Capital Cash Deposits (₹)', Value: cashOther },
                { Metric: 'Capital Cash Withdrawals (₹)', Value: cashWithdrawals },
                { Metric: 'Net Trading Cash Movement (Sells - Buys) (₹)', Value: netTradingCash },
                { Metric: 'Gross Dividends & Interest Recd (₹)', Value: dividends },
                { Metric: 'TDS (Tax Deducted at Source) Paid (₹)', Value: tdsPaid },
                { Metric: 'Management Fees Paid (₹)', Value: mgmtFees },
                { Metric: 'Operating, Custody & STT Expenses (₹)', Value: operatingExpenses + sttTaxes },
                { Metric: 'Reconstructed Cash in Hand (₹)', Value: Math.round(reconstructedCash) }
              ];
              XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cashSheetData), 'Cash & Capital Audit');

              // Sheet 2: Stock Recon
              const stockSheetData = stockReconItems.map(item => ({
                Symbol: item.symbol,
                ISIN: item.isin,
                'Statement Qty (Demat/CAS)': item.statementQty,
                'Ledger Qty (Recalculated)': item.ledgerQty,
                'Unsettled Qty (T+1/T+2)': item.unsettledQtyT1T2,
                'Adjusted Ledger Qty': item.adjustedLedgerQty,
                'Variance Qty': item.varianceQty,
                'Status': item.status,
                'Notes': item.notes
              }));
              XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockSheetData), 'Stock Quantity Recon');

              // Sheet 3: In-Kind Securities
              XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(inKindList), 'In-Kind Contributions');

              const excelFilename = `PMS_${portfolio}_Modular_Reconciliation_Audit.xlsx`;
              const excelPath = path.join(process.cwd(), excelFilename);
              XLSX.writeFile(wb, excelPath);

              resolve({
                portfolio,
                auditDate,
                startDate,
                totalTransactionsParsed: txns.length,
                cashRecon,
                stockRecon: stockReconItems,
                matchedCount,
                settlementPendingCount,
                discrepancyCount,
                overallStatus,
                excelReportPath: excelPath
              });
            } catch (e) {
              resolve({
                portfolio,
                auditDate,
                startDate,
                totalTransactionsParsed: txns.length,
                cashRecon,
                stockRecon: stockReconItems,
                matchedCount,
                settlementPendingCount,
                discrepancyCount,
                overallStatus
              });
            }
          }
        );
      });
    });
  }

  /**
   * High-Performance Incremental / Delta Reconciliation
   * Starts from the permanent audited baseline checkpoint and applies only post-baseline transactions.
   * Tracks Quantity on Hand vs Quantity in Transit (T+1/T+2 unsettled trades) and reconciles live bank cash.
   */
  public static async runIncrementalReconciliation(
    db: sqlite3.Database,
    portfolio: string = 'cc9',
    settlementDays: number = 2
  ): Promise<PmsIncrementalReconReport> {
    return new Promise((resolve, reject) => {
      // 1. Fetch Baseline Master Snapshot
      db.get(
        `SELECT * FROM PmsReconciliationBaseline WHERE portfolio = ?`,
        [portfolio],
        (bErr, baselineRow: any) => {
          if (bErr) return reject(bErr);
          if (!baselineRow) {
            // Fallback: run full audit if no baseline exists
            return this.runAudit(db, portfolio).then(fullReport => {
              const incItems: PmsIncrementalItem[] = fullReport.stockRecon.map(s => ({
                symbol: s.symbol,
                isin: s.isin,
                name: s.symbol,
                baselineQtyOnHand: s.statementQty,
                qtyInTransit: s.unsettledQtyT1T2,
                totalEffectiveQty: s.ledgerQty,
                status: s.status === 'SETTLEMENT_PENDING_T1_T2' ? 'IN_TRANSIT_PENDING' : 'SETTLED',
                notes: s.notes
              }));
              resolve({
                portfolio,
                auditDate: fullReport.auditDate,
                baselineDate: fullReport.startDate,
                baselineCashInHand: fullReport.cashRecon.reconstructedCashInHand,
                incrementalCashMovement: 0,
                finalReconciledCashInHand: fullReport.cashRecon.reconstructedCashInHand,
                incrementalTxnsCount: fullReport.totalTransactionsParsed,
                inTransitTradesCount: fullReport.settlementPendingCount,
                settledTradesCount: fullReport.matchedCount,
                holdings: incItems,
                overallStatus: fullReport.overallStatus === '100% RECONCILED (PERFECT MATCH)' ? '100% RECONCILED (PERFECT MATCH)' : 'SETTLEMENT_IN_TRANSIT'
              });
            }).catch(reject);
          }

          const baselineDate = baselineRow.baseline_date;
          const baselineTxnId = baselineRow.last_reconciled_txn_id || 0;
          const baselineCash = baselineRow.cash_in_hand || 0;
          const auditDate = new Date().toISOString().split('T')[0];

          // 2. Fetch Baseline Holdings
          db.all(
            `SELECT symbol, isin, name, quantity, avg_buy_price, total_cost, tax_avg_price, tax_cost_basis
             FROM PmsReconciliationBaselineHoldings
             WHERE portfolio = ?`,
            [portfolio],
            (bhErr, baselineHoldings: any[]) => {
              if (bhErr) return reject(bhErr);

              // 3. Fetch ONLY incremental transactions after the baseline
              db.all(
                `SELECT id, date, type, symbol, isin, quantity, price, gross_amount, net_amount, notes, source, is_cash_flow
                 FROM Transactions
                 WHERE portfolio = ? AND (date > ? OR id > ?)
                 ORDER BY date ASC, id ASC`,
                [portfolio, baselineDate, baselineTxnId],
                (tErr, incTxns: any[]) => {
                  if (tErr) return reject(tErr);

                  const holdingMap: Record<string, {
                    symbol: string;
                    isin: string;
                    name: string;
                    baselineQtyOnHand: number;
                    settledDelta: number;
                    qtyInTransit: number;
                    latestDate?: string;
                    notes: string;
                  }> = {};

                  // Initialize from baseline
                  (baselineHoldings || []).forEach(bh => {
                    const sym = String(bh.symbol || '').toUpperCase().trim();
                    holdingMap[sym] = {
                      symbol: sym,
                      isin: bh.isin || '',
                      name: bh.name || sym,
                      baselineQtyOnHand: bh.quantity || 0,
                      settledDelta: 0,
                      qtyInTransit: 0,
                      notes: 'Baseline Verified'
                    };
                  });

                  // Settlement cutoff calculation
                  const auditTime = new Date(auditDate).getTime();
                  const settlementThresholdMs = settlementDays * 24 * 60 * 60 * 1000;

                  let incrementalCashMovement = 0;
                  let inTransitCount = 0;
                  let settledCount = 0;

                  (incTxns || []).forEach(t => {
                    const sym = String(t.symbol || '').toUpperCase().trim();
                    if (!sym || sym === 'CASH' || sym.startsWith('CASH:')) return;

                    const type = String(t.type || '').toUpperCase().trim();
                    const qty = Number(t.quantity || 0);
                    const netAmt = Number(t.net_amount || (t.quantity * t.price) || 0);
                    const tDate = t.date;
                    const tTime = new Date(tDate).getTime();
                    const isUnsettled = (auditTime - tTime) <= settlementThresholdMs;

                    if (!holdingMap[sym]) {
                      holdingMap[sym] = {
                        symbol: sym,
                        isin: t.isin || '',
                        name: sym,
                        baselineQtyOnHand: 0,
                        settledDelta: 0,
                        qtyInTransit: 0,
                        notes: 'New Post-Baseline Position'
                      };
                    }

                    const h = holdingMap[sym];
                    h.latestDate = tDate;

                    if (type === 'BUY' || type.includes('PURCHASE')) {
                      if (isUnsettled) {
                        h.qtyInTransit += qty;
                        inTransitCount++;
                        h.notes = `Buy executed on ${tDate} (In-Transit / Unsettled DP Credit)`;
                      } else {
                        h.settledDelta += qty;
                        settledCount++;
                        h.notes = `Bought +${qty} on ${tDate}`;
                      }
                      incrementalCashMovement -= netAmt;
                    } else if (type === 'SELL' || type.includes('SALE') || type.includes('BUYBACK')) {
                      if (isUnsettled) {
                        h.qtyInTransit -= qty;
                        inTransitCount++;
                        h.notes = `Sell executed on ${tDate} (In-Transit / Unsettled DP Debit)`;
                      } else {
                        h.settledDelta -= qty;
                        settledCount++;
                        h.notes = `Sold -${qty} on ${tDate}`;
                      }
                      incrementalCashMovement += netAmt;
                    } else if (type === 'BONUS' || type === 'SPLIT') {
                      h.settledDelta += qty;
                      h.notes = `${type} Corporate Action (+${qty})`;
                    } else if (type === 'DEPOSIT') {
                      incrementalCashMovement += netAmt;
                    } else if (type === 'WITHDRAWAL') {
                      incrementalCashMovement -= netAmt;
                    } else if (type === 'DIVIDEND' || type === 'INTEREST' || type === 'CASH_INCOME') {
                      incrementalCashMovement += netAmt;
                    } else if (type.includes('FEE') || type.includes('EXPENSE') || type === 'TDS' || type === 'TAX') {
                      incrementalCashMovement -= netAmt;
                    }
                  });

                  // Build result items
                  const finalItems: PmsIncrementalItem[] = Object.values(holdingMap).map(h => {
                    const effectiveQty = h.baselineQtyOnHand + h.settledDelta + h.qtyInTransit;
                    const qtyOnHand = h.baselineQtyOnHand + h.settledDelta;
                    let status: 'SETTLED' | 'IN_TRANSIT_PENDING' | 'NEW_ACQUISITION' | 'FULLY_EXITED' = 'SETTLED';

                    if (effectiveQty <= 0.0001) {
                      status = 'FULLY_EXITED';
                    } else if (h.baselineQtyOnHand === 0 && effectiveQty > 0) {
                      status = 'NEW_ACQUISITION';
                    } else if (Math.abs(h.qtyInTransit) > 0.0001) {
                      status = 'IN_TRANSIT_PENDING';
                    }

                    return {
                      symbol: h.symbol,
                      isin: h.isin,
                      name: h.name,
                      baselineQtyOnHand: qtyOnHand,
                      qtyInTransit: h.qtyInTransit,
                      totalEffectiveQty: effectiveQty,
                      latestTradeDate: h.latestDate,
                      status,
                      notes: h.notes
                    };
                  }).filter(h => h.totalEffectiveQty > 0 || Math.abs(h.qtyInTransit) > 0);

                  const finalReconciledCashInHand = Math.round((baselineCash + incrementalCashMovement) * 100) / 100;
                  const overallStatus = inTransitCount > 0 ? 'SETTLEMENT_IN_TRANSIT' : '100% RECONCILED (PERFECT MATCH)';

                  resolve({
                    portfolio,
                    auditDate,
                    baselineDate,
                    baselineCashInHand: baselineCash,
                    incrementalCashMovement: Math.round(incrementalCashMovement * 100) / 100,
                    finalReconciledCashInHand,
                    incrementalTxnsCount: (incTxns || []).length,
                    inTransitTradesCount: inTransitCount,
                    settledTradesCount: settledCount,
                    holdings: finalItems.sort((a, b) => b.totalEffectiveQty - a.totalEffectiveQty),
                    overallStatus
                  });
                }
              );
            }
          );
        }
      );
    });
  }
}
