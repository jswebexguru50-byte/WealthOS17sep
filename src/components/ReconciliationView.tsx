import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  UploadCloud,
  ChevronDown,
  Info,
  Check,
  ChevronRight,
  TrendingDown,
  ExternalLink,
  Download,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Briefcase,
  Coins,
  Settings,
  Plus,
  Trash2,
  Edit2,
  X,
  RefreshCw,
  Clock
} from 'lucide-react';
import { Transaction } from '../types';
import { formatINR, formatPct } from '../lib/formatters.js';

interface ReconciliationRow {
  isin: string;
  symbol: string;
  name: string;
  zerodha_qty: number;
  db_qty: number;
  diff_qty: number;
  zerodha_avg: number;
  db_avg: number;
  status: 'RECONCILED' | 'MISSING_IN_PORTFOLIO' | 'PHANTOM_HOLDING' | 'QUANTITY_MISMATCH' | 'PRICE_MISMATCH';
  reason: string;
  action: 'BUY' | 'SELL' | 'SPLIT' | 'EDIT' | null;
}

interface ReconciliationViewProps {
  onReconcile: (file: File, mappings?: Record<string, string>, portfolio?: string, reconcileType?: string) => Promise<any>;
  formatCurrency: (val: number) => string;
  portfolios: string[];
  selectedPortfolio: string;
  onAddTransaction: (txn: Partial<Transaction>) => Promise<boolean>;
}

