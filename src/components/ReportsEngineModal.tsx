import React, { useState, useEffect } from 'react';
import { 
  X, 
  FileSpreadsheet, 
  Download, 
  Printer, 
  Calendar, 
  Filter, 
  CheckCircle2, 
  ChevronRight, 
  PieChart, 
  TrendingUp, 
  Receipt, 
  Layers, 
  ShieldAlert, 
  Sparkles,
  Info,
  Building
} from 'lucide-react';
import { Schedule112AReportModal } from './Schedule112AReportModal.js';
import { getGainLossColorClass, getGainLossBgClass } from '../lib/formatters.js';

interface ReportsEngineModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPortfolio: string;
  portfolios: string[];
  formatCurrency?: (val: number) => string;
  onOpenReportStudio?: () => void;
}

export type ReportCategoryId = 'PRIME' | 'PERFORMANCE' | 'CAPITAL_GAINS' | 'TRANSACTIONS' | 'HOLDINGS' | 'TAX_FORMATS';

interface ReportDefinition {
  id: string;
  name: string;
  category: ReportCategoryId;
  tagline: string;
  description: string;
  endpointType: 'CAPITAL_GAINS' | 'HOLDING_STATEMENT' | 'TRADE_BOOK' | 'PERFORMANCE_SUMMARY' | 'DIVIDEND_STATEMENT' | 'ASSET_XIRR';
}

