import React, { useState, useEffect } from 'react';
import { 
  X, 
  FileSpreadsheet, 
  Download, 
  Printer, 
  Calendar, 
  Filter, 
  CheckCircle2, 
  ShieldCheck, 
  Info,
  Building,
  Layers,
  ChevronDown
} from 'lucide-react';
import { formatINR } from '../lib/formatters.js';

interface Schedule112AReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPortfolio: string;
  portfolios: string[];
}

export function Schedule112AReportModal({
  isOpen,
  onClose,
  selectedPortfolio,
  portfolios
}: Schedule112AReportModalProps) {
  const [assetClass, setAssetClass] = useState<'STOCKS' | 'MUTUAL_FUNDS' | 'ALL'>('STOCKS');
  const [financialYear, setFinancialYear] = useState('2024-2025');
  const [portfolio, setPortfolio] = useState(selectedPortfolio || 'Combined');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchReport();
    }
  }, [isOpen, assetClass, financialYear, portfolio]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportType: 'CAPITAL_GAINS',
          portfolio,
          financialYear,
          includeGrandfathering: true,
          assetClass
        })
      });
      const data = await res.json();
      if (data.success) {
        setReportData(data);
      }
    } catch (e) {
      console.error('Failed to generate Schedule 112A report:', e);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleDownloadExcel = () => {
    if (!reportData || !reportData.rows) return;
    
    // Build ITR statutory CSV
    let csv = 'ISIN,Share/Unit Name,No. of Shares/Units,Sale Price per Share/Unit,Full Value of Consideration (Sales Proceeds),Cost of Acquisition without indexation,FMV as on 31st January 2018,Total Fair Market Value (Col 3 * Col 7),Cost of Acquisition (Grandfathered),Expenditure wholly in transfer (Brokerage/STT),Total Deductions,Balance / LTCG (Col 5 - Col 11)\n';

    reportData.rows.forEach((r: any) => {
      const isin = r.isin || '';
      const name = `"${(r.company_name || r.symbol || '').replace(/"/g, '""')}"`;
      const qty = r.quantity || 0;
      const salePrice = r.sale_price || (r.sale_value / qty) || 0;
      const fullValue = r.sale_value || 0;
      const costRaw = r.cost_value || 0;
      const fmvPerShare = r.fmv_31_jan_2018 || 0;
      const totalFmv = qty * fmvPerShare;
      const costGrandfathered = r.grandfathered_cost || costRaw;
      const transferExpense = (r.brokerage || 0) + (r.stt || 0);
      const totalDeductions = costGrandfathered + transferExpense;
      const ltcg = fullValue - totalDeductions;

      csv += `${isin},${name},${qty},${salePrice.toFixed(2)},${fullValue.toFixed(2)},${costRaw.toFixed(2)},${fmvPerShare.toFixed(2)},${totalFmv.toFixed(2)},${costGrandfathered.toFixed(2)},${transferExpense.toFixed(2)},${totalDeductions.toFixed(2)},${ltcg.toFixed(2)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ITR_Schedule_112A_${financialYear}_${portfolio}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
      <div 
        className="w-full max-w-6xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        style={{ background: 'var(--bg-modal, #FFFFFF)', borderColor: 'var(--border-card, #1E293B)' }}
      >
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-card, #1E293B)' }}>
          <div className="flex items-center gap-3">
            <div 
              className="p-2.5 rounded-2xl flex items-center justify-center font-bold"
              style={{ background: 'var(--accent-green-bg, rgba(16, 185, 129, 0.14))', color: 'var(--accent-green, #10B981)' }}
            >
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold font-display" style={{ color: 'var(--text-primary)' }}>
                  ITR Schedule 112A Statutory Capital Gains Report
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  SECTION 112A READY
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Exact statutory tax schedule for Form ITR-2 / ITR-3 with 31-Jan-2018 FMV grandfathering and ₹1.25L exemption computation.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-4 bg-slate-900/80 dark:bg-slate-900/80/60 border-b border-slate-800 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            {/* Asset Class */}
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-500">Asset Class:</span>
              <select
                value={assetClass}
                onChange={(e) => setAssetClass(e.target.value as any)}
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-700 dark:border-slate-700 font-bold text-slate-200 cursor-pointer"
              >
                <option value="STOCKS">Listed Stocks & ETFs</option>
                <option value="MUTUAL_FUNDS">Equity Mutual Funds</option>
                <option value="ALL">All Equity Instruments</option>
              </select>
            </div>

            {/* Financial Year */}
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-500">Assessment FY:</span>
              <select
                value={financialYear}
                onChange={(e) => setFinancialYear(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-700 dark:border-slate-700 font-bold text-slate-200 cursor-pointer"
              >
                <option value="2025-2026">FY 2025-26 (AY 2026-27)</option>
                <option value="2024-2025">FY 2024-25 (AY 2025-26)</option>
                <option value="2023-2024">FY 2023-24 (AY 2024-25)</option>
                <option value="2022-2023">FY 2022-23 (AY 2023-24)</option>
              </select>
            </div>

            {/* Portfolio */}
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-500">Portfolio:</span>
              <select
                value={portfolio}
                onChange={(e) => setPortfolio(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-700 dark:border-slate-700 font-bold text-slate-200 cursor-pointer"
              >
                <option value="Combined">Consolidated (All Accounts)</option>
                {portfolios.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleDownloadExcel}
            disabled={!reportData || !reportData.rows?.length}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download ITR Schedule 112A (CSV / Excel)</span>
          </button>
        </div>

        {/* Report Content Table */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 text-xs font-mono">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-400 font-sans">Computing Section 112A Grandfathering & LTCG...</p>
            </div>
          ) : reportData && reportData.rows ? (
            <>
              {/* Summary Metrics Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-3.5 rounded-2xl bg-slate-800 dark:bg-slate-800 border border-slate-800">
                  <span className="text-[10px] font-sans font-bold text-slate-400 uppercase block">Total Sales Consideration</span>
                  <span className="text-base font-bold text-white">
                    {formatINR(reportData.summary?.totalSaleValue || 0)}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-800 dark:bg-slate-800 border border-slate-800">
                  <span className="text-[10px] font-sans font-bold text-slate-400 uppercase block">Grandfathered Cost</span>
                  <span className="text-base font-bold text-white">
                    {formatINR(reportData.summary?.totalCostValue || 0)}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                  <span className="text-[10px] font-sans font-bold text-emerald-600 dark:text-emerald-400 uppercase block">Total Long Term Gains (LTCG)</span>
                  <span className="text-base font-bold text-emerald-700 dark:text-emerald-300">
                    {formatINR(reportData.summary?.totalLtcg || 0)}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
                  <span className="text-[10px] font-sans font-bold text-blue-600 dark:text-blue-400 uppercase block">Exemption u/s 112A (₹1.25L)</span>
                  <span className="text-base font-bold text-blue-700 dark:text-blue-300">
                    {formatINR(Math.min(reportData.summary?.totalLtcg || 0, 125000))}
                  </span>
                </div>
              </div>

              {/* Statutory Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-800 dark:border-slate-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-800 dark:bg-slate-800/80 text-slate-200 font-bold border-b border-slate-800 uppercase text-[10px]">
                    <tr>
                      <th className="py-3 px-3">ISIN</th>
                      <th className="py-3 px-3">SHARE / UNIT NAME</th>
                      <th className="py-3 px-3 text-right">QTY</th>
                      <th className="py-3 px-3 text-right">SALE PROCEEDS</th>
                      <th className="py-3 px-3 text-right">ACQ COST</th>
                      <th className="py-3 px-3 text-right">31-JAN-18 FMV</th>
                      <th className="py-3 px-3 text-right">DEDUCTIONS</th>
                      <th className="py-3 px-3 text-right">BALANCE LTCG</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {reportData.rows.slice(0, 50).map((r: any, idx: number) => {
                      const ltcg = (r.sale_value || 0) - (r.cost_value || 0);
                      return (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 px-3 text-slate-500">{r.isin || '-'}</td>
                          <td className="py-2.5 px-3 font-sans font-bold text-white">
                            {r.company_name || r.symbol}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-200">
                            {r.quantity?.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-white">
                            {formatINR(r.sale_value || 0)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-300">
                            {formatINR(r.cost_value || 0)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-500">
                            {r.fmv_31_jan_2018 ? formatINR(r.fmv_31_jan_2018 * r.quantity) : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-300">
                            {formatINR((r.cost_value || 0) + (r.brokerage || 0) + (r.stt || 0))}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-bold ${ltcg >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {formatINR(ltcg)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
