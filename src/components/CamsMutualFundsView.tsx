import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Play,
  RefreshCw,
  Trash2,
  Key,
  Mail,
  User,
  Check,
  Plus,
  HelpCircle,
  Sparkles,
  TrendingUp,
  DollarSign,
  Briefcase,
  Layers,
  Activity,
  ArrowRight,
  Download,
  FileSpreadsheet
} from 'lucide-react';
import { ConfirmationModal } from './ConfirmationModal.js';
import { MFCasAutoSyncModal } from './MFCasAutoSyncModal.js';
import { formatINR, formatPct } from '../lib/formatters.js';

interface CamsConfig {
  pan: string;
  email: string;
  password?: string;
  portfolio_name: string;
  status: string;
  last_sync: string | null;
  created_at: string;
}

interface PortfolioItem {
  name: string;
  total_invested: number;
  current_value: number;
  unrealized_pnl: number;
  unrealized_pct: number;
  xirr: number | null;
}

export function CamsMutualFundsView({
  formatCurrency,
  selectedPortfolio,
  portfolios
}: {
  formatCurrency: (v: number) => string;
  selectedPortfolio?: string;
  portfolios?: string[];
}) {
  // Config state
  const [configs, setConfigs] = useState<CamsConfig[]>([]);
  const [panInput, setPanInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [showAutoSyncModal, setShowAutoSyncModal] = useState(false);

  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [targetPan, setTargetPan] = useState('');
  const [uploadPortfolioOption, setUploadPortfolioOption] = useState('new');
  const [customPortfolioName, setCustomPortfolioName] = useState('');
  const [pdfPassword, setPdfPassword] = useState('');
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  
  // Status feedback state
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [uploadResult, setUploadResult] = useState<any | null>(null);
  
  // Auto-sync or trigger state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<Record<string, string>>({});

  // Pricing engine state
  const [isPricingSyncing, setIsPricingSyncing] = useState(false);
  const [pricingResult, setPricingResult] = useState<string | null>(null);

  // Consolidated XIRR Clubbing States
  const [portfoliosList, setPortfoliosList] = useState<PortfolioItem[]>([]);
  const [selectedPortfolios, setSelectedPortfolios] = useState<string[]>([]);
  const [isLoadingPortfolios, setIsLoadingPortfolios] = useState(false);
  const [consolidatedXirr, setConsolidatedXirr] = useState<number | null>(null);
  const [consolidatedBenchXirr, setConsolidatedBenchXirr] = useState<number | null>(null);
  const [isCalculatingConsolidated, setIsCalculatingConsolidated] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [portfolioToDelete, setPortfolioToDelete] = useState('');

  // Reconciliation/Validation states
  const [reconPortfolio, setReconPortfolio] = useState('');
  const [reconReport, setReconReport] = useState<any[]>([]);
  const [isFetchingRecon, setIsFetchingRecon] = useState(false);

  // Fetch configs and portfolios on load
  useEffect(() => {
    fetchConfigs();
    fetchPortfoliosData();
  }, []);

  // Whenever selected portfolios change, recalculate consolidated XIRR
  useEffect(() => {
    if (selectedPortfolios.length > 0) {
      calculateConsolidatedXirr();
    } else {
      setConsolidatedXirr(null);
      setConsolidatedBenchXirr(null);
    }
  }, [selectedPortfolios]);

  // Whenever the reconciliation portfolio selection changes, run check
  useEffect(() => {
    if (reconPortfolio) {
      fetchReconciliationReport();
    } else {
      setReconReport([]);
    }
  }, [reconPortfolio]);

  const fetchReconciliationReport = async () => {
    if (!reconPortfolio) return;
    setIsFetchingRecon(true);
    try {
      const res = await fetch(`/api/cams/reconciliation-report?portfolio=${encodeURIComponent(reconPortfolio)}`);
      const data = await res.json();
      if (data.success) {
        setReconReport(data.report);
      } else {
        setReconReport([]);
        setErrorMsg(data.message || 'Failed to fetch reconciliation report.');
      }
    } catch (err: any) {
      console.error('Failed to run reconciliation report:', err);
      setReconReport([]);
    } finally {
      setIsFetchingRecon(false);
    }
  };

  const fetchConfigs = async () => {
    try {
      const res = await fetch('/api/cams/configs');
      const data = await res.json();
      if (data.success) {
        setConfigs(data.configs);
        if (data.configs.length > 0 && !targetPan) {
          setTargetPan(data.configs[0].pan);
        }
      }
    } catch (err) {
      console.error('Failed to fetch CAMS configs:', err);
    }
  };

  const fetchPortfoliosData = async () => {
    setIsLoadingPortfolios(true);
    try {
      // 1. Get raw list of portfolios
      const pRes = await fetch('/api/portfolios');
      const pData = await pRes.json();
      if (!pData.success) throw new Error(pData.message);

      const list: string[] = pData.portfolios || [];
      const loadedPortfolios: PortfolioItem[] = [];

      // 2. Fetch metrics & XIRR for each portfolio sequentially
      for (const pName of list) {
        try {
          const mRes = await fetch(`/api/metrics?portfolios=${encodeURIComponent(pName)}`);
          const mData = await mRes.json();
          const xRes = await fetch(`/api/dashboard/xirr?portfolios=${encodeURIComponent(pName)}`);
          const xData = await xRes.json();

          if (mData.success) {
            loadedPortfolios.push({
              name: pName,
              total_invested: mData.metrics.total_invested,
              current_value: mData.metrics.current_value,
              unrealized_pnl: mData.metrics.unrealized_pnl,
              unrealized_pct: mData.metrics.unrealized_pct,
              xirr: xData.success ? xData.xirr : null
            });
          }
        } catch (err) {
          console.error(`Error loading details for portfolio ${pName}:`, err);
        }
      }

      setPortfoliosList(loadedPortfolios);
      
      // Default selection strictly based on active selectedPortfolio
      if (selectedPortfolios.length === 0 && loadedPortfolios.length > 0) {
        if (selectedPortfolio && selectedPortfolio !== 'Combined' && selectedPortfolio !== 'all') {
          const match = loadedPortfolios.find(p => p.name.toLowerCase() === selectedPortfolio.toLowerCase());
          if (match) {
            setSelectedPortfolios([match.name]);
          } else {
            setSelectedPortfolios([selectedPortfolio]);
          }
        } else {
          // If Combined or all, default strictly to Mutual Fund portfolios
          const mfOnly = loadedPortfolios.filter(p => p.name.endsWith('-MF') || p.name.toLowerCase().includes('mutual fund')).map(p => p.name);
          setSelectedPortfolios(mfOnly.length > 0 ? mfOnly : loadedPortfolios.map(p => p.name));
        }
      }
      if (loadedPortfolios.length > 0 && !reconPortfolio) {
        const defaultRecon = (selectedPortfolio && loadedPortfolios.find(p => p.name.toLowerCase() === selectedPortfolio.toLowerCase()))?.name || loadedPortfolios[0].name;
        setReconPortfolio(defaultRecon);
      }
    } catch (err: any) {
      console.error('Failed to compile portfolios data:', err);
    } finally {
      setIsLoadingPortfolios(false);
    }
  };

  const handleLinkConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!panInput || !emailInput) {
      setErrorMsg('PAN and Email ID are strictly required.');
      return;
    }
    setIsLinking(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/cams/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pan: panInput,
          email: emailInput,
          password: passInput
        })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message);
        setPanInput('');
        setEmailInput('');
        setPassInput('');
        fetchConfigs();
        fetchPortfoliosData(); // Refresh portfolio list since a new one might be created
      } else {
        setErrorMsg(data.message || 'Linking failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred linking configuration.');
    } finally {
      setIsLinking(false);
    }
  };

  const handleDeleteConfig = async (pan: string) => {
    if (!window.confirm(`Are you sure you want to disconnect CAMS automated sync for PAN ${pan}?`)) {
      return;
    }
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`/api/cams/configs/${encodeURIComponent(pan)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message);
        fetchConfigs();
        fetchPortfoliosData();
      } else {
        setErrorMsg(data.message || 'Deletion failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred deleting connection.');
    }
  };

  const handleTriggerCamsRequest = async (pan: string, email: string) => {
    setSuccessMsg('');
    setErrorMsg('');
    setSyncStatus(prev => ({ ...prev, [pan]: 'Requesting CAS...' }));
    try {
      const res = await fetch('/api/cams/trigger-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pan, email })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(`${data.message} ${data.details}`);
        fetchConfigs();
      } else {
        setErrorMsg(data.message || 'Failed to trigger CAS request.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error triggering CAS portal request.');
    } finally {
      setSyncStatus(prev => ({ ...prev, [pan]: '' }));
    }
  };

  const handleAutoSync = async (pan: string) => {
    setSuccessMsg('');
    setErrorMsg('');
    setSyncStatus(prev => ({ ...prev, [pan]: 'Checking CAMS statements...' }));
    try {
      const res = await fetch('/api/cams/auto-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pan })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message);
        fetchConfigs();
        fetchPortfoliosData(); // reload holdings
      } else {
        setErrorMsg(data.message || 'Auto-sync failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Connection error during auto-sync check.');
    } finally {
      setSyncStatus(prev => ({ ...prev, [pan]: '' }));
    }
  };

  const handleSyncPrices = async () => {
    setIsPricingSyncing(true);
    setPricingResult(null);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/cams/sync-prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ portfolios: selectedPortfolios }),
      });
      const data = await res.json();
      if (data.success) {
        setPricingResult(`Successfully synced! Updated ${data.updated_count} mutual fund prices via AMFI.`);
        fetchPortfoliosData(); // reload values
      } else {
        setErrorMsg(data.message || 'AMFI price sync failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error updating AMFI NAVs.');
    } finally {
      setIsPricingSyncing(false);
    }
  };

  // Upload Statement files
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
      const selectedFile = e.dataTransfer.files[0];
      setFile(selectedFile);
      setErrorMsg('');
      if (selectedFile.name.toLowerCase().endsWith('.pdf')) {
        setShowPasswordInput(true);
      } else {
        setShowPasswordInput(false);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setErrorMsg('');
      if (selectedFile.name.toLowerCase().endsWith('.pdf')) {
        setShowPasswordInput(true);
      } else {
        setShowPasswordInput(false);
      }
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    const targetPortfolioName = uploadPortfolioOption === 'new' ? customPortfolioName.trim() : uploadPortfolioOption;
    if (uploadPortfolioOption === 'new' && !targetPortfolioName) {
      setErrorMsg('Please enter a name for the new portfolio.');
      return;
    }

    setIsUploading(true);
    setErrorMsg('');
    setSuccessMsg('');
    setUploadResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('portfolio_name', targetPortfolioName);
    formData.append('pan', targetPan); // If empty, server will auto-detect
    if (pdfPassword) {
      formData.append('password', pdfPassword);
    }

    try {
      const res = await fetch('/api/cams/parse-statement', {
        method: 'POST',
        body: formData
      });

      const contentType = res.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const textResponse = await res.text();
        console.error('[CAMS Upload] Server returned non-JSON response:', textResponse);
        throw new Error('Server returned an invalid response (non-JSON). Please ensure the uploaded file is a valid statement.');
      }

      if (data.success) {
        setUploadResult(data.data);
        setSuccessMsg(`CAMS statement processed successfully! All transaction ISINs have been automatically fetched from the net and loaded into portfolio "${data.data?.portfolio_name || 'ledger'}".`);
        setFile(null);
        setCustomPortfolioName('');
        setPdfPassword('');
        setShowPasswordInput(false);
        window.dispatchEvent(new CustomEvent('portfolioDataChanged'));
        fetchPortfoliosData(); // Refresh portfolio holdings and totals
        fetchConfigs(); // Refresh configs in case auto-linked
      } else if (data.errorType === 'PASSWORD_REQUIRED') {
        setShowPasswordInput(true);
        setErrorMsg(data.message || 'This CAMS Statement PDF is encrypted. Please provide the PDF password.');
      } else {
        setErrorMsg(data.message || 'Failed to parse statement.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error processing file.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeletePortfolioClick = (e: React.MouseEvent, pName: string) => {
    e.stopPropagation(); // Stop click from toggling selection
    setPortfolioToDelete(pName);
    setDeleteModalOpen(true);
  };

  const handleConfirmDeletePortfolio = async () => {
    if (!portfolioToDelete) return;
    setIsLoadingPortfolios(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`/api/portfolios/${encodeURIComponent(portfolioToDelete)}?confirm=true`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message);
        // Deselect if it was selected
        setSelectedPortfolios(prev => prev.filter(p => p !== portfolioToDelete));
        window.dispatchEvent(new CustomEvent('portfolioDataChanged'));
        await fetchPortfoliosData();
        await fetchConfigs();
      } else {
        setErrorMsg(data.message || 'Failed to delete portfolio.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred deleting portfolio.');
    } finally {
      setIsLoadingPortfolios(false);
      setPortfolioToDelete('');
    }
  };

  // Multi-portfolio consolidated XIRR calculator
  const calculateConsolidatedXirr = async () => {
    setIsCalculatingConsolidated(true);
    try {
      let url = '/api/dashboard/xirr';
      if (selectedPortfolios.length > 0) {
        url += `?portfolios=${selectedPortfolios.map(p => encodeURIComponent(p)).join(',')}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setConsolidatedXirr(data.xirr);
        setConsolidatedBenchXirr(data.bench_xirr);
      } else {
        setConsolidatedXirr(null);
        setConsolidatedBenchXirr(null);
      }
    } catch (err) {
      console.error('Consolidated XIRR calc error:', err);
      setConsolidatedXirr(null);
      setConsolidatedBenchXirr(null);
    } finally {
      setIsCalculatingConsolidated(false);
    }
  };

  const toggleSelectPortfolio = (pName: string) => {
    if (selectedPortfolios.includes(pName)) {
      setSelectedPortfolios(selectedPortfolios.filter(p => p !== pName));
    } else {
      setSelectedPortfolios([...selectedPortfolios, pName]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedPortfolios.length === portfoliosList.length) {
      setSelectedPortfolios([]);
    } else {
      setSelectedPortfolios(portfoliosList.map(p => p.name));
    }
  };

  return (
    <div className="space-y-6">
      {/* Visual Feedback Alerts */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-xl flex items-start gap-3"
            id="cams-success-alert"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-sm text-emerald-200">{successMsg}</div>
          </motion.div>
        )}

        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-red-950/40 border border-red-500/30 rounded-xl flex items-start gap-3"
            id="cams-error-alert"
          >
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="text-sm text-red-200">{errorMsg}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PANEL 1: Automated CAMS Connection */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between" id="panel-automated-cams">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-slate-100">Automated CAMS & MFCentral Tracking</h3>
                <p className="text-slate-400 text-xs">Automatically pull new mutual fund transactions going forward using PAN & Email ID</p>
              </div>
            </div>

            <div className="mb-4">
              <button
                type="button"
                onClick={() => setShowAutoSyncModal(true)}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>Launch Interactive MF CAS Auto-Sync (PAN / OTP API)</span>
              </button>
            </div>

            {/* Connection Linker Form */}
            <form onSubmit={handleLinkConfig} className="space-y-3 mt-4 border-b border-slate-800/80 pb-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400">PAN Number</label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="ABCDE1234F"
                      maxLength={10}
                      value={panInput}
                      onChange={e => setPanInput(e.target.value.toUpperCase())}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-slate-100 text-sm placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                    <input
                      type="email"
                      placeholder="investor@example.com"
                      value={emailInput}
                      onChange={e => setEmailInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-slate-100 text-sm placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    CAMS Statement Password (Optional)
                  </label>
                  <span className="text-[10px] text-slate-400">For decrypting automated PDF statements</span>
                </div>
                <div className="relative">
                  <Key className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    placeholder="Enter PDF password if configured"
                    value={passInput}
                    onChange={e => setPassInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-slate-100 text-sm placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLinking}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 text-slate-950 text-xs font-semibold py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {isLinking ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 shrink-0" />
                )}
                Link Automated CAMS Account
              </button>
            </form>

            {/* Linked Connections List */}
            <div className="mt-5 space-y-3">
              <h4 className="text-xs uppercase font-bold tracking-wider text-slate-400 mb-2">Linked Connections</h4>
              {configs.length === 0 ? (
                <div className="py-6 text-center border border-dashed border-slate-800/60 rounded-xl text-slate-500 text-xs">
                  No automated CAMS connections configured. Link one above.
                </div>
              ) : (
                <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                  {configs.map((cfg) => (
                    <div
                      key={cfg.pan}
                      className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-slate-700/80 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-emerald-400 text-sm font-semibold">{cfg.pan}</span>
                          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono uppercase tracking-wider font-bold">
                            {cfg.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          {cfg.email}
                        </p>
                        <p className="text-[10px] text-slate-500 flex items-center gap-1">
                          <Briefcase className="w-3 h-3 text-slate-600 shrink-0" />
                          Portfolio Name: <span className="font-mono text-slate-400">{cfg.portfolio_name}</span>
                        </p>
                        {cfg.last_sync && (
                          <p className="text-[10px] text-emerald-500 font-mono">
                            Last Checked: {cfg.last_sync}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
                        <button
                          onClick={() => handleTriggerCamsRequest(cfg.pan, cfg.email)}
                          disabled={!!syncStatus[cfg.pan]}
                          className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded text-[10px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          title="Triggers online CAMS portal to generate and email a statement"
                        >
                          {syncStatus[cfg.pan]?.includes('Requesting') ? (
                            <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                          ) : (
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                          )}
                          Request CAS
                        </button>

                        <button
                          onClick={() => handleAutoSync(cfg.pan)}
                          disabled={!!syncStatus[cfg.pan]}
                          className="px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded text-[10px] font-extrabold flex items-center gap-1 cursor-pointer disabled:bg-slate-800"
                        >
                          {syncStatus[cfg.pan]?.includes('Checking') ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Play className="w-3 h-3 shrink-0 fill-current" />
                          )}
                          Sync Now
                        </button>

                        <button
                          onClick={() => handleDeleteConfig(cfg.pan)}
                          className="p-1.5 bg-slate-950 hover:bg-red-950 border border-slate-800 hover:border-red-500/30 text-slate-500 hover:text-red-400 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3 text-[10px] text-slate-400 flex items-start gap-2.5 mt-4">
            <HelpCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <span className="text-emerald-400 font-medium font-sans">How this works:</span> CAMS Statement Auto-Tracking periodically simulates requests to MFCentral and triggers portal updates. Pressing <strong className="text-slate-200">"Sync Now"</strong> downloads new monthly SIP installments and auto-debits going forward directly into your portfolio!
            </div>
          </div>
        </div>

        {/* PANEL 2: Heuristic Consolidated Statement Upload */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between" id="panel-manual-upload">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-sky-500/10 border border-sky-500/20 rounded-xl text-sky-400">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-slate-100">CAMS Statement Upload</h3>
                <p className="text-slate-400 text-xs">Import mutual fund trades directly from your exported Excel or CSV Consolidated Account Statement</p>
              </div>
            </div>

            {/* Download Template Panel */}
            <div className="mt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-950/60 p-4 rounded-xl border border-slate-800/60 gap-3">
              <div>
                <span className="text-xs font-semibold text-slate-200 block">Need the correct column structure?</span>
                <span className="text-[11px] text-slate-400 block mt-0.5">Download our pre-formatted sample Excel template for mutual fund transactions.</span>
              </div>
              <a
                href="/api/import/template?model=transactions"
                download
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-950/30 hover:bg-emerald-950/50 px-3.5 py-2 rounded-xl border border-emerald-500/20 active:scale-95 shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Download Template (.xlsx)
              </a>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4 mt-4">
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Target Portfolio Name</label>
                    <span className="text-[10px] text-emerald-400 font-mono">Required</span>
                  </div>
                  <select
                    value={uploadPortfolioOption}
                    onChange={e => setUploadPortfolioOption(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-slate-200 text-sm focus:border-emerald-500/50 focus:outline-none font-sans"
                  >
                    <option value="new">-- Create New Portfolio --</option>
                    {portfoliosList.map(p => (
                      <option key={p.name} value={p.name}>
                        {p.name} (Holdings: {p.current_value > 0 ? `₹${Math.round(p.current_value).toLocaleString()}` : 'None'})
                      </option>
                    ))}
                  </select>
                </div>

                {uploadPortfolioOption === 'new' && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-1"
                  >
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">New Portfolio Name</label>
                    <input
                      type="text"
                      placeholder="Enter portfolio name (e.g. Maa, Papa, Personal)"
                      value={customPortfolioName}
                      onChange={e => setCustomPortfolioName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500/50 text-slate-200 rounded-lg py-2 px-3 text-sm focus:outline-none placeholder:text-slate-500"
                      required
                    />
                  </motion.div>
                )}
              </div>

              {/* PDF Password (if PDF or requested) */}
              {showPasswordInput && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-1"
                >
                  <label className="text-[10px] uppercase font-bold tracking-wider text-amber-400 block">
                    PDF Password (Required)
                  </label>
                  <div className="relative">
                    <Key className="absolute left-3 top-2.5 w-4 h-4 text-amber-500" />
                    <input
                      type="password"
                      placeholder="Enter password to decrypt your CAMS CAS PDF statement"
                      value={pdfPassword}
                      onChange={e => setPdfPassword(e.target.value)}
                      className="w-full bg-slate-950 border border-amber-500/30 focus:border-amber-500 text-slate-200 rounded-lg py-2 pl-9 pr-3 text-sm focus:outline-none placeholder:text-slate-500"
                    />
                  </div>
                  <p className="text-[9px] text-slate-400">This password is used strictly in-memory on the server to parse transaction rows.</p>
                </motion.div>
              )}              {/* Drag and Drop Zone */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById('cams-file-selector')?.click()}
                className={`py-8 px-4 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                  dragActive ? 'border-sky-500 bg-sky-500/5' : 'border-slate-800 hover:border-slate-700 bg-slate-950/40'
                }`}
              >
                <input
                  id="cams-file-selector"
                  type="file"
                  accept=".xlsx,.xls,.csv,.json,.pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                <UploadCloud className={`w-10 h-10 mb-2 ${file ? 'text-emerald-400' : 'text-slate-500'}`} />
                {file ? (
                  <div>
                    <p className="text-slate-200 font-medium text-sm font-mono">{file.name}</p>
                    <p className="text-[10px] text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB — Press "Submit Statement" below</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-slate-300 font-medium text-sm">Drag and drop your CAMS Excel, CSV, PDF, or JSON statement here</p>
                    <p className="text-xs text-slate-500 mt-1">or click to browse local files</p>
                  </div>
                )}
              </div>

              {file && (
                <button
                  type="submit"
                  disabled={isUploading}
                  className="w-full bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 text-slate-950 text-xs font-semibold py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isUploading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 shrink-0" />
                  )}
                  Submit & Parse Statement
                </button>
              )}
            </form>

            {/* Display Parse Result */}
            {uploadResult && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-4 p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5"
              >
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Import Statistics
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-900 p-2.5 rounded border border-slate-800/60">
                    <span className="text-slate-400 block text-[10px] uppercase">Portfolio Target</span>
                    <strong className="text-emerald-400 font-mono text-sm">{uploadResult.portfolio_name}</strong>
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded border border-slate-800/60">
                    <span className="text-slate-400 block text-[10px] uppercase">Total Scanned Rows</span>
                    <strong className="text-slate-200 font-mono text-sm">{uploadResult.total_parsed}</strong>
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded border border-slate-800/60">
                    <span className="text-slate-400 block text-[10px] uppercase">Newly Imported</span>
                    <strong className="text-emerald-400 font-mono text-sm">+{uploadResult.inserted_count}</strong>
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded border border-slate-800/60">
                    <span className="text-slate-400 block text-[10px] uppercase">Skipped Duplicates</span>
                    <strong className="text-slate-500 font-mono text-sm">{uploadResult.skipped_duplicates}</strong>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Pricing Syncer Section */}
          <div className="mt-5 border-t border-slate-800 pb-2 pt-4">
            <h4 className="text-xs uppercase font-bold tracking-wider text-slate-400 mb-2.5">AMFI Daily NAV Pricing Engine</h4>
            <div className="p-4 bg-slate-950/50 border border-slate-800/80 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs font-medium text-slate-200 block">Synchronize Market Valuation</span>
                <p className="text-[10px] text-slate-400">Downloads and maps daily AMFI NAV prices using mutual fund ISINs directly.</p>
                {pricingResult && (
                  <p className="text-[10px] text-emerald-400 font-medium font-mono">{pricingResult}</p>
                )}
              </div>
              <button
                onClick={handleSyncPrices}
                disabled={isPricingSyncing}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 disabled:bg-slate-950 text-slate-100 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 self-start md:self-center"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isPricingSyncing ? 'animate-spin text-emerald-400' : 'text-slate-400'}`} />
                Sync Mutual Fund NAVs
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* PANEL: Portfolio Validation & Reconciliation Routine */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6" id="panel-reconciliation">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 border-b border-slate-800/80 pb-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-sky-500/10 border border-sky-500/20 rounded-lg text-sky-400 shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-lg text-slate-100">CAMS Statement Validation Routine</h3>
            </div>
            <p className="text-slate-400 text-xs">Verify that all schemes, quantities, and purchase prices from the uploaded statement match the active loaded portfolio exactly</p>
          </div>
          
          <div className="flex items-center gap-2">
            <select
              value={reconPortfolio}
              onChange={e => setReconPortfolio(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-3 text-slate-200 text-xs focus:border-emerald-500/50 focus:outline-none font-sans"
            >
              <option value="">-- Select Portfolio --</option>
              {portfoliosList.map(p => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
            
            <button
              onClick={fetchReconciliationReport}
              disabled={!reconPortfolio || isFetchingRecon}
              className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetchingRecon ? 'animate-spin text-sky-400' : ''}`} />
              Run Check
            </button>
          </div>
        </div>

        {isFetchingRecon ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-400" />
            Performing strict line-by-line reconciliation check...
          </div>
        ) : !reconPortfolio ? (
          <div className="py-8 text-center text-slate-500 text-xs border border-dashed border-slate-800/60 rounded-xl">
            Select an uploaded portfolio from the dropdown to run the ground-truth reconciliation routine.
          </div>
        ) : reconReport.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs border border-dashed border-slate-800/60 rounded-xl">
            No ground-truth reconciliation data found for this portfolio. Please re-upload your CAMS PDF statement to generate ground-truth balances.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary status banner */}
            {(() => {
              const mismatches = reconReport.filter(item => item.status !== 'RECONCILED');
              const isPerfect = mismatches.length === 0;
              return (
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                  isPerfect 
                    ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200' 
                    : 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                }`}>
                  {isPerfect ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <div className="text-xs space-y-1">
                    <strong className="text-sm font-bold block">
                      {isPerfect ? 'All Schemes Perfectly Reconciled!' : `${mismatches.length} Reconciliation Mismatch(es) Detected`}
                    </strong>
                    <p>
                      {isPerfect 
                        ? 'Congratulations! Every mutual fund scheme, closing quantity, and investment purchase cost from the official PDF matches the parsed database ledger perfectly.' 
                        : 'The validation routine has flagged differences between the PDF page 1 summary and recalculated database ledger. Please review the highlighted fields below.'}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Reconciliation table */}
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800 text-[10px] uppercase font-bold tracking-wider">
                    <th className="py-3 px-4">Scheme / ISIN</th>
                    <th className="py-3 px-4 text-right">PDF Quantity</th>
                    <th className="py-3 px-4 text-right">DB Quantity</th>
                    <th className="py-3 px-4 text-right">Qty Diff</th>
                    <th className="py-3 px-4 text-right">PDF Cost</th>
                    <th className="py-3 px-4 text-right">DB Cost</th>
                    <th className="py-3 px-4 text-right">Cost Diff</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 bg-slate-950/20">
                  {reconReport.map((item) => {
                    const isQtyMismatch = item.status === 'MISMATCH_QUANTITY';
                    const isCostMismatch = item.status === 'MISMATCH_COST';
                    const isNotLoaded = item.status === 'NOT_LOADED';
                    const isOk = item.status === 'RECONCILED';
                    
                    return (
                      <tr key={item.isin} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-3.5 px-4 max-w-[280px]">
                          <span className="font-semibold text-slate-200 block text-xs whitespace-normal break-words leading-tight" title={item.symbol}>{item.symbol}</span>
                          <span className="font-mono text-[10px] text-slate-500 mt-0.5 block">{item.isin}</span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                          {(item.pdfQuantity || 0).toFixed(3)}
                        </td>
                        <td className={`py-3.5 px-4 text-right font-mono ${isQtyMismatch || isNotLoaded ? 'text-rose-400 font-bold' : 'text-slate-300'}`}>
                          {(item.dbQuantity || 0).toFixed(3)}
                        </td>
                        <td className={`py-3.5 px-4 text-right font-mono ${isQtyMismatch || isNotLoaded ? 'text-rose-400' : 'text-slate-500'}`}>
                          {item.quantityDiff === 0 ? '-' : `${item.quantityDiff > 0 ? '+' : ''}${(item.quantityDiff || 0).toFixed(3)}`}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                          {item.pdfCost !== null ? formatCurrency(item.pdfCost) : 'N/A'}
                        </td>
                        <td className={`py-3.5 px-4 text-right font-mono ${isCostMismatch ? 'text-amber-400 font-bold' : 'text-slate-300'}`}>
                          {formatCurrency(item.dbCost)}
                        </td>
                        <td className={`py-3.5 px-4 text-right font-mono ${isCostMismatch ? 'text-amber-400' : 'text-slate-500'}`}>
                          {item.pdfCost === null || item.costDiff === 0 ? '-' : `${item.costDiff > 0 ? '+' : ''}${formatCurrency(item.costDiff)}`}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                            isOk 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                              : isNotLoaded
                              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                              : isQtyMismatch
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {item.status.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* PANEL 3: Multi-Portfolio Consolidated XIRR Optimizer & Clubber */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6" id="panel-consolidated-xirr">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 border-b border-slate-800/80 pb-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 shrink-0">
                <Activity className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-lg text-slate-100">Consolidated XIRR Optimizer</h3>
            </div>
            <p className="text-slate-400 text-xs">Tick or untick any direct stock or mutual fund portfolios to instantly compute consolidated gains and clubbed XIRR rate of return</p>
          </div>
          <button
            onClick={fetchPortfoliosData}
            disabled={isLoadingPortfolios}
            className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 self-start md:self-center transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPortfolios ? 'animate-spin text-emerald-400' : ''}`} />
            Refresh Portfolios
          </button>
        </div>

        {isLoadingPortfolios && portfoliosList.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
            Compiling and pricing individual portfolios...
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* List of individual portfolios */}
            <div className="xl:col-span-2 space-y-3">
              <div className="flex items-center justify-between px-2 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                <span>Select Portfolios to Club</span>
                <button
                  onClick={toggleSelectAll}
                  className="text-emerald-400 hover:text-emerald-300 font-sans tracking-normal uppercase text-[10px]"
                >
                  {selectedPortfolios.length === portfoliosList.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                {portfoliosList.map((p) => {
                  const isSelected = selectedPortfolios.includes(p.name);
                  const isMF = p.name.endsWith('-MF');
                  return (
                    <div
                      key={p.name}
                      onClick={() => toggleSelectPortfolio(p.name)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                        isSelected
                          ? 'bg-slate-950 border-emerald-500/40 shadow-sm shadow-emerald-950/20'
                          : 'bg-slate-950/40 border-slate-800 hover:border-slate-700/80'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Checkbox */}
                        <div
                          className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-colors ${
                            isSelected
                              ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                              : 'border-slate-700 bg-slate-900 hover:border-slate-600'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>

                        {/* Portfolio Label */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-100 font-semibold text-sm truncate">{p.name}</span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase shrink-0 ${
                                isMF
                                  ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                                  : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                              }`}
                            >
                              {isMF ? 'Mutual Funds' : 'Direct Stock'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                            <span>Invested: <strong className="text-slate-200 font-mono">{formatCurrency(p.total_invested)}</strong></span>
                            <span>Valuation: <strong className="text-slate-200 font-mono">{formatCurrency(p.current_value)}</strong></span>
                          </div>
                        </div>
                      </div>

                      {/* Financial statistics & Delete */}
                      <div className="flex items-center gap-3">
                        <div className="text-right shrink-0">
                          <div className={`text-xs font-semibold ${p.unrealized_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {p.unrealized_pnl >= 0 ? '+' : ''}
                            {formatCurrency(p.unrealized_pnl)} ({formatPct(p.unrealized_pct, true)})
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 mt-0.5 flex items-center justify-end gap-1">
                            <TrendingUp className="w-3 h-3 text-emerald-400" />
                            XIRR: <span className={`font-bold ${p.xirr && p.xirr >= 0 ? 'text-emerald-400' : p.xirr ? 'text-red-400' : 'text-slate-400'}`}>
                              {p.xirr !== null && p.xirr !== undefined ? formatPct(p.xirr) : '0%'}
                            </span>
                          </div>
                        </div>

                        {/* Delete Portfolio Button */}
                        <button
                          onClick={(e) => handleDeletePortfolioClick(e, p.name)}
                          className="p-2 bg-slate-900 hover:bg-rose-950/60 border border-slate-850 hover:border-rose-500/30 text-slate-500 hover:text-rose-400 rounded-lg transition-colors cursor-pointer shrink-0"
                          title={`Delete entire portfolio ${p.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Combined Clubbed XIRR Display Panel */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-col justify-between" id="clubbed-xirr-metrics-card">
              <div className="space-y-4">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  Combined Valuation Summary
                </div>

                {selectedPortfolios.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 text-xs">
                    No portfolios selected. Tick portfolios on the left to combine them.
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {/* Sum stats */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Total Selected Portfolios</span>
                        <strong className="text-slate-200">{selectedPortfolios.length}</strong>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Consolidated Cost Basis</span>
                        <strong className="text-slate-200 font-mono">
                          {formatCurrency(
                            portfoliosList
                              .filter((p) => selectedPortfolios.includes(p.name))
                              .reduce((sum, p) => sum + p.total_invested, 0)
                          )}
                        </strong>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Consolidated Current Value</span>
                        <strong className="text-slate-200 font-mono">
                          {formatCurrency(
                            portfoliosList
                              .filter((p) => selectedPortfolios.includes(p.name))
                              .reduce((sum, p) => sum + p.current_value, 0)
                          )}
                        </strong>
                      </div>
                      <div className="flex justify-between items-center text-xs border-t border-slate-800/80 pt-2">
                        <span className="text-slate-400">Unrealized Profit/Loss</span>
                        {(() => {
                          const cost = portfoliosList
                            .filter((p) => selectedPortfolios.includes(p.name))
                            .reduce((sum, p) => sum + p.total_invested, 0);
                          const current = portfoliosList
                            .filter((p) => selectedPortfolios.includes(p.name))
                            .reduce((sum, p) => sum + p.current_value, 0);
                          const pnl = current - cost;
                          const pct = cost > 0 ? (pnl / cost) * 100 : 0;
                          return (
                            <strong className={`font-mono ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {pnl >= 0 ? '+' : ''}
                              {formatCurrency(pnl)} ({formatPct(pct, true)})
                            </strong>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Consolidated XIRR Big Gauge */}
                    <div className="border-t border-slate-800/80 pt-4 text-center">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">
                        Consolidated Portfolio XIRR
                      </span>
                      {isCalculatingConsolidated ? (
                        <div className="py-3 flex items-center justify-center gap-1.5 text-xs text-slate-400 font-mono">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                          Recalculating flows...
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <span className={`text-4xl font-extrabold font-mono tracking-tight block ${
                            consolidatedXirr && consolidatedXirr >= 0 ? 'text-emerald-400' : consolidatedXirr ? 'text-red-400' : 'text-slate-200'
                          }`}>
                            {consolidatedXirr !== null && consolidatedXirr !== undefined ? formatPct(consolidatedXirr) : '0%'}
                          </span>
                          {consolidatedBenchXirr !== null && consolidatedBenchXirr !== undefined && (
                            <span className="text-[10px] text-slate-400 font-mono block">
                              Nifty 50 Benchmark: <strong className="text-slate-300 font-semibold">{formatPct(consolidatedBenchXirr)}</strong>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-[9px] text-slate-400 mt-4 leading-normal">
                XIRR represents your actual annualized rate of return, calculated mathematically by collecting all historical daily cash-inflow and cash-outflow dates across every selected stock and mutual fund ledger, mapped to the combined portfolio valuation at this very moment.
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={deleteModalOpen}
        title="Delete Portfolio"
        message={`CRITICAL WARNING: Are you absolutely sure you want to completely delete the entire portfolio "${portfolioToDelete}"?

This will permanently wipe all trades, transactions, holdings, and configurations associated with it. This operation cannot be undone.`}
        confirmText="Yes, Permanently Delete"
        cancelText="Keep Portfolio"
        isDangerous={true}
        onConfirm={handleConfirmDeletePortfolio}
        onCancel={() => {
          setDeleteModalOpen(false);
          setPortfolioToDelete('');
        }}
      />
      {/* MF CAS Auto-Sync Modal */}
      <MFCasAutoSyncModal
        isOpen={showAutoSyncModal}
        onClose={() => setShowAutoSyncModal(false)}
        portfolios={portfolios || []}
        onSyncComplete={() => {
          fetchPortfoliosData();
          fetchConfigs();
        }}
      />
    </div>
  );
}