const REPORT_CATALOG: ReportDefinition[] = [
  // Prime / Executive
  {
    id: 'prime-perf-review',
    name: 'Advanced Performance Review',
    category: 'PRIME',
    tagline: 'Multi-asset XIRR vs Blended Benchmark',
    description: 'Delivers comprehensive money-weighted XIRR performance analysis across custom asset categories (Equity, Debt, FDs, Unlisted) compared against standard benchmarks.',
    endpointType: 'HOLDING_STATEMENT'
  },
  {
    id: 'prime-perf-snapshot',
    name: 'Advanced Performance Snapshot',
    category: 'PRIME',
    tagline: 'Inflows, Outflows, Income & Capital Return Map',
    description: 'Visual flow map consolidating total deposits, withdrawals, dividend payouts, live valuations, and portfolio XIRR.',
    endpointType: 'HOLDING_STATEMENT'
  },

  // Performance Reports
  {
    id: 'perf-asset-xirr',
    name: 'Asset-wise XIRR & Return Statement',
    category: 'PERFORMANCE',
    tagline: 'Internal Rate of Return per Instrument',
    description: 'Scrip-level dated cash flow analysis calculating exact annualized XIRRs and cumulative profit attribution.',
    endpointType: 'ASSET_XIRR'
  },
  {
    id: 'perf-portfolio-summary',
    name: 'Portfolio Performance Summary',
    category: 'PERFORMANCE',
    tagline: 'Valuation & Absolute Return Timeline',
    description: 'Comprehensive historical summary tracking cost invested, current value, realized gains, and unrealized appreciation.',
    endpointType: 'HOLDING_STATEMENT'
  },

  // Capital Gains & Tax
  {
    id: 'tax-realized-cg',
    name: 'Realized Capital Gains (STCG / LTCG)',
    category: 'CAPITAL_GAINS',
    tagline: 'Section 112A Grandfathered Tax Ledger',
    description: 'Calculates Short-Term Capital Gains (STCG @ 20%/15%) and Long-Term Capital Gains (LTCG @ 12.5%/10%) with Section 112A FMV grandfathering as of 31-Jan-2018 and ₹1.25 Lakh exemption tracking.',
    endpointType: 'CAPITAL_GAINS'
  },
  {
    id: 'tax-unrealized-cg',
    name: 'Unrealized Capital Gains & Tax Liability',
    category: 'CAPITAL_GAINS',
    tagline: 'Estimated Tax on Open Positions',
    description: 'Projects prospective tax liability on all currently open holdings if liquidated at today’s market prices.',
    endpointType: 'CAPITAL_GAINS'
  },

  // Transactions & Income
  {
    id: 'txn-trade-book',
    name: 'Trade Book & Transaction Ledger',
    category: 'TRANSACTIONS',
    tagline: 'Complete Trade History with Brokerage & STT',
    description: 'Itemized ledger of all buy, sell, bonus, split, and corporate action events with date, quantities, execution rates, and net cash amounts.',
    endpointType: 'TRADE_BOOK'
  },
  {
    id: 'txn-dividend-ledger',
    name: 'Annual Dividend & Income Ledger',
    category: 'TRANSACTIONS',
    tagline: 'Scrip-wise Dividends & Section 194K TDS',
    description: 'Itemized statement of all dividend and interest payouts received with estimated Section 194K TDS deducted and net credited amounts.',
    endpointType: 'DIVIDEND_STATEMENT'
  },

  // Holdings
  {
    id: 'holdings-detailed',
    name: 'Detailed Holdings Statement',
    category: 'HOLDINGS',
    tagline: 'Comprehensive Portfolio Scrip Inventory',
    description: 'Detailed asset breakdown with ISIN, Sector, Units, Average Buy Price, Total Cost, LTP, Valuation, and Portfolio Weightage (%).',
    endpointType: 'HOLDING_STATEMENT'
  },
  {
    id: 'holdings-asset-alloc',
    name: 'Asset Allocation & Exposure Summary',
    category: 'HOLDINGS',
    tagline: 'Multi-Asset Exposure Breakdown',
    description: 'Distribution report grouped by Equity, Mutual Funds, Fixed Deposits, Unlisted, and Global Assets.',
    endpointType: 'PERFORMANCE_SUMMARY'
  },

  // Tax Software Formats (Direct CA Exports)
  {
    id: 'tax-cleartax-format',
    name: 'ClearTax Capital Gains Upload Template',
    category: 'TAX_FORMATS',
    tagline: 'Standard ClearTax ITR-2/3 Excel Template',
    description: 'Formatted with Date of Acquisition, Date of Transfer, Sale Consideration, Cost of Acquisition, FMV 2018, and ISIN codes for direct upload into ClearTax.',
    endpointType: 'CAPITAL_GAINS'
  },
  {
    id: 'tax-winman-format',
    name: 'Winman Software Schedule CG Format',
    category: 'TAX_FORMATS',
    tagline: 'CA Winman Software Direct Import',
    description: 'Specialized ledger format structured for Chartered Accountants utilizing Winman ITR computation suites.',
    endpointType: 'CAPITAL_GAINS'
  },
  {
    id: 'tax-computax-format',
    name: 'Computax Capital Gains Audit Schedule',
    category: 'TAX_FORMATS',
    tagline: 'Computax Tax Preparation CSV Export',
    description: 'Pre-formatted CSV structure mapping directly to Computax capital gain heads and grandfathering formulas.',
    endpointType: 'CAPITAL_GAINS'
  }
];

// Dynamically generate all 20 Financial Years from earliest transaction date (2007) till current (2026-27)
const DYNAMIC_FINANCIAL_YEARS: { id: string; label: string; ay: string }[] = [];
for (let y = 2026; y >= 2007; y--) {
  const fyStr = `${y}-${y + 1}`;
  const ayStr = `AY ${y + 1}-${String(y + 2).slice(2)}`;
  DYNAMIC_FINANCIAL_YEARS.push({
    id: fyStr,
    label: `FY ${fyStr} (${ayStr})`,
    ay: ayStr
  });
}

