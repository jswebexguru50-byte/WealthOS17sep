import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, ArrowRight, DollarSign, TrendingUp, TrendingDown, BookOpen, Receipt, RefreshCcw, Download, Edit3, Trash2, Plus, ShieldCheck, Search, Calculator, CheckCircle2, AlertOctagon, FileSpreadsheet, ChevronDown, ChevronUp, Sliders } from 'lucide-react';
import { PMSImportView } from './PMSImportView.js';

export const PMSManagerView: React.FC<{
  portfolios: string[];
  selectedPortfolio: string;
  onPortfolioChange?: (p: string) => void;
  onUpload: () => Promise<any>;
  formatCurrency: (val: number) => string;
}> = ({ portfolios, selectedPortfolio, onPortfolioChange, onUpload, formatCurrency }) => {
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [reconData, setReconData] = useState<any>(null);
  const [holdingsRecon, setHoldingsRecon] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dividendLoading, setDividendLoading] = useState(false);
  const [dividendLoaded, setDividendLoaded] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'cashflow'|'dividends'|'holdings'|'fullrecon'|'templates'|'feerecon'>('templates');
  const [drilldown, setDrilldown] = useState<{title: string, txns: any[]} | null>(null);

  // Management Fee & GST Audit state
  const [feeAuditData, setFeeAuditData] = useState<any>(null);
  const [feeAuditLoading, setFeeAuditLoading] = useState(false);
  const [feeAuditLoaded, setFeeAuditLoaded] = useState(false);
  const [feeConfig, setFeeConfig] = useState<{
    annual_fee_rate: number;
    gst_rate: number;
    billing_frequency: 'monthly' | 'quarterly';
    calculation_basis: 'daily_avg' | 'month_end';
    include_expenses: number;
  }>({
    annual_fee_rate: 1.0,
    gst_rate: 18.0,
    billing_frequency: 'quarterly',
    calculation_basis: 'daily_avg',
    include_expenses: 0
  });
  const [feeConfigSaving, setFeeConfigSaving] = useState(false);
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);

  // Template Import Center state
  const [templatePms, setTemplatePms] = useState<'IIFL' | 'COMPLETE_CIRCLE'>('IIFL');
  const [templateDocType, setTemplateDocType] = useState<'BANK_BOOK' | 'TRADES'>('BANK_BOOK');
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [parsedPmsRecords, setParsedPmsRecords] = useState<any[] | null>(null);
  const [commitStatus, setCommitStatus] = useState<string | null>(null);

  // Full Reconciliation state
  const [reconTxnFile, setReconTxnFile]     = useState<File | null>(null);
  const [reconBankFile, setReconBankFile]   = useState<File | null>(null);
  const [reconLoading, setReconLoading]     = useState(false);
  const [reconResult, setReconResult]       = useState<any>(null);
  const [reconApplying, setReconApplying]   = useState(false);
  const [reconApplyResult, setReconApplyResult] = useState<any>(null);
  const [reconError, setReconError]         = useState<string | null>(null);
  const txnFileRef  = useRef<HTMLInputElement>(null);
  const bankFileRef = useRef<HTMLInputElement>(null);

  // Txn Edit Modal state
  const [editTxn, setEditTxn] = useState<any>(null);
  const [isInserting, setIsInserting] = useState(false);

  useEffect(() => {
    if (selectedPortfolio && selectedPortfolio !== 'Combined') {
      setDividendLoaded(false);
      setFeeAuditLoaded(false);
      setReconData(null);
      setFeeAuditData(null);
      fetchDashboardData();
      fetchFeeConfig();
    }
  }, [selectedPortfolio]);

  // Fast initial load: dashboard summary + holdings recon only
  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [dbRes, holdRes] = await Promise.all([
        fetch(`/api/pms/dashboard?portfolio=${encodeURIComponent(selectedPortfolio)}`),
        fetch(`/api/pms/reconcile-holdings?portfolio=${encodeURIComponent(selectedPortfolio)}`)
      ]);
      
      const dbData = await dbRes.json();
      const holdData = await holdRes.json();

      if (dbData.success) setDashboardData(dbData.data);
      if (holdData.success) setHoldingsRecon(holdData.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Lazy: fetch dividends only when Dividend Audit tab is first clicked
  const fetchDividendRecon = async () => {
    if (dividendLoaded || dividendLoading) return;
    setDividendLoading(true);
    try {
      const res = await fetch(`/api/pms/reconcile-dividends?portfolio=${encodeURIComponent(selectedPortfolio)}`);
      const data = await res.json();
      if (data.success) { setReconData(data); setDividendLoaded(true); }
    } catch (err) {
      console.error(err);
    } finally {
      setDividendLoading(false);
    }
  };

  const fetchFeeConfig = async () => {
    try {
      const res = await fetch(`/api/pms/fee-config?portfolio=${encodeURIComponent(selectedPortfolio)}`);
      const data = await res.json();
      if (data.success && data.data) {
        setFeeConfig({
          annual_fee_rate: data.data.annual_fee_rate ?? 1.0,
          gst_rate: data.data.gst_rate ?? 18.0,
          billing_frequency: data.data.billing_frequency || 'quarterly',
          calculation_basis: data.data.calculation_basis || 'daily_avg',
          include_expenses: data.data.include_expenses || 0
        });
      }
    } catch (e) {
      console.error('Failed to fetch fee config:', e);
    }
  };

  const fetchFeeAudit = async (customConfig?: any) => {
    const cfg = customConfig || feeConfig;
    setFeeAuditLoading(true);
    try {
      const params = new URLSearchParams({
        portfolio: selectedPortfolio,
        annualFeeRate: String(cfg.annual_fee_rate),
        gstRate: String(cfg.gst_rate),
        billingFrequency: cfg.billing_frequency,
        calculationBasis: cfg.calculation_basis,
        includeExpenses: String(cfg.include_expenses === 1)
      });
      const res = await fetch(`/api/pms/fee-audit?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setFeeAuditData(data.data);
        setFeeAuditLoaded(true);
      }
    } catch (e) {
      console.error('Failed to run fee audit:', e);
    } finally {
      setFeeAuditLoading(false);
    }
  };

  const handleSaveFeeConfig = async () => {
    setFeeConfigSaving(true);
    try {
      const res = await fetch('/api/pms/fee-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio: selectedPortfolio,
          ...feeConfig
        })
      });
      const data = await res.json();
      if (data.success) {
        await fetchFeeAudit();
        alert(`Agreed fee terms saved for ${selectedPortfolio}!`);
      } else {
        alert(data.message || 'Failed to save fee configuration.');
      }
    } catch (e: any) {
      alert(`Error saving fee config: ${e.message}`);
    } finally {
      setFeeConfigSaving(false);
    }
  };

  const handleExportFeeAuditCsv = () => {
    if (!feeAuditData || !feeAuditData.periods?.length) return;
    const headers = ['Period', 'Period Label', 'Start Date', 'End Date', 'Days', 'Average Daily AUM', 'Expected Base Fee', 'Expected GST (18%)', 'Total Expected Fee', 'Actual Bank Book Debit', 'Variance (Amount)', 'Variance (%)', 'Status'];
    const rows = feeAuditData.periods.map((p: any) => [
      p.period,
      `"${p.periodLabel}"`,
      p.startDate,
      p.endDate,
      p.days,
      p.avgDailyAum.toFixed(2),
      p.expectedBaseFee.toFixed(2),
      p.expectedGst.toFixed(2),
      p.expectedTotalFee.toFixed(2),
      p.actualDebit.toFixed(2),
      p.variance.toFixed(2),
      `${p.variancePct.toFixed(2)}%`,
      p.status
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PMS_${selectedPortfolio}_Fee_and_GST_Audit_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleTabChange = (tab: 'cashflow'|'dividends'|'holdings'|'fullrecon'|'templates'|'feerecon') => {
    setActiveTab(tab);
    if (tab === 'dividends') fetchDividendRecon();
    if (tab === 'feerecon') fetchFeeAudit();
  };

  const handleParseTemplateFile = async () => {
    if (!templateFile) return;
    setTemplateLoading(true);
    setCommitStatus(null);
    try {
      const fd = new FormData();
      fd.append('file', templateFile);
      fd.append('type', templateDocType);

      const endpoint = templatePms === 'IIFL' ? '/api/pms/iifl/parse' : '/api/pms/complete-circle/parse';
      const res = await fetch(endpoint, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        setParsedPmsRecords(data.records);
      } else {
        alert(`Parsing failed: ${data.error}`);
      }
    } catch (e: any) {
      alert(`Error parsing statement: ${e.message}`);
    } finally {
      setTemplateLoading(false);
    }
  };

  const handleCommitParsedRecords = async () => {
    if (!parsedPmsRecords || parsedPmsRecords.length === 0) return;
    setTemplateLoading(true);
    try {
      const txnsToCommit = parsedPmsRecords.map((r: any) => {
        if (templateDocType === 'BANK_BOOK') {
          return {
            portfolio: selectedPortfolio,
            date: r.date,
            type: r.mappedType,
            symbol: r.mappedType === 'BUY' || r.mappedType === 'SELL'
              ? (r.scripName || r.securityName || 'PMS_ASSET') 
              : (r.scripName || r.securityName || r.txnType || `CASH:${r.mappedType}`),
            amount: r.amount,
            notes: r.description || `PMS Bank Book Entry: ${r.mappedType}`
          };
        } else {
          return {
            portfolio: selectedPortfolio,
            date: r.tradeDate,
            type: r.transactionType,
            symbol: r.symbol || r.securityName,
            isin: r.isin,
            quantity: r.quantity,
            price: r.price,
            amount: r.netAmount,
            brokerage: r.brokerage,
            stt: r.stt,
            notes: `PMS Trade Register: ${r.sourcePms || templatePms}`
          };
        }
      });

      const res = await fetch('/api/pms/reconcile-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolio: selectedPortfolio, transactions: txnsToCommit })
      });
      const data = await res.json();
      if (data.success) {
        setCommitStatus(data.message || `Successfully processed ${txnsToCommit.length} transactions (${data.inserted || 0} inserted, ${data.skipped || 0} duplicates prevented) into portfolio ${selectedPortfolio}!`);
        setParsedPmsRecords(null);
        setTemplateFile(null);
        fetchDashboardData();
        onUpload();
      } else {
        alert(`Failed to commit transactions: ${data.message}`);
      }
    } catch (e: any) {
      alert(`Error committing transactions: ${e.message}`);
    } finally {
      setTemplateLoading(false);
    }
  };

  const handleCleanupDuplicates = async () => {
    if (!confirm(`Run automatic duplicate cleanup on portfolio '${selectedPortfolio}'? This will retain one clean record per transaction and remove any duplicates.`)) return;
    setTemplateLoading(true);
    try {
      const res = await fetch('/api/pms/cleanup-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolio: selectedPortfolio })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setCommitStatus(data.message);
        fetchDashboardData();
        onUpload();
      } else {
        alert(`Cleanup failed: ${data.message}`);
      }
    } catch (e: any) {
      alert(`Cleanup error: ${e.message}`);
    } finally {
      setTemplateLoading(false);
    }
  };

  const handleUndoLatestBatch = async () => {
    if (!confirm(`Undo the most recent import batch in portfolio '${selectedPortfolio}'?`)) return;
    setTemplateLoading(true);
    try {
      const res = await fetch('/api/pms/undo-recent-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolio: selectedPortfolio })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setCommitStatus(data.message);
        fetchDashboardData();
        onUpload();
      } else {
        alert(`Undo failed: ${data.message}`);
      }
    } catch (e: any) {
      alert(`Undo error: ${e.message}`);
    } finally {
      setTemplateLoading(false);
    }
  };

  // ── Full Reconciliation handlers ──────────────────────────────────────────
  const handleReconUpload = async () => {
    if (!reconTxnFile && !reconBankFile) {
      setReconError('Please upload at least one file (transaction statement or bank book).');
      return;
    }
    setReconLoading(true); setReconError(null); setReconResult(null); setReconApplyResult(null);
    try {
      const fd = new FormData();
      fd.append('portfolio', selectedPortfolio);
      if (reconTxnFile)  fd.append('txnFile',  reconTxnFile);
      if (reconBankFile) fd.append('bankFile', reconBankFile);
      const res = await fetch('/api/pms/reconcile-upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) setReconResult(data);
      else setReconError(data.message || 'Upload failed');
    } catch (e: any) {
      setReconError(e.message);
    } finally {
      setReconLoading(false);
    }
  };

  const handleReconApply = async () => {
    if (!reconResult || !reconResult.missingTransactions?.length) return;
    setReconApplying(true); setReconError(null);
    try {
      const res = await fetch('/api/pms/reconcile-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolio: selectedPortfolio, transactions: reconResult.missingTransactions })
      });
      const data = await res.json();
      if (data.success) {
        setReconApplyResult(data);
        setReconResult((prev: any) => prev ? { ...prev, missingCount: 0, missingTransactions: [] } : prev);
        fetchDashboardData();
      } else { setReconError(data.message); }
    } catch (e: any) {
      setReconError(e.message);
    } finally {
      setReconApplying(false);
    }
  };

  const fmtInr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
  const fmtPct = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

  const downloadDividendCsv = () => {
    if (!reconData) return;
    let csv = 'Type,Date,Symbol,ISIN,Qty Held,DPS,Amount\n';
    reconData.expected?.forEach((d: any) => {
      csv += `Expected,${d.date},${d.symbol},${d.isin},${d.qtyHeld},${d.dps},${d.amount}\n`;
    });
    reconData.received?.forEach((d: any) => {
      csv += `Actual,${d.date},Bank Book Income,,,,,${d.amount}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dividend_recon_${selectedPortfolio}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleTxnSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData);
    payload.portfolio = selectedPortfolio;
    
    try {
      const url = isInserting ? '/api/transactions' : `/api/transactions/${editTxn.id}`;
      const method = isInserting ? 'POST' : 'PUT';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setEditTxn(null);
        setIsInserting(false);
        fetchDashboardData();
        onUpload(); // trigger global refresh
      } else {
        alert('Failed to save transaction');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTxnDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return;
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchDashboardData();
        onUpload();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!selectedPortfolio || selectedPortfolio === 'Combined') {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-slate-900 border border-slate-800 rounded-2xl gap-4">
        <BookOpen className="w-12 h-12 text-emerald-500 mb-2" />
        <h3 className="text-lg font-bold text-slate-200">Select a PMS Portfolio</h3>
        <p className="text-slate-400 text-sm">Choose a PMS portfolio to view its ledger and reconciliation data.</p>
        {onPortfolioChange && portfolios.filter(p => p !== 'Combined').length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {portfolios.filter(p => p !== 'Combined').map(p => (
              <button key={p} onClick={() => onPortfolioChange(p)}
                className="px-4 py-2 bg-slate-800 border border-slate-700 hover:border-emerald-500 text-slate-200 rounded-xl text-sm transition-colors">
                {p}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Helper for cash flow rows
  const renderFlowRow = (label: string, data: any, color: string) => {
    if (!data) return null;
    return (
      <div 
        className="flex justify-between items-center p-3 hover:bg-slate-800/50 cursor-pointer rounded-lg transition-colors border border-transparent hover:border-slate-700"
        onDoubleClick={() => setDrilldown({ title: label, txns: data.txns })}
      >
        <span className="text-slate-300 font-medium">{label}</span>
        <span className={`font-bold ${color}`}>{formatCurrency(data.total)}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6 relative">
      {/* Header & Actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
          <BookOpen className="w-7 h-7 text-emerald-500" />
          PMS Manager: {selectedPortfolio}
        </h2>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl transition-colors font-medium shadow-lg shadow-emerald-500/20"
        >
          <Upload className="w-4 h-4" />
          Upload Statement
        </button>
      </div>

      {showUpload && (
        <div className="bg-slate-900 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)] rounded-2xl p-2 animate-in slide-in-from-top-4">
          <PMSImportView portfolios={portfolios} onUpload={() => { setShowUpload(false); onUpload(); fetchDashboardData(); }} formatCurrency={formatCurrency} />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
      ) : dashboardData ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-5 shadow-lg relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-all"></div>
              <div className="flex items-center gap-3 mb-2 relative z-10">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg"><DollarSign className="w-5 h-5"/></div>
                <h3 className="text-slate-200 font-bold text-sm font-display">Net Cash In Hand</h3>
              </div>
              <p className="text-3xl font-black text-white font-mono relative z-10">{formatCurrency(dashboardData.cashInHand)}</p>
              <p className="text-xs text-slate-400 mt-1 relative z-10">Available uninvested cash balance</p>
            </div>

            <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-5 shadow-lg relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/10 rounded-full blur-xl group-hover:bg-blue-500/20 transition-all"></div>
              <div className="flex items-center gap-3 mb-2 relative z-10">
                <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg"><TrendingUp className="w-5 h-5"/></div>
                <h3 className="text-slate-200 font-bold text-sm font-display">Total Capital Invested</h3>
              </div>
              <p className="text-3xl font-black text-white font-mono relative z-10">{formatCurrency(dashboardData.totalDeposits + dashboardData.totalTransferIn)}</p>
              <p className="text-xs text-slate-400 mt-1 font-medium relative z-10">
                Cash: <span className="text-emerald-400 font-bold font-mono">{formatCurrency(dashboardData.totalDeposits)}</span> | In-Kind: <span className="text-cyan-400 font-bold font-mono">{formatCurrency(dashboardData.totalTransferIn)}</span>
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-5 shadow-lg relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-rose-500/10 rounded-full blur-xl group-hover:bg-rose-500/20 transition-all"></div>
              <div className="flex items-center gap-3 mb-2 relative z-10">
                <div className="p-2 bg-rose-500/20 text-rose-400 rounded-lg"><TrendingDown className="w-5 h-5"/></div>
                <h3 className="text-slate-200 font-bold text-sm font-display">Total Capital Withdrawn</h3>
              </div>
              <p className="text-3xl font-black text-white font-mono relative z-10">{formatCurrency(dashboardData.totalWithdrawals + dashboardData.totalTransferOut)}</p>
              <p className="text-xs text-slate-400 mt-1 font-medium relative z-10">
                Cash: <span className="text-rose-400 font-bold font-mono">{formatCurrency(dashboardData.totalWithdrawals)}</span> | In-Kind: <span className="text-amber-400 font-bold font-mono">{formatCurrency(dashboardData.totalTransferOut)}</span>
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex space-x-1 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800">
            <button onClick={() => handleTabChange('templates')} className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${activeTab === 'templates' ? 'bg-blue-600 text-white shadow-sm font-bold' : 'text-slate-300 hover:text-white hover:bg-slate-800/70'}`}>
              <Download className="w-4 h-4" />
              Templates & Ingestion
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/20 font-mono">PDF/CSV</span>
            </button>
            <button onClick={() => handleTabChange('feerecon')} className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${activeTab === 'feerecon' ? 'bg-amber-600 text-white shadow-sm font-bold' : 'text-slate-300 hover:text-amber-300 hover:bg-slate-800/70'}`}>
              <Receipt className="w-4 h-4" />
              Fee & GST Audit
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 font-mono">AGREED TERMS</span>
            </button>
            <button onClick={() => handleTabChange('cashflow')} className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'cashflow' ? 'bg-slate-800 text-white shadow-sm font-bold' : 'text-slate-300 hover:text-white hover:bg-slate-800/70'}`}>Cash Flow Ledger</button>
            <button onClick={() => handleTabChange('holdings')} className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'holdings' ? 'bg-slate-800 text-white shadow-sm font-bold' : 'text-slate-300 hover:text-white hover:bg-slate-800/70'}`}>Holdings Recon</button>
            <button onClick={() => handleTabChange('dividends')} className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'dividends' ? 'bg-slate-800 text-white shadow-sm font-bold' : 'text-slate-300 hover:text-white hover:bg-slate-800/70'}`}>Dividend Audit {dividendLoading && <span className="inline-block ml-1 w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin"/>}</button>
            <button onClick={() => handleTabChange('fullrecon')} className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${activeTab === 'fullrecon' ? 'bg-emerald-800 text-emerald-200 shadow-sm border border-emerald-600 font-bold' : 'text-slate-300 hover:text-emerald-300 hover:bg-slate-800/70'}`}>
              <ShieldCheck className="w-3.5 h-3.5" />Full Recon
            </button>
          </div>

          {/* Tab Content */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden min-h-[400px]">
            
            {/* TEMPLATES & INGESTION TAB */}
            {activeTab === 'templates' && (
              <div className="p-6 space-y-6 animate-fadeIn">
                {/* Header info */}
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <Download className="w-5 h-5 text-blue-400" />
                    360 ONE (IIFL) & Complete Circle PMS Template Ingestion Center
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Download sample templates formatted with standard column layouts for bank books and trade registers, or upload your statements directly.
                  </p>
                </div>

                {/* Download Sample Templates Grid */}
                <div className="space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                    Download Standard Sample Import Templates
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {/* 360 ONE Bank Book */}
                    <a
                      href="/api/templates/download/iifl-pms-bank-book"
                      download="360_ONE_IIFL_PMS_Bank_Book_Template.csv"
                      className="p-3.5 rounded-2xl bg-slate-850 border border-slate-700/80 hover:border-blue-500 transition-all flex flex-col justify-between group cursor-pointer"
                    >
                      <div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">360 ONE (IIFL)</span>
                        <h4 className="text-xs font-bold text-slate-200 mt-2 group-hover:text-blue-400 transition-colors">
                          Bank Book / Cash Ledger
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Date, Particulars, Debit, Credit, Running Balance, Voucher No.
                        </p>
                      </div>
                      <div className="mt-3 flex items-center gap-1.5 text-xs font-bold text-blue-400">
                        <Download className="w-3.5 h-3.5" />
                        <span>Download CSV</span>
                      </div>
                    </a>

                    {/* 360 ONE Trades */}
                    <a
                      href="/api/templates/download/iifl-pms-trades"
                      download="360_ONE_IIFL_PMS_Trade_Register_Template.csv"
                      className="p-3.5 rounded-2xl bg-slate-850 border border-slate-700/80 hover:border-blue-500 transition-all flex flex-col justify-between group cursor-pointer"
                    >
                      <div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">360 ONE (IIFL)</span>
                        <h4 className="text-xs font-bold text-slate-200 mt-2 group-hover:text-blue-400 transition-colors">
                          Trade Register (Transactions)
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Trade Date, Scrip Name, ISIN, BUY/SELL, Qty, Rate, Brokerage, Net.
                        </p>
                      </div>
                      <div className="mt-3 flex items-center gap-1.5 text-xs font-bold text-blue-400">
                        <Download className="w-3.5 h-3.5" />
                        <span>Download CSV</span>
                      </div>
                    </a>

                    {/* Complete Circle Bank Book */}
                    <a
                      href="/api/templates/download/complete-circle-pms-bank-book"
                      download="Complete_Circle_PMS_Bank_Book_Template.csv"
                      className="p-3.5 rounded-2xl bg-slate-850 border border-slate-700/80 hover:border-emerald-500 transition-all flex flex-col justify-between group cursor-pointer"
                    >
                      <div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">COMPLETE CIRCLE</span>
                        <h4 className="text-xs font-bold text-slate-200 mt-2 group-hover:text-emerald-400 transition-colors">
                          Bank Book CSV Layout
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Tran Date, Transaction Description, Buy/Sell Amt, Income, Dep/With.
                        </p>
                      </div>
                      <div className="mt-3 flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                        <Download className="w-3.5 h-3.5" />
                        <span>Download CSV</span>
                      </div>
                    </a>

                    {/* Complete Circle Trades */}
                    <a
                      href="/api/templates/download/complete-circle-pms-trades"
                      download="Complete_Circle_PMS_Trade_Register_Template.csv"
                      className="p-3.5 rounded-2xl bg-slate-850 border border-slate-700/80 hover:border-emerald-500 transition-all flex flex-col justify-between group cursor-pointer"
                    >
                      <div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">COMPLETE CIRCLE</span>
                        <h4 className="text-xs font-bold text-slate-200 mt-2 group-hover:text-emerald-400 transition-colors">
                          Trade Register (Transactions)
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Trade Date, Security Name, ISIN, Symbol, Action, Qty, Execution Rate.
                        </p>
                      </div>
                      <div className="mt-3 flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                        <Download className="w-3.5 h-3.5" />
                        <span>Download CSV</span>
                      </div>
                    </a>
                  </div>
                </div>

                {/* Upload & Ingestion Sandbox */}
                <div className="p-5 rounded-2xl bg-slate-850 border border-slate-700 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Upload & Ingest Statement File
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-400 block mb-1.5">PMS Provider</label>
                      <select
                        value={templatePms}
                        onChange={(e) => setTemplatePms(e.target.value as any)}
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
                      >
                        <option value="IIFL">360 ONE (IIFL Wealth) PMS</option>
                        <option value="COMPLETE_CIRCLE">Complete Circle PMS</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-400 block mb-1.5">Document Type</label>
                      <select
                        value={templateDocType}
                        onChange={(e) => setTemplateDocType(e.target.value as any)}
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
                      >
                        <option value="BANK_BOOK">Bank Book / Cash & Bank Ledger</option>
                        <option value="TRADES">Transactions / Trade Register</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                    <label className="w-full flex-1 flex items-center justify-center gap-3 p-3.5 border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-xl cursor-pointer bg-slate-900/50 text-center transition-colors">
                      <Upload className="w-4 h-4 text-slate-400" />
                      <div className="flex flex-col items-center">
                        <span className="text-xs font-bold text-slate-300">
                          {templateFile ? templateFile.name : 'Select statement file'}
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          {templatePms === 'COMPLETE_CIRCLE' ? 'CSV or PDF accepted' : 'CSV format'}
                        </span>
                      </div>
                      <input
                        type="file"
                        accept={templatePms === 'COMPLETE_CIRCLE' ? '.csv,.pdf' : '.csv'}
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) setTemplateFile(e.target.files[0]);
                        }}
                      />
                    </label>

                    <button
                      onClick={handleParseTemplateFile}
                      disabled={!templateFile || templateLoading}
                      className="w-full sm:w-auto px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0"
                    >
                      {templateLoading ? 'Parsing...' : 'Parse & Preview'}
                    </button>

                    <button
                      onClick={handleCleanupDuplicates}
                      disabled={templateLoading}
                      title="Scan portfolio and remove duplicate transactions"
                      className="w-full sm:w-auto px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-amber-300 font-bold text-xs shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                    >
                      <ShieldCheck className="w-4 h-4 text-amber-400" />
                      <span>Clean Duplicates</span>
                    </button>

                    <button
                      onClick={handleUndoLatestBatch}
                      disabled={templateLoading}
                      title="Undo latest uploaded batch"
                      className="w-full sm:w-auto px-3.5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-rose-300 font-bold text-xs shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                    >
                      <RefreshCcw className="w-3.5 h-3.5 text-rose-400" />
                      <span>Undo Latest Batch</span>
                    </button>
                  </div>

                  {commitStatus && (
                    <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs font-bold flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{commitStatus}</span>
                    </div>
                  )}
                </div>

                {/* Parsed Preview Table */}
                {parsedPmsRecords && parsedPmsRecords.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                        Parsed Records Preview ({parsedPmsRecords.length} rows found)
                      </h4>
                      <button
                        onClick={handleCommitParsedRecords}
                        disabled={templateLoading}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Commit {parsedPmsRecords.length} Rows to {selectedPortfolio} (Auto-Deduplicated)</span>
                      </button>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-800">
                      <table className="w-full text-left text-xs font-mono border-collapse">
                        <thead className="bg-slate-800/80 text-slate-400 font-bold uppercase text-[10px]">
                          <tr>
                            <th className="py-2.5 px-3">DATE</th>
                            <th className="py-2.5 px-3">TYPE</th>
                            <th className="py-2.5 px-3">DESCRIPTION / SCRIP</th>
                            <th className="py-2.5 px-3 text-right">AMOUNT / QTY</th>
                            <th className="py-2.5 px-3 text-right">NET VALUE</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                          {parsedPmsRecords.slice(0, 15).map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-850">
                              <td className="py-2 px-3 text-slate-300">{row.date || row.tradeDate}</td>
                              <td className="py-2 px-3">
                                <span className="px-2 py-0.5 rounded font-sans text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-800">
                                  {row.mappedType || row.transactionType}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-sans text-slate-200">{row.description || row.securityName || row.symbol}</td>
                              <td className="py-2 px-3 text-right text-slate-300">{row.quantity ? row.quantity.toLocaleString('en-IN') : (row.debit ? `Dr: ${formatCurrency(row.debit)}` : `Cr: ${formatCurrency(row.credit)}`)}</td>
                              <td className="py-2 px-3 text-right font-bold text-emerald-400">{formatCurrency(row.amount || row.netAmount || 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {parsedPmsRecords.length > 15 && (
                        <div className="p-2 text-center text-[11px] text-slate-400 bg-slate-850">
                          ... and {parsedPmsRecords.length - 15} more records
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* FULL RECONCILIATION TAB */}
            {activeTab === 'fullrecon' && (
              <div className="p-6 space-y-6">
                <div>
                  <h3 className="text-base font-semibold text-slate-200 flex items-center gap-2 mb-1">
                    <ShieldCheck className="w-5 h-5 text-emerald-400"/>
                    Full Transaction Reconciliation
                  </h3>
                  <p className="text-sm text-slate-400">Upload the PMS transaction statement and/or bank book CSV. The system will identify any rows missing from the database and let you apply them in one click.</p>
                </div>

                {/* File Upload Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Transaction Statement */}
                  <div className={`border-2 border-dashed rounded-xl p-4 transition-all cursor-pointer ${reconTxnFile ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-slate-700 hover:border-slate-600'}`}
                    onClick={() => txnFileRef.current?.click()}>
                    <input ref={txnFileRef} type="file" accept=".csv" className="hidden"
                      onChange={e => { setReconTxnFile(e.target.files?.[0] || null); setReconResult(null); }} />
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${reconTxnFile ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                        <FileText className="w-5 h-5"/>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-300">Transaction Statement CSV</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {reconTxnFile ? <span className="text-emerald-400">✓ {reconTxnFile.name}</span> : 'PMS Transaction Statement export (Buy/Sell/Security In/Out/TDS…)'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Bank Book */}
                  <div className={`border-2 border-dashed rounded-xl p-4 transition-all cursor-pointer ${reconBankFile ? 'border-blue-500/60 bg-blue-500/5' : 'border-slate-700 hover:border-slate-600'}`}
                    onClick={() => bankFileRef.current?.click()}>
                    <input ref={bankFileRef} type="file" accept=".csv" className="hidden"
                      onChange={e => { setReconBankFile(e.target.files?.[0] || null); setReconResult(null); }} />
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${reconBankFile ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400'}`}>
                        <BookOpen className="w-5 h-5"/>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-300">Bank Book CSV</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {reconBankFile ? <span className="text-blue-400">✓ {reconBankFile.name}</span> : 'PMS Bank Book ledger (Deposits, Dividends, Fees, TDS…)'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Run Button */}
                <div className="flex items-center gap-3">
                  <button onClick={handleReconUpload} disabled={reconLoading || (!reconTxnFile && !reconBankFile)}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl font-medium transition-colors">
                    {reconLoading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Search className="w-4 h-4"/>}
                    {reconLoading ? 'Analysing...' : 'Run Reconciliation (Dry Run)'}
                  </button>
                  {(reconTxnFile || reconBankFile) && !reconLoading && (
                    <button onClick={() => { setReconTxnFile(null); setReconBankFile(null); setReconResult(null); setReconApplyResult(null); setReconError(null); }}
                      className="text-xs text-slate-400 hover:text-slate-300 transition-colors">Clear files</button>
                  )}
                </div>

                {/* Error */}
                {reconError && (
                  <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-700/50 rounded-xl text-red-400 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0"/> {reconError}
                  </div>
                )}

                {/* Apply Success Banner */}
                {reconApplyResult && (
                  <div className="flex items-center gap-3 p-4 bg-emerald-900/30 border border-emerald-700/50 rounded-xl">
                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0"/>
                    <div>
                      <p className="text-emerald-300 font-semibold">✓ {reconApplyResult.inserted} transactions inserted successfully</p>
                      <p className="text-emerald-500 text-xs mt-0.5">
                        Net Invested: {fmtInr(reconApplyResult.netInvested)} | Capital In: {fmtInr(reconApplyResult.capitalIn)} | Capital Out: {fmtInr(reconApplyResult.capitalOut)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Reconciliation Results */}
                {reconResult && (
                  <div className="space-y-5">
                    {/* Status cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3">
                        <p className="text-xs text-slate-400 mb-1">Missing Rows Found</p>
                        <p className={`text-2xl font-bold ${reconResult.missingCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{reconResult.missingCount}</p>
                        <p className="text-xs text-slate-600 mt-0.5">Txn: {reconResult.parsedRows.txnFile} | Bank: {reconResult.parsedRows.bankFile}</p>
                      </div>
                      <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3">
                        <p className="text-xs text-slate-400 mb-1">Portfolio Value</p>
                        <p className="text-lg font-bold text-slate-200">{fmtInr(reconResult.dbState.terminalValue)}</p>
                        <p className="text-xs text-slate-600 mt-0.5">{reconResult.dbState.holdingsCount} holdings</p>
                      </div>
                      <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3">
                        <p className="text-xs text-slate-400 mb-1">XIRR</p>
                        <p className={`text-2xl font-bold ${reconResult.dbState.xirr >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtPct(reconResult.dbState.xirr)}</p>
                        <p className="text-xs text-slate-600 mt-0.5">Invested: {fmtInr(reconResult.dbState.totalCapitalIn)}</p>
                      </div>
                      <div className={`bg-slate-800/60 border rounded-xl p-3 ${reconResult.dbState.cashDiff < 50000 ? 'border-emerald-700/50' : 'border-amber-700/50'}`}>
                        <p className="text-xs text-slate-400 mb-1">Cash Match</p>
                        <p className={`text-sm font-bold ${reconResult.dbState.cashDiff < 50000 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {reconResult.dbState.cashDiff < 50000 ? '✓ Close' : `⚠ Δ${fmtInr(reconResult.dbState.cashDiff)}`}
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5">DB: {fmtInr(reconResult.dbState.calculatedCash)}</p>
                        {reconResult.dbState.closingBalance > 0 && (
                          <p className="text-xs text-slate-600">Vendor: {fmtInr(reconResult.dbState.closingBalance)}</p>
                        )}
                      </div>
                    </div>

                    {/* Missing transactions table */}
                    {reconResult.missingCount > 0 ? (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4"/> {reconResult.missingCount} Missing Transactions (not in DB)
                          </h4>
                          <button onClick={handleReconApply} disabled={reconApplying}
                            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                            {reconApplying ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <CheckCircle className="w-3.5 h-3.5"/>}
                            {reconApplying ? 'Inserting...' : `Insert ${reconResult.missingCount} Rows`}
                          </button>
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-slate-700">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-800/80">
                              <tr>
                                <th className="px-3 py-2 text-left text-slate-400 font-medium">Date</th>
                                <th className="px-3 py-2 text-left text-slate-400 font-medium">Type</th>
                                <th className="px-3 py-2 text-left text-slate-400 font-medium">Symbol / Description</th>
                                <th className="px-3 py-2 text-right text-slate-400 font-medium">Amount</th>
                                <th className="px-3 py-2 text-center text-slate-400 font-medium">CF?</th>
                                <th className="px-3 py-2 text-left text-slate-400 font-medium">Source</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                              {reconResult.missingTransactions.map((r: any, i: number) => (
                                <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                                  <td className="px-3 py-2 text-slate-300 font-mono">{r.date}</td>
                                  <td className="px-3 py-2">
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                      r.type === 'DEPOSIT' ? 'bg-emerald-900/40 text-emerald-400' :
                                      r.type === 'WITHDRAWAL' ? 'bg-red-900/40 text-red-400' :
                                      r.type === 'TDS' ? 'bg-orange-900/40 text-orange-400' :
                                      r.type === 'DIVIDEND' ? 'bg-blue-900/40 text-blue-400' :
                                      r.type === 'MANAGEMENT_FEE' ? 'bg-purple-900/40 text-purple-400' :
                                      'bg-slate-700 text-slate-400'
                                    }`}>{r.type}</span>
                                  </td>
                                  <td className="px-3 py-2 text-slate-300 max-w-[200px] truncate">{r.symbol || r.notes}</td>
                                  <td className="px-3 py-2 text-right text-slate-200 font-mono">{fmtInr(r.netAmount)}</td>
                                  <td className="px-3 py-2 text-center">
                                    <span className={`text-xs ${r.isCashFlow ? 'text-emerald-400' : 'text-slate-600'}`}>{r.isCashFlow ? '✓ Yes' : 'No'}</span>
                                  </td>
                                  <td className="px-3 py-2 text-slate-400 text-xs">{r.fileSource}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 p-4 bg-emerald-900/20 border border-emerald-700/40 rounded-xl">
                        <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0"/>
                        <div>
                          <p className="text-emerald-300 font-semibold">✓ Fully Reconciled — No Missing Transactions</p>
                          <p className="text-emerald-600 text-xs mt-0.5">All rows from the uploaded files are already present in the database.</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* CASH FLOW LEDGER */}
            {activeTab === 'cashflow' && (

              <div className="p-6">
                {!dashboardData?.inflows ? (
                  <div className="text-center py-12 text-slate-400">No cash flow data available. Upload a PMS statement to get started.</div>
                ) : (
                  <>
                    <p className="text-sm text-slate-400 mb-6 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-blue-400"/>
                      Double-click any row to view underlying transactions.
                    </p>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* INFLOWS */}
                      <div className="border border-slate-700/50 rounded-xl overflow-hidden bg-slate-900/50">
                        <div className="bg-slate-800/80 px-4 py-3 font-bold text-emerald-400 border-b border-slate-700 flex justify-between">
                          <span>INFLOWS</span>
                          <span>{formatCurrency(dashboardData.inflows.deposits.total + dashboardData.inflows.securitiesIn.total + dashboardData.inflows.income.total + dashboardData.inflows.sellProceeds.total)}</span>
                        </div>
                        <div className="p-2 space-y-1">
                          {renderFlowRow('Corpus Deposits', dashboardData.inflows.deposits, 'text-slate-100')}
                          {renderFlowRow('Securities In (In-Kind)', dashboardData.inflows.securitiesIn, 'text-slate-100')}
                          {renderFlowRow('Dividend / Interest Income', dashboardData.inflows.income, 'text-emerald-400')}
                          {renderFlowRow('Sell Proceeds', dashboardData.inflows.sellProceeds, 'text-slate-100')}
                        </div>
                      </div>

                      {/* OUTFLOWS */}
                      <div className="border border-slate-700/50 rounded-xl overflow-hidden bg-slate-900/50">
                        <div className="bg-slate-800/80 px-4 py-3 font-bold text-rose-400 border-b border-slate-700 flex justify-between">
                          <span>OUTFLOWS</span>
                          <span>{formatCurrency(dashboardData.outflows.withdrawals.total + dashboardData.outflows.securitiesOut.total + dashboardData.outflows.expenses.total + dashboardData.outflows.buyCosts.total)}</span>
                        </div>
                        <div className="p-2 space-y-1">
                          {renderFlowRow('Capital Withdrawals', dashboardData.outflows.withdrawals, 'text-slate-100')}
                          {renderFlowRow('Securities Out (In-Kind)', dashboardData.outflows.securitiesOut, 'text-slate-100')}
                          {renderFlowRow('Management Fees & Custody Charges', dashboardData.outflows.managementFees, 'text-amber-400')}
                          {renderFlowRow('TDS (Tax Deducted)', dashboardData.outflows.tds, 'text-rose-400')}
                          {dashboardData.outflows.otherExpenses?.total > 0 && renderFlowRow('Other Expenses', dashboardData.outflows.otherExpenses, 'text-slate-300')}
                          {renderFlowRow('Buy Costs', dashboardData.outflows.buyCosts, 'text-slate-100')}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* HOLDINGS RECON */}
            {activeTab === 'holdings' && holdingsRecon && (
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <p className="text-sm text-slate-400">Comparing System-Derived Holdings (from TXNs) against your uploaded Statement of Holdings.</p>
                  <button 
                    onClick={() => { setIsInserting(true); setEditTxn({ type: 'BUY', date: new Date().toISOString().split('T')[0] }); }}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-sm transition-colors border border-slate-600"
                  >
                    <Plus className="w-4 h-4"/> Insert Missing Txn
                  </button>
                </div>
                
                <div className="border border-slate-700 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-800 text-slate-300">
                      <tr>
                        <th className="p-3">Symbol</th>
                        <th className="p-3 text-right">System Qty</th>
                        <th className="p-3 text-right">Uploaded Qty</th>
                        <th className="p-3 text-right">Discrepancy</th>
                        <th className="p-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {holdingsRecon.length === 0 && (
                        <tr><td colSpan={5} className="p-6 text-center text-slate-400">No holdings found for reconciliation.</td></tr>
                      )}
                      {holdingsRecon.map((r: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                          <td className="p-3">
                            <div className="font-medium text-slate-200">{r.symbol || r.isin}</div>
                            <div className="text-xs text-slate-400 truncate max-w-[200px]">{r.name}</div>
                          </td>
                          <td className="p-3 text-right text-slate-300">{r.systemQty}</td>
                          <td className="p-3 text-right text-slate-300">{r.uploadedQty}</td>
                          <td className={`p-3 text-right font-bold ${Math.abs(r.diff) > 0.001 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {Math.abs(r.diff) > 0.001 ? r.diff : 'Match'}
                          </td>
                          <td className="p-3 text-center">
                            {Math.abs(r.diff) > 0.001 && (
                               <button 
                                 onClick={() => {
                                   setIsInserting(true);
                                   setEditTxn({
                                     symbol: r.symbol,
                                     isin: r.isin,
                                     type: r.diff < 0 ? 'BUY' : 'SELL',
                                     quantity: Math.abs(r.diff),
                                     date: new Date().toISOString().split('T')[0]
                                   });
                                 }}
                                 className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded hover:bg-indigo-500/30"
                               >
                                 Fix
                               </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* DIVIDENDS RECON */}
            {activeTab === 'dividends' && dividendLoading && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                <p className="text-slate-400 text-sm">Computing dividend audit from corporate actions history...</p>
              </div>
            )}
            {activeTab === 'dividends' && !dividendLoading && !reconData && (
              <div className="text-center py-12 text-slate-400">Click &apos;Dividend Audit&apos; tab to load the audit.</div>
            )}
            {activeTab === 'dividends' && !dividendLoading && reconData && (
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <div className="flex gap-4">
                    <div className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-lg">
                      <span className="text-xs text-slate-400 block">Total Expected</span>
                      <span className="font-bold text-slate-200">{formatCurrency(reconData.expected?.reduce((sum: number, d: any) => sum + d.amount, 0) || 0)}</span>
                    </div>
                    <div className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-lg">
                      <span className="text-xs text-slate-400 block">Total Received</span>
                      <span className="font-bold text-emerald-400">{formatCurrency(reconData.received?.reduce((sum: number, d: any) => sum + d.amount, 0) || 0)}</span>
                    </div>
                  </div>
                  <button 
                    onClick={downloadDividendCsv}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg text-sm transition-colors border border-slate-600"
                  >
                    <Download className="w-4 h-4"/> Export CSV
                  </button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {/* Expected */}
                  <div className="border border-slate-700 rounded-xl overflow-hidden bg-slate-900/50">
                    <div className="bg-slate-800 px-4 py-3 font-bold text-slate-300 border-b border-slate-700">System Expected Dividends</div>
                    <div className="divide-y divide-slate-800 max-h-[400px] overflow-y-auto">
                      {reconData.expected?.length === 0 && <div className="p-4 text-slate-400 text-sm">No expected dividends found.</div>}
                      {reconData.expected?.map((d: any, i: number) => (
                        <div key={i} className="p-3 flex justify-between items-center text-sm hover:bg-slate-800/30">
                          <div>
                            <span className="text-slate-200 font-medium">{d.symbol}</span>
                            <span className="text-slate-400 ml-2 text-xs">Qty: {d.qtyHeld} @ {formatCurrency(d.dps)}</span>
                            <div className="text-xs text-slate-400">{d.date}</div>
                          </div>
                          <div className="font-bold text-emerald-400">+{formatCurrency(d.amount)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actual */}
                  <div className="border border-slate-700 rounded-xl overflow-hidden bg-slate-900/50">
                    <div className="bg-slate-800 px-4 py-3 font-bold text-slate-300 border-b border-slate-700">Actual Bank Book Credits</div>
                    <div className="divide-y divide-slate-800 max-h-[400px] overflow-y-auto">
                      {reconData.received?.length === 0 && <div className="p-4 text-slate-400 text-sm">No cash income found.</div>}
                      {reconData.received?.map((d: any, i: number) => (
                        <div key={i} className="p-3 flex justify-between items-center text-sm hover:bg-slate-800/30">
                          <div>
                            <span className="text-slate-200 font-medium">Bank Book Income</span>
                            <div className="text-xs text-slate-400">{d.date}</div>
                          </div>
                          <div className="font-bold text-emerald-400">+{formatCurrency(d.amount)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* MANAGEMENT FEE & GST AUDIT TAB */}
            {activeTab === 'feerecon' && (
              <div className="p-6 space-y-6 animate-fadeIn">
                {/* Header & Agreed Terms Bar */}
                <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                        <Receipt className="w-5 h-5 text-amber-400" />
                        PMS Management Fee & GST Contract Reconciliation
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Audit bank book management fee debits against agreed contract terms ({feeConfig.annual_fee_rate}% p.a. AUM fee + {feeConfig.gst_rate}% GST on daily weighted AUM).
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleExportFeeAuditCsv}
                        disabled={!feeAuditData?.periods?.length}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 shadow-xs"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                        Export Audit CSV
                      </button>
                      <button
                        onClick={() => fetchFeeAudit()}
                        disabled={feeAuditLoading}
                        className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
                      >
                        <RefreshCcw className={`w-3.5 h-3.5 ${feeAuditLoading ? 'animate-spin' : ''}`} />
                        Recalculate Audit
                      </button>
                    </div>
                  </div>

                  {/* Agreed Contract Terms Inputs */}
                  <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3.5 items-end">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Agreed Annual Fee Rate (%)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          max="10"
                          value={feeConfig.annual_fee_rate}
                          onChange={(e) => setFeeConfig(prev => ({ ...prev, annual_fee_rate: parseFloat(e.target.value) || 0 }))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono font-bold focus:border-amber-500 focus:outline-none"
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">% p.a.</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        GST Rate (%)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="30"
                          value={feeConfig.gst_rate}
                          onChange={(e) => setFeeConfig(prev => ({ ...prev, gst_rate: parseFloat(e.target.value) || 0 }))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono font-bold focus:border-amber-500 focus:outline-none"
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">% GST</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Billing Cycle
                      </label>
                      <select
                        value={feeConfig.billing_frequency}
                        onChange={(e) => setFeeConfig(prev => ({ ...prev, billing_frequency: e.target.value as any }))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-semibold focus:border-amber-500 focus:outline-none"
                      >
                        <option value="quarterly">Quarterly (Standard)</option>
                        <option value="monthly">Monthly Accrual</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        AUM Calculation Basis
                      </label>
                      <select
                        value={feeConfig.calculation_basis}
                        onChange={(e) => setFeeConfig(prev => ({ ...prev, calculation_basis: e.target.value as any }))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-semibold focus:border-amber-500 focus:outline-none"
                      >
                        <option value="daily_avg">Daily Average AUM (Exact)</option>
                        <option value="month_end">Period-End AUM</option>
                      </select>
                    </div>

                    <div>
                      <button
                        onClick={handleSaveFeeConfig}
                        disabled={feeConfigSaving}
                        className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Sliders className="w-3.5 h-3.5 text-amber-400" />
                        {feeConfigSaving ? 'Saving...' : 'Save Terms'}
                      </button>
                    </div>
                  </div>
                </div>

                {feeAuditLoading ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
                    <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-xs font-medium">Reconciling historical daily AUM against fee debits...</p>
                  </div>
                ) : feeAuditData ? (
                  <>
                    {/* Executive Summary KPI Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Monitored AUM */}
                      <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between">
                        <span className="text-xs font-semibold text-slate-400">Monitored Portfolio AUM</span>
                        <div className="mt-2">
                          <span className="text-2xl font-bold text-slate-100">{formatCurrency(feeAuditData.latestAum)}</span>
                          <span className="text-[11px] text-slate-400 block mt-0.5">Average: {formatCurrency(feeAuditData.totalAumAssessed)}</span>
                        </div>
                      </div>

                      {/* Expected Contractual Fee */}
                      <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-400">Expected Contractual Fee</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-bold border border-blue-500/20">
                            {feeConfig.annual_fee_rate}% + 18% GST
                          </span>
                        </div>
                        <div className="mt-2">
                          <span className="text-2xl font-bold text-blue-400">{formatCurrency(feeAuditData.totalExpectedFee)}</span>
                          <span className="text-[11px] text-slate-400 block mt-0.5">
                            Base: {formatCurrency(feeAuditData.totalExpectedBaseFee)} | GST: {formatCurrency(feeAuditData.totalExpectedGst)}
                          </span>
                        </div>
                      </div>

                      {/* Actual Debited */}
                      <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-400">Actual Debited in Bank Book</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                            {feeAuditData.allFeeTransactions?.length || 0} debits
                          </span>
                        </div>
                        <div className="mt-2">
                          <span className="text-2xl font-bold text-slate-100">{formatCurrency(feeAuditData.totalActualDebited)}</span>
                          <span className="text-[11px] text-slate-400 block mt-0.5">Total debits from bank book</span>
                        </div>
                      </div>

                      {/* Net Audit Variance */}
                      <div className={`p-4 rounded-2xl border flex flex-col justify-between ${
                        Math.abs(feeAuditData.netVariance) < 1000
                          ? 'bg-emerald-950/30 border-emerald-800/60'
                          : feeAuditData.netVariance > 0
                          ? 'bg-rose-950/30 border-rose-800/60'
                          : 'bg-blue-950/30 border-blue-800/60'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-300">Audit Discrepancy / Delta</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                            Math.abs(feeAuditData.netVariance) < 1000
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : feeAuditData.netVariance > 0
                              ? 'bg-rose-500/20 text-rose-300'
                              : 'bg-blue-500/20 text-blue-300'
                          }`}>
                            {Math.abs(feeAuditData.netVariance) < 1000 ? 'MATCH' : feeAuditData.netVariance > 0 ? 'OVERCHARGED' : 'UNDERCHARGED'}
                          </span>
                        </div>
                        <div className="mt-2">
                          <span className={`text-2xl font-extrabold ${
                            Math.abs(feeAuditData.netVariance) < 1000
                              ? 'text-emerald-400'
                              : feeAuditData.netVariance > 0
                              ? 'text-rose-400'
                              : 'text-blue-400'
                          }`}>
                            {feeAuditData.netVariance > 0 ? '+' : ''}{formatCurrency(feeAuditData.netVariance)}
                          </span>
                          <span className="text-[11px] text-slate-400 block mt-0.5 font-mono">
                            {feeAuditData.netVariancePct > 0 ? '+' : ''}{feeAuditData.netVariancePct.toFixed(1)}% vs agreed contract
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Period-by-Period Audit Table */}
                    <div className="bg-slate-950/60 rounded-2xl border border-slate-800 overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-slate-200">Periodic Contract Audit Breakdown</h4>
                          <span className="text-xs text-slate-400">Comparing expected fee against recorded debit for each billing period</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" /> {feeAuditData.matchedCount} Match
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 font-semibold border border-rose-500/20">
                            <AlertOctagon className="w-3 h-3" /> {feeAuditData.overchargedCount} Overcharged
                          </span>
                          {feeAuditData.underchargedCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-semibold border border-blue-500/20">
                              {feeAuditData.underchargedCount} Undercharged
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                            <tr>
                              <th className="py-3 px-4 font-semibold">Billing Period</th>
                              <th className="py-3 px-4 font-semibold text-right">Avg Daily AUM</th>
                              <th className="py-3 px-4 font-semibold text-right">Days</th>
                              <th className="py-3 px-4 font-semibold text-right">Agreed Base ({feeConfig.annual_fee_rate}%)</th>
                              <th className="py-3 px-4 font-semibold text-right">GST ({feeConfig.gst_rate}%)</th>
                              <th className="py-3 px-4 font-semibold text-right text-blue-300">Total Agreed</th>
                              <th className="py-3 px-4 font-semibold text-right text-slate-200">Bank Debit</th>
                              <th className="py-3 px-4 font-semibold text-right">Variance</th>
                              <th className="py-3 px-4 font-semibold text-center">Status</th>
                              <th className="py-3 px-3 text-center">Details</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono">
                            {feeAuditData.periods?.map((p: any) => {
                              const isExpanded = expandedPeriod === p.period;
                              return (
                                <React.Fragment key={p.period}>
                                  <tr className="hover:bg-slate-900/50 transition-colors">
                                    <td className="py-3 px-4 font-sans font-bold text-slate-200">
                                      {p.periodLabel}
                                      <span className="text-[10px] text-slate-400 font-mono block">{p.startDate} to {p.endDate}</span>
                                    </td>
                                    <td className="py-3 px-4 text-right text-slate-300 font-medium">
                                      {formatCurrency(p.avgDailyAum)}
                                    </td>
                                    <td className="py-3 px-4 text-right text-slate-400">
                                      {p.days}
                                    </td>
                                    <td className="py-3 px-4 text-right text-slate-300">
                                      {formatCurrency(p.expectedBaseFee)}
                                    </td>
                                    <td className="py-3 px-4 text-right text-slate-400">
                                      {formatCurrency(p.expectedGst)}
                                    </td>
                                    <td className="py-3 px-4 text-right font-bold text-blue-400">
                                      {formatCurrency(p.expectedTotalFee)}
                                    </td>
                                    <td className="py-3 px-4 text-right font-bold text-slate-100">
                                      {p.actualDebit > 0 ? formatCurrency(p.actualDebit) : <span className="text-slate-600 font-sans font-normal">-</span>}
                                    </td>
                                    <td className={`py-3 px-4 text-right font-bold ${
                                      p.actualDebit === 0 ? 'text-slate-600' :
                                      p.status === 'MATCH' ? 'text-emerald-400' :
                                      p.variance > 0 ? 'text-rose-400' : 'text-blue-400'
                                    }`}>
                                      {p.actualDebit > 0 ? (
                                        <>
                                          {p.variance > 0 ? '+' : ''}{formatCurrency(p.variance)}
                                          <span className="text-[10px] block opacity-80">
                                            ({p.variancePct > 0 ? '+' : ''}{p.variancePct.toFixed(1)}%)
                                          </span>
                                        </>
                                      ) : '-'}
                                    </td>
                                    <td className="py-3 px-4 text-center font-sans">
                                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                        p.status === 'MATCH' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                                        p.status === 'OVERCHARGED' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                                        p.status === 'UNDERCHARGED' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                                        'bg-slate-800 text-slate-400 border border-slate-700'
                                      }`}>
                                        {p.status}
                                      </span>
                                    </td>
                                    <td className="py-3 px-3 text-center">
                                      {p.transactions?.length > 0 ? (
                                        <button
                                          onClick={() => setExpandedPeriod(isExpanded ? null : p.period)}
                                          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200"
                                          title="View debited transactions"
                                        >
                                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </button>
                                      ) : null}
                                    </td>
                                  </tr>
                                  {isExpanded && p.transactions?.length > 0 && (
                                    <tr className="bg-slate-900/90 font-sans">
                                      <td colSpan={10} className="p-4 border-t border-b border-slate-800">
                                        <div className="space-y-2">
                                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                                            Bank Book Debit Records for {p.periodLabel}
                                          </span>
                                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                            {p.transactions.map((tx: any, idx: number) => (
                                              <div key={idx} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
                                                <div>
                                                  <span className="font-bold text-slate-200 block">{tx.notes || tx.type}</span>
                                                  <span className="text-[10px] text-slate-400 font-mono">{tx.date}</span>
                                                </div>
                                                <span className="font-bold text-rose-400 font-mono">
                                                  {formatCurrency(tx.net_amount)}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-16 text-slate-400 text-sm">
                    No transactions found to audit management fees for portfolio '{selectedPortfolio}'.
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : null}

      {/* Drilldown Modal */}
      {drilldown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl animate-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
              <h3 className="text-lg font-bold text-slate-100">{drilldown.title} Transactions</h3>
              <button onClick={() => setDrilldown(null)} className="text-slate-400 hover:text-white">&times;</button>
            </div>
            <div className="p-0 max-h-[60vh] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800/80 text-slate-400 sticky top-0">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Symbol</th>
                    <th className="p-3 text-right">Amount / Qty</th>
                    <th className="p-3">Notes</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {drilldown.txns.map((t, i) => (
                    <tr key={i} className="hover:bg-slate-800/50">
                      <td className="p-3 text-slate-300">{t.date}</td>
                      <td className="p-3 text-slate-300"><span className="px-2 py-0.5 bg-slate-800 rounded text-xs">{t.type}</span></td>
                      <td className="p-3 font-medium text-slate-200">{t.symbol || '-'}</td>
                      <td className="p-3 text-right font-medium text-slate-200">{t.net_amount ? formatCurrency(t.net_amount) : t.quantity}</td>
                      <td className="p-3 text-xs text-slate-400 max-w-[200px] truncate">{t.notes}</td>
                      <td className="p-3 text-center flex justify-center gap-2">
                        <button onClick={() => { setEditTxn(t); setIsInserting(false); setDrilldown(null); }} className="text-slate-400 hover:text-blue-400"><Edit3 className="w-4 h-4"/></button>
                        <button onClick={() => { handleTxnDelete(t.id); setDrilldown(null); }} className="text-slate-400 hover:text-rose-400"><Trash2 className="w-4 h-4"/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Edit/Insert Txn Modal */}
      {editTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
              <h3 className="text-lg font-bold text-slate-100">{isInserting ? 'Insert Transaction' : 'Edit Transaction'}</h3>
              <button onClick={() => setEditTxn(null)} className="text-slate-400 hover:text-white">&times;</button>
            </div>
            <form onSubmit={handleTxnSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Date</label>
                  <input type="date" name="date" defaultValue={editTxn.date} required className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Type</label>
                  <input type="text" name="type" defaultValue={editTxn.type} required className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Symbol</label>
                  <input type="text" name="symbol" defaultValue={editTxn.symbol} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">ISIN</label>
                  <input type="text" name="isin" defaultValue={editTxn.isin} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Quantity</label>
                  <input type="number" step="any" name="quantity" defaultValue={editTxn.quantity} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Price</label>
                  <input type="number" step="any" name="price" defaultValue={editTxn.price} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Net Amount</label>
                  <input type="number" step="any" name="net_amount" defaultValue={editTxn.net_amount} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Notes</label>
                <input type="text" name="notes" defaultValue={editTxn.notes} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500" />
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-slate-800">
                <button type="button" onClick={() => setEditTxn(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Save Transaction</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
