import React, { useState, useEffect } from 'react';
import { 
  X, 
  Printer, 
  ArrowUpRight, 
  ArrowDownRight, 
  TrendingUp, 
  DollarSign, 
  Wallet, 
  PiggyBank, 
  Receipt, 
  ArrowRightLeft, 
  Download, 
  Calendar,
  Layers,
  ChevronRight,
  Info
} from 'lucide-react';

interface PerformanceSnapshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPortfolio: string;
  formatCurrency?: (val: number) => string;
}

interface CashflowItem {
  sNo: number;
  category: string;
  date: string;
  symbol: string;
  portfolio: string;
  netAmountInr: number;
  nativeCurrency?: string;
  nativeAmount?: number;
  notes?: string;
}

export function PerformanceSnapshotModal({
  isOpen,
  onClose,
  selectedPortfolio,
  formatCurrency = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(v)
}: PerformanceSnapshotModalProps) {
  const [loading, setLoading] = useState(true);
  const [cashFlows, setCashFlows] = useState<CashflowItem[]>([]);
  const [showCashflowsDrawer, setShowCashflowsDrawer] = useState(false);
  const [summary, setSummary] = useState({
    cashIn: 0,
    cashOut: 0,
    incomePayout: 0,
    currentValue: 0,
    cashOnHand: 0,
    absoluteGain: 0,
    absoluteGainPct: 0,
    xirr: null as number | null,
    totalValuation: 0
  });

  useEffect(() => {
    if (!isOpen) return;
    fetchSnapshotData();
  }, [isOpen, selectedPortfolio]);

  const fetchSnapshotData = async () => {
    setLoading(true);
    try {
      // 1. Fetch cash flow ledger
      const portParam = selectedPortfolio && selectedPortfolio !== 'Combined' ? `?portfolios=${encodeURIComponent(selectedPortfolio)}` : '';
      const [cfRes, dashRes, xirrRes] = await Promise.all([
        fetch(`/api/cash-flow-ledger${portParam}`).then(r => r.json()).catch(() => ({ cashFlows: [] })),
        fetch(`/api/dashboard${portParam}`).then(r => r.json()).catch(() => ({ metrics: {} })),
        fetch(`/api/dashboard/xirr${portParam}`).then(r => r.json()).catch(() => ({ xirr: null }))
      ]);

      const flows: CashflowItem[] = cfRes?.cashFlows || [];
      setCashFlows(flows);

      let totalIn = 0;
      let totalOut = 0;
      let totalIncome = 0;

      flows.forEach(cf => {
        const cat = (cf.category || '').toUpperCase();
        const amt = cf.netAmountInr || 0;
        if (cat.includes('DEPOSIT') || cat.includes('INFLOW') || cat.includes('BUY')) {
          totalIn += Math.abs(amt);
        } else if (cat.includes('WITHDRAWAL') || cat.includes('OUTFLOW') || cat.includes('SELL')) {
          totalOut += Math.abs(amt);
        } else if (cat.includes('DIVIDEND') || cat.includes('INTEREST') || cat.includes('INCOME')) {
          totalIncome += Math.abs(amt);
        }
      });

      const curVal = dashRes?.metrics?.current_value || dashRes?.current_value || 0;
      const cashHold = dashRes?.metrics?.cash_in_hand || dashRes?.cash_in_hand || 0;
      const absGain = (curVal + totalOut + totalIncome) - totalIn;
      const absGainPct = totalIn > 0 ? (absGain / totalIn) * 100 : 0;
      const xirrVal = xirrRes?.xirr !== undefined ? xirrRes.xirr : (dashRes?.metrics?.xirr ?? null);

      setSummary({
        cashIn: totalIn,
        cashOut: totalOut,
        incomePayout: totalIncome,
        currentValue: curVal,
        cashOnHand: cashHold,
        absoluteGain: absGain,
        absoluteGainPct: absGainPct,
        xirr: xirrVal,
        totalValuation: curVal + cashHold
      });
    } catch (e) {
      console.error('Error loading snapshot data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const exportCashflowsCsv = () => {
    if (!cashFlows.length) return;
    const headers = ['S.No', 'Date', 'Category', 'Symbol', 'ISIN', 'Portfolio', 'Net Amount (INR)', 'Notes'];
    const rows = cashFlows.map(cf => [
      cf.sNo,
      cf.date,
      `"${cf.category || ''}"`,
      `"${cf.symbol || ''}"`,
      `"${cf.isin || '-'}"`,
      `"${cf.portfolio || ''}"`,
      cf.netAmountInr,
      `"${(cf.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Cashflows_${selectedPortfolio}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  // Max value for bar scaling
  const maxBar = Math.max(summary.cashIn + summary.cashOnHand, summary.currentValue + summary.cashOut + summary.incomePayout, 1);
  const inHeightPct = Math.min(100, Math.round(((summary.cashIn + summary.cashOnHand) / maxBar) * 100));
  const outHeightPct = Math.min(100, Math.round(((summary.currentValue + summary.cashOut + summary.incomePayout) / maxBar) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 animate-fadeIn">
      <div 
        className="rounded-3xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl transition-all border"
        style={{
          background: 'var(--bg-modal, #FFFFFF)',
          borderColor: 'var(--border-card, #1E293B)',
          color: 'var(--text-primary, #0F172A)'
        }}
      >
        {/* Top Header Bar */}
        <div 
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{
            borderColor: 'var(--border-card, #1E293B)',
            background: 'var(--bg-sidebar, #0A2240)',
            color: 'var(--text-sidebar, #F8FAFC)'
          }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold font-display tracking-tight text-white">
                  Performance Snapshot
                </h3>
                <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  {selectedPortfolio}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Consolidated visual capital flows, current asset valuation, and money-weighted returns (XIRR).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
              title="Print Snapshot"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowCashflowsDrawer(!showCashflowsDrawer)}
              className="px-3.5 py-1.5 rounded-xl font-medium text-xs transition-all cursor-pointer flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white shadow-sm"
            >
              <Receipt className="w-3.5 h-3.5" />
              {showCashflowsDrawer ? 'Hide Cashflows' : 'View Cashflows'}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body Canvas */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm font-mono text-slate-500">Calculating Dated Cashflows & Valuation Tree...</span>
            </div>
          ) : (
            <>
              {/* Main Circular Flow & Comparative Chart Container */}
              <div 
                className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center p-6 rounded-2xl border"
                style={{
                  background: 'var(--bg-card, #FFFFFF)',
                  borderColor: 'var(--border-card, #CBD5E1)',
                  color: 'var(--text-primary, #0F172A)'
                }}
              >
                
                {/* Left: Interactive Split-Flow Circular Node Tree */}
                <div className="lg:col-span-7 flex flex-col items-center justify-center relative py-4">
                  {/* Circular Tree Visual Background */}
                  <div className="relative w-full max-w-md flex flex-col gap-3.5 items-center">
                    
                    {/* Central Vertical Connector Axis */}
                    <div className="absolute top-4 bottom-14 w-0.5 bg-gradient-to-b from-emerald-500 via-blue-500 to-amber-500 opacity-40 z-0"></div>

                    {/* Node 1: Cash In */}
                    <div 
                      className="w-full flex items-center justify-between z-10 p-3 rounded-2xl border shadow-sm hover:shadow transition-all"
                      style={{
                        background: 'var(--bg-table-row, #FFFFFF)',
                        borderColor: 'var(--border-card, #E2E8F0)'
                      }}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                          Cash In (Inflows / Invested)
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                        {formatCurrency(summary.cashIn)}
                      </span>
                    </div>

                    {/* Node 2: Cash Out */}
                    <div 
                      className="w-full flex items-center justify-between z-10 p-3 rounded-2xl border shadow-sm hover:shadow transition-all"
                      style={{
                        background: 'var(--bg-table-row, #FFFFFF)',
                        borderColor: 'var(--border-card, #E2E8F0)'
                      }}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                          Cash Out (Realized Sales)
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold px-3 py-1 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                        {formatCurrency(summary.cashOut)}
                      </span>
                    </div>

                    {/* Node 3: Income Payout */}
                    <div 
                      className="w-full flex items-center justify-between z-10 p-3 rounded-2xl border shadow-sm hover:shadow transition-all"
                      style={{
                        background: 'var(--bg-table-row, #FFFFFF)',
                        borderColor: 'var(--border-card, #E2E8F0)'
                      }}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                          Income Payout (Dividends / Interest)
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold px-3 py-1 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                        {formatCurrency(summary.incomePayout)}
                      </span>
                    </div>

                    {/* Node 4: Current Value */}
                    <div 
                      className="w-full flex items-center justify-between z-10 p-3.5 rounded-2xl border-2 shadow-sm hover:shadow transition-all"
                      style={{
                        background: 'var(--bg-table-row, #FFFFFF)',
                        borderColor: 'rgba(99, 102, 241, 0.6)'
                      }}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-3 h-3 rounded-full bg-indigo-600"></span>
                        <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                          Current Market Value
                        </span>
                      </div>
                      <span className="text-sm font-mono font-extrabold px-3 py-1 rounded-xl bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                        {formatCurrency(summary.currentValue)}
                      </span>
                    </div>

                    {/* Node 5: Cash on Hand */}
                    <div 
                      className="w-full flex items-center justify-between z-10 p-3 rounded-2xl border shadow-sm hover:shadow transition-all"
                      style={{
                        background: 'var(--bg-table-row, #FFFFFF)',
                        borderColor: 'var(--border-card, #E2E8F0)'
                      }}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-3 h-3 rounded-full bg-teal-500"></span>
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                          Cash on Hand (Liquid / Bank)
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold px-3 py-1 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/30">
                        {formatCurrency(summary.cashOnHand)}
                      </span>
                    </div>

                    {/* Absolute Gain Strip */}
                    <div 
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium border-t mt-1"
                      style={{ borderColor: 'var(--border-card, #E2E8F0)', color: 'var(--text-secondary, #64748B)' }}
                    >
                      <span>Total Economic Gain:</span>
                      <span className={`font-mono font-bold flex items-center gap-1 ${summary.absoluteGain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                        {summary.absoluteGain >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        {formatCurrency(summary.absoluteGain)} ({summary.absoluteGainPct.toFixed(2)}%)
                      </span>
                    </div>

                    {/* Prominent Bottom Banner: Portfolio XIRR */}
                    <div className="w-full mt-2 p-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between shadow-lg">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-emerald-200" />
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-100">Annualized Return (XIRR)</span>
                      </div>
                      <span className="text-lg font-mono font-black tracking-tight">
                        {summary.xirr !== null ? `${summary.xirr.toFixed(2)}%` : 'N/A'}
                      </span>
                    </div>

                  </div>
                </div>

                {/* Right: Comparative Inflows vs Outflows Bar Chart */}
                <div 
                  className="lg:col-span-5 flex flex-col items-center justify-center p-5 rounded-2xl border shadow-sm h-full"
                  style={{
                    background: 'var(--bg-table-row, #FFFFFF)',
                    borderColor: 'var(--border-card, #CBD5E1)'
                  }}
                >
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-6 text-center" style={{ color: 'var(--text-secondary, #64748B)' }}>
                    Capital In vs Value Out (₹)
                  </h4>

                  <div 
                    className="w-full flex items-end justify-center gap-12 h-64 border-b pb-2 px-6"
                    style={{ borderColor: 'var(--border-card, #E2E8F0)' }}
                  >
                    {/* IN Bar */}
                    <div className="flex flex-col items-center gap-2 w-20">
                      <span className="text-[11px] font-mono font-bold text-center" style={{ color: 'var(--text-primary)' }}>
                        {formatCurrency(summary.cashIn + summary.cashOnHand)}
                      </span>
                      <div 
                        className="w-full rounded-t-xl bg-gradient-to-t from-emerald-600 to-teal-400 shadow-md transition-all duration-700"
                        style={{ height: `${Math.max(12, inHeightPct * 2)}px` }}
                      ></div>
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 mt-1">
                        In
                      </span>
                    </div>

                    {/* OUT Bar */}
                    <div className="flex flex-col items-center gap-2 w-20">
                      <span className="text-[11px] font-mono font-bold text-center" style={{ color: 'var(--text-primary)' }}>
                        {formatCurrency(summary.currentValue + summary.cashOut + summary.incomePayout)}
                      </span>
                      <div 
                        className="w-full rounded-t-xl bg-gradient-to-t from-indigo-700 to-blue-500 shadow-md transition-all duration-700"
                        style={{ height: `${Math.max(12, outHeightPct * 2)}px` }}
                      ></div>
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 mt-1">
                        Out + Value
                      </span>
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-6 text-[11px]" style={{ color: 'var(--text-secondary, #64748B)' }}>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                      <span>Cash In (Invested)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                      <span>Current Valuation</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span>
                      <span>Cash on Hand</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                      <span>Cash Out / Realized</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Cashflows Drawer / Table Section */}
              {showCashflowsDrawer && (
                <div 
                  className="space-y-3 animate-fadeIn border-t pt-5"
                  style={{ borderColor: 'var(--border-card, #E2E8F0)' }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        Dated Cashflows Ledger
                        <span className="text-xs font-mono font-normal" style={{ color: 'var(--text-secondary)' }}>
                          ({cashFlows.length} events)
                        </span>
                      </h4>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        Exact timeline of deposits, withdrawals, buys, sales, and dividends feeding the XIRR engine.
                      </p>
                    </div>
                    <button
                      onClick={exportCashflowsCsv}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer"
                      style={{
                        borderColor: 'var(--border-card, #CBD5E1)',
                        background: 'var(--bg-table-alt, #F1F5F9)',
                        color: 'var(--text-primary, #0F172A)'
                      }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export CSV
                    </button>
                  </div>

                  <div 
                    className="overflow-x-auto rounded-2xl border max-h-72"
                    style={{ borderColor: 'var(--border-card, #CBD5E1)' }}
                  >
                    <table className="w-full text-left text-xs border-collapse">
                      <thead 
                        className="sticky top-0 font-bold border-b"
                        style={{
                          background: 'var(--bg-table-alt, #E2E8F0)',
                          borderColor: 'var(--border-card, #CBD5E1)',
                          color: 'var(--text-primary, #0F172A)'
                        }}
                      >
                        <tr>
                          <th className="py-2.5 px-3 w-12">#</th>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Category</th>
                          <th className="py-2.5 px-3">Symbol / Asset</th>
                          <th className="py-2.5 px-3">Portfolio</th>
                          <th className="py-2.5 px-3 text-right">Net Amount (₹)</th>
                          <th className="py-2.5 px-3">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y font-mono" style={{ borderColor: 'var(--border-card, #E2E8F0)' }}>
                        {cashFlows.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center" style={{ color: 'var(--text-secondary)' }}>
                              No dated cash flows recorded for this portfolio.
                            </td>
                          </tr>
                        ) : (
                          cashFlows.map((cf, idx) => {
                            const isNeg = cf.netAmountInr < 0;
                            return (
                              <tr 
                                key={idx} 
                                className="transition-colors"
                                style={{
                                  background: idx % 2 === 0 ? 'var(--bg-table-row, #FFFFFF)' : 'var(--bg-table-alt, #F8FAFC)',
                                  color: 'var(--text-primary, #0F172A)'
                                }}
                              >
                                <td className="py-2 px-3 opacity-60">{cf.sNo || idx + 1}</td>
                                <td className="py-2 px-3">{cf.date}</td>
                                <td className="py-2 px-3 font-sans">
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                    cf.category.includes('DEPOSIT') || cf.category.includes('BUY')
                                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                                      : cf.category.includes('SELL') || cf.category.includes('WITHDRAWAL')
                                      ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30'
                                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                                  }`}>
                                    {cf.category}
                                  </span>
                                </td>
                                <td className="py-2 px-3 font-bold" style={{ color: 'var(--text-primary)' }}>{cf.symbol}</td>
                                <td className="py-2 px-3 font-sans opacity-75">{cf.portfolio}</td>
                                <td className={`py-2 px-3 text-right font-bold ${isNeg ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                  {formatCurrency(cf.netAmountInr)}
                                </td>
                                <td className="py-2 px-3 text-[11px] opacity-75 truncate max-w-xs font-sans" title={cf.notes}>
                                  {cf.notes || '-'}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div 
          className="flex items-center justify-between px-6 py-3 border-t text-xs"
          style={{
            borderColor: 'var(--border-card, #1E293B)',
            background: 'var(--bg-table-alt, #F8FAFC)',
            color: 'var(--text-secondary, #64748B)'
          }}
        >
          <div className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-blue-500" />
            <span>XIRR engine calculates daily dated flows matching SEBI / AMFI institutional return methodologies.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl font-bold transition-all cursor-pointer bg-slate-900 dark:bg-slate-700 text-white hover:opacity-90"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