export function ReportsEngineModal({
  isOpen,
  onClose,
  selectedPortfolio,
  portfolios,
  formatCurrency = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(v),
  onOpenReportStudio
}: ReportsEngineModalProps) {
  const [activeCategory, setActiveCategory] = useState<ReportCategoryId>('PRIME');
  const [selectedReport, setSelectedReport] = useState<ReportDefinition>(REPORT_CATALOG[0]);
  
  // Filter states
  const [filterPortfolio, setFilterPortfolio] = useState<string>(selectedPortfolio || 'Combined');
  const [dateMode, setDateMode] = useState<'FY' | 'CUSTOM' | 'ALL_TIME'>('FY');
  const [financialYear, setFinancialYear] = useState<string>('2024-2025');
  const [startDate, setStartDate] = useState<string>('2023-04-01');
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [includeGrandfathering, setIncludeGrandfathering] = useState<boolean>(true);

  // Generated Report states
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [reportData, setReportData] = useState<any | null>(null);
  const [show112AModal, setShow112AModal] = useState<boolean>(false);

  useEffect(() => {
    if (selectedPortfolio) {
      setFilterPortfolio(selectedPortfolio);
    }
  }, [selectedPortfolio]);

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    setReportData(null);
    try {
      const payload: any = {
        reportType: selectedReport.endpointType,
        portfolio: filterPortfolio,
        includeGrandfathering
      };

      if (dateMode === 'FY') {
        payload.financialYear = financialYear;
      } else if (dateMode === 'CUSTOM') {
        payload.startDate = startDate;
        payload.endDate = endDate;
      } else {
        payload.financialYear = 'ALL_TIME';
      }

      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setReportData(data);
    } catch (e) {
      console.error('Error generating report:', e);
    } finally {
      setIsGenerating(false);
    }
  };

  const exportCsv = () => {
    if (!reportData?.rows?.length) return;
    let csvContent = '';

    if (selectedReport.id === 'tax-cleartax-format') {
      const headers = [
        'Sr No',
        'ISIN Code',
        'Security Name',
        'Date of Sale',
        'Date of Acquisition',
        'Quantity',
        'Sale Price (₹)',
        'Total Sale Consideration (₹)',
        'Cost of Acquisition (₹)',
        'FMV as on 31 Jan 2018 (₹)',
        'Deemed Cost u/s 112A (₹)',
        'Net Capital Gain (₹)',
        'Gain Type'
      ];
      const rows = reportData.rows.map((r: any, idx: number) => [
        idx + 1,
        `"${r.isin || '-'}"`,
        `"${(r.company_name || r.symbol || '').replace(/"/g, '""')}"`,
        `"${r.date || ''}"`,
        `"${r.buy_date || ''}"`,
        r.quantity || 0,
        Math.round((r.sale_price || 0) * 100) / 100,
        Math.round((r.sale_value || 0) * 100) / 100,
        Math.round((r.buy_cost || 0) * 100) / 100,
        Math.round((r.grandfathered_fmv || 0) * 100) / 100,
        Math.round((r.deemed_cost || 0) * 100) / 100,
        Math.round((r.gain_loss || 0) * 100) / 100,
        `"${r.gain_type || ''}"`
      ].join(','));
      csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    } else if (selectedReport.id === 'tax-winman-format') {
      const headers = [
        'Sl No',
        'Security Name',
        'ISIN',
        'Date of Transfer',
        'Date of Acquisition',
        'Full Value of Consideration',
        'Cost of Acquisition',
        'FMV 31.01.2018',
        'Deemed Cost',
        'Capital Gain',
        'Tax Rate'
      ];
      const rows = reportData.rows.map((r: any, idx: number) => [
        idx + 1,
        `"${(r.company_name || r.symbol || '').replace(/"/g, '""')}"`,
        `"${r.isin || '-'}"`,
        `"${r.date || ''}"`,
        `"${r.buy_date || ''}"`,
        Math.round(r.sale_value || 0),
        Math.round(r.buy_cost || 0),
        Math.round(r.grandfathered_fmv || 0),
        Math.round(r.deemed_cost || 0),
        Math.round(r.gain_loss || 0),
        `"${r.gain_type?.includes('LTCG') ? '12.5%' : '20%'}"`
      ].join(','));
      csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    } else {
      const firstRow = reportData.rows[0];
      const keys = Object.keys(firstRow);
      csvContent = 'data:text/csv;charset=utf-8,' + [
        keys.join(','),
        ...reportData.rows.map((r: any) => keys.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))
      ].join('\n');
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const dateTag = dateMode === 'FY' ? financialYear : dateMode === 'CUSTOM' ? `${startDate}_to_${endDate}` : 'ALL_TIME';
    link.setAttribute('download', `${selectedReport.id}_${filterPortfolio}_${dateTag}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  const categoryReports = REPORT_CATALOG.filter(r => r.category === activeCategory);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-fadeIn">
      <div 
        className="rounded-3xl w-full max-w-6xl max-h-[94vh] overflow-hidden flex flex-col shadow-2xl transition-all border border-slate-700 bg-slate-950 text-slate-100"
      >
        {/* Top Header - High Contrast Solid Dark */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm shadow-emerald-500/20">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base sm:text-lg font-bold font-display tracking-tight text-white">
                  Institutional Reports Center
                </h3>
                <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  {REPORT_CATALOG.length} Standard Reports
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Tax P&L, Section 112A grandfathered capital gains, asset-wise XIRR, and transaction trade books.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Report Studio Launch Bar */}
        {onOpenReportStudio && (
          <div className="px-6 py-2.5 bg-gradient-to-r from-emerald-950/70 via-teal-950/50 to-slate-900 border-b border-emerald-500/30 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-bold text-white">
                New: Report Studio (Interactive Pivot & Custom BI)
              </span>
              <span className="text-[11px] text-slate-300 hidden sm:inline">
                — Multi-level grouping by Family, PAN & Asset Class with custom Excel export
              </span>
            </div>
            <button
              onClick={() => {
                onClose();
                onOpenReportStudio();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow transition-all cursor-pointer border border-emerald-400/40 shrink-0"
            >
              <span>Launch Studio ›</span>
            </button>
          </div>
        )}

        {/* Modal 3-Pane Body */}
        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-hidden">
          
          {/* Left Category Rail */}
          <div className="md:col-span-3 border-r border-slate-800 bg-slate-900/80 p-4 space-y-1.5 overflow-y-auto">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 block mb-2 font-mono">
              Report Categories
            </span>

            {[
              { id: 'PRIME', label: 'Prime / Executive', icon: Sparkles },
              { id: 'PERFORMANCE', label: 'Performance & XIRR', icon: TrendingUp },
              { id: 'CAPITAL_GAINS', label: 'Capital Gains & Tax', icon: Receipt },
              { id: 'TRANSACTIONS', label: 'Trade Book & Ledgers', icon: Layers },
              { id: 'HOLDINGS', label: 'Holding Statements', icon: PieChart }
            ].map(cat => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveCategory(cat.id as ReportCategoryId);
                    const first = REPORT_CATALOG.find(r => r.category === cat.id);
                    if (first) setSelectedReport(first);
                    setReportData(null);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer text-left ${
                    isActive 
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' 
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-blue-400'}`} />
                    <span>{cat.label}</span>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 opacity-60 ${isActive ? 'translate-x-0.5' : ''}`} />
                </button>
              );
            })}
          </div>

          {/* Middle Report Picker */}
          <div className="md:col-span-4 border-r border-slate-800 bg-slate-950 p-4 space-y-2.5 overflow-y-auto">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 px-2 block mb-2.5 font-mono">
              Available Reports ({categoryReports.length})
            </span>

            {categoryReports.map(report => {
              const isSelected = selectedReport.id === report.id;
              return (
                <div
                  key={report.id}
                  onClick={() => {
                    setSelectedReport(report);
                    setReportData(null);
                  }}
                  className={`p-4 rounded-2xl transition-all cursor-pointer shadow-sm ${
                    isSelected
                      ? 'bg-blue-600 border-2 border-blue-400 text-white shadow-lg shadow-blue-600/30 ring-1 ring-white/30'
                      : 'bg-slate-900 border border-slate-700 hover:bg-slate-800 hover:border-slate-500 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h4 className={`text-sm font-black font-display tracking-tight ${isSelected ? 'text-white' : 'text-white'}`}>
                      {report.name}
                    </h4>
                    {isSelected ? (
                      <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                    )}
                  </div>
                  <span className={`text-xs font-bold mt-1 block ${isSelected ? 'text-blue-100' : 'text-sky-400'}`}>
                    {report.tagline}
                  </span>
                  <p className={`text-xs mt-1.5 leading-relaxed line-clamp-2 ${isSelected ? 'text-white/95 font-medium' : 'text-slate-300'}`}>
                    {report.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Right Configuration & Preview Pane */}
          <div className="md:col-span-5 p-6 space-y-5 overflow-y-auto flex flex-col justify-between bg-slate-900/50">
            <div>
              <div className="pb-4 border-b border-slate-800">
                <h4 className="text-lg font-bold font-display text-white">
                  {selectedReport.name}
                </h4>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  {selectedReport.description}
                </p>
              </div>

              {/* Input Filters Form */}
              <div className="space-y-4 mt-5">
                {/* Target Portfolio */}
                <div>
                  <label className="text-xs font-bold text-white block mb-1.5 font-display">
                    Portfolio / Demat Entity
                  </label>
                  <select
                    value={filterPortfolio}
                    onChange={(e) => setFilterPortfolio(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-950 border border-slate-700 text-white cursor-pointer shadow-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="Combined">All Portfolios (Consolidated)</option>
                    {portfolios.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                {/* Date Range Mode Selector */}
                <div>
                  <label className="text-xs font-bold text-white block mb-1.5 font-display">
                    Date Range & Tax Period
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setDateMode('FY')}
                      className={`py-1.5 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        dateMode === 'FY'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Financial Year
                    </button>
                    <button
                      type="button"
                      onClick={() => setDateMode('CUSTOM')}
                      className={`py-1.5 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        dateMode === 'CUSTOM'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Custom Dates
                    </button>
                    <button
                      type="button"
                      onClick={() => setDateMode('ALL_TIME')}
                      className={`py-1.5 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        dateMode === 'ALL_TIME'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      All Time
                    </button>
                  </div>
                </div>

                {/* Mode 1: Dynamic Financial Year Dropdown (2007 to Present) */}
                {dateMode === 'FY' && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-400 block">
                      Select Financial Year (From Inception)
                    </label>
                    <select
                      value={financialYear}
                      onChange={(e) => setFinancialYear(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-950 border border-slate-700 text-slate-100 cursor-pointer shadow-sm font-mono focus:border-blue-500 focus:outline-none"
                    >
                      {DYNAMIC_FINANCIAL_YEARS.map(fy => (
                        <option key={fy.id} value={fy.id}>
                          {fy.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Mode 2: Custom Date Range Pickers */}
                {dateMode === 'CUSTOM' && (
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-blue-950/30 border border-blue-800/40">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                        From Date
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-950 border border-slate-700 text-slate-100 font-mono focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                        To Date
                      </label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-950 border border-slate-700 text-slate-100 font-mono focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Mode 3: All Time Notification */}
                {dateMode === 'ALL_TIME' && (
                  <div className="p-3 rounded-2xl bg-emerald-950/30 border border-emerald-800/40 text-xs text-emerald-300 font-medium">
                    ⚡ Evaluates all historical transactions since inception with complete audit coverage.
                  </div>
                )}

                {/* Tax & Grandfathering Toggles */}
                {selectedReport.category === 'CAPITAL_GAINS' && (
                  <div className="space-y-3">
                    <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-800/60 space-y-2 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer font-bold text-amber-200">
                        <input
                          type="checkbox"
                          checked={includeGrandfathering}
                          onChange={(e) => setIncludeGrandfathering(e.target.checked)}
                          className="rounded text-amber-500 cursor-pointer"
                        />
                        Apply Section 112A FMV Grandfathering (31-Jan-2018)
                      </label>
                      <p className="text-[11px] text-amber-300/80 pl-5">
                        Substitutes acquisition cost with Jan 31, 2018 closing price if higher than actual purchase price to minimize tax liability.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShow112AModal(true)}
                      className="w-full py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>Open Statutory Schedule 112A ITR Format</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-slate-800 space-y-2">
              <button
                onClick={handleGenerateReport}
                disabled={isGenerating}
                className="w-full py-3 rounded-2xl font-bold text-xs transition-all cursor-pointer bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Processing Financial Engine...</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Generate & View Report</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Report Output Preview Drawer */}
        {reportData && (
          <div className="border-t border-slate-800 p-5 bg-slate-950 max-h-80 overflow-y-auto space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-bold text-white uppercase tracking-wider font-display">
                    Report Preview: {selectedReport.name}
                  </span>
                  <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    {reportData.rows?.length || 0} Records
                  </span>
                </div>

                {/* KPI Summary Strip */}
                {reportData.summary && (
                  <div className="flex flex-wrap items-center gap-2 mt-2 font-mono text-xs">
                    {reportData.summary.totalRealizedGain !== undefined && (
                      <span className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-700 text-slate-200">
                        Realized Gain: <strong className={getGainLossColorClass(reportData.summary.totalRealizedGain)}>{formatCurrency(reportData.summary.totalRealizedGain)}</strong>
                      </span>
                    )}
                    {reportData.summary.totalStcg !== undefined && (
                      <span className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-700 text-slate-200">
                        STCG: <strong className={getGainLossColorClass(reportData.summary.totalStcg)}>{formatCurrency(reportData.summary.totalStcg)}</strong>
                      </span>
                    )}
                    {reportData.summary.totalLtcg !== undefined && (
                      <span className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-700 text-slate-200">
                        LTCG: <strong className={getGainLossColorClass(reportData.summary.totalLtcg)}>{formatCurrency(reportData.summary.totalLtcg)}</strong>
                      </span>
                    )}
                    {reportData.summary.totalTaxLiability !== undefined && (
                      <span className="px-2.5 py-1 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 font-bold">
                        Estimated Tax: {formatCurrency(reportData.summary.totalTaxLiability)}
                      </span>
                    )}
                    {reportData.summary.totalCurrent !== undefined && (
                      <span className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-700 text-slate-200">
                        Current Valuation: <strong className="text-white font-bold">{formatCurrency(reportData.summary.totalCurrent)}</strong>
                      </span>
                    )}
                    {reportData.summary.overallPct !== undefined && (
                      <span className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-700 text-slate-200">
                        Return: <strong className={getGainLossColorClass(reportData.summary.overallPct)}>{reportData.summary.overallPct >= 0 ? '+' : ''}{reportData.summary.overallPct.toFixed(2)}%</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {reportData.rows?.length > 0 && (
                <button
                  onClick={exportCsv}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              )}
            </div>

            {reportData.rows && reportData.rows.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead className="bg-slate-900 text-slate-200 font-bold border-b border-slate-800">
                    <tr>
                      {Object.keys(reportData.rows[0]).map(k => {
                        const kLower = k.toLowerCase();
                        let headerLabel = k.replace(/_/g, ' ').toUpperCase();
                        if (kLower === 'sno' || kLower === 's_no' || kLower === 'sr_no') headerLabel = 'S.NO.';
                        else if (kLower === 'isin') headerLabel = 'ISIN';
                        else if (kLower === 'ltp') headerLabel = 'LTP';
                        else if (kLower === 'pnl' || kLower === 'gain_loss') headerLabel = 'P&L / GAIN';
                        else if (kLower === 'stcg') headerLabel = 'STCG';
                        else if (kLower === 'ltcg') headerLabel = 'LTCG';
                        else if (kLower === 'xirr' || kLower === 'xirr_pct') headerLabel = 'XIRR';
                        else if (kLower === 'holding_days') headerLabel = 'HOLDING DAYS';
                        return (
                          <th key={k} className="py-2.5 px-3 uppercase text-[10px] text-slate-400 whitespace-nowrap">{headerLabel}</th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-950">
                    {reportData.rows.map((row: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-900/60 transition-colors">
                        {Object.entries(row).map(([key, val]: [string, any], vIdx: number) => {
                          const keyLower = key.toLowerCase();
                          let displayVal = '-';
                          let cellClass = 'text-slate-200';

                          if (val !== null && val !== undefined && val !== '') {
                            // 1. S.No / Serial numbers / IDs / Days / Year / Count -> Plain Integer (NO Rupee, NO Decimals)
                            if (
                              keyLower === 'sno' || 
                              keyLower === 's_no' || 
                              keyLower === 'sr_no' || 
                              keyLower === 'serial_no' || 
                              keyLower === 'id' || 
                              keyLower === 'holding_days' || 
                              keyLower === 'days' || 
                              keyLower === 'year' || 
                              keyLower === 'holding_count' || 
                              keyLower === 'trade_count' || 
                              keyLower === 'record_count' ||
                              keyLower === 'cash_flow_count'
                            ) {
                              const num = parseInt(val, 10);
                              displayVal = isNaN(num) ? String(val) : num.toString();
                              cellClass = 'text-slate-400 font-bold';
                            }
                            // 2. Quantity / Units -> Unit count (NO Rupee symbol)
                            else if (keyLower === 'quantity' || keyLower === 'qty' || keyLower === 'shares' || keyLower === 'units') {
                              const num = typeof val === 'number' ? val : parseFloat(val);
                              displayVal = isNaN(num) ? String(val) : (Number.isInteger(num) ? num.toLocaleString('en-IN') : num.toLocaleString('en-IN', { maximumFractionDigits: 4 }));
                              cellClass = 'text-slate-200 font-bold';
                            }
                            // 3. Percentages & XIRR
                            else if (keyLower.includes('pct') || keyLower.includes('percent') || keyLower.includes('xirr')) {
                              const num = typeof val === 'number' ? val : parseFloat(val);
                              if (!isNaN(num)) {
                                displayVal = `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
                                cellClass = getGainLossColorClass(num);
                              } else {
                                displayVal = String(val);
                              }
                            }
                            // 4. Monetary amounts (Prices, Costs, Valuations, Gains/Losses, Taxes, Charges)
                            else if (typeof val === 'number' || (!isNaN(parseFloat(val)) && (
                              keyLower.includes('price') || 
                              keyLower.includes('cost') || 
                              keyLower.includes('value') || 
                              keyLower.includes('amount') || 
                              keyLower.includes('gain') || 
                              keyLower.includes('loss') || 
                              keyLower.includes('pnl') || 
                              keyLower.includes('stcg') || 
                              keyLower.includes('ltcg') || 
                              keyLower.includes('tax') || 
                              keyLower.includes('charge') || 
                              keyLower.includes('brokerage') || 
                              keyLower.includes('stt') || 
                              keyLower.includes('ltp') || 
                              keyLower.includes('fmv') || 
                              keyLower.includes('dividend') || 
                              keyLower.includes('tds')
                            ))) {
                              const num = typeof val === 'number' ? val : parseFloat(val);
                              displayVal = formatCurrency(num);
                              const isGainField = keyLower.includes('gain') || keyLower.includes('pnl') || keyLower.includes('loss') || keyLower.includes('return');
                              if (isGainField) {
                                cellClass = getGainLossColorClass(num);
                              } else {
                                cellClass = 'text-slate-200';
                              }
                            }
                            // 5. Booleans
                            else if (typeof val === 'boolean') {
                              displayVal = val ? 'Yes' : 'No';
                              cellClass = val ? 'text-emerald-400 font-bold' : 'text-slate-400';
                            }
                            // 6. Strings & dates
                            else {
                              displayVal = String(val);
                              if (keyLower === 'isin') cellClass = 'text-sky-300 font-mono';
                              else if (keyLower === 'symbol') cellClass = 'text-white font-bold font-mono';
                              else cellClass = 'text-slate-200';
                            }
                          }

                          return (
                            <td key={vIdx} className={`py-2.5 px-3 whitespace-nowrap ${cellClass}`}>
                              {displayVal}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 my-2 rounded-2xl bg-slate-900/70 border border-slate-800 text-center space-y-2">
                <div className="w-10 h-10 mx-auto rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-700">
                  <FileSpreadsheet className="w-5 h-5 text-slate-400" />
                </div>
                <p className="text-sm font-bold text-slate-100 font-display">No Records Found for Selected Parameters</p>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  No matching transaction rows or realized capital gains exist for <span className="text-emerald-400 font-semibold">{filterPortfolio}</span> ({dateMode === 'FY' ? `FY ${financialYear}` : dateMode === 'CUSTOM' ? `${startDate} to ${endDate}` : 'All-Time'}). Try adjusting the date range or selecting another portfolio entity.
                </p>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Statutory Schedule 112A ITR Format Modal */}
      <Schedule112AReportModal
        isOpen={show112AModal}
        onClose={() => setShow112AModal(false)}
        selectedPortfolio={filterPortfolio}
        portfolios={portfolios}
      />
    </div>
  );
}