export function ReconciliationView({
  onReconcile,
  formatCurrency,
  portfolios,
  selectedPortfolio,
  onAddTransaction
}: ReconciliationViewProps) {
  // Config States
  const [reconcileType, setReconcileType] = useState<'broker' | 'pms'>('pms'); // Default to PMS for the user's specific request
  const [targetPortfolio, setTargetPortfolio] = useState(selectedPortfolio === 'Combined' ? (portfolios.find(p => p !== 'Default') || 'Maa') : selectedPortfolio);

  const [file, setFile] = useState<File | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationRow[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Search & Sort State
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<string>('symbol');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // Mapping UI State
  const [unmatched, setUnmatched] = useState<any[]>([]);
  const [masterTickers, setMasterTickers] = useState<any[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [needsMapping, setNeedsMapping] = useState(false);
  
  // Drag and Drop
  const [dragActive, setDragActive] = useState(false);

  // Resolution States
  const [activeResolverRow, setActiveResolverRow] = useState<ReconciliationRow | null>(null);
  const [resolverType, setResolverType] = useState<'BUY' | 'SELL' | 'SPLIT' | 'EDIT' | null>(null);
  const [resolveDate, setResolveDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [resolveQty, setResolveQty] = useState<number>(0);
  const [resolvePrice, setResolvePrice] = useState<number>(0);
  const [resolveNotes, setResolveNotes] = useState<string>('Reconciliation Adjusting Entry');
  
  // Split specific
  const [splitNumerator, setSplitNumerator] = useState<number>(2);
  const [splitDenominator, setSplitDenominator] = useState<number>(1);
  const [splitActionType, setSplitActionType] = useState<'Split' | 'Bonus'>('Split');

  // Trade history for PRICE_MISMATCH / EDIT
  const [txHistory, setTxHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [editingTxId, setEditingTxId] = useState<number | null>(null);
  const [editTxPrice, setEditTxPrice] = useState<number>(0);
  const [editTxQty, setEditTxQty] = useState<number>(0);
  const [editTxDate, setEditTxDate] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  // PMS 100% Traceable Audit Suite State
  const [pmsAuditReport, setPmsAuditReport] = useState<any>(null);
  const [isAuditingPms, setIsAuditingPms] = useState(false);
  const [initialCashInput, setInitialCashInput] = useState<number>(14000000);
  const [settlementDaysInput, setSettlementDaysInput] = useState<number>(2);

  const runPmsAudit = async () => {
    setIsAuditingPms(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/reconciliation/pms-audit?portfolio=${encodeURIComponent(targetPortfolio)}&initialCash=${initialCashInput}&settlementDays=${settlementDaysInput}`);
      const data = await res.json();
      if (data.success && data.report) {
        setPmsAuditReport(data.report);
        setSuccessMsg(`Successfully executed 100% traceable audit for ${targetPortfolio}!`);
      } else {
        setErrorMsg(data.message || 'Failed to run PMS audit.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error executing audit.');
  // Auto-run PMS audit on load or portfolio change
  useEffect(() => {
    if (reconcileType === 'pms') {
      runPmsAudit();
    }
  }, [targetPortfolio, reconcileType]);

  // Sync target portfolio when selectedPortfolio changes globally
  useEffect(() => {
    if (selectedPortfolio !== 'Combined') {
      setTargetPortfolio(selectedPortfolio);
    } else if (portfolios.length > 0 && !portfolios.includes(targetPortfolio)) {
      setTargetPortfolio(portfolios[0]);
    }
  }, [selectedPortfolio, portfolios]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setNeedsMapping(false);
      setUnmatched([]);
      setErrorMsg('');
    }
  };

  const filteredReconciliation = reconciliation.filter(r => {
    const s = search.toLowerCase();
    return (
      r.symbol.toLowerCase().includes(s) ||
      (r.isin && r.isin.toLowerCase().includes(s)) ||
      r.status.toLowerCase().includes(s) ||
      r.reason.toLowerCase().includes(s)
    );
  });

  const sortedReconciliation = [...filteredReconciliation].sort((a, b) => {
    let valA: any = a[sortField as keyof ReconciliationRow];
    let valB: any = b[sortField as keyof ReconciliationRow];

    if (valA === undefined || valA === null) return sortDirection === 'asc' ? -1 : 1;
    if (valB === undefined || valB === null) return sortDirection === 'asc' ? 1 : -1;

    if (typeof valA === 'string') {
      return sortDirection === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    } else {
      return sortDirection === 'asc' 
        ? valA - valB 
        : valB - valA;
    }
  });

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 inline-block ml-1 opacity-50" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="w-3.5 h-3.5 text-emerald-400 inline-block ml-1" /> 
      : <ArrowDown className="w-3.5 h-3.5 text-emerald-400 inline-block ml-1" />;
  };

  const downloadReconciliationCSV = () => {
    const typeLabel = reconcileType === 'pms' ? 'PMS' : 'Broker';
    const headers = ['Symbol', 'ISIN', `${typeLabel} Qty`, 'DB Qty', 'Qty Difference', `${typeLabel} Avg Price`, 'DB Avg Price', 'Status', 'Diagnostic Details'];
    const rows = sortedReconciliation.map(r => [
      r.symbol,
      r.isin || '',
      r.zerodha_qty,
      r.db_qty,
      r.diff_qty,
      r.zerodha_avg,
      r.db_avg,
      r.status,
      `"${r.reason.replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${reconcileType}_reconciliation_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setNeedsMapping(false);
      setUnmatched([]);
      setErrorMsg('');
    }
  };

  const executeReconcile = async (selectedFile: File, userMappings: Record<string, string> = {}) => {
    setErrorMsg('');
    try {
      const res = await onReconcile(selectedFile, userMappings, targetPortfolio, reconcileType);
      if (res.needs_mapping) {
        setNeedsMapping(true);
        setUnmatched(res.unmatched);
        if (res.master_tickers) {
          setMasterTickers(res.master_tickers);
        }
        // Initialize mappings with top suggestions
        const initial: Record<string, string> = {};
        for (const item of res.unmatched) {
          initial[item.file_name] = item.suggestions[0] || '';
        }
        setMappings(m => ({ ...m, ...initial }));
      } else if (res.reconciliation) {
        setReconciliation(res.reconciliation);
        setNeedsMapping(false);
        setUnmatched([]);
        setMasterTickers([]);
      } else if (res.message) {
        setErrorMsg(res.message);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Verification failed. Please check spreadsheet headers.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (file) {
      executeReconcile(file, mappings);
    }
  };

  const handleMappingChange = (fileName: string, value: string) => {
    setMappings({ ...mappings, [fileName]: value });
  };

  const reset = () => {
    setMappings({});
    setMasterTickers([]);
    setReconciliation([]);
    setUnmatched([]);
    setMappings({});
    setNeedsMapping(false);
    setErrorMsg('');
    setSuccessMsg('');
    setActiveResolverRow(null);
    setResolverType(null);
  };

  // Resolver Modal Actions
  const openResolver = async (row: ReconciliationRow) => {
    setActiveResolverRow(row);
    setResolveDate(new Date().toISOString().split('T')[0]);
    setResolveNotes('Reconciliation Adjusting Entry');
    
    let resolvedType: 'BUY' | 'SELL' | 'SPLIT' | 'EDIT' = 'BUY';
    let qty = 0;
    let price = 0;

    if (row.action === 'BUY') {
      resolvedType = 'BUY';
      qty = Math.abs(row.diff_qty);
      price = row.zerodha_avg || 0;
    } else if (row.action === 'SELL') {
      resolvedType = 'SELL';
      qty = Math.abs(row.diff_qty);
      price = row.zerodha_avg || row.db_avg || 0;
    } else if (row.action === 'SPLIT') {
      resolvedType = 'SPLIT';
      const ratio = row.zerodha_qty / (row.db_qty || 1);
      if (Math.abs(ratio - 2.0) < 0.1) {
        setSplitNumerator(2);
        setSplitDenominator(1);
        setSplitActionType('Split');
      } else if (Math.abs(ratio - 10.0) < 0.1) {
        setSplitNumerator(10);
        setSplitDenominator(1);
        setSplitActionType('Split');
      } else {
        setSplitNumerator(Math.round(ratio));
        setSplitDenominator(1);
        setSplitActionType('Bonus');
      }
    } else if (row.action === 'EDIT' || row.status === 'PRICE_MISMATCH') {
      resolvedType = 'EDIT';
      qty = row.db_qty;
      price = row.zerodha_avg;
      // Fetch transaction history
      await fetchTxHistory(row.symbol);
    }

    setResolverType(resolvedType);
    setResolveQty(qty);
    setResolvePrice(price);
  };

  const fetchTxHistory = async (symbol: string) => {
    setLoadingHistory(true);
    setEditingTxId(null);
    try {
      const queryParams = new URLSearchParams({
        search: symbol,
        portfolios: targetPortfolio,
        limit: '100'
      });
      const res = await fetch(`/api/transactions?${queryParams.toString()}`);
      const data = await res.json();
      if (data && data.data) {
        // filter down strictly to correct symbol
        const exactMatches = data.data.filter((tx: any) => tx.symbol.toUpperCase() === symbol.toUpperCase());
        setTxHistory(exactMatches);
      }
    } catch (err) {
      console.error('Error fetching transaction history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handlePostTradeAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeResolverRow || !resolverType) return;
    setIsSubmitting(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const netAmount = resolveQty * resolvePrice;
      const success = await onAddTransaction({
        date: resolveDate,
        portfolio: targetPortfolio,
        type: resolverType === 'BUY' ? 'Buy' : 'Sell',
        symbol: activeResolverRow.symbol,
        isin: activeResolverRow.isin || 'UNKNOWN',
        quantity: resolveQty,
        price: resolvePrice,
        net_amount: netAmount,
        gross_amount: netAmount,
        brokerage: 0,
        source: 'Manual',
        notes: resolveNotes
      });

      if (success) {
        setSuccessMsg(`Successfully posted adjusting ${resolverType} trade for ${activeResolverRow.symbol}!`);
        setActiveResolverRow(null);
        setResolverType(null);
        // Refresh reconciliation sheet in-place
        if (file) {
          executeReconcile(file, mappings);
        }
      } else {
        setErrorMsg('Failed to post transaction.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error posting transaction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplySplit = async () => {
    if (!activeResolverRow) return;
    setIsSubmitting(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      // 1. Create manual Corporate Action
      const caRes = await fetch('/api/corporate-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record_date: resolveDate,
          symbol: activeResolverRow.symbol,
          isin: activeResolverRow.isin || 'UNKNOWN',
          action_type: splitActionType.toUpperCase(),
          numerator: splitNumerator,
          denominator: splitDenominator,
          details: `${splitActionType} applied during portfolio audit.`
        })
      });
      const caData = await caRes.json();

      if (caData.success) {
        // 2. Apply it immediately to trigger ledger processing
        const applyRes = await fetch('/api/corporate-actions/apply', {
          method: 'POST'
        });
        const applyData = await applyRes.json();

        if (applyData.success) {
          setSuccessMsg(`Successfully applied ${splitActionType} corporate action for ${activeResolverRow.symbol}!`);
          setActiveResolverRow(null);
          setResolverType(null);
          if (file) {
            executeReconcile(file, mappings);
          }
        } else {
          setErrorMsg(applyData.message || 'Failed to execute corporate action calculations.');
        }
      } else {
        setErrorMsg(caData.message || 'Failed to save corporate action record.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error processing corporate action.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditHistoryTx = (tx: any) => {
    setEditingTxId(tx.id);
    setEditTxPrice(tx.price);
    setEditTxQty(tx.quantity);
    setEditTxDate(tx.date.split('T')[0]);
  };

  const handleSaveHistoryTx = async (txId: number) => {
    setLoadingHistory(true);
    try {
      const netAmount = editTxQty * editTxPrice;
      const res = await fetch(`/api/transactions/${txId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: txId,
          date: editTxDate,
          portfolio: targetPortfolio,
          type: txHistory.find(t => t.id === txId)?.type || 'Buy',
          symbol: activeResolverRow?.symbol,
          isin: activeResolverRow?.isin || 'UNKNOWN',
          quantity: editTxQty,
          price: editTxPrice,
          net_amount: netAmount,
          gross_amount: netAmount,
          brokerage: 0
        })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg('Ledger transaction updated successfully!');
        setEditingTxId(null);
        if (activeResolverRow) {
          await fetchTxHistory(activeResolverRow.symbol);
        }
        if (file) {
          executeReconcile(file, mappings);
        }
      } else {
        setErrorMsg(data.message || 'Failed to update transaction.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error updating transaction.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleDeleteHistoryTx = async (txId: number) => {
    if (!window.confirm('Are you sure you want to delete this trade record? This will instantly trigger recalculations.')) return;
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/transactions/${txId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg('Transaction removed from ledger.');
        setEditingTxId(null);
        if (activeResolverRow) {
          await fetchTxHistory(activeResolverRow.symbol);
        }
        if (file) {
          executeReconcile(file, mappings);
        }
      } else {
        setErrorMsg(data.message || 'Failed to delete transaction.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error deleting transaction.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const typeLabel = reconcileType === 'pms' ? 'PMS' : 'Broker';

  return (
    <div className="space-y-6">
      {/* Header and Type/Portfolio Selectors */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
            <Coins className="text-emerald-400 w-8 h-8" />
            Audit & Reconciliation
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Compare uploaded broker sheets or PMS current holdings reports against internal databases, auto-detect discrepancies, and apply corrective fixes instantly.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 self-start lg:self-center">
          {/* Reconciliation Type Segment Toggle */}
          <div className="bg-slate-950 border border-slate-800 p-1 rounded-xl flex gap-1">
            <button
              type="button"
              onClick={() => { setReconcileType('pms'); reset(); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold tracking-tight transition-all cursor-pointer ${
                reconcileType === 'pms'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Briefcase size={14} />
              PMS 100% Audit Suite
            </button>
            <button
              type="button"
              onClick={() => { setReconcileType('broker'); reset(); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold tracking-tight transition-all cursor-pointer ${
                reconcileType === 'broker'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Coins size={14} />
              Broker / File Upload
            </button>
          </div>

          {/* Target Portfolio override dropdown */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-xl text-xs font-semibold">
            <span className="text-slate-400">Audit Portfolio:</span>
            <select
              value={targetPortfolio}
              onChange={(e) => { setTargetPortfolio(e.target.value); reset(); }}
              className="bg-transparent text-emerald-400 font-bold focus:outline-none cursor-pointer pr-1"
            >
              {portfolios.map(p => (
                <option key={p} value={p} className="bg-slate-950 text-slate-200">{p}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-950/20 border border-emerald-500/20 text-emerald-400 text-sm rounded-xl flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <p className="font-semibold">{successMsg}</p>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-slate-500 hover:text-slate-300">
            <X size={16} />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-950/20 border border-rose-500/20 text-rose-300 text-sm rounded-xl flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed font-semibold">{errorMsg}</p>
          </div>
          <button onClick={() => setErrorMsg('')} className="text-slate-500 hover:text-slate-300">
            <X size={16} />
          </button>
        </div>
      )}

      {needsMapping ? (
        /* Needs Mapping View */
        <div className="max-w-xl mx-auto glass-card rounded-2xl p-6 border border-slate-800/80 space-y-4">
          <div className="flex items-start gap-3 border-b border-slate-800 pb-4">
            <HelpCircle className="w-6 h-6 text-amber-400 shrink-0" />
            <div>
              <h3 className="font-display font-semibold text-lg text-slate-100">Unresolved Scrip Mappings</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                The spreadsheet contains {unmatched.length} company names that don't match your master tickers list. Please map them below.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-sm">
            {masterTickers.length > 0 && (
              <datalist id="reconcile-master-tickers-list">
                {masterTickers.map((t: any) => (
                  <option key={t.symbol} value={t.symbol}>{t.name}</option>
                ))}
              </datalist>
            )}
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {unmatched.map((row) => (
                <div key={row.original} className="flex flex-col gap-1.5 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-slate-300 font-bold">{row.original}</span>
                    <span className="text-slate-500">Spreadsheet Row</span>
                  </div>
                  <input
                    type="text"
                    list="reconcile-master-tickers-list"
                    value={mappings[row.original] || ''}
                    onChange={(e) => setMappings({ ...mappings, [row.original]: e.target.value.toUpperCase() })}
                    placeholder="Enter NSE/BSE Symbol (e.g. RELIANCE, TCS)"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={reset}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Apply Mappings & Reconcile'}
              </button>
            </div>
          </form>
        </div>
      ) : reconcileType === 'pms' ? (
        /* PMS 100% Traceable Multi-Asset Audit Suite Mode */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                      <Briefcase className="w-5 h-5" />
                    </span>
                    <h3 className="text-xl font-bold text-slate-100 font-display">PMS 100% Traceable Multi-Asset Audit Suite</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Traceably reconciles stock holding quantities, in-kind securities contributions, TDS tax deductions, and cash in hand including T+1/T+2 trade settlement buffers.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-xs">
                    <span className="text-slate-400">Initial Cash Base:</span>
                    <span className="font-mono text-emerald-400 font-bold">₹{(initialCashInput / 10000000).toFixed(2)} Cr</span>
                  </div>
                  
                  <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-xs">
                    <span className="text-slate-400">T+1/T+2 Buffer:</span>
                    <span className="font-mono text-emerald-400 font-bold">{settlementDaysInput} Days</span>
                  </div>

                  <button
                    onClick={runPmsAudit}
                    disabled={isAuditingPms}
                    className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isAuditingPms ? 'animate-spin' : ''}`} />
                    {isAuditingPms ? 'Auditing Ledger...' : 'Run 100% Traceable Audit'}
                  </button>
                </div>
              </div>

              {/* Display Audit Results */}
              {pmsAuditReport && (
                <div className="space-y-6 animate-fade-in">
                  {/* Status Banner */}
                  <div className={`p-4 rounded-xl border flex items-start justify-between gap-4 ${
                    pmsAuditReport.overallStatus.includes('100% RECONCILED')
                      ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
                      : pmsAuditReport.overallStatus.includes('PENDING SETTLEMENT')
                      ? 'bg-sky-950/30 border-sky-500/30 text-sky-200'
                      : 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                  }`}>
                    <div className="flex items-start gap-3">
                      {pmsAuditReport.overallStatus.includes('100% RECONCILED') ? (
                        <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <Clock className="w-6 h-6 text-sky-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <h4 className="font-bold text-base">{pmsAuditReport.overallStatus}</h4>
                        <p className="text-xs text-slate-300 mt-0.5">
                          Audit executed for portfolio <strong className="font-mono text-emerald-400">{pmsAuditReport.portfolio}</strong> from {pmsAuditReport.startDate} to {pmsAuditReport.auditDate} across {pmsAuditReport.totalTransactionsParsed} transactions.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs shrink-0">
                      <div className="bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 text-center">
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Matched</span>
                        <strong className="text-emerald-400 text-sm font-mono">{pmsAuditReport.matchedCount}</strong>
                      </div>
                      <div className="bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 text-center">
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">T+1/T+2 Pending</span>
                        <strong className="text-sky-400 text-sm font-mono">{pmsAuditReport.settlementPendingCount}</strong>
                      </div>
                      <div className="bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 text-center">
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Mismatches</span>
                        <strong className="text-rose-400 text-sm font-mono">{pmsAuditReport.discrepancyCount}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Cash & Capital Reconciliation Summary Cards */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                      1. Cash Ledger &amp; Capital Reconciliation Summary
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Initial Cash Base</span>
                        <strong className="text-emerald-400 font-mono text-lg block">₹{formatINR(pmsAuditReport.cashRecon.initialCashContribution)}</strong>
                        <span className="text-[10px] text-slate-500 block">Initial ₹1.40 Cr deposit</span>
                      </div>

                      <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">In-Kind Securities Contribution</span>
                        <strong className="text-emerald-400 font-mono text-lg block">₹{formatINR(pmsAuditReport.cashRecon.inKindSecuritiesValue)}</strong>
                        <span className="text-[10px] text-slate-500 block">Initial share transfer value</span>
                      </div>

                      <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Total TDS Paid</span>
                        <strong className="text-amber-400 font-mono text-lg block">₹{formatINR(pmsAuditReport.cashRecon.tdsPaid)}</strong>
                        <span className="text-[10px] text-slate-500 block">Tax deducted at source</span>
                      </div>

                      <div className="p-3.5 bg-emerald-950/20 border border-emerald-500/30 rounded-xl space-y-1">
                        <span className="text-[10px] text-emerald-400 uppercase font-bold block">Reconstructed Cash in Hand</span>
                        <strong className="text-emerald-400 font-mono text-lg block">₹{formatINR(pmsAuditReport.cashRecon.reconstructedCashInHand)}</strong>
                        <span className="text-[10px] text-emerald-300 block">Net bank balance in hand</span>
                      </div>
                    </div>
                  </div>

                  {/* Stock Quantity Audit Table */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                      2. Stock Quantity Reconciliation Table (100% Traceable)
                    </h4>
                    <div className="overflow-x-auto border border-slate-800 rounded-xl">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[10px] uppercase font-bold tracking-wider">
                            <th className="py-3 px-4">Scrip Symbol</th>
                            <th className="py-3 px-4 text-right">Statement Qty</th>
                            <th className="py-3 px-4 text-right">Ledger Qty</th>
                            <th className="py-3 px-4 text-right">Unsettled Buffer (T+1/T+2)</th>
                            <th className="py-3 px-4 text-center">Status</th>
                            <th className="py-3 px-4">Audit Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 bg-slate-950/40 font-mono">
                          {pmsAuditReport.stockRecon.map((item: any) => (
                            <tr key={item.symbol} className="hover:bg-slate-900/50 transition-colors">
                              <td className="py-3 px-4 font-bold text-slate-200">
                                {item.symbol}
                                {item.isin && <span className="block text-[9px] text-slate-500 font-normal">{item.isin}</span>}
                              </td>
                              <td className="py-3 px-4 text-right text-slate-200">{item.statementQty}</td>
                              <td className="py-3 px-4 text-right text-slate-300">{item.ledgerQty}</td>
                              <td className="py-3 px-4 text-right text-sky-400 font-semibold">{item.unsettledQtyT1T2 !== 0 ? item.unsettledQtyT1T2 : '-'}</td>
                              <td className="py-3 px-4 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                  item.status === 'MATCHED'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : item.status === 'SETTLEMENT_PENDING_T1_T2'
                                    ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                }`}>
                                  {item.status === 'MATCHED' ? 'MATCHED (100%)' : item.status === 'SETTLEMENT_PENDING_T1_T2' ? 'SETTLEMENT PENDING (T+1/T+2)' : 'DISCREPANCY'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-slate-400 font-sans text-xs">{item.notes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
              {/* File Upload Dropzone for Custom PMS Statements */}
              <div className="pt-6 border-t border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  3. Upload Statement CSV / Bank Book / Demat Holdings File
                </h4>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-2xl p-8 text-center flex flex-col items-center justify-center transition-all cursor-pointer ${
                      dragActive 
                        ? 'border-emerald-500 bg-emerald-950/10' 
                        : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                    }`}
                  >
                    <UploadCloud className={`w-10 h-10 mb-2 ${dragActive ? 'text-emerald-400 animate-bounce' : 'text-slate-500'}`} />
                    
                    <h3 className="font-display font-semibold text-sm text-slate-200 mb-1">
                      Drag &amp; Drop Statements, Bank Books or Holdings CSVs Here
                    </h3>
                    <p className="text-xs text-slate-400 max-w-sm">
                      Upload transaction ledgers (.csv, .xlsx), bank book statements, or demat holdings statements.
                    </p>

                    <label className="mt-4 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 font-semibold px-4 py-2 rounded-xl cursor-pointer text-xs transition-colors block">
                      Browse Local Files
                      <input
                        type="file"
                        accept=".csv,.xlsx,.xls,.pdf"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>

                    {file && (
                      <div className="mt-4 flex items-center gap-2 bg-emerald-950/20 border border-emerald-500/20 px-3 py-1.5 rounded-xl text-xs text-emerald-400 font-mono font-medium animate-fade-in">
                        <FileSpreadsheet className="w-4 h-4" />
                        {file.name} ({Math.round(file.size / 1024)} KB)
                      </div>
                    )}
                  </div>

                  {file && (
                    <button
                      type="submit"
                      disabled={!file}
                      className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 text-slate-950 font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2"
                    >
                      <RefreshCw size={14} /> Parse &amp; Upload Statement File
                    </button>
                  )}
                </form>
              </div>
            </div>
      ) : (
        /* Broker File Upload Station */
        <div className="max-w-xl mx-auto">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-12 text-center flex flex-col items-center justify-center transition-all cursor-pointer ${
                dragActive 
                  ? 'border-emerald-500 bg-emerald-950/10' 
                  : 'border-slate-800 bg-slate-900/30 hover:border-slate-700'
              }`}
            >
              <UploadCloud className={`w-14 h-14 mb-4 ${dragActive ? 'text-emerald-400 animate-bounce' : 'text-slate-500'}`} />
              
              <h3 className="font-display font-semibold text-lg text-slate-200 mb-1">
                Upload {typeLabel} Holdings Sheet / Statement CSV
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mb-2">
                Supports standard excel spreadsheets (.xlsx, .xls) or csv reports containing holdings details.
              </p>
              <div className="bg-slate-950/50 border border-slate-800 px-4 py-2 rounded-xl text-[10px] text-slate-500 max-w-md mt-2 font-mono text-left space-y-1">
                <span className="text-slate-400 font-bold block mb-1">Required Schema Elements:</span>
                <p>• Quantity (e.g. Quantity, Qty, Balance, Units, Holding)</p>
                <p>• Identifier (e.g. ISIN, Symbol, Stock, Scrip, Instrument)</p>
                <p>• Cost Price (e.g. Avg Price, Average, Buy Price, Cost, Purchase) - for price comparison</p>
              </div>

              <label className="mt-6 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 font-semibold px-5 py-2.5 rounded-xl cursor-pointer text-sm transition-colors block">
                Browse Spreadsheet
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {file && (
                <div className="mt-6 flex items-center gap-2 bg-emerald-950/20 border border-emerald-500/20 px-4 py-2 rounded-xl text-xs text-emerald-400 font-mono font-medium animate-fade-in">
                  <FileSpreadsheet className="w-4 h-4" />
                  {file.name} ({Math.round(file.size / 1024)} KB)
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!file}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold rounded-xl transition-colors cursor-pointer shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2"
            >
              <RefreshCw size={16} /> Run Portfolio Reconciliation Audit
            </button>
          </form>
        </div>
      )}

      {reconcileType === 'broker' && reconciliation.length > 0 && (
        /* Results Table View */
        <div className="space-y-4 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-display text-xl font-bold text-slate-200 tracking-tight">Audit Report: <span className="text-emerald-400">{targetPortfolio}</span></h3>
              <div className="flex items-center gap-2 bg-emerald-950/20 border border-emerald-500/20 px-3 py-1 rounded-full text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Audit Complete ({typeLabel} source)
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={downloadReconciliationCSV}
                className="flex items-center justify-center gap-2 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:text-emerald-400 text-slate-300 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download CSV
              </button>
              
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search symbol, guidance, status..."
                  className="w-full sm:w-64 bg-slate-900/60 border border-slate-800 focus:border-emerald-500 text-slate-200 text-sm rounded-xl pl-10 pr-4 py-2 focus:outline-none transition-colors"
                />
                <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-500" />
              </div>

              <button
                onClick={reset}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Reconcile New File
              </button>
            </div>
          </div>

          {/* Mobile Horizontal Scroll Hint */}
          <div className="lg:hidden flex items-center justify-between text-[11px] font-mono px-3.5 py-2 mb-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 shadow-sm">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              Swipe table horizontally to inspect all reconciliation columns
            </span>
            <span className="text-cyan-400 font-bold text-xs">⟷</span>
          </div>

          {/* Reconciliation Table */}
          <div className="overflow-x-auto touch-scroll-container rounded-2xl border border-slate-800/80 bg-slate-950">
            <table className="min-w-[980px] w-full divide-y divide-slate-800/60 text-sm">
              <thead className="bg-slate-900/60 text-slate-400 uppercase font-semibold text-[10px] tracking-wider select-none">
                <tr>
                  <th className="px-6 py-4 text-left cursor-pointer hover:text-slate-200 transition-colors" onClick={() => toggleSort('symbol')}>
                    <div className="flex items-center gap-1">Company Symbol {renderSortIcon('symbol')}</div>
                  </th>
                  <th className="px-6 py-4 text-right cursor-pointer hover:text-slate-200 transition-colors" onClick={() => toggleSort('zerodha_qty')}>
                    <div className="flex items-center justify-end gap-1">Actual Qty ({typeLabel}) {renderSortIcon('zerodha_qty')}</div>
                  </th>
                  <th className="px-6 py-4 text-right cursor-pointer hover:text-slate-200 transition-colors" onClick={() => toggleSort('db_qty')}>
                    <div className="flex items-center justify-end gap-1">Tracker Qty (DB) {renderSortIcon('db_qty')}</div>
                  </th>
                  <th className="px-6 py-4 text-right cursor-pointer hover:text-slate-200 transition-colors" onClick={() => toggleSort('diff_qty')}>
                    <div className="flex items-center justify-end gap-1">Qty Difference {renderSortIcon('diff_qty')}</div>
                  </th>
                  <th className="px-6 py-4 text-right cursor-pointer hover:text-slate-200 transition-colors" onClick={() => toggleSort('zerodha_avg')}>
                    <div className="flex items-center justify-end gap-1">Actual Avg Buy Price {renderSortIcon('zerodha_avg')}</div>
                  </th>
                  <th className="px-6 py-4 text-right cursor-pointer hover:text-slate-200 transition-colors" onClick={() => toggleSort('db_avg')}>
                    <div className="flex items-center justify-end gap-1">Tracker Avg Buy Price {renderSortIcon('db_avg')}</div>
                  </th>
                  <th className="px-6 py-4 text-left cursor-pointer hover:text-slate-200 transition-colors" onClick={() => toggleSort('status')}>
                    <div className="flex items-center gap-1">Diagnostic Status {renderSortIcon('status')}</div>
                  </th>
                  <th className="px-6 py-4 text-left">Audit Resolution Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-slate-300 font-medium">
                {sortedReconciliation.map((r) => {
                  const statusColors = {
                    RECONCILED: 'bg-emerald-950/40 text-emerald-400 border-emerald-500/20',
                    MISSING_IN_PORTFOLIO: 'bg-cyan-950/40 text-cyan-400 border-cyan-500/20',
                    PHANTOM_HOLDING: 'bg-rose-950/40 text-rose-400 border-rose-500/20',
                    QUANTITY_MISMATCH: 'bg-amber-950/40 text-amber-400 border-amber-500/20',
                    PRICE_MISMATCH: 'bg-orange-950/40 text-orange-400 border-orange-500/20'
                  };

                  const isMismatch = r.status !== 'RECONCILED';

                  return (
                    <tr key={r.symbol} className="hover:bg-slate-900/40 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <span className="font-display font-semibold text-slate-100">{r.symbol}</span>
                          <span className="text-[10px] text-slate-500 font-mono block">{r.isin}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-slate-200">
                        {r.zerodha_qty.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-slate-200">
                        {r.db_qty.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </td>
                      <td className={`px-6 py-4 text-right font-mono font-bold ${
                        r.diff_qty === 0 ? 'text-slate-400' : r.diff_qty > 0 ? 'text-rose-400' : 'text-cyan-400'
                      }`}>
                        {r.diff_qty === 0 ? '0' : r.diff_qty > 0 ? `+${r.diff_qty.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : r.diff_qty.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </td>
                      <td className="px-6 py-4 text-right font-mono">
                        {r.zerodha_avg > 0 ? formatCurrency(r.zerodha_avg) : '-'}
                      </td>
                      <td className="px-6 py-4 text-right font-mono">
                        {r.db_avg > 0 ? formatCurrency(r.db_avg) : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide border ${statusColors[r.status]}`}>
                          {r.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {isMismatch ? (
                          <div className="space-y-2">
                            <p className="text-slate-400 text-xs font-mono line-clamp-2 max-w-[220px] mb-1 leading-normal">{r.reason}</p>
                            <button
                              onClick={() => openResolver(r)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center gap-1 ${
                                r.action === 'BUY' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500 hover:text-slate-950' :
                                r.action === 'SELL' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500 hover:text-slate-950' :
                                r.action === 'SPLIT' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500 hover:text-slate-950' :
                                'bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500 hover:text-slate-950'
                              }`}
                            >
                              {r.action === 'BUY' && <Plus size={12} />}
                              {r.action === 'SELL' && <Trash2 size={12} />}
                              {r.action === 'SPLIT' && <RefreshCw size={12} />}
                              {r.action === 'EDIT' && <Edit2 size={12} />}
                              Fix Mismatch
                            </button>
                          </div>
                        ) : (
                          <span className="text-emerald-500 text-xs font-mono flex items-center gap-1.5 font-bold">
                            <CheckCircle2 size={14} /> Perfect Alignment
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Interactive Resolution Drawer/Modal */}
      <AnimatePresence>
        {activeResolverRow && resolverType && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
                <div>
                  <h3 className="font-display font-bold text-lg text-slate-100 flex items-center gap-2">
                    {resolverType === 'BUY' && <Plus className="text-cyan-400" size={20} />}
                    {resolverType === 'SELL' && <Trash2 className="text-rose-400" size={20} />}
                    {resolverType === 'SPLIT' && <RefreshCw className="text-amber-400 animate-spin" size={20} />}
                    {resolverType === 'EDIT' && <Edit2 className="text-orange-400" size={20} />}
                    Resolve Mismatch for {activeResolverRow.symbol}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">ISIN: {activeResolverRow.isin} • Portfolio: {targetPortfolio}</p>
                </div>
                <button
                  onClick={() => { setActiveResolverRow(null); setResolverType(null); }}
                  className="text-slate-400 hover:text-slate-200 p-1 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-4 flex-1">
                {/* Diagnostic box */}
                <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl space-y-2">
                  <span className="text-[10px] font-mono uppercase font-bold text-slate-500 tracking-wider">System Diagnostic Details</span>
                  <p className="text-sm text-slate-300 font-mono leading-relaxed">{activeResolverRow.reason}</p>
                  
                  <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-slate-900/60 text-xs">
                    <div>
                      <span className="text-slate-500 block">Actual Uploaded Qty ({typeLabel}):</span>
                      <strong className="text-slate-200 font-mono text-sm">{activeResolverRow.zerodha_qty.toLocaleString(undefined, { maximumFractionDigits: 4 })}</strong>
                      {activeResolverRow.zerodha_avg > 0 && (
                        <span className="text-slate-500 block text-[10px] mt-0.5">Price: {formatCurrency(activeResolverRow.zerodha_avg)}</span>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-500 block">Calculated DB Qty (Tracker):</span>
                      <strong className="text-slate-200 font-mono text-sm">{activeResolverRow.db_qty.toLocaleString(undefined, { maximumFractionDigits: 4 })}</strong>
                      {activeResolverRow.db_avg > 0 && (
                        <span className="text-slate-500 block text-[10px] mt-0.5">Price: {formatCurrency(activeResolverRow.db_avg)}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Forms depending on recommended action */}
                {(resolverType === 'BUY' || resolverType === 'SELL') && (
                  <form onSubmit={handlePostTradeAction} className="space-y-4 pt-1">
                    <div className="bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-lg text-xs text-slate-300 flex items-start gap-2">
                      <Info className="text-emerald-400 shrink-0 mt-0.5" size={14} />
                      <p>
                        Posting an adjusting <strong>{resolverType}</strong> trade will add a transaction record to your ledger database. This adjusts the dynamically calculated FIFO holdings and reconciles the variance.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-slate-400 block mb-1 font-bold">Transaction Date</label>
                        <input
                          type="date"
                          value={resolveDate}
                          onChange={(e) => setResolveDate(e.target.value)}
                          required
                          className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 text-sm text-slate-200 px-3 py-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1 font-bold">Adjusting Quantity</label>
                        <input
                          type="number"
                          step="any"
                          value={resolveQty}
                          onChange={(e) => setResolveQty(parseFloat(e.target.value) || 0)}
                          required
                          className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 text-sm text-slate-200 px-3 py-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-slate-400 block mb-1 font-bold">Share Cost / Price (INR)</label>
                        <input
                          type="number"
                          step="any"
                          value={resolvePrice}
                          onChange={(e) => setResolvePrice(parseFloat(e.target.value) || 0)}
                          required
                          className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 text-sm text-slate-200 px-3 py-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1 font-bold">Total Adjusted Amount</label>
                        <div className="w-full bg-slate-950 border border-slate-800 text-sm text-slate-500 px-3 py-2.5 rounded-xl font-mono">
                          {formatCurrency(resolveQty * resolvePrice)}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 block mb-1 font-bold">Audit Adjusting Note</label>
                      <textarea
                        value={resolveNotes}
                        onChange={(e) => setResolveNotes(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 text-sm text-slate-200 px-3 py-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 min-h-16 resize-none"
                      />
                    </div>

                    <div className="flex gap-3 pt-3 border-t border-slate-800 bg-slate-900">
                      <button
                        type="button"
                        onClick={() => { setActiveResolverRow(null); setResolverType(null); }}
                        className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className={`flex-1 py-3 text-slate-950 font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          resolverType === 'BUY' ? 'bg-cyan-400 hover:bg-cyan-500 shadow-md shadow-cyan-400/10' : 'bg-rose-400 hover:bg-rose-500 shadow-md shadow-rose-400/10'
                        }`}
                      >
                        {isSubmitting ? 'Posting...' : `Post Adjusting ${resolverType} Trade`}
                      </button>
                    </div>
                  </form>
                )}

                {resolverType === 'SPLIT' && (
                  <div className="space-y-4 pt-1">
                    <div className="bg-amber-500/5 border border-amber-500/10 p-3.5 rounded-lg text-xs text-slate-300 flex items-start gap-2">
                      <Info className="text-amber-400 shrink-0 mt-0.5" size={14} />
                      <p>
                        Corporate actions like Splits or Bonuses multiply your holdings on a specific record date without actual BUY transactions. The system automatically calculates shares eligible on that date and splits them.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-slate-400 block mb-1 font-bold font-sans">Ex/Record Date</label>
                        <input
                          type="date"
                          value={resolveDate}
                          onChange={(e) => setResolveDate(e.target.value)}
                          required
                          className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 text-sm text-slate-200 px-3 py-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1 font-bold">Action Event Type</label>
                        <select
                          value={splitActionType}
                          onChange={(e) => setSplitActionType(e.target.value as 'Split' | 'Bonus')}
                          className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 text-sm text-slate-200 px-3 py-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="Split">Stock Split</option>
                          <option value="Bonus">Bonus Issue</option>
                        </select>
                      </div>
                    </div>

                    <div className="bg-slate-950 border border-slate-800/60 p-4 rounded-xl flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="text-xs text-slate-400 font-bold block">Apply Multiplier Ratio</span>
                        <p className="text-[10px] text-slate-500">For a standard 1:10 Split, the numerator is 10 and denominator is 1.</p>
                      </div>
                      <div className="flex items-center gap-3 font-mono font-bold">
                        <input
                          type="number"
                          value={splitNumerator}
                          onChange={(e) => setSplitNumerator(parseInt(e.target.value) || 1)}
                          className="w-16 bg-slate-900 border border-slate-800 text-center text-slate-200 py-1.5 rounded-lg"
                        />
                        <span className="text-slate-500 font-display">:</span>
                        <input
                          type="number"
                          value={splitDenominator}
                          onChange={(e) => setSplitDenominator(parseInt(e.target.value) || 1)}
                          className="w-16 bg-slate-900 border border-slate-800 text-center text-slate-200 py-1.5 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="flex gap-3 pt-3 border-t border-slate-800 bg-slate-900">
                      <button
                        type="button"
                        onClick={() => { setActiveResolverRow(null); setResolverType(null); }}
                        className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleApplySplit}
                        disabled={isSubmitting}
                        className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/10"
                      >
                        {isSubmitting ? 'Processing...' : `Apply Corporate ${splitActionType}`}
                      </button>
                    </div>
                  </div>
                )}

                {resolverType === 'EDIT' && (
                  <div className="space-y-4 pt-1">
                    <div className="bg-orange-500/5 border border-orange-500/10 p-3 rounded-lg text-xs text-slate-300 flex items-start gap-2">
                      <Info className="text-orange-400 shrink-0 mt-0.5" size={14} />
                      <p>
                        Your calculated average cost (INR {(activeResolverRow.db_avg || 0).toFixed(2)}) differs from the actual uploaded average buy cost (INR {(activeResolverRow.zerodha_avg || 0).toFixed(2)}). You can modify the price of previous manual BUY trade logs to balance the ledger.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <span className="text-xs text-slate-400 font-bold block">Transaction Ledger Entries in {targetPortfolio}</span>
                      
                      {loadingHistory ? (
                        <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
                          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                          <p className="text-xs font-mono">Fetching ledger history...</p>
                        </div>
                      ) : txHistory.length === 0 ? (
                        <div className="bg-slate-950/40 border border-slate-800 p-8 rounded-xl text-center text-xs text-slate-500 italic">
                          No transactions found for this symbol in portfolio {targetPortfolio}.
                        </div>
                      ) : (
                        <div className="border border-slate-800 rounded-xl overflow-hidden max-h-60 overflow-y-auto bg-slate-950/50">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold uppercase text-[9px] tracking-widest">
                                <th className="p-3">Date</th>
                                <th className="p-3">Type</th>
                                <th className="p-3 text-right">Qty</th>
                                <th className="p-3 text-right">Price (INR)</th>
                                <th className="p-3 text-right">Total (INR)</th>
                                <th className="p-3 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-900/60 font-mono text-slate-300">
                              {txHistory.map((tx) => {
                                const isEditing = editingTxId === tx.id;
                                return (
                                  <tr key={tx.id} className="hover:bg-slate-900/30">
                                    <td className="p-3">
                                      {isEditing ? (
                                        <input
                                          type="date"
                                          value={editTxDate}
                                          onChange={(e) => setEditTxDate(e.target.value)}
                                          className="bg-slate-900 border border-slate-800 text-xs text-slate-200 px-1 py-0.5 rounded focus:outline-none"
                                        />
                                      ) : (
                                        tx.date.split('T')[0]
                                      )}
                                    </td>
                                    <td className="p-3">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        String(tx.type).toUpperCase().includes('BUY') ? 'bg-cyan-500/10 text-cyan-400' : 'bg-rose-500/10 text-rose-400'
                                      }`}>
                                        {tx.type}
                                      </span>
                                    </td>
                                    <td className="p-3 text-right">
                                      {isEditing ? (
                                        <input
                                          type="number"
                                          step="any"
                                          value={editTxQty}
                                          onChange={(e) => setEditTxQty(parseFloat(e.target.value) || 0)}
                                          className="bg-slate-900 border border-slate-800 text-xs text-slate-200 text-right px-1 py-0.5 rounded focus:outline-none w-16"
                                        />
                                      ) : (
                                        tx.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })
                                      )}
                                    </td>
                                    <td className="p-3 text-right">
                                      {isEditing ? (
                                        <input
                                          type="number"
                                          step="any"
                                          value={editTxPrice}
                                          onChange={(e) => setEditTxPrice(parseFloat(e.target.value) || 0)}
                                          className="bg-slate-900 border border-slate-800 text-xs text-slate-200 text-right px-1 py-0.5 rounded focus:outline-none w-20"
                                        />
                                      ) : (
                                        formatCurrency(tx.price)
                                      )}
                                    </td>
                                    <td className="p-3 text-right text-slate-400 font-semibold">
                                      {isEditing 
                                        ? formatCurrency(editTxQty * editTxPrice) 
                                        : formatCurrency(tx.net_amount || (tx.quantity * tx.price))
                                      }
                                    </td>
                                    <td className="p-3 text-right">
                                      {isEditing ? (
                                        <div className="flex justify-end gap-1.5">
                                          <button
                                            onClick={() => handleSaveHistoryTx(tx.id)}
                                            className="text-emerald-400 hover:text-emerald-300 font-bold bg-slate-900 px-1.5 py-1 rounded border border-slate-800"
                                          >
                                            Save
                                          </button>
                                          <button
                                            onClick={() => setEditingTxId(null)}
                                            className="text-slate-400 hover:text-slate-200 bg-slate-900 px-1.5 py-1 rounded border border-slate-800"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex justify-end gap-2.5">
                                          <button
                                            onClick={() => handleEditHistoryTx(tx)}
                                            className="text-slate-400 hover:text-orange-400 p-0.5 hover:bg-slate-900 rounded"
                                            title="Edit ledger price/quantity"
                                          >
                                            <Edit2 size={13} />
                                          </button>
                                          <button
                                            onClick={() => handleDeleteHistoryTx(tx.id)}
                                            className="text-slate-500 hover:text-rose-400 p-0.5 hover:bg-slate-900 rounded"
                                            title="Delete ledger transaction"
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end pt-3 border-t border-slate-800 bg-slate-900">
                      <button
                        type="button"
                        onClick={() => { setActiveResolverRow(null); setResolverType(null); }}
                        className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-all cursor-pointer"
                      >
                        Close Resolution Assistant
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
}
}

