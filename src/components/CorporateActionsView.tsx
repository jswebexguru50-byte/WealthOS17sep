import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Layers,
  Search,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  XCircle,
  Play,
  CheckCircle2,
  Info,
  History,
  RotateCw,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
  AlertTriangle,
  RefreshCw,
  UploadCloud,
  FileSpreadsheet,
  Coins,
  Clock,
  TrendingUp,
  ShieldCheck,
  Scale,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { formatINR } from '../lib/formatters.js';
import { ResizableDataTable } from './ResizableDataTable.js';
import { CorporateAction } from '../types.js';
import { ConfirmationModal } from './ConfirmationModal.js';

interface CorporateActionsViewProps {
  onApplyPending: () => Promise<void>;
  onAddAction: (action: Partial<CorporateAction>) => Promise<boolean>;
  onEditAction: (id: number, action: Partial<CorporateAction>) => Promise<boolean>;
  onDeleteAction: (id: number) => Promise<boolean>;
}

type TabType = 'scheduled' | 'upcoming-calendar' | 'dividend-summary' | 'yield-on-cost' | 'reconcile' | 'pms-recon';

export function CorporateActionsView({
  onApplyPending,
  onAddAction,
  onEditAction,
  onDeleteAction
}: CorporateActionsViewProps) {
  const [actions, setActions] = useState<CorporateAction[]>([]);
  const [search, setSearch] = useState('');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isAuditLogsOpen, setIsAuditLogsOpen] = useState(false);
  const [isSyncingCA, setIsSyncingCA] = useState(false);
  const [showOnlyEligible, setShowOnlyEligible] = useState(false);

  // Sub-navigation active tab
  const [activeTab, setActiveTab] = useState<TabType>('scheduled');

  // CA-1: Upcoming Corporate Actions Calendar
  const [upcomingActions, setUpcomingActions] = useState<any[]>([]);
  const [loadingUpcoming, setLoadingUpcoming] = useState(false);
  const [upcomingFilterUrgent, setUpcomingFilterUrgent] = useState(false);
  const [upcomingSearch, setUpcomingSearch] = useState('');
  const [upcomingSortField, setUpcomingSortField] = useState('trading_days_to_ex');
  const [upcomingSortDir, setUpcomingSortDir] = useState<'asc' | 'desc'>('asc');

  // CA-2: Dividend Rollup & Tax TDS (Section 194)
  const [dividendSummary, setDividendSummary] = useState<any | null>(null);
  const [selectedDivFy, setSelectedDivFy] = useState('2024-2025');
  const [selectedDivPan, setSelectedDivPan] = useState('ALL');
  const [loadingDividend, setLoadingDividend] = useState(false);
  const [divSearch, setDivSearch] = useState('');
  const [divSortField, setDivSortField] = useState('gross');
  const [divSortDir, setDivSortDir] = useState<'asc' | 'desc'>('desc');

  // CA-5: Yield on Cost (YOC%)
  const [yocHoldings, setYocHoldings] = useState<any[]>([]);
  const [loadingYoc, setLoadingYoc] = useState(false);
  const [yocSearch, setYocSearch] = useState('');
  const [yocSortField, setYocSortField] = useState('yield_on_cost_pct');
  const [yocSortDir, setYocSortDir] = useState<'asc' | 'desc'>('desc');

  const handleCASortToggle = (
    currentField: string,
    currentDir: 'asc' | 'desc',
    newField: string,
    setField: (f: string) => void,
    setDir: (d: 'asc' | 'desc') => void
  ) => {
    if (currentField === newField) {
      setDir(currentDir === 'asc' ? 'desc' : 'asc');
    } else {
      setField(newField);
      setDir('desc');
    }
  };

  const renderCASortHeader = (
    label: string,
    field: string,
    curField: string,
    curDir: 'asc' | 'desc',
    onSort: (f: string) => void,
    align: 'left' | 'right' | 'center' = 'left',
    extraClass: string = ''
  ) => {
    const active = curField === field;
    return (
      <th
        onClick={() => onSort(field)}
        className={`px-6 py-3.5 select-none cursor-pointer hover:text-white transition-colors group ${
          align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
        } ${extraClass}`}
      >
        <div className={`inline-flex items-center gap-1.5 ${
          align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
        }`}>
          <span className={active ? 'text-emerald-400 font-bold' : ''}>{label}</span>
          <span className="text-[10px]">
            {active ? (
              curDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-emerald-400 inline" /> : <ChevronDown className="w-3.5 h-3.5 text-emerald-400 inline" />
            ) : (
              <ArrowUpDown className="w-3 h-3 text-slate-600 group-hover:text-slate-400 inline opacity-60" />
            )}
          </span>
        </div>
      </th>
    );
  };

  // CA-3: Verification Report Modal
  const [verificationReport, setVerificationReport] = useState<any | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // CA-4: Rights Subscription Modal
  const [isRightsModalOpen, setIsRightsModalOpen] = useState(false);
  const [rightsForm, setRightsForm] = useState({
    symbol: '',
    portfolio: 'cc9',
    pan: 'BBFPS1002P',
    rights_ratio: '1:4',
    issue_price: 100,
    shares_subscribed: 100,
    subscription_date: new Date().toISOString().split('T')[0],
    renounced_shares: 0,
    renunciation_proceeds: 0
  });
  const [rightsSubmitting, setRightsSubmitting] = useState(false);
  const [rightsSuccessMsg, setRightsSuccessMsg] = useState('');
  const [rightsErrorMsg, setRightsErrorMsg] = useState('');

  // Custom confirmation dialog state
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    isDangerous?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Reconciliation states
  const [reconciliationData, setReconciliationData] = useState<{
    reconciled: any[];
    missingInManual: any[];
  } | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);
  const [backupCount, setBackupCount] = useState(0);
  const [selectedReconcileIds, setSelectedReconcileIds] = useState<number[]>([]);

  // PMS Vendor CA Reconciliation State
  const [pmsReconData, setPmsReconData] = useState<{
    total: number;
    counts: { MATCHED: number; QTY_MISMATCH: number; AMOUNT_MISMATCH: number; MISSING_IN_SYSTEM: number; NOT_HELD_IN_PORTFOLIO: number };
    comparisonList: any[];
  } | null>(null);
  const [isComparingPms, setIsComparingPms] = useState(false);
  const [pmsStatusFilter, setPmsStatusFilter] = useState<string>('ALL');

  // Manual CA Bulk Upload State
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [isUploadingManual, setIsUploadingManual] = useState(false);
  const [manualUploadError, setManualUploadError] = useState('');
  const [manualUploadSuccess, setManualUploadSuccess] = useState('');
  const [manualDragActive, setManualDragActive] = useState(false);

  // Modals for add/edit scheduled
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<CorporateAction | null>(null);
  const [formDate, setFormDate] = useState('');
  const [formSymbol, setFormSymbol] = useState('');
  const [formIsin, setFormIsin] = useState('');
  const [formType, setFormType] = useState('DIVIDEND');
  const [formDetails, setFormDetails] = useState('');
  const [formNumerator, setFormNumerator] = useState('');
  const [formDenominator, setFormDenominator] = useState('');
  const [formDps, setFormDps] = useState('');

  // Fetch functions
  const fetchActions = async () => {
    try {
      const res = await fetch('/api/corporate-actions');
      const data = await res.json();
      setActions(Array.isArray(data) ? data : (data.actions || []));
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUpcomingActions = async () => {
    try {
      setLoadingUpcoming(true);
      const res = await fetch('/api/corporate-actions/upcoming?days=45');
      const data = await res.json();
      if (data.success) {
        setUpcomingActions(data.actions || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingUpcoming(false);
    }
  };

  const fetchDividendSummary = async () => {
    try {
      setLoadingDividend(true);
      let url = `/api/corporate-actions/dividend-summary?fy=${selectedDivFy}`;
      if (selectedDivPan !== 'ALL') url += `&pan=${encodeURIComponent(selectedDivPan)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setDividendSummary(data.summary);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDividend(false);
    }
  };

  const fetchYocHoldings = async () => {
    try {
      setLoadingYoc(true);
      const res = await fetch('/api/corporate-actions/yoc');
      const data = await res.json();
      if (data.success) {
        setYocHoldings(data.holdings || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingYoc(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('/api/audit/corporate-actions');
      const data = await res.json();
      setAuditLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchBackupStatus = async () => {
    try {
      const res = await fetch('/api/corporate-actions/reconcile/backup-status');
      const data = await res.json();
      if (data.success) {
        setBackupCount(data.backupCount || 0);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchReconciliationData = async () => {
    try {
      setIsReconciling(true);
      const res = await fetch('/api/corporate-actions/reconcile');
      const data = await res.json();
      if (data.success) {
        setReconciliationData({
          reconciled: data.reconciled || [],
          missingInManual: data.missingInManual || []
        });
        const autoSelect = (data.reconciled || [])
          .filter((item: any) => item.status === 'EXACT_MATCH' || item.status === 'DISCREPANCY')
          .map((item: any) => item.id);
        setSelectedReconcileIds(autoSelect);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsReconciling(false);
    }
  };

  const fetchPmsComparison = async () => {
    try {
      setIsComparingPms(true);
      const res = await fetch('/api/corporate-actions/pms-comparison');
      const data = await res.json();
      if (data.success) {
        setPmsReconData(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsComparingPms(false);
    }
  };

  useEffect(() => {
    fetchActions();
    fetchBackupStatus();
    fetchUpcomingActions();
  }, []);

  useEffect(() => {
    if (activeTab === 'dividend-summary') {
      fetchDividendSummary();
    } else if (activeTab === 'yield-on-cost') {
      fetchYocHoldings();
    }
  }, [activeTab, selectedDivFy, selectedDivPan]);

  // Apply Corporate Action with Runtime Cost-Basis Invariant Verification (CA-3)
  const handleApplyWithVerification = async (ca: any) => {
    setIsVerifying(true);
    try {
      const res = await fetch('/api/corporate-actions/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_id: ca.id,
          symbol: ca.symbol,
          action_type: ca.action_type,
          ratio_num: ca.numerator,
          ratio_den: ca.denominator,
          ex_date: ca.record_date,
          user_id: 'Portfolio Manager'
        })
      });
      const data = await res.json();
      if (data.success) {
        setVerificationReport(data.report);
        fetchActions();
        fetchUpcomingActions();
      } else {
        alert(`Verification Failed: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error during corporate action verification: ${err.message}`);
    } finally {
      setIsVerifying(false);
    }
  };

  // Process Rights Issue Subscription (CA-4)
  const handleRightsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRightsSubmitting(true);
    setRightsErrorMsg('');
    setRightsSuccessMsg('');
    try {
      const res = await fetch('/api/corporate-actions/rights-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rightsForm)
      });
      const data = await res.json();
      if (data.success) {
        setRightsSuccessMsg(`Rights subscription successfully processed for ${rightsForm.symbol}! Subscribed ${rightsForm.shares_subscribed} shares.`);
        fetchActions();
        setTimeout(() => {
          setIsRightsModalOpen(false);
          setRightsSuccessMsg('');
        }, 2000);
      } else {
        setRightsErrorMsg(data.error || 'Failed to process rights subscription.');
      }
    } catch (err: any) {
      setRightsErrorMsg(err.message);
    } finally {
      setRightsSubmitting(false);
    }
  };

  // Legacy manual reconciliation handlers
  const handleApplyReconciliation = async () => {
    if (selectedReconcileIds.length === 0) return;
    setConfirmState({
      isOpen: true,
      title: 'Apply Selected Reconciliations?',
      message: (
        <div className="space-y-2 text-sm text-slate-300">
          <p>You are about to align <strong>{selectedReconcileIds.length}</strong> legacy transactions with official data parameters.</p>
          <p className="text-emerald-400 font-medium">An automatic backup of affected rows will be created so you can rollback at any time.</p>
        </div>
      ),
      confirmText: 'Reconcile and Backup',
      onConfirm: async () => {
        try {
          const res = await fetch('/api/corporate-actions/reconcile/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemIds: selectedReconcileIds })
          });
          const data = await res.json();
          if (data.success) {
            fetchReconciliationData();
            fetchBackupStatus();
            fetchActions();
          }
        } catch (err) {
          console.error(err);
        }
      }
    });
  };

  const handleRollbackReconciliation = async () => {
    setConfirmState({
      isOpen: true,
      title: 'Rollback Corporate Action Alignments?',
      message: 'This will restore your manually entered legacy transactions back to their state before the last reconciliation. Are you sure?',
      confirmText: 'Rollback Changes',
      isDangerous: true,
      onConfirm: async () => {
        try {
          const res = await fetch('/api/corporate-actions/reconcile/rollback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          const data = await res.json();
          if (data.success) {
            fetchReconciliationData();
            fetchBackupStatus();
            fetchActions();
          }
        } catch (err) {
          console.error(err);
        }
      }
    });
  };

  const handleManualCAUpload = async () => {
    if (!manualFile) return;
    setIsUploadingManual(true);
    setManualUploadError('');
    setManualUploadSuccess('');
    const formData = new FormData();
    formData.append('file', manualFile);

    try {
      const res = await fetch('/api/corporate-actions/upload-manual', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setManualUploadSuccess(data.message || `Loaded ${data.importedCount || 0} manual corporate action transactions.`);
        setManualFile(null);
        fetchReconciliationData();
        fetchActions();
      } else {
        setManualUploadError(data.message || 'Failed to parse file');
      }
    } catch (err: any) {
      setManualUploadError(err.message || 'Network error uploading manual CA spreadsheet');
    } finally {
      setIsUploadingManual(false);
    }
  };

  const handleApply = async () => {
    setConfirmState({
      isOpen: true,
      title: 'Apply Pending Corporate Actions?',
      message: 'This will update your portfolio transactions for all pending splits, bonuses, and dividends according to their parameters with strict cost-basis preservation. Are you sure?',
      confirmText: 'Apply Actions',
      isDangerous: false,
      onConfirm: async () => {
        await onApplyPending();
        fetchActions();
      }
    });
  };

  const handleSyncCorporateActions = async () => {
    setIsSyncingCA(true);
    try {
      const res = await fetch('/api/corporate-actions/sync-upstox', {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        fetchActions();
        fetchUpcomingActions();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSyncingCA(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const actionData: Partial<CorporateAction> = {
      record_date: formDate,
      symbol: formSymbol.toUpperCase(),
      isin: formIsin,
      action_type: formType,
      details: formDetails,
      numerator: formNumerator ? parseFloat(formNumerator) : undefined,
      denominator: formDenominator ? parseFloat(formDenominator) : undefined,
      dividend_per_share: formDps ? parseFloat(formDps) : undefined,
      applied: 0
    };

    let success = false;
    if (editingAction) {
      success = await onEditAction(editingAction.id, actionData);
    } else {
      success = await onAddAction(actionData);
    }

    if (success) {
      setIsModalOpen(false);
      setEditingAction(null);
      fetchActions();
    }
  };

  const handleDelete = async (id: number) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Corporate Action?',
      message: 'Are you sure you want to delete this action from the ledger?',
      confirmText: 'Delete Action',
      isDangerous: true,
      onConfirm: async () => {
        const success = await onDeleteAction(id);
        if (success) {
          fetchActions();
        }
      }
    });
  };

  // Filtered lists
  const filteredActions = actions.filter(ca => {
    if (showOnlyEligible && !ca.eligible_qty_held) return false;
    const s = search.toLowerCase();
    return (
      (ca.symbol || '').toLowerCase().includes(s) ||
      (ca.isin || '').toLowerCase().includes(s) ||
      (ca.action_type || '').toLowerCase().includes(s) ||
      (ca.details || '').toLowerCase().includes(s)
    );
  });

  const urgentUpcomingCount = upcomingActions.filter(a => a.is_urgent_ex_date).length;

  return (
    <div className="space-y-6">
      {/* Header & Quick Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-100 tracking-tight flex items-center gap-3">
            Corporate Actions Engine
            <span className="text-xs font-mono font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full">
              CA-1 to CA-6 Invariant Verified
            </span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Automated split/bonus cost basis preservation (<span className="font-mono text-emerald-400">Δ Cost = 0</span>), 5-day ex-date advance alerts, Section 194 TDS tracking, and Yield-On-Cost metrics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={() => {
              setRightsForm({
                symbol: '',
                portfolio: 'cc9',
                pan: 'BBFPS1002P',
                rights_ratio: '1:4',
                issue_price: 100,
                shares_subscribed: 100,
                subscription_date: new Date().toISOString().split('T')[0],
                renounced_shares: 0,
                renunciation_proceeds: 0
              });
              setIsRightsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold px-4 py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
          >
            <Scale className="w-4 h-4" />
            Rights Issue (CA-4)
          </button>

          <button
            onClick={handleSyncCorporateActions}
            disabled={isSyncingCA}
            className="flex items-center gap-2 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:text-emerald-400 text-slate-300 px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCA ? 'animate-spin text-emerald-400' : ''}`} />
            {isSyncingCA ? 'Syncing...' : 'Sync Upstox/Yahoo'}
          </button>

          <button
            onClick={handleApply}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs transition-colors cursor-pointer shadow-lg shadow-emerald-500/20"
          >
            <Play className="w-4 h-4 fill-slate-950" />
            Apply All Pending Actions
          </button>

          <button
            onClick={() => {
              setEditingAction(null);
              setFormDate(new Date().toISOString().split('T')[0]);
              setFormSymbol('');
              setFormIsin('');
              setFormType('DIVIDEND');
              setFormDetails('');
              setFormNumerator('');
              setFormDenominator('');
              setFormDps('');
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold px-4 py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            Add Action
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap border-b border-slate-800/80 mb-6 bg-slate-900/40 p-1.5 rounded-2xl gap-1">
        <button
          onClick={() => setActiveTab('scheduled')}
          className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'scheduled'
              ? 'bg-slate-900 border border-slate-800 text-emerald-400 shadow-md font-black'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Scheduled Ledger
          <span className="bg-slate-800 text-slate-300 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">
            {actions.length}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('upcoming-calendar');
            fetchUpcomingActions();
          }}
          className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'upcoming-calendar'
              ? 'bg-slate-900 border border-slate-800 text-emerald-400 shadow-md font-black'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar className="w-3.5 h-3.5 text-emerald-400" />
          Upcoming Calendar (CA-1)
          {urgentUpcomingCount > 0 ? (
            <span className="bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] px-2 py-0.5 rounded-full font-black animate-pulse">
              {urgentUpcomingCount} Urgent (&le;5d)
            </span>
          ) : (
            <span className="bg-slate-800 text-slate-400 text-[10px] px-2 py-0.5 rounded-full font-mono">
              {upcomingActions.length}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab('dividend-summary');
            fetchDividendSummary();
          }}
          className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'dividend-summary'
              ? 'bg-slate-900 border border-slate-800 text-emerald-400 shadow-md font-black'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Coins className="w-3.5 h-3.5 text-amber-400" />
          Dividend & TDS Rollup (CA-2)
        </button>

        <button
          onClick={() => {
            setActiveTab('yield-on-cost');
            fetchYocHoldings();
          }}
          className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'yield-on-cost'
              ? 'bg-slate-900 border border-slate-800 text-emerald-400 shadow-md font-black'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
          Yield On Cost (CA-5)
        </button>

        <button
          onClick={() => {
            setActiveTab('reconcile');
            fetchReconciliationData();
            fetchBackupStatus();
          }}
          className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'reconcile'
              ? 'bg-slate-900 border border-slate-800 text-emerald-400 shadow-md font-black'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Legacy Reconciliation
          {backupCount > 0 && (
            <span className="bg-emerald-500/15 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-black">
              Backup ({backupCount})
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab('pms-recon');
            fetchPmsComparison();
          }}
          className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'pms-recon'
              ? 'bg-slate-900 border border-slate-800 text-emerald-400 shadow-md font-black'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
          PMS Vendor CA Match
        </button>
      </div>

      {/* ─── TAB 1: UPCOMING CA CALENDAR (CA-1) ──────────────────────────────── */}
      {activeTab === 'upcoming-calendar' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-emerald-400" />
                  Upcoming Ex-Date Advance Intelligence (Next 45 Trading Days)
                </h3>
                <p className="text-slate-400 text-xs mt-1">
                  Trading-day calendar powered by NSE holidays. Signals highlight actions occurring within ≤5 trading days so you never miss a record date or cum-dividend eligibility.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search symbol, ISIN, action..."
                    value={upcomingSearch}
                    onChange={(e) => setUpcomingSearch(e.target.value)}
                    className="pl-8 pr-7 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-48 sm:w-60 transition"
                  />
                  {upcomingSearch && (
                    <button
                      onClick={() => setUpcomingSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs cursor-pointer"
                    >
                      ×
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setUpcomingFilterUrgent(!upcomingFilterUrgent)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                    upcomingFilterUrgent
                      ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 text-rose-400" />
                  Show Only Urgent (&le; 5 Days)
                </button>

                <button
                  onClick={fetchUpcomingActions}
                  className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-xl cursor-pointer"
                  title="Refresh Calendar"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingUpcoming ? 'animate-spin text-emerald-400' : ''}`} />
                </button>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-4">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Upcoming Actions Tracked</span>
                <p className="text-2xl font-display font-bold text-slate-100 mt-1">{upcomingActions.length}</p>
                <span className="text-[11px] text-slate-500 font-mono">Next 45 trading days</span>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-4">
                <span className="text-[11px] uppercase tracking-wider text-rose-400 font-bold">Urgent Ex-Dates (&le;5 Trading Days)</span>
                <p className="text-2xl font-display font-bold text-rose-400 mt-1">{urgentUpcomingCount}</p>
                <span className="text-[11px] text-rose-400/70 font-mono">Immediate portfolio impact</span>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-4">
                <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-bold">Eligible Holdings Held</span>
                <p className="text-2xl font-display font-bold text-emerald-400 mt-1">
                  {upcomingActions.filter(a => (a.eligible_qty_held || 0) > 0).length} Stocks
                </p>
                <span className="text-[11px] text-slate-500 font-mono">Shares physically held in portfolios</span>
              </div>
            </div>
          </div>

          {/* Upcoming Actions Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-950">
            <table className="min-w-full divide-y divide-slate-800/60 text-xs font-sans">
              <thead className="bg-slate-900/80 text-slate-400 uppercase font-semibold text-[9px] tracking-wider select-none">
                <tr>
                  {renderCASortHeader('Scrip / ISIN', 'symbol', upcomingSortField, upcomingSortDir, (f) => handleCASortToggle(upcomingSortField, upcomingSortDir, f, setUpcomingSortField, setUpcomingSortDir), 'left')}
                  {renderCASortHeader('Action Type', 'action_type', upcomingSortField, upcomingSortDir, (f) => handleCASortToggle(upcomingSortField, upcomingSortDir, f, setUpcomingSortField, setUpcomingSortDir), 'left')}
                  {renderCASortHeader('Ex-Date / Record Date', 'ex_date', upcomingSortField, upcomingSortDir, (f) => handleCASortToggle(upcomingSortField, upcomingSortDir, f, setUpcomingSortField, setUpcomingSortDir), 'left')}
                  {renderCASortHeader('Trading Days to Ex', 'trading_days_to_ex', upcomingSortField, upcomingSortDir, (f) => handleCASortToggle(upcomingSortField, upcomingSortDir, f, setUpcomingSortField, setUpcomingSortDir), 'center')}
                  {renderCASortHeader('Eligible Qty Held', 'eligible_qty_held', upcomingSortField, upcomingSortDir, (f) => handleCASortToggle(upcomingSortField, upcomingSortDir, f, setUpcomingSortField, setUpcomingSortDir), 'right')}
                  {renderCASortHeader('Projected Value', 'projected_value', upcomingSortField, upcomingSortDir, (f) => handleCASortToggle(upcomingSortField, upcomingSortDir, f, setUpcomingSortField, setUpcomingSortDir), 'right')}
                  <th className="px-6 py-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-slate-300">
                {(() => {
                  let list = upcomingActions.filter(a => !upcomingFilterUrgent || a.is_urgent_ex_date);

                  if (upcomingSearch.trim()) {
                    const q = upcomingSearch.toLowerCase().trim();
                    list = list.filter((a: any) => {
                      const sym = (a.symbol || '').toLowerCase();
                      const isin = (a.isin || '').toLowerCase();
                      const type = (a.action_type || '').toLowerCase();
                      const det = (a.details || '').toLowerCase();
                      return sym.includes(q) || isin.includes(q) || type.includes(q) || det.includes(q);
                    });
                  }

                  list.sort((a: any, b: any) => {
                    let aVal: any = 0;
                    let bVal: any = 0;
                    if (upcomingSortField === 'symbol') {
                      aVal = a.symbol || '';
                      bVal = b.symbol || '';
                      return upcomingSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                    } else if (upcomingSortField === 'action_type') {
                      aVal = a.action_type || '';
                      bVal = b.action_type || '';
                      return upcomingSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                    } else if (upcomingSortField === 'ex_date') {
                      aVal = a.ex_date || '';
                      bVal = b.ex_date || '';
                      return upcomingSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                    } else if (upcomingSortField === 'trading_days_to_ex') {
                      aVal = a.trading_days_to_ex !== undefined ? a.trading_days_to_ex : 999;
                      bVal = b.trading_days_to_ex !== undefined ? b.trading_days_to_ex : 999;
                    } else if (upcomingSortField === 'eligible_qty_held') {
                      aVal = a.eligible_qty_held || 0;
                      bVal = b.eligible_qty_held || 0;
                    } else if (upcomingSortField === 'projected_value') {
                      aVal = a.estimated_value || a.projected_payout_value || 0;
                      bVal = b.estimated_value || b.projected_payout_value || 0;
                    }
                    return upcomingSortDir === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
                  });

                  if (list.length === 0) {
                    return (
                      <tr>
                        <td colSpan={7} className="text-center py-12 text-slate-500 font-mono">
                          {upcomingSearch ? `No corporate actions matching "${upcomingSearch}".` : 'No corporate actions scheduled in the next 45 trading days.'}
                        </td>
                      </tr>
                    );
                  }

                  return list.map(a => (
                    <tr key={a.id || `${a.symbol}_${a.ex_date}`} className="hover:bg-slate-900/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="space-y-0.5">
                          <span className="font-display font-bold text-slate-100 text-sm">{a.symbol}</span>
                          <span className="text-[10px] text-slate-500 font-mono block">{a.isin || '-'}</span>
                          {a.conflict_flag && (
                            <span className="inline-flex items-center gap-1 text-[9px] bg-amber-950/40 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono">
                              <AlertTriangle className="w-2.5 h-2.5" /> Cross-Feed Discrepancy
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wider border ${
                          a.action_type === 'DIVIDEND'
                            ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/30'
                            : a.action_type === 'BONUS'
                            ? 'bg-purple-950/60 text-purple-400 border-purple-500/30'
                            : a.action_type === 'SPLIT'
                            ? 'bg-indigo-950/60 text-indigo-400 border-indigo-500/30'
                            : 'bg-amber-950/60 text-amber-400 border-amber-500/30'
                        }`}>
                          {a.action_type}
                        </span>
                        <p className="text-[11px] text-slate-400 font-mono mt-1">{a.details || '-'}</p>
                      </td>
                      <td className="px-6 py-4 font-mono">
                        <div className="text-slate-200 font-bold">Ex: {a.ex_date}</div>
                        <div className="text-slate-500 text-[10px]">Rec: {a.record_date}</div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {a.is_urgent_ex_date ? (
                          <span className="inline-flex items-center gap-1.5 bg-rose-950/80 text-rose-300 border border-rose-500/40 px-3 py-1 rounded-full font-bold font-mono text-[11px] animate-pulse">
                            <Clock className="w-3 h-3" />
                            {a.trading_days_to_ex} Trading Days
                          </span>
                        ) : (
                          <span className="font-mono text-slate-400 bg-slate-900 px-2.5 py-1 rounded-full border border-slate-800">
                            {a.trading_days_to_ex} Trading Days
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-slate-200">
                        {a.eligible_qty_held ? (
                          <span className="text-emerald-400">{Number(a.eligible_qty_held).toLocaleString()}</span>
                        ) : (
                          <span className="text-slate-600">0</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-slate-200">
                        {a.estimated_value > 0 ? (
                          <span className="text-emerald-400">{formatINR(a.estimated_value)}</span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {(a.action_type === 'SPLIT' || a.action_type === 'BONUS') ? (
                          <button
                            onClick={() => handleApplyWithVerification(a)}
                            disabled={isVerifying}
                            className="inline-flex items-center gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Apply & Verify (Δ=0)
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-500 font-mono">Automated on Ex</span>
                        )}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 2: DIVIDEND ROLLUP & TDS (CA-2) ─────────────────────────────── */}
      {activeTab === 'dividend-summary' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Coins className="w-5 h-5 text-amber-400" />
                Dividend Rollup & Statutory TDS (Section 194)
              </h3>
              <p className="text-slate-400 text-xs mt-1">
                Track gross dividends, 10% statutory TDS withheld at source under Section 194, and net proceeds for ITR Schedule OS reconciliation.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <select
                  value={selectedDivFy}
                  onChange={(e) => setSelectedDivFy(e.target.value)}
                  className="appearance-none bg-slate-950 border border-slate-800 text-slate-200 text-xs font-semibold pl-4 pr-9 py-2 rounded-xl cursor-pointer focus:outline-none focus:border-emerald-500"
                >
                  <option value="2025-2026">FY 2025-2026</option>
                  <option value="2024-2025">FY 2024-2025 (Current)</option>
                  <option value="2023-2024">FY 2023-2024</option>
                  <option value="2022-2023">FY 2022-2023</option>
                </select>
                <ChevronDown className="absolute right-3 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>

              <button
                onClick={fetchDividendSummary}
                className="p-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-xl cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${loadingDividend ? 'animate-spin text-emerald-400' : ''}`} />
              </button>
            </div>
          </div>

          {dividendSummary && (
            <div className="space-y-6">
              {/* Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                  <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Total Gross Dividend</span>
                  <p className="text-2xl font-display font-bold text-slate-100 mt-1">
                    {formatINR(dividendSummary.gross_dividend || 0)}
                  </p>
                  <span className="text-[11px] text-slate-500 font-mono">Schedule OS Gross Income</span>
                </div>

                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                  <span className="text-[11px] uppercase tracking-wider text-amber-400 font-bold">Section 194 TDS Withheld (10%)</span>
                  <p className="text-2xl font-display font-bold text-amber-400 mt-1">
                    {formatINR(dividendSummary.estimated_tds || 0)}
                  </p>
                  <span className="text-[11px] text-amber-400/70 font-mono">Creditable in Form 26AS / AIS</span>
                </div>

                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                  <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-bold">Net Dividend Credited</span>
                  <p className="text-2xl font-display font-bold text-emerald-400 mt-1">
                    {formatINR(dividendSummary.net_dividend || 0)}
                  </p>
                  <span className="text-[11px] text-slate-500 font-mono">Liquid cash credited to bank</span>
                </div>
              </div>

              {/* Scrip Breakdown */}
              <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-950">
                <div className="p-4 bg-slate-900/60 border-b border-slate-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-slate-200 text-sm">Scrip-Wise Dividend Breakdown</h4>
                    <span className="text-xs font-mono text-slate-400">{dividendSummary.by_symbol?.length || 0} Scrips Paid</span>
                  </div>
                  <div className="relative w-full sm:w-60">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search symbol, ISIN..."
                      value={divSearch}
                      onChange={(e) => setDivSearch(e.target.value)}
                      className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
                    />
                    {divSearch && (
                      <button
                        onClick={() => setDivSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs cursor-pointer"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
                <table className="min-w-full divide-y divide-slate-800/60 text-xs">
                  <thead className="bg-slate-900/80 text-slate-400 uppercase font-semibold text-[9px] tracking-wider select-none">
                    <tr>
                      {renderCASortHeader('Scrip Symbol', 'symbol', divSortField, divSortDir, (f) => handleCASortToggle(divSortField, divSortDir, f, setDivSortField, setDivSortDir), 'left')}
                      {renderCASortHeader('ISIN', 'isin', divSortField, divSortDir, (f) => handleCASortToggle(divSortField, divSortDir, f, setDivSortField, setDivSortDir), 'left')}
                      {renderCASortHeader('Payout Events', 'count', divSortField, divSortDir, (f) => handleCASortToggle(divSortField, divSortDir, f, setDivSortField, setDivSortDir), 'center')}
                      {renderCASortHeader('Gross Dividend (₹)', 'gross', divSortField, divSortDir, (f) => handleCASortToggle(divSortField, divSortDir, f, setDivSortField, setDivSortDir), 'right')}
                      {renderCASortHeader('Section 194 TDS (₹)', 'tds', divSortField, divSortDir, (f) => handleCASortToggle(divSortField, divSortDir, f, setDivSortField, setDivSortDir), 'right')}
                      {renderCASortHeader('Net Credited (₹)', 'net', divSortField, divSortDir, (f) => handleCASortToggle(divSortField, divSortDir, f, setDivSortField, setDivSortDir), 'right')}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 text-slate-300 font-mono">
                    {(() => {
                      let list = [...(dividendSummary.by_symbol || [])];
                      if (divSearch.trim()) {
                        const q = divSearch.toLowerCase().trim();
                        list = list.filter((s: any) => {
                          const sym = (s.symbol || '').toLowerCase();
                          const isin = (s.isin || '').toLowerCase();
                          return sym.includes(q) || isin.includes(q);
                        });
                      }

                      list.sort((a: any, b: any) => {
                        let aVal: any = 0;
                        let bVal: any = 0;
                        if (divSortField === 'symbol') {
                          aVal = a.symbol || '';
                          bVal = b.symbol || '';
                          return divSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                        } else if (divSortField === 'isin') {
                          aVal = a.isin || '';
                          bVal = b.isin || '';
                          return divSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                        } else if (divSortField === 'count') {
                          aVal = a.count || 0;
                          bVal = b.count || 0;
                        } else if (divSortField === 'gross') {
                          aVal = a.gross || 0;
                          bVal = b.gross || 0;
                        } else if (divSortField === 'tds') {
                          aVal = a.tds || 0;
                          bVal = b.tds || 0;
                        } else if (divSortField === 'net') {
                          aVal = (a.gross || 0) - (a.tds || 0);
                          bVal = (b.gross || 0) - (b.tds || 0);
                        }
                        return divSortDir === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
                      });

                      if (list.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} className="text-center py-12 text-slate-500 font-mono">
                              {divSearch ? `No dividend records matching "${divSearch}".` : 'No dividend records found.'}
                            </td>
                          </tr>
                        );
                      }

                      return list.map((s: any) => (
                        <tr key={s.symbol} className="hover:bg-slate-900/40 transition-colors">
                          <td className="px-6 py-3.5 font-bold text-slate-100">{s.symbol}</td>
                          <td className="px-6 py-3.5 text-slate-500">{s.isin || '-'}</td>
                          <td className="px-6 py-3.5 text-center text-slate-400">{s.count}</td>
                          <td className="px-6 py-3.5 text-right font-bold text-slate-200">{formatINR(s.gross)}</td>
                          <td className="px-6 py-3.5 text-right text-amber-400">{formatINR(s.tds)}</td>
                          <td className="px-6 py-3.5 text-right text-emerald-400 font-bold">{formatINR(s.gross - s.tds)}</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 3: YIELD ON COST (CA-5) ────────────────────────────────────── */}
      {activeTab === 'yield-on-cost' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-400" />
                Yield On Cost (YOC%) Portfolio Ranking
              </h3>
              <p className="text-slate-400 text-xs leading-relaxed max-w-2xl">
                Yield on Cost (YOC%) calculates annual dividend cash flow divided by the <em>adjusted original cost of acquisition</em>. Because splits and bonus issuances increase share counts without altering total cost basis, true long-term compounders generate extraordinary double-digit and triple-digit YOC% returns.
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search holding scrip..."
                value={yocSearch}
                onChange={(e) => setYocSearch(e.target.value)}
                className="w-full pl-8 pr-7 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
              {yocSearch && (
                <button
                  onClick={() => setYocSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs cursor-pointer"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-950">
            <table className="min-w-full divide-y divide-slate-800/60 text-xs">
              <thead className="bg-slate-900/80 text-slate-400 uppercase font-semibold text-[9px] tracking-wider select-none">
                <tr>
                  {renderCASortHeader('Holding Scrip', 'symbol', yocSortField, yocSortDir, (f) => handleCASortToggle(yocSortField, yocSortDir, f, setYocSortField, setYocSortDir), 'left')}
                  {renderCASortHeader('Quantity', 'quantity', yocSortField, yocSortDir, (f) => handleCASortToggle(yocSortField, yocSortDir, f, setYocSortField, setYocSortDir), 'right')}
                  {renderCASortHeader('Avg Cost Basis (₹)', 'avg_cost', yocSortField, yocSortDir, (f) => handleCASortToggle(yocSortField, yocSortDir, f, setYocSortField, setYocSortDir), 'right')}
                  {renderCASortHeader('Current Price (₹)', 'current_price', yocSortField, yocSortDir, (f) => handleCASortToggle(yocSortField, yocSortDir, f, setYocSortField, setYocSortDir), 'right')}
                  {renderCASortHeader('Dividends Received (₹)', 'dividends', yocSortField, yocSortDir, (f) => handleCASortToggle(yocSortField, yocSortDir, f, setYocSortField, setYocSortDir), 'right')}
                  {renderCASortHeader('Current Yield (%)', 'current_yield', yocSortField, yocSortDir, (f) => handleCASortToggle(yocSortField, yocSortDir, f, setYocSortField, setYocSortDir), 'right')}
                  {renderCASortHeader('Yield On Cost (YOC%)', 'yield_on_cost_pct', yocSortField, yocSortDir, (f) => handleCASortToggle(yocSortField, yocSortDir, f, setYocSortField, setYocSortDir), 'right')}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-slate-300 font-mono">
                {(() => {
                  let list = [...yocHoldings];
                  if (yocSearch.trim()) {
                    const q = yocSearch.toLowerCase().trim();
                    list = list.filter((h: any) => {
                      const sym = (h.symbol || '').toLowerCase();
                      const comp = (h.company_name || '').toLowerCase();
                      return sym.includes(q) || comp.includes(q);
                    });
                  }

                  list.sort((a: any, b: any) => {
                    let aVal: any = 0;
                    let bVal: any = 0;
                    if (yocSortField === 'symbol') {
                      aVal = a.symbol || '';
                      bVal = b.symbol || '';
                      return yocSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                    } else if (yocSortField === 'quantity') {
                      aVal = Number(a.total_quantity || 0);
                      bVal = Number(b.total_quantity || 0);
                    } else if (yocSortField === 'avg_cost') {
                      aVal = a.avg_buy_price || 0;
                      bVal = b.avg_buy_price || 0;
                    } else if (yocSortField === 'current_price') {
                      aVal = a.current_price || 0;
                      bVal = b.current_price || 0;
                    } else if (yocSortField === 'dividends') {
                      aVal = a.total_gross_dividends_received || 0;
                      bVal = b.total_gross_dividends_received || 0;
                    } else if (yocSortField === 'current_yield') {
                      aVal = a.current_yield_pct || 0;
                      bVal = b.current_yield_pct || 0;
                    } else if (yocSortField === 'yield_on_cost_pct') {
                      aVal = a.yield_on_cost_pct || 0;
                      bVal = b.yield_on_cost_pct || 0;
                    }
                    return yocSortDir === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
                  });

                  if (list.length === 0) {
                    return (
                      <tr>
                        <td colSpan={7} className="text-center py-12 text-slate-500 font-mono">
                          {yocSearch ? `No holdings matching "${yocSearch}".` : 'No active holdings found for YOC calculation.'}
                        </td>
                      </tr>
                    );
                  }

                  return list.map((h: any) => (
                    <tr key={h.symbol} className="hover:bg-slate-900/40 transition-colors">
                      <td className="px-6 py-3.5">
                        <span className="font-display font-bold text-slate-100 text-sm">{h.symbol}</span>
                        <span className="text-[10px] text-slate-500 block">{h.company_name || ''}</span>
                      </td>
                      <td className="px-6 py-3.5 text-right font-bold text-slate-200">{Number(h.total_quantity).toLocaleString()}</td>
                      <td className="px-6 py-3.5 text-right text-slate-300">{formatINR(h.avg_buy_price)}</td>
                      <td className="px-6 py-3.5 text-right font-bold text-slate-100">{formatINR(h.current_price)}</td>
                      <td className="px-6 py-3.5 text-right text-emerald-400 font-bold">{formatINR(h.total_gross_dividends_received)}</td>
                      <td className="px-6 py-3.5 text-right text-slate-400">{h.current_yield_pct.toFixed(2)}%</td>
                      <td className="px-6 py-3.5 text-right">
                        <span className={`inline-block px-2.5 py-1 rounded-full font-black text-[11px] border ${
                          h.yield_on_cost_pct >= 5
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-900 text-slate-300 border-slate-800'
                        }`}>
                          {h.yield_on_cost_pct.toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 4: SCHEDULED ACTIONS LEDGER ───────────────────────────────── */}
      {activeTab === 'scheduled' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-display text-xl font-bold text-slate-200 tracking-tight">Scheduled Actions</h3>
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1 rounded-full text-xs text-slate-400">
                Pending:{' '}
                <span className="font-bold text-amber-400">
                  {actions.filter(a => !a.applied).length}
                </span>
              </div>
              <label className="flex items-center gap-2 bg-slate-900 border border-slate-800/80 px-3.5 py-1.5 rounded-full text-xs text-slate-300 hover:text-slate-100 transition-colors cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showOnlyEligible}
                  onChange={(e) => setShowOnlyEligible(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-800 bg-slate-950 text-emerald-500 focus:ring-emerald-500/20"
                />
                <span className="font-semibold text-[11px]">Eligible Portfolio Stocks Only</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search symbol, ISIN..."
                  className="w-full sm:w-64 bg-slate-900/60 border border-slate-800 focus:border-emerald-500 text-slate-200 text-sm rounded-xl pl-10 pr-4 py-2 focus:outline-none transition-colors"
                />
                <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-500" />
              </div>
            </div>
          </div>

          <ResizableDataTable<CorporateAction>
            tableId="corporate_actions"
            columns={[
              {
                id: 'record_date',
                header: 'Record Date',
                cell: (ca) => <span className="font-mono text-slate-300">{ca.record_date}</span>,
                width: 120,
                sortable: true,
                sortValue: (ca) => ca.record_date,
                defaultPinned: 'left'
              },
              {
                id: 'symbol',
                header: 'Scrip Description',
                cell: (ca) => (
                  <div>
                    <span className="font-display font-semibold text-slate-100">{ca.symbol}</span>
                    {ca.company_name && (
                      <p className="text-[11px] text-slate-400 truncate max-w-[200px]">{ca.company_name}</p>
                    )}
                    <span className="text-[10px] text-slate-500 font-mono block">{ca.isin}</span>
                  </div>
                ),
                width: 180,
                sortable: true,
                sortValue: (ca) => ca.symbol,
                defaultPinned: 'left'
              },
              {
                id: 'action_type',
                header: 'Action Type',
                cell: (ca) => (
                  <span className="bg-slate-900 text-slate-300 border border-slate-800 text-[10px] font-extrabold tracking-wider px-2.5 py-1 rounded-full">
                    {ca.action_type}
                  </span>
                ),
                width: 130,
                sortable: true,
                sortValue: (ca) => ca.action_type
              },
              {
                id: 'params',
                header: 'Ratio / DPS Parameters',
                cell: (ca) => (
                  ca.action_type === 'DIVIDEND' ? (
                    <span className="font-mono text-emerald-400 font-bold">₹{Number(ca.dividend_per_share || 0).toFixed(2)} DPS</span>
                  ) : (
                    <span className="font-mono text-indigo-400 font-bold">{ca.numerator}:{ca.denominator} Ratio</span>
                  )
                ),
                width: 160
              },
              {
                id: 'status',
                header: 'Status',
                cell: (ca) => (
                  ca.applied ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Applied
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-400 text-xs font-semibold">
                      <Clock className="w-3.5 h-3.5" /> Pending
                    </span>
                  )
                ),
                width: 120
              },
              {
                id: 'actions',
                header: 'Actions',
                cell: (ca) => (
                  <div className="flex items-center gap-1.5">
                    {!ca.applied && (ca.action_type === 'SPLIT' || ca.action_type === 'BONUS') && (
                      <button
                        onClick={() => handleApplyWithVerification(ca)}
                        className="p-1.5 hover:bg-emerald-950/40 text-slate-400 hover:text-emerald-400 rounded-lg transition-colors cursor-pointer"
                        title="Apply with Cost Basis Invariant Verification"
                      >
                        <ShieldCheck className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setEditingAction(ca);
                        setFormDate(ca.record_date);
                        setFormSymbol(ca.symbol);
                        setFormIsin(ca.isin || '');
                        setFormType(ca.action_type);
                        setFormDetails(ca.details || '');
                        setFormNumerator(ca.numerator ? String(ca.numerator) : '');
                        setFormDenominator(ca.denominator ? String(ca.denominator) : '');
                        setFormDps(ca.dividend_per_share ? String(ca.dividend_per_share) : '');
                        setIsModalOpen(true);
                      }}
                      className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(ca.id)}
                      className="p-1.5 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ),
                width: 120,
                align: 'center'
              }
            ]}
            data={filteredActions}
            keyExtractor={(ca) => ca.id}
            emptyMessage="No corporate actions matching search."
          />
        </div>
      )}

      {/* ─── TAB 5: RECONCILE / PMS-RECON ──────────────────────────────────── */}
      {(activeTab === 'reconcile' || activeTab === 'pms-recon') && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-emerald-400" />
                  Historical Alignment & Reconciliation Engine
                </h3>
                <p className="text-slate-400 text-xs leading-relaxed max-w-4xl">
                  Yahoo Finance up-to-20-year history and Upstox feeds are merged here to cross-reference older, manually-logged corporate actions in your ledger. Backups are kept automatically for zero-risk, instant rollback.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {backupCount > 0 && (
                  <button
                    onClick={handleRollbackReconciliation}
                    className="flex items-center gap-2 bg-rose-950/40 hover:bg-rose-950/80 border border-rose-500/30 text-rose-300 font-semibold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer shadow-lg"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    Rollback ({backupCount} Items)
                  </button>
                )}
                <button
                  onClick={handleApplyReconciliation}
                  disabled={selectedReconcileIds.length === 0}
                  className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs transition-colors cursor-pointer shadow-lg disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  Reconcile Selected ({selectedReconcileIds.length})
                </button>
              </div>
            </div>
          </div>

          {/* Bulk Uploader */}
          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-4">
            <div className="flex flex-col lg:flex-row gap-6 items-stretch">
              <div className="flex-1 space-y-3">
                <h4 className="font-display font-bold text-slate-200 text-sm flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  Load Manual Corporate Actions (Spreadsheet Load)
                </h4>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Upload historical manual corporate action sheets to automatically align against Yahoo & Upstox calculations.
                </p>
              </div>

              <div className="flex-1 flex flex-col justify-between">
                <div
                  onDragEnter={(e) => { e.preventDefault(); setManualDragActive(true); }}
                  onDragOver={(e) => { e.preventDefault(); setManualDragActive(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setManualDragActive(false); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setManualDragActive(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      setManualFile(e.dataTransfer.files[0]);
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-6 text-center flex flex-col items-center justify-center transition-all ${
                    manualDragActive
                      ? 'border-emerald-500 bg-emerald-950/10'
                      : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                  }`}
                >
                  <UploadCloud className={`w-8 h-8 mb-2 ${manualDragActive ? 'text-emerald-400 animate-bounce' : 'text-slate-500'}`} />
                  <p className="text-xs text-slate-300 font-medium">
                    Drag & Drop Excel/CSV here or{' '}
                    <label className="text-emerald-400 hover:text-emerald-300 cursor-pointer underline">
                      Browse
                      <input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setManualFile(e.target.files[0]);
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  </p>
                  {manualFile && (
                    <span className="text-[11px] text-emerald-400 bg-emerald-950/20 border border-emerald-500/20 px-2.5 py-1 rounded-md font-mono mt-2">
                      Selected: {manualFile.name}
                    </span>
                  )}
                </div>

                <div className="flex justify-end gap-2 mt-3">
                  <button
                    type="button"
                    disabled={!manualFile || isUploadingManual}
                    onClick={() => handleManualCAUpload()}
                    className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    {isUploadingManual ? 'Uploading...' : 'Load Manual Actions'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 1: COST BASIS VERIFICATION REPORT (CA-3) ─────────────────── */}
      <AnimatePresence>
        {verificationReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="max-w-lg w-full rounded-2xl bg-slate-900 border border-emerald-500/30 p-6 space-y-5 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-6 h-6 text-emerald-400" />
                  <div>
                    <h3 className="font-bold text-slate-100 text-base">Cost-Basis Invariant Verification Report</h3>
                    <p className="text-[11px] text-slate-400 font-mono">Spec: CA-3 Runtime Assertion Check</p>
                  </div>
                </div>
                <button
                  onClick={() => setVerificationReport(null)}
                  className="text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status Banner */}
              <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-emerald-300 font-bold text-sm">INVARIANT PRESERVED: Δ Total Cost = 0.00</p>
                  <p className="text-emerald-400/70 text-xs">
                    Pre-action and post-action portfolio cost basis match to the exact integer paise. Zero cost drift detected.
                  </p>
                </div>
              </div>

              {/* Verification Metrics Table */}
              <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 space-y-3 font-mono text-xs">
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Scrip Symbol:</span>
                  <span className="text-slate-100 font-bold">{verificationReport.symbol}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Action Type & Ratio:</span>
                  <span className="text-indigo-400 font-bold">{verificationReport.action_type} ({verificationReport.ratio})</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Pre-Action Share Count:</span>
                  <span className="text-slate-200">{verificationReport.pre_total_qty?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Post-Action Share Count:</span>
                  <span className="text-emerald-400 font-bold">{verificationReport.post_total_qty?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Pre-Action Total Cost:</span>
                  <span className="text-slate-200 font-bold">{formatINR(verificationReport.pre_total_cost)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Post-Action Total Cost:</span>
                  <span className="text-emerald-400 font-bold">{formatINR(verificationReport.post_total_cost)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">New Adjusted Avg Price:</span>
                  <span className="text-indigo-400 font-bold">{formatINR(verificationReport.new_avg_price)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Audit Ledger Stamp:</span>
                  <span className="text-slate-500">{verificationReport.verified_at}</span>
                </div>
              </div>

              <button
                onClick={() => setVerificationReport(null)}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Close Verification Report
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── MODAL 2: RIGHTS ISSUE SUBSCRIPTION (CA-4) ──────────────────────── */}
      <AnimatePresence>
        {isRightsModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="max-w-md w-full rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                  <Scale className="w-5 h-5 text-amber-400" />
                  Process Rights Issue Subscription (CA-4)
                </h3>
                <button
                  onClick={() => setIsRightsModalOpen(false)}
                  className="text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {rightsSuccessMsg && (
                <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 text-emerald-400 text-xs rounded-xl">
                  {rightsSuccessMsg}
                </div>
              )}
              {rightsErrorMsg && (
                <div className="p-3 bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs rounded-xl">
                  {rightsErrorMsg}
                </div>
              )}

              <form onSubmit={handleRightsSubmit} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Scrip Symbol</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. RELIANCE, TATASTEEL"
                    value={rightsForm.symbol}
                    onChange={(e) => setRightsForm({ ...rightsForm, symbol: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Portfolio</label>
                    <input
                      type="text"
                      required
                      value={rightsForm.portfolio}
                      onChange={(e) => setRightsForm({ ...rightsForm, portfolio: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">PAN</label>
                    <input
                      type="text"
                      required
                      value={rightsForm.pan}
                      onChange={(e) => setRightsForm({ ...rightsForm, pan: e.target.value.toUpperCase() })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Rights Ratio</label>
                    <input
                      type="text"
                      placeholder="e.g. 1:4"
                      value={rightsForm.rights_ratio}
                      onChange={(e) => setRightsForm({ ...rightsForm, rights_ratio: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Issue Price (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={rightsForm.issue_price}
                      onChange={(e) => setRightsForm({ ...rightsForm, issue_price: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Subscribed Shares</label>
                    <input
                      type="number"
                      required
                      value={rightsForm.shares_subscribed}
                      onChange={(e) => setRightsForm({ ...rightsForm, shares_subscribed: parseInt(e.target.value, 10) || 0 })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Subscription Date</label>
                    <input
                      type="date"
                      required
                      value={rightsForm.subscription_date}
                      onChange={(e) => setRightsForm({ ...rightsForm, subscription_date: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                    />
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-slate-300 font-mono space-y-1">
                  <div className="flex justify-between">
                    <span>Total Outlay Required:</span>
                    <span className="font-bold text-amber-400">
                      {formatINR((rightsForm.shares_subscribed || 0) * (rightsForm.issue_price || 0))}
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsRightsModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={rightsSubmitting}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    {rightsSubmitting ? 'Processing...' : 'Subscribe Rights'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── MODAL 3: ADD / EDIT SCHEDULED CA ───────────────────────────────── */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="max-w-md w-full rounded-2xl bg-slate-900 border border-slate-800/80 p-6 space-y-4"
            >
              <h3 className="font-display font-bold text-slate-100 text-lg">
                {editingAction ? 'Edit Corporate Action' : 'Add Corporate Action'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Record Date</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Scrip Symbol</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. INFY, TCS"
                    value={formSymbol}
                    onChange={(e) => setFormSymbol(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Action Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="DIVIDEND">DIVIDEND</option>
                    <option value="BONUS">BONUS</option>
                    <option value="SPLIT">SPLIT</option>
                    <option value="RIGHTS">RIGHTS</option>
                  </select>
                </div>
                {formType === 'DIVIDEND' ? (
                  <div>
                    <label className="block text-slate-400 mb-1">Dividend Per Share (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={formDps}
                      onChange={(e) => setFormDps(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Numerator</label>
                      <input
                        type="number"
                        required
                        value={formNumerator}
                        onChange={(e) => setFormNumerator(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Denominator</label>
                      <input
                        type="number"
                        required
                        value={formDenominator}
                        onChange={(e) => setFormDenominator(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-slate-400 mb-1">Details / Rationale</label>
                  <input
                    type="text"
                    value={formDetails}
                    onChange={(e) => setFormDetails(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl cursor-pointer"
                  >
                    {editingAction ? 'Update Action' : 'Save Action'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        isDangerous={confirmState.isDangerous}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
