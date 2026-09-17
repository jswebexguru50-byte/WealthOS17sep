import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet, HardDrive, FolderSync, ShieldCheck, Layers, Upload, Download,
  CheckCircle2, AlertTriangle, ArrowRight, RefreshCw, FileCheck, Zap, Sparkles,
  ExternalLink, Globe, Bookmark, Copy, Check, Terminal, LogOut, HelpCircle, ChevronDown, ChevronUp
} from 'lucide-react';
import { BulkImportView } from './BulkImportView.js';
import { PMSManagerView } from './PMSManagerView.js';
import { CamsMutualFundsView } from './CamsMutualFundsView.js';
import { ReconciliationView } from './ReconciliationView.js';
import { Transaction } from '../types.js';
import { SUPPORTED_BROKER_TEMPLATES, BrokerFormatId, ReconHoldingItem } from '../types/brokerTemplates.js';

interface ImportsHubViewProps {
  portfolios: string[];
  pmsPortfolios: string[];
  selectedPortfolio: string;
  onPortfolioChange: (p: string) => void;
  onValidateBulk: (file: File, target: string, mappings?: Record<string, string>, portfolioOption?: string, portfolioName?: string) => Promise<any>;
  onCommitBulk: (batchId: string, mappings?: Record<string, string>, portfolioOption?: string, portfolioName?: string, overrideDuplicateIndices?: number[]) => Promise<any>;
  onUndoBatch: (batchId: string) => Promise<boolean>;
  onReconcile: (file: File, userMappings?: Record<string, string>, portfolio?: string, reconcileType?: string) => Promise<any>;
  onPMSUpload: (file: File) => Promise<any>;
  onAddTransaction: (txn: Partial<Transaction>) => Promise<boolean>;
  formatCurrency: (val: number) => string;
}

export function ImportsHubView({
  portfolios,
  pmsPortfolios,
  selectedPortfolio,
  onPortfolioChange,
  onValidateBulk,
  onCommitBulk,
  onUndoBatch,
  onReconcile,
  onPMSUpload,
  onAddTransaction,
  formatCurrency
}: ImportsHubViewProps) {
  const [subTab, setSubTab] = useState<'MULTI_BROKER' | 'ZERODHA_SYNC' | 'BULK' | 'PMS' | 'CAMS' | 'RECONCILE'>('MULTI_BROKER');
  
  // Multi-broker recon state
  const [reconBroker, setReconBroker] = useState<BrokerFormatId>('ZERODHA');
  const [reconFile, setReconFile] = useState<File | null>(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [reconResult, setReconResult] = useState<any | null>(null);
  const [reconPortfolio, setReconPortfolio] = useState<string>(selectedPortfolio || 'Combined');

  // Zerodha Live API / Enctoken Sync state
  const [zerodhaToken, setZerodhaToken] = useState('');
  const [zerodhaTokenType, setZerodhaTokenType] = useState<'ENCTOKEN' | 'KITE_CONNECT'>('ENCTOKEN');
  const [zerodhaApiKey, setZerodhaApiKey] = useState('');
  const [zerodhaPortfolio, setZerodhaPortfolio] = useState(selectedPortfolio || 'Self');
  const [zerodhaLoading, setZerodhaLoading] = useState(false);
  const [zerodhaResult, setZerodhaResult] = useState<any | null>(null);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [zerodhaAutoDetecting, setZerodhaAutoDetecting] = useState(false);
  const [detectedZerodhaSession, setDetectedZerodhaSession] = useState<{ user_id?: string; enctoken?: string; pageTitle?: string } | null>(null);
  const [showConnectAssistant, setShowConnectAssistant] = useState(false);
  const [assistantTab, setAssistantTab] = useState<'BOOKMARKLET' | 'BROWSER' | 'CONSOLE' | 'MANUAL'>('BOOKMARKLET');
  const [launchingBrowser, setLaunchingBrowser] = useState(false);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  // Zerodha Historical Past Tradebook Sync state
  const [tradebookFile, setTradebookFile] = useState<File | null>(null);
  const [tradebookPortfolio, setTradebookPortfolio] = useState<string>(selectedPortfolio || 'Papa');
  const [tradebookValidating, setTradebookValidating] = useState(false);
  const [tradebookCommitting, setTradebookCommitting] = useState(false);
  const [tradebookValidationResult, setTradebookValidationResult] = useState<any | null>(null);
  const [tradebookStatusMsg, setTradebookStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Downloads Folder Auto-Scanner & Playwright Console Automation states
  const [downloadsSummary, setDownloadsSummary] = useState<{ totalFiles: number; accounts: string[]; files: any[] } | null>(null);
  const [autoScanningDownloads, setAutoScanningDownloads] = useState(false);
  const [autoScanReport, setAutoScanReport] = useState<any | null>(null);
  const [autoDownloadingConsole, setAutoDownloadingConsole] = useState(false);

  const fetchDownloadsSummary = async () => {
    try {
      const res = await fetch('/api/zerodha/tradebook/downloads-summary');
      const data = await res.json();
      if (data.success) {
        setDownloadsSummary(data);
      }
    } catch {}
  };

  const handleScanAndIngestDownloads = async () => {
    setAutoScanningDownloads(true);
    setAutoScanReport(null);
    setTradebookStatusMsg(null);
    try {
      const res = await fetch('/api/zerodha/tradebook/scan-downloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        setAutoScanReport(data);
        setTradebookStatusMsg({
          type: 'success',
          text: `🎉 ${data.message}`
        });
        window.dispatchEvent(new Event('portfolioDataChanged'));
        fetchDownloadsSummary();
      } else {
        setTradebookStatusMsg({ type: 'error', text: data.error || 'Failed to scan Downloads folder' });
      }
    } catch (e: any) {
      setTradebookStatusMsg({ type: 'error', text: `Scan failed: ${e.message}` });
    } finally {
      setAutoScanningDownloads(false);
    }
  };

  // Incremental Sync Checkpoint state
  const [syncCheckpoint, setSyncCheckpoint] = useState<any | null>(null);
  const [forceFullSync, setForceFullSync] = useState(false);

  const fetchSyncCheckpoint = async (port?: string) => {
    const targetPort = port || tradebookPortfolio;
    try {
      const res = await fetch(`/api/zerodha/tradebook/checkpoint?portfolio=${encodeURIComponent(targetPort)}`);
      const data = await res.json();
      if (data.success) {
        setSyncCheckpoint(data);
      }
    } catch (e) {
      console.error('Failed to fetch sync checkpoint:', e);
    }
  };

  const handleAutoDownloadConsole = async () => {
    setAutoDownloadingConsole(true);
    setTradebookStatusMsg(null);
    try {
      const res = await fetch('/api/zerodha/tradebook/auto-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headless: false,
          portfolio: tradebookPortfolio,
          forceFull: forceFullSync
        })
      });
      const data = await res.json();
      if (data.success) {
        setTradebookStatusMsg({
          type: 'success',
          text: `🎉 ${data.message}`
        });
        window.dispatchEvent(new Event('portfolioDataChanged'));
        fetchDownloadsSummary();
        fetchSyncCheckpoint(tradebookPortfolio);
      } else {
        setTradebookStatusMsg({ type: 'error', text: data.error || 'Playwright Console download failed' });
      }
    } catch (e: any) {
      setTradebookStatusMsg({ type: 'error', text: `Console automation failed: ${e.message}` });
    } finally {
      setAutoDownloadingConsole(false);
    }
  };

  // Zerodha API Demat Holdings vs Ledger Trades Reconciliation state
  const [zerodhaReconPortfolio, setZerodhaReconPortfolio] = useState<string>(selectedPortfolio || 'Maa');
  const [zerodhaReconLoading, setZerodhaReconLoading] = useState(false);
  const [zerodhaReconReport, setZerodhaReconReport] = useState<any | null>(null);
  const [zerodhaReconFilter, setZerodhaReconFilter] = useState<'ALL' | 'MATCHED' | 'DISCREPANT' | 'APPROVED'>('ALL');

  // Exception Approval Modal state
  const [exceptionModalItem, setExceptionModalItem] = useState<any | null>(null);
  const [exceptionReasonCategory, setExceptionReasonCategory] = useState('OFF_MARKET_TRANSFER_OUT');
  const [exceptionReasonNotes, setExceptionReasonNotes] = useState('');
  const [approvingException, setApprovingException] = useState(false);

  const handleFetchReconciliation = async (port?: string) => {
    const targetPort = port || zerodhaReconPortfolio;
    setZerodhaReconLoading(true);
    try {
      const res = await fetch(`/api/zerodha/reconciliation?portfolio=${encodeURIComponent(targetPort)}`);
      const data = await res.json();
      if (data.success) {
        setZerodhaReconReport(data);
      }
    } catch (e: any) {
      console.error('Failed to fetch reconciliation report:', e);
    } finally {
      setZerodhaReconLoading(false);
    }
  };

  const handleApproveException = async () => {
    if (!exceptionModalItem) return;
    setApprovingException(true);
    try {
      const res = await fetch('/api/zerodha/reconciliation/approve-exception', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio: zerodhaReconPortfolio,
          scripOrTradeId: exceptionModalItem.isin || exceptionModalItem.symbol,
          exceptionType: 'DEMAT_VS_LEDGER_QTY',
          discrepancyDetail: `Demat Qty: ${exceptionModalItem.apiQty}, Ledger Qty: ${exceptionModalItem.ledgerQty} (Diff: ${exceptionModalItem.diffQty})`,
          reasonCategory: exceptionReasonCategory,
          reasonNotes: exceptionReasonNotes
        })
      });
      const data = await res.json();
      if (data.success) {
        setExceptionModalItem(null);
        setExceptionReasonNotes('');
        handleFetchReconciliation(zerodhaReconPortfolio);
      }
    } catch (e: any) {
      alert(`Failed to approve exception: ${e.message}`);
    } finally {
      setApprovingException(false);
    }
  };

  const handleRevokeException = async (exceptionId: number) => {
    if (!confirm('Are you sure you want to revoke this approved exception?')) return;
    try {
      await fetch('/api/zerodha/reconciliation/revoke-exception', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exceptionId })
      });
      handleFetchReconciliation(zerodhaReconPortfolio);
    } catch (e: any) {
      alert(`Failed to revoke exception: ${e.message}`);
    }
  };

  const handleValidateTradebook = async (fileToValidate: File) => {
    setTradebookFile(fileToValidate);
    setTradebookValidating(true);
    setTradebookValidationResult(null);
    setTradebookStatusMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', fileToValidate);
      formData.append('portfolio', tradebookPortfolio);

      const res = await fetch('/api/zerodha/tradebook/validate', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setTradebookValidationResult(data);
        if (data.suggestedPortfolio) {
          setTradebookPortfolio(data.suggestedPortfolio);
        }
        setTradebookStatusMsg({
          type: 'success',
          text: `Validated ${data.totalTradesInFile} trades (${data.newTradesCount} new, ${data.duplicateTradesCount} already in DB) for account ${data.detectedClientId || 'Zerodha'}.`
        });
      } else {
        setTradebookStatusMsg({ type: 'error', text: data.error || 'Failed to validate tradebook' });
      }
    } catch (e: any) {
      setTradebookStatusMsg({ type: 'error', text: `Validation failed: ${e.message}` });
    } finally {
      setTradebookValidating(false);
    }
  };

  const handleCommitTradebook = async () => {
    if (!tradebookValidationResult?.batchId) return;
    setTradebookCommitting(true);
    setTradebookStatusMsg(null);
    try {
      const res = await fetch('/api/zerodha/tradebook/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: tradebookValidationResult.batchId,
          portfolio: tradebookPortfolio
        })
      });
      const data = await res.json();
      if (data.success) {
        setTradebookStatusMsg({
          type: 'success',
          text: `🎉 ${data.message}`
        });
        setTradebookValidationResult(null);
        setTradebookFile(null);
        window.dispatchEvent(new Event('portfolioDataChanged'));
      } else {
        setTradebookStatusMsg({ type: 'error', text: data.error || 'Commit failed' });
      }
    } catch (e: any) {
      setTradebookStatusMsg({ type: 'error', text: `Commit failed: ${e.message}` });
    } finally {
      setTradebookCommitting(false);
    }
  };

  // Bookmarklet and Console snippets for 1-click token linking
  const bookmarkletCode = `javascript:(function(){try{const c=document.cookie.split(';').reduce((a,v)=>{const[k,val]=v.trim().split('=');a[k]=val;return a;},{});const t=c['enctoken'];const u=c['user_id']||document.querySelector('.user-id')?.innerText||'Zerodha User';if(!t){alert('⚠️ No active Zerodha session found on this tab. Please ensure you are logged into kite.zerodha.com!');return;}const url='http://localhost:3000/api/zerodha/push-session';fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t,user_id:u})}).then(r=>r.json()).then(d=>{if(d.success)alert('🎉 Zerodha linked to WealthOS for user '+u+'!\\n\\nSwitch back to your WealthOS tab.');else alert('Link error: '+(d.error||'Failed'));}).catch(e=>{const img=new Image();img.src=url+'?token='+encodeURIComponent(t)+'&user_id='+encodeURIComponent(u)+'&t='+Date.now();alert('🎉 Zerodha linked to WealthOS for user '+u+'!\\n\\nSwitch back to your WealthOS tab.');});}catch(e){alert('Error: '+e.message);}})();`;

  const consoleSnippetCode = `fetch('http://localhost:3000/api/zerodha/push-session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: document.cookie.match(/(?:^|;\\s*)enctoken=([^;]+)/)?.[1],
    user_id: document.cookie.match(/(?:^|;\\s*)user_id=([^;]+)/)?.[1] || document.querySelector('.user-id')?.innerText || 'Zerodha User'
  })
}).then(r => r.json()).then(d => alert('🎉 ' + (d.message || 'Connected!'))).catch(e => alert('Error: ' + e.message));`;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(id);
    setTimeout(() => setCopiedItem(null), 2500);
  };

  // Auto-detect active Zerodha tab whenever user enters ZERODHA_SYNC tab or switches back to this window
  useEffect(() => {
    if (subTab === 'ZERODHA_SYNC') {
      handleAutoDetectZerodha(true);
      fetchDownloadsSummary();
      handleFetchReconciliation();
      fetchSyncCheckpoint();

      const handleWindowFocus = () => {
        handleAutoDetectZerodha(true);
      };
      window.addEventListener('focus', handleWindowFocus);
      return () => window.removeEventListener('focus', handleWindowFocus);
    }
  }, [subTab]);

  const handleAutoDetectZerodha = async (silent: boolean = false): Promise<boolean> => {
    setZerodhaAutoDetecting(true);
    try {
      const res = await fetch('/api/zerodha/auto-detect');
      const data = await res.json();
      if (data.success && data.enctoken) {
        setDetectedZerodhaSession({
          user_id: data.user_id,
          enctoken: data.enctoken,
          pageTitle: data.pageTitle
        });
        setZerodhaToken(data.enctoken);
        setZerodhaTokenType('ENCTOKEN');
        setShowConnectAssistant(false);
        return true;
      } else {
        setDetectedZerodhaSession(null);
        if (!silent) {
          setShowConnectAssistant(true);
        }
        return false;
      }
    } catch (e: any) {
      if (!silent) {
        setShowConnectAssistant(true);
      }
      return false;
    } finally {
      setZerodhaAutoDetecting(false);
    }
  };

  const handleLaunchConnectedBrowser = async () => {
    setLaunchingBrowser(true);
    try {
      const res = await fetch('/api/zerodha/launch-browser', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSyncStatusMsg({
          type: 'success',
          text: `🚀 ${data.message || 'Connected browser launched! Log in on the window to auto-connect.'}`
        });
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          const detected = await handleAutoDetectZerodha(true);
          if (detected || attempts > 30) {
            clearInterval(interval);
          }
        }, 2500);
      } else {
        setSyncStatusMsg({
          type: 'error',
          text: data.message || 'Failed to launch connected browser'
        });
      }
    } catch (e: any) {
      setSyncStatusMsg({ type: 'error', text: `Launch error: ${e.message}` });
    } finally {
      setLaunchingBrowser(false);
    }
  };

  const handleClearZerodhaSession = async () => {
    try {
      await fetch('/api/zerodha/clear-session', { method: 'POST' });
      setDetectedZerodhaSession(null);
      setZerodhaToken('');
      setSyncStatusMsg({ type: 'success', text: 'Zerodha session cleared.' });
    } catch (e: any) {
      alert(`Failed to clear session: ${e.message}`);
    }
  };

  const handle1ClickAutoSync = async () => {
    setZerodhaLoading(true);
    setZerodhaResult(null);
    try {
      const res = await fetch('/api/zerodha/auto-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolio: zerodhaPortfolio })
      });
      const data = await res.json();
      if (data.success) {
        setZerodhaResult(data);
        if (data.items?.length > 0) {
          window.dispatchEvent(new Event('portfolioDataChanged'));
        }
      } else {
        alert(`Zerodha auto-sync error: ${data.error || data.message}`);
      }
    } catch (e: any) {
      alert(`Sync failed: ${e.message}`);
    } finally {
      setZerodhaLoading(false);
    }
  };

  const handleZerodhaSync = async () => {
    if (!zerodhaToken.trim()) {
      alert('Please enter your Zerodha enctoken or Kite Connect token.');
      return;
    }
    setZerodhaLoading(true);
    setZerodhaResult(null);
    setSyncStatusMsg(null);
    try {
      const res = await fetch('/api/zerodha/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: zerodhaToken.trim(),
          tokenType: zerodhaTokenType,
          portfolio: zerodhaPortfolio,
          apiKey: zerodhaApiKey.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setZerodhaResult(data);
        setSyncStatusMsg({
          type: 'success',
          text: `✅ ${data.message || `Successfully synced ${data.totalHoldings} holdings from Zerodha Kite for "${data.portfolio}"!`}`
        });
        if (data.items?.length > 0) {
          window.dispatchEvent(new Event('portfolioDataChanged'));
        }
        setTimeout(() => {
          document.getElementById('zerodha-sync-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      } else {
        const errMsg = data.error || data.message || 'Unknown error occurred during Zerodha sync';
        setSyncStatusMsg({ type: 'error', text: `❌ ${errMsg}` });
        alert(`Zerodha sync error: ${errMsg}`);
      }
    } catch (e: any) {
      const netErr = `Sync failed: ${e.message}. Please verify the backend server is running.`;
      setSyncStatusMsg({ type: 'error', text: `❌ ${netErr}` });
      alert(netErr);
    } finally {
      setZerodhaLoading(false);
    }
  };

  const handleRunRecon = async () => {
    if (!reconFile) return;
    setReconLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', reconFile);
      formData.append('portfolio', reconPortfolio);
      formData.append('forcedFormat', reconBroker);

      const res = await fetch('/api/recon/multi-broker', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setReconResult(data);
      } else {
        alert(`Reconciliation error: ${data.error}`);
      }
    } catch (e: any) {
      alert(`Failed to run reconciliation: ${e.message}`);
    } finally {
      setReconLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Sub-Navigation Header */}
      <div 
        className="flex items-center justify-between p-2 rounded-2xl border shadow-sm backdrop-blur-md"
        style={{ background: 'var(--bg-card, #0F172A)', borderColor: 'var(--border-card, #1E293B)' }}
      >
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setSubTab('MULTI_BROKER')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              subTab === 'MULTI_BROKER'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            Multi-Broker Statement Recon
          </button>

          <button
            onClick={() => setSubTab('ZERODHA_SYNC')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              subTab === 'ZERODHA_SYNC'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <RefreshCw className="w-4 h-4 text-cyan-300" />
            Zerodha Kite Live Sync
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-400/20 text-cyan-200 font-mono">LIVE API</span>
          </button>

          <button
            onClick={() => setSubTab('BULK')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              subTab === 'BULK'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Spreadsheet Import
          </button>

          <button
            onClick={() => setSubTab('PMS')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              subTab === 'PMS'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            PMS Valuation Import
          </button>

          <button
            onClick={() => setSubTab('CAMS')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              subTab === 'CAMS'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <FolderSync className="w-4 h-4" />
            CAMS Mutual Funds CAS
          </button>

          <button
            onClick={() => setSubTab('RECONCILE')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              subTab === 'RECONCILE'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Audit Ledger
          </button>
        </div>
      </div>

      {/* MULTI-BROKER RECON TAB */}
      {subTab === 'MULTI_BROKER' && (
        <div className="space-y-6">
          {/* Top Config Card */}
          <div 
            className="p-6 rounded-3xl border shadow-sm space-y-6"
            style={{ background: 'var(--bg-card, #0F172A)', borderColor: 'var(--border-card, #1E293B)' }}
          >
            <div>
              <h3 className="text-base font-bold font-display" style={{ color: 'var(--text-primary)' }}>
                Multi-Broker Statement Reconciliation Hub
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Upload broker tradebooks or holdings statements to automatically reconcile against your SQLite database.
              </p>
            </div>

            {/* Broker Templates Selector Grid with Category Filter */}
            <div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Supported Broker & Statement Templates ({SUPPORTED_BROKER_TEMPLATES.length})
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[360px] overflow-y-auto pr-1">
                {SUPPORTED_BROKER_TEMPLATES.map((tmpl) => {
                  const isSelected = reconBroker === tmpl.id;
                  return (
                    <div
                      key={tmpl.id}
                      onClick={() => setReconBroker(tmpl.id)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 shadow-sm ring-1 ring-blue-500'
                          : 'border-slate-800 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-950 dark:bg-slate-950/40'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 dark:bg-slate-800 text-slate-300">
                            {tmpl.category}
                          </span>
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                        </div>
                        <h4 className="text-xs font-bold text-white mt-2">
                          {tmpl.name}
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                          {tmpl.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Selected Broker Download Guide */}
              {(() => {
                const cur = SUPPORTED_BROKER_TEMPLATES.find(t => t.id === reconBroker);
                if (!cur || !cur.downloadGuide) return null;
                return (
                  <div className="mt-3 p-3.5 rounded-2xl bg-slate-800 dark:bg-slate-800/80 border border-slate-800 text-xs flex items-start gap-2.5">
                    <span className="p-1 rounded bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold text-[10px] shrink-0 uppercase">HOW TO GET FILE</span>
                    <p className="text-slate-700 dark:text-slate-300 font-medium">
                      {cur.downloadGuide}
                    </p>
                  </div>
                );
              })()}
            </div>


            {/* File Dropzone & Target Portfolio */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="md:col-span-4 space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Target Portfolio in DB
                </label>
                <select
                  value={reconPortfolio}
                  onChange={(e) => setReconPortfolio(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-800 border border-slate-700 dark:border-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
                >
                  <option value="Combined">Consolidated (All Portfolios)</option>
                  {portfolios.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-8 flex flex-col sm:flex-row items-center gap-3">
                <label className="w-full flex-1 flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-2xl border-slate-700 dark:border-slate-700 hover:border-blue-500 transition-colors cursor-pointer bg-slate-900/80 dark:bg-slate-900/80/40 text-center">
                  <Upload className="w-5 h-5 text-slate-400 mb-1" />
                  <span className="text-xs font-bold text-slate-200">
                    {reconFile ? reconFile.name : 'Select or drop statement file (CSV, XLSX)'}
                  </span>
                  <input
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) setReconFile(e.target.files[0]);
                    }}
                  />
                </label>

                <button
                  onClick={handleRunRecon}
                  disabled={!reconFile || reconLoading}
                  className="w-full sm:w-auto px-6 py-4 rounded-2xl font-bold text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0"
                >
                  {reconLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Reconciling...</span>
                    </>
                  ) : (
                    <>
                      <FileCheck className="w-4 h-4" />
                      <span>Reconcile Now</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Reconciliation Output Diff Table */}
          {reconResult && (
            <div 
              className="p-6 rounded-3xl border shadow-sm space-y-5"
              style={{ background: 'var(--bg-card, #0F172A)', borderColor: 'var(--border-card, #1E293B)' }}
            >
              {/* Summary Cards Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                  <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 block">Matched Holdings</span>
                  <span className="text-xl font-mono font-bold text-emerald-700 dark:text-emerald-300">
                    {reconResult.summary.matchedCount}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                  <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400 block">Qty Mismatches</span>
                  <span className="text-xl font-mono font-bold text-amber-700 dark:text-amber-300">
                    {reconResult.summary.qtyMismatchCount}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
                  <span className="text-[10px] uppercase font-bold text-blue-700 dark:text-blue-400 block">Missing in DB</span>
                  <span className="text-xl font-mono font-bold text-blue-700 dark:text-blue-300">
                    {reconResult.summary.missingInDbCount}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800">
                  <span className="text-[10px] uppercase font-bold text-purple-700 dark:text-purple-400 block">Missing in File</span>
                  <span className="text-xl font-mono font-bold text-purple-700 dark:text-purple-300">
                    {reconResult.summary.missingInFileCount}
                  </span>
                </div>
              </div>

              {/* Items Diff Table */}
              <div className="overflow-x-auto touch-scroll-container rounded-2xl border border-slate-800 dark:border-slate-800">
                <table className="w-full text-left text-xs border-collapse font-mono" style={{ minWidth: 780 }}>
                  <thead className="bg-slate-800 dark:bg-slate-800 text-slate-200 font-bold border-b border-slate-800 uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">STATUS</th>
                      <th className="py-2.5 px-3">SCRIP / SYMBOL</th>
                      <th className="py-2.5 px-3 text-right">FILE QTY</th>
                      <th className="py-2.5 px-3 text-right">DB QTY</th>
                      <th className="py-2.5 px-3 text-right">QTY DIFF</th>
                      <th className="py-2.5 px-3 text-right">FILE VALUE</th>
                      <th className="py-2.5 px-3 text-right">DB VALUE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {reconResult.items.map((item: ReconHoldingItem, idx: number) => {
                      const isMatched = item.status === 'MATCHED';
                      return (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded font-sans text-[10px] font-bold ${
                              isMatched 
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : item.status === 'QTY_MISMATCH'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                            }`}>
                              {item.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-sans font-bold text-white">
                            {item.name} <span className="text-[10px] text-slate-400 font-mono">({item.symbol})</span>
                          </td>
                          <td className="py-2 px-3 text-right text-slate-200">
                            {item.fileQty.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-200">
                            {item.dbQty.toLocaleString('en-IN')}
                          </td>
                          <td className={`py-2 px-3 text-right font-bold ${item.qtyDiff === 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {item.qtyDiff > 0 ? `+${item.qtyDiff}` : item.qtyDiff}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-200">
                            {formatCurrency(item.fileValue)}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-200">
                            {formatCurrency(item.dbValue)}
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
      )}

      {/* Sub-Tab Content: ZERODHA KITE LIVE SYNC */}
      {subTab === 'ZERODHA_SYNC' && (
        <div className="space-y-6">
          <div 
            className="p-6 rounded-3xl border shadow-sm"
            style={{ background: 'var(--bg-card, #0F172A)', borderColor: 'var(--border-card, #1E293B)' }}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white font-display">
                    Zerodha Kite Live Ingestion & Reconciliation
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    REAL-TIME SYNC
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Fetch live demat holdings directly from Zerodha Kite without exporting or parsing CSV files.
                </p>
              </div>
            </div>

            {/* Live Auto-Detection & Connection Assistant */}
            {detectedZerodhaSession ? (
              <div className="mt-5 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fadeIn">
                <div className="flex items-center gap-3">
                  <div className="relative flex items-center justify-center">
                    <span className="w-3 h-3 rounded-full bg-emerald-400"></span>
                    <span className="absolute w-5 h-5 rounded-full bg-emerald-400/40 animate-ping"></span>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-emerald-300 flex items-center gap-2">
                      <span>Active Zerodha Tab Connected: User {detectedZerodhaSession.user_id}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono">CONNECTED</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Session token automatically read from active tab ({detectedZerodhaSession.pageTitle || 'Zerodha Kite'}). Ready to sync live holdings!
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={handle1ClickAutoSync}
                    disabled={zerodhaLoading}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                  >
                    <Zap className={`w-4 h-4 ${zerodhaLoading ? 'animate-spin' : ''}`} />
                    <span>{zerodhaLoading ? 'Syncing Live Holdings...' : '1-Click Auto-Sync from Tab'}</span>
                  </button>
                  <button
                    onClick={() => handleAutoDetectZerodha(false)}
                    disabled={zerodhaAutoDetecting}
                    className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
                    title="Re-check browser tab"
                  >
                    <RefreshCw className={`w-4 h-4 ${zerodhaAutoDetecting ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={handleClearZerodhaSession}
                    className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-400 hover:text-rose-400 transition-all cursor-pointer"
                    title="Disconnect Zerodha session"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-cyan-400 shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-slate-200">
                        Auto-Detect Open Zerodha Kite Tab
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Open <a href="https://kite.zerodha.com" target="_blank" rel="noreferrer" className="text-cyan-400 underline">kite.zerodha.com</a> in your browser, then click Detect or use the 1-Click Link Assistant.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => handleAutoDetectZerodha(false)}
                      disabled={zerodhaAutoDetecting}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-all cursor-pointer shadow-md disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${zerodhaAutoDetecting ? 'animate-spin' : ''}`} />
                      <span>{zerodhaAutoDetecting ? 'Detecting Tabs...' : 'Detect Open Zerodha Tab'}</span>
                    </button>
                    <button
                      onClick={() => setShowConnectAssistant(!showConnectAssistant)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        showConnectAssistant
                          ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300'
                          : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                      }`}
                      title="Toggle 1-Click Connect Assistant"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>Link Assistant</span>
                      {showConnectAssistant ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Interactive Connection Assistant Accordion / Card */}
                {showConnectAssistant && (
                  <div className="p-5 rounded-2xl bg-slate-900/90 border border-cyan-500/30 space-y-4 animate-fadeIn">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                      <div>
                        <h4 className="text-xs font-bold text-white flex items-center gap-2">
                          <Zap className="w-4 h-4 text-amber-400" />
                          <span>Zerodha Tab Connect Assistant (Choose Any Method)</span>
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Standard browsers isolate tabs for security. Choose the fastest method to link your open Kite tab:
                        </p>
                      </div>
                      <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto w-full sm:w-auto">
                        <button
                          onClick={() => setAssistantTab('BOOKMARKLET')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                            assistantTab === 'BOOKMARKLET' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          ⚡ 1-Click Bookmarklet
                        </button>
                        <button
                          onClick={() => setAssistantTab('BROWSER')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                            assistantTab === 'BROWSER' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          🌐 Connected Window
                        </button>
                        <button
                          onClick={() => setAssistantTab('CONSOLE')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                            assistantTab === 'CONSOLE' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          💻 Console Snippet
                        </button>
                        <button
                          onClick={() => setAssistantTab('MANUAL')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                            assistantTab === 'MANUAL' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          🔑 Manual Paste
                        </button>
                      </div>
                    </div>

                    {/* Tab 1: 1-Click Bookmarklet */}
                    {assistantTab === 'BOOKMARKLET' && (
                      <div className="space-y-3">
                        <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-xs text-slate-300 space-y-2">
                          <div className="font-bold text-cyan-300 flex items-center gap-2">
                            <Bookmark className="w-4 h-4" />
                            <span>Recommended: 1-Click Bookmark (Works on ANY existing tab in 2 seconds)</span>
                          </div>
                          <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-300 font-sans">
                            <li>
                              Drag this button to your Bookmarks Bar (press <kbd className="px-1 bg-slate-800 rounded">Ctrl+Shift+B</kbd> to show bookmarks bar):
                              <div className="mt-2 inline-block">
                                <a
                                  href={bookmarkletCode}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    alert('👉 Drag this button to your browser bookmarks bar (Ctrl+Shift+B), then click it while on your Zerodha Kite tab!');
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow cursor-grab active:cursor-grabbing border border-cyan-300 select-none"
                                  title="Drag me to your Bookmarks Bar!"
                                >
                                  <Bookmark className="w-3.5 h-3.5 fill-current" />
                                  <span>⚡ Link Zerodha to WealthOS</span>
                                </a>
                              </div>
                            </li>
                            <li>
                              Go to your open <a href="https://kite.zerodha.com" target="_blank" rel="noreferrer" className="text-cyan-400 underline font-semibold">kite.zerodha.com</a> tab and click the bookmark.
                            </li>
                            <li>
                              Switch back to this WealthOS tab — it will connect and display your user ID automatically!
                            </li>
                          </ol>
                        </div>
                        <div className="flex items-center justify-between gap-3 pt-1">
                          <span className="text-[11px] text-slate-400 font-mono">Or copy the raw bookmarklet code:</span>
                          <button
                            onClick={() => copyToClipboard(bookmarkletCode, 'bookmarklet')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 cursor-pointer"
                          >
                            {copiedItem === 'bookmarklet' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedItem === 'bookmarklet' ? 'Copied URL!' : 'Copy Bookmarklet Code'}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Tab 2: Connected Browser Window */}
                    {assistantTab === 'BROWSER' && (
                      <div className="space-y-3">
                        <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 space-y-2">
                          <div className="font-bold text-white flex items-center gap-2">
                            <Globe className="w-4 h-4 text-cyan-400" />
                            <span>Launch Connected Browser with Remote Debugging</span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            This launches Chrome/Edge with remote debugging enabled on port 9222. Any tab opened in this window can be auto-detected natively by WealthOS without any bookmarks or tokens!
                          </p>
                          <div className="pt-2">
                            <button
                              onClick={handleLaunchConnectedBrowser}
                              disabled={launchingBrowser}
                              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-all cursor-pointer shadow-md disabled:opacity-50"
                            >
                              <Globe className={`w-4 h-4 ${launchingBrowser ? 'animate-spin' : ''}`} />
                              <span>{launchingBrowser ? 'Launching Browser Window...' : '🚀 Launch Connected Zerodha Window'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tab 3: Console Snippet */}
                    {assistantTab === 'CONSOLE' && (
                      <div className="space-y-3">
                        <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 space-y-2">
                          <div className="font-bold text-white flex items-center gap-2">
                            <Terminal className="w-4 h-4 text-cyan-400" />
                            <span>1-Line DevTools Console Snippet</span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            On your Zerodha Kite tab, press <kbd className="px-1 bg-slate-800 rounded">F12</kbd> &gt; go to <strong>Console</strong> &gt; paste this snippet and press <strong>Enter</strong>:
                          </p>
                          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 font-mono text-[10.5px] text-cyan-300 overflow-x-auto select-all">
                            {consoleSnippetCode}
                          </div>
                          <div className="flex justify-end pt-1">
                            <button
                              onClick={() => copyToClipboard(consoleSnippetCode, 'console')}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 cursor-pointer"
                            >
                              {copiedItem === 'console' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedItem === 'console' ? 'Copied Snippet!' : 'Copy Console Snippet'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tab 4: Manual Enctoken Paste */}
                    {assistantTab === 'MANUAL' && (
                      <div className="space-y-3">
                        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 space-y-1">
                          <span className="font-bold text-slate-300 block">💡 How to copy your Zerodha enctoken (10 seconds):</span>
                          <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-slate-400 font-mono">
                            <li>Log in to <a href="https://kite.zerodha.com" target="_blank" rel="noreferrer" className="text-cyan-400 underline">kite.zerodha.com</a> in your browser.</li>
                            <li>Press <kbd className="px-1 bg-slate-800 rounded">F12</kbd> (DevTools) &gt; Go to <strong>Application</strong> &gt; <strong>Cookies</strong> &gt; <kbd className="px-1 bg-slate-800 rounded">https://kite.zerodha.com</kbd>.</li>
                            <li>Copy the value of the <strong>enctoken</strong> cookie and paste it in the box below.</li>
                          </ol>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Form Fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6">
              {/* Target Portfolio */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Target Portfolio:
                </label>
                <select
                  value={zerodhaPortfolio}
                  onChange={(e) => setZerodhaPortfolio(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white"
                >
                  {portfolios.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Token Type */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Authentication Method:
                </label>
                <select
                  value={zerodhaTokenType}
                  onChange={(e) => setZerodhaTokenType(e.target.value as any)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white"
                >
                  <option value="ENCTOKEN">Web Session Enctoken (Zero-Cost / Instant)</option>
                  <option value="KITE_CONNECT">Official Kite Connect API Key + Token</option>
                </select>
              </div>

              {/* Optional API Key */}
              {zerodhaTokenType === 'KITE_CONNECT' && (
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1.5">
                    Kite API Key:
                  </label>
                  <input
                    type="text"
                    value={zerodhaApiKey}
                    onChange={(e) => setZerodhaApiKey(e.target.value)}
                    placeholder="Enter Zerodha API key..."
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-white"
                  />
                </div>
              )}

              {/* Enctoken / Token Input */}
              <div className={zerodhaTokenType === 'KITE_CONNECT' ? 'md:col-span-3' : 'md:col-span-1'}>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  {zerodhaTokenType === 'ENCTOKEN' ? 'Kite Enctoken:' : 'Kite Access Token:'}
                </label>
                <input
                  type="password"
                  value={zerodhaToken}
                  onChange={(e) => setZerodhaToken(e.target.value)}
                  placeholder="Paste token here..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-white"
                />
              </div>
            </div>

            {/* Enctoken Guide Box */}
            {zerodhaTokenType === 'ENCTOKEN' && (
              <div className="mt-4 p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 space-y-1">
                <span className="font-bold text-slate-300 block">💡 How to copy your Zerodha enctoken (10 seconds):</span>
                <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-slate-400 font-mono">
                  <li>Log in to <a href="https://kite.zerodha.com" target="_blank" rel="noreferrer" className="text-cyan-400 underline">kite.zerodha.com</a> in your browser.</li>
                  <li>Press <kbd className="px-1 bg-slate-800 rounded">F12</kbd> (DevTools) &gt; Go to <strong>Application</strong> &gt; <strong>Cookies</strong> &gt; <kbd className="px-1 bg-slate-800 rounded">https://kite.zerodha.com</kbd>.</li>
                  <li>Copy the value of the <strong>enctoken</strong> cookie and paste it in the box above.</li>
                </ol>
              </div>
            )}

            {/* Status Feedback Banner */}
            {syncStatusMsg && (
              <div className={`mt-5 p-3.5 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 animate-fadeIn ${
                syncStatusMsg.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                <div className="flex items-center gap-2">
                  <span>{syncStatusMsg.text}</span>
                </div>
                <button
                  onClick={() => setSyncStatusMsg(null)}
                  className="text-[11px] opacity-70 hover:opacity-100 uppercase font-mono cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Sync Action Button */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleZerodhaSync}
                disabled={zerodhaLoading || !zerodhaToken.trim()}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs bg-cyan-600 hover:bg-cyan-500 text-white transition-all cursor-pointer shadow-md disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${zerodhaLoading ? 'animate-spin' : ''}`} />
                <span>{zerodhaLoading ? 'Fetching Live Holdings...' : 'Sync Live Zerodha Holdings'}</span>
              </button>
            </div>
          </div>

          {/* Sync Results View */}
          {zerodhaResult && (
            <div 
              id="zerodha-sync-results"
              className="p-6 rounded-3xl border shadow-sm space-y-6 scroll-mt-6"
              style={{ background: 'var(--bg-card, #0F172A)', borderColor: 'var(--border-card, #1E293B)' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-base font-bold text-white font-display">
                    Zerodha Sync Summary ({zerodhaResult.portfolio})
                  </h4>
                  <p className="text-xs text-emerald-400 font-semibold">
                    ✓ {zerodhaResult.message}
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  Synced: {new Date(zerodhaResult.syncedAt).toLocaleTimeString()}
                </span>
              </div>

              {/* KPI Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <span className="text-xs text-slate-400 font-sans block">Total Holdings</span>
                  <span className="text-xl font-bold text-white">{zerodhaResult.totalHoldings} Scrips</span>
                </div>
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <span className="text-xs text-slate-400 font-sans block">Total Valuation</span>
                  <span className="text-xl font-bold text-white">{formatCurrency(zerodhaResult.totalValuation)}</span>
                </div>
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <span className="text-xs text-slate-400 font-sans block">Unrealized P&L</span>
                  <span className={`text-xl font-bold ${zerodhaResult.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatCurrency(zerodhaResult.unrealizedPnl)}
                  </span>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-xs text-left">
                  <thead className="sticky top-0 bg-slate-900 font-bold uppercase tracking-wider text-[10px] text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Symbol</th>
                      <th className="py-2.5 px-3">ISIN</th>
                      <th className="py-2.5 px-3 text-right">Quantity</th>
                      <th className="py-2.5 px-3 text-right">Avg Price</th>
                      <th className="py-2.5 px-3 text-right">LTP</th>
                      <th className="py-2.5 px-3 text-right">Current Value</th>
                      <th className="py-2.5 px-3 text-right">Unrealized P&L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {zerodhaResult.items.map((item: any) => (
                      <tr key={item.isin || item.symbol} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-bold text-white font-sans">{item.symbol}</td>
                        <td className="py-2.5 px-3 text-slate-400">{item.isin || '-'}</td>
                        <td className="py-2.5 px-3 text-right text-slate-200">{item.quantity.toLocaleString('en-IN')}</td>
                        <td className="py-2.5 px-3 text-right text-slate-200">{formatCurrency(item.avgPrice)}</td>
                        <td className="py-2.5 px-3 text-right text-cyan-300 font-bold">{formatCurrency(item.lastPrice)}</td>
                        <td className="py-2.5 px-3 text-right text-white font-bold">{formatCurrency(item.currentValue)}</td>
                        <td className={`py-2.5 px-3 text-right font-bold ${item.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatCurrency(item.pnl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* HISTORICAL PAST TRADEBOOK SYNCHRONIZATION CARD */}
          <div 
            className="p-6 rounded-3xl border shadow-sm space-y-6"
            style={{ background: 'var(--bg-card, #0F172A)', borderColor: 'var(--border-card, #1E293B)' }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white font-display">
                    Zerodha Console Historical Tradebook Sync
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    FULL REPLICATION
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Synchronize multi-year past trades to replicate complete portfolios, recalculate FIFO holding lots, and track accurate historical returns.
                </p>
              </div>
              <a
                href="https://console.zerodha.com/reports/tradebook"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 border border-slate-700 text-cyan-400 hover:text-cyan-300 hover:border-cyan-500 transition-all self-start sm:self-auto"
              >
                <span>Open Zerodha Console</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Quick 4-Step Instructions Banner */}
            <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 text-xs space-y-2">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
                How to download your past trade history from Zerodha:
              </span>
              <ol className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-[11px] text-slate-400 pt-1">
                <li className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="font-bold text-cyan-400 block mb-0.5">1. Open Console</span>
                  Log in to <a href="https://console.zerodha.com/reports/tradebook" target="_blank" rel="noreferrer" className="text-cyan-300 underline">console.zerodha.com</a> and go to <strong>Reports &gt; Tradebook</strong>.
                </li>
                <li className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="font-bold text-cyan-400 block mb-0.5">2. Choose Dates</span>
                  Select your desired historical date range (e.g. from account opening to today).
                </li>
                <li className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="font-bold text-cyan-400 block mb-0.5">3. Download</span>
                  Click <strong>Download</strong> to save the file as a <strong>CSV or XLSX</strong> spreadsheet.
                </li>
                <li className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="font-bold text-cyan-400 block mb-0.5">4. Drop &amp; Ingest</span>
                  Drop the file below. It will auto-detect your account, de-duplicate, and compute FIFO lots!
                </li>
              </ol>
            </div>

            {/* Status Feedback Message */}
            {tradebookStatusMsg && (
              <div className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 animate-fadeIn ${
                tradebookStatusMsg.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                <span>{tradebookStatusMsg.text}</span>
                <button
                  onClick={() => setTradebookStatusMsg(null)}
                  className="text-[11px] opacity-70 hover:opacity-100 uppercase font-mono cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* AUTOMATION COMMAND STRIP */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  Automated Multi-Year Historical Tradebook Ingestion
                </span>
                {downloadsSummary && (
                  <span className="text-[11px] font-mono text-cyan-400">
                    {downloadsSummary.totalFiles} tradebook files found in Downloads ({downloadsSummary.accounts.join(', ')})
                  </span>
                )}
              </div>

              {/* Incremental Period Synchronization Bar */}
              {syncCheckpoint && (
                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      syncCheckpoint.isIncremental && !forceFullSync
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    }`}>
                      {syncCheckpoint.isIncremental && !forceFullSync ? '⚡ SUBSEQUENT RUN: INCREMENTAL' : '🔄 FULL PAST RE-SYNC'}
                    </span>
                    <span className="text-slate-300 font-sans">
                      {forceFullSync 
                        ? 'Full multi-year historical range from 2015 to Today.'
                        : syncCheckpoint.summaryText}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={forceFullSync}
                        onChange={(e) => setForceFullSync(e.target.checked)}
                        className="rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                      />
                      <span>Force Full Re-sync</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1-Click Downloads Folder Scanner */}
                <button
                  onClick={handleScanAndIngestDownloads}
                  disabled={autoScanningDownloads}
                  className="flex flex-col items-start p-4 rounded-2xl bg-gradient-to-br from-cyan-950/60 to-blue-950/40 border border-cyan-500/40 hover:border-cyan-400 transition-all text-left group cursor-pointer shadow-lg shadow-cyan-950/40 disabled:opacity-50"
                >
                  <div className="flex items-center justify-between w-full mb-1.5">
                    <span className="flex items-center gap-2 font-bold text-sm text-cyan-300 group-hover:text-cyan-200">
                      <Zap className={`w-4 h-4 text-cyan-400 ${autoScanningDownloads ? 'animate-spin' : ''}`} />
                      1-Click Scan &amp; Ingest All Downloads
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      {downloadsSummary ? `${downloadsSummary.totalFiles} files` : 'INSTANT'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Auto-scans your local Downloads folder for all historical tradebook files across all accounts (IPD619, PSI722, JDB184), de-duplicates, and syncs complete multi-year portfolios.
                  </p>
                </button>

                {/* Playwright Console Browser Auto-Downloader */}
                <button
                  onClick={handleAutoDownloadConsole}
                  disabled={autoDownloadingConsole}
                  className="flex flex-col items-start p-4 rounded-2xl bg-gradient-to-br from-indigo-950/60 to-purple-950/40 border border-indigo-500/40 hover:border-indigo-400 transition-all text-left group cursor-pointer shadow-lg shadow-indigo-950/40 disabled:opacity-50"
                >
                  <div className="flex items-center justify-between w-full mb-1.5">
                    <span className="flex items-center gap-2 font-bold text-sm text-indigo-300 group-hover:text-indigo-200">
                      <Sparkles className={`w-4 h-4 text-indigo-400 ${autoDownloadingConsole ? 'animate-spin' : ''}`} />
                      Automate Console Downloads (Playwright)
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      BROWSER AGENT
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Launches an automated browser session to log into console.zerodha.com, cycle through historical financial years, download CSVs, and feed them into the DB.
                  </p>
                </button>
              </div>

              {/* Auto-Scan Completion Report Grid */}
              {autoScanReport && (
                <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 space-y-3 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Auto-Scan Complete: Processed {autoScanReport.totalFilesScanned} files ({autoScanReport.totalNewTradesInserted} new trades ingested, {autoScanReport.totalDuplicatesSkipped} duplicates skipped)
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      FIFO Holdings Recalculated
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {autoScanReport.accounts.map((acc: any) => (
                      <div key={acc.clientId} className="p-3 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-cyan-300">{acc.portfolio}</span>
                          <span className="text-[10px] text-slate-400 font-sans">{acc.clientId}</span>
                        </div>
                        <div className="text-[11px] text-slate-300 space-y-0.5 font-sans">
                          <div>Files: <strong className="text-white">{acc.filesCount}</strong> | Total: <strong className="text-white">{acc.totalTrades}</strong></div>
                          <div className="text-emerald-400 font-bold">+{acc.newTrades} New Trades Ingested</div>
                          <div className="text-amber-400/80 text-[10px]">{acc.duplicatesSkipped} duplicates skipped</div>
                          <div className="text-slate-500 text-[10px]">{acc.dateRange.start} → {acc.dateRange.end}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Manual Upload Section Header */}
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Or Upload Single Tradebook Manually:
              </span>
            </div>

            {/* Dropzone & Target Portfolio Selection */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              <div className="md:col-span-4 space-y-2">
                <label className="text-xs font-bold text-slate-300 block">
                  Target Portfolio in DB:
                </label>
                <select
                  value={tradebookPortfolio}
                  onChange={(e) => setTradebookPortfolio(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white cursor-pointer"
                >
                  {portfolios.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500">
                  Auto-mapped if client ID is detected in file (IPD619 → Papa, PSI722 → Maa, JDB184 → Brother).
                </p>
              </div>

              <div className="md:col-span-8">
                <label className="w-full flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl border-slate-700 hover:border-cyan-500 transition-colors cursor-pointer bg-slate-900/50 text-center group">
                  <Upload className="w-6 h-6 text-slate-400 group-hover:text-cyan-400 mb-2 transition-colors" />
                  <span className="text-xs font-bold text-slate-200">
                    {tradebookFile ? tradebookFile.name : 'Select or drop Zerodha Tradebook file (CSV or XLSX)'}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-1">
                    Supports tradebook-*.xlsx, tradebook-*.csv with multi-year trades
                  </span>
                  <input
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleValidateTradebook(e.target.files[0]);
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Validation Loading */}
            {tradebookValidating && (
              <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-center gap-3 text-xs text-cyan-300">
                <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                <span>Parsing Zerodha Tradebook headers, validating scrips, and checking for duplicates...</span>
              </div>
            )}

            {/* Validation Preview Results */}
            {tradebookValidationResult && (
              <div className="space-y-5 pt-4 border-t border-slate-800 animate-fadeIn">
                {/* Summary KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono">
                  <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 font-sans block">Client / Account</span>
                    <span className="text-lg font-bold text-cyan-300">
                      {tradebookValidationResult.detectedClientId || 'Zerodha'}
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      → {tradebookPortfolio}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 font-sans block">Date Range</span>
                    <span className="text-sm font-bold text-white block mt-1">
                      {tradebookValidationResult.dateRange.start || 'N/A'}
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      to {tradebookValidationResult.dateRange.end || 'N/A'}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 font-sans block">New Trades to Ingest</span>
                    <span className="text-xl font-bold text-emerald-300">
                      +{tradebookValidationResult.newTradesCount}
                    </span>
                    <span className="text-[10px] text-emerald-400/70 block mt-0.5">
                      Will enter FIFO ledger
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                    <span className="text-[10px] uppercase font-bold text-amber-400 font-sans block">Existing Duplicates</span>
                    <span className="text-xl font-bold text-amber-300">
                      {tradebookValidationResult.duplicateTradesCount}
                    </span>
                    <span className="text-[10px] text-amber-400/70 block mt-0.5">
                      Skipped automatically
                    </span>
                  </div>
                </div>

                {/* Preview Trades Table */}
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Trade Preview (First {tradebookValidationResult.preview.length} of {tradebookValidationResult.totalTradesInFile})
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      File: {tradebookValidationResult.fileName}
                    </span>
                  </div>

                  <div className="overflow-x-auto max-h-[360px] rounded-2xl border border-slate-800">
                    <table className="w-full text-xs text-left font-mono">
                      <thead className="sticky top-0 bg-slate-900 font-bold uppercase tracking-wider text-[10px] text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Type</th>
                          <th className="py-2.5 px-3">Symbol</th>
                          <th className="py-2.5 px-3">ISIN</th>
                          <th className="py-2.5 px-3 text-right">Quantity</th>
                          <th className="py-2.5 px-3 text-right">Price</th>
                          <th className="py-2.5 px-3 text-right">Gross Total</th>
                          <th className="py-2.5 px-3">Trade ID</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {tradebookValidationResult.preview.map((t: any, idx: number) => (
                          <tr key={idx} className={`hover:bg-slate-800/40 ${t.isDuplicate ? 'opacity-50' : ''}`}>
                            <td className="py-2 px-3 font-sans">
                              {t.isDuplicate ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  DUPLICATE
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  NEW
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-300">{t.tradeDate}</td>
                            <td className="py-2 px-3 font-bold">
                              <span className={t.tradeType === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}>
                                {t.tradeType}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-bold text-white font-sans">{t.symbol}</td>
                            <td className="py-2 px-3 text-slate-400 text-[11px]">{t.isin || '-'}</td>
                            <td className="py-2 px-3 text-right text-slate-200">{t.quantity.toLocaleString('en-IN')}</td>
                            <td className="py-2 px-3 text-right text-slate-200">{formatCurrency(t.price)}</td>
                            <td className="py-2 px-3 text-right text-white font-bold">{formatCurrency(t.quantity * t.price)}</td>
                            <td className="py-2 px-3 text-slate-400 text-[11px]">{t.tradeId || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Commit Action Button */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-cyan-950/30 border border-cyan-500/30">
                  <div className="text-xs">
                    <span className="font-bold text-cyan-300 block">
                      Ready to replicate into &quot;{tradebookPortfolio}&quot;
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      Will insert {tradebookValidationResult.newTradesCount} clean trades into your Transactions ledger and automatically trigger FIFO holding recomputations.
                    </span>
                  </div>

                  <button
                    onClick={handleCommitTradebook}
                    disabled={tradebookCommitting || tradebookValidationResult.newTradesCount === 0}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all cursor-pointer shadow-lg shadow-cyan-500/20 disabled:opacity-50 shrink-0"
                  >
                    <CheckCircle2 className={`w-4 h-4 ${tradebookCommitting ? 'animate-spin' : ''}`} />
                    <span>
                      {tradebookCommitting 
                        ? 'Committing & Computing FIFO...' 
                        : `Commit & Ingest ${tradebookValidationResult.newTradesCount} Historical Trades`}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* DEMAT HOLDINGS VS LEDGER RECONCILIATION MATRIX */}
          <div 
            className="p-6 rounded-3xl border shadow-sm space-y-6"
            style={{ background: 'var(--bg-card, #0F172A)', borderColor: 'var(--border-card, #1E293B)' }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white font-display">
                    Demat Holdings vs Trade Ledger Reconciliation
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    AUDIT &amp; SYNC MATRIX
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Compare live Zerodha Demat snapshot (API truth) with calculated holdings from historical trades to pinpoint discrepancies, missing corporate actions, or unrecorded trades.
                </p>
              </div>

              {/* Portfolio Selector & Refresh */}
              <div className="flex items-center gap-2">
                <select
                  value={zerodhaReconPortfolio}
                  onChange={(e) => {
                    setZerodhaReconPortfolio(e.target.value);
                    handleFetchReconciliation(e.target.value);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white cursor-pointer"
                >
                  {['Maa', 'Brother - Equity', 'Papa', ...portfolios.filter(p => !['Maa', 'Brother - Equity', 'Papa'].includes(p))].map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>

                <button
                  onClick={() => handleFetchReconciliation(zerodhaReconPortfolio)}
                  disabled={zerodhaReconLoading}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${zerodhaReconLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {zerodhaReconLoading && (
              <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-center gap-3 text-xs text-cyan-300">
                <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                <span>Comparing Demat holdings against FIFO trade ledger for {zerodhaReconPortfolio}...</span>
              </div>
            )}

            {zerodhaReconReport && !zerodhaReconLoading && (
              <div className="space-y-5 animate-fadeIn">
                {/* KPI Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono">
                  <div className={`p-4 rounded-2xl border ${
                    zerodhaReconReport.matchRatePct === 100 
                      ? 'bg-emerald-500/10 border-emerald-500/30' 
                      : 'bg-amber-500/10 border-amber-500/30'
                  }`}>
                    <span className="text-[10px] uppercase font-bold text-slate-400 font-sans block">Sync Status</span>
                    <span className={`text-xl font-bold ${
                      zerodhaReconReport.matchRatePct === 100 ? 'text-emerald-400' : 'text-amber-400'
                    }`}>
                      {zerodhaReconReport.matchRatePct}% Match
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5 font-sans">
                      {zerodhaReconReport.matchedCount + (zerodhaReconReport.approvedCount || 0)} of {zerodhaReconReport.totalScrips} scrips accounted
                    </span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 font-sans block">Demat Valuation (API)</span>
                    <span className="text-xl font-bold text-white">
                      {formatCurrency(zerodhaReconReport.totalApiValuation)}
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5 font-sans">
                      Official Broker Demat
                    </span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 font-sans block">Ledger Valuation (FIFO)</span>
                    <span className="text-xl font-bold text-white">
                      {formatCurrency(zerodhaReconReport.totalLedgerValuation)}
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5 font-sans">
                      Calculated from Trades
                    </span>
                  </div>

                  <div className={`p-4 rounded-2xl border ${
                    (zerodhaReconReport.unapprovedCount || (zerodhaReconReport.discrepantCount - (zerodhaReconReport.approvedCount || 0))) === 0
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-rose-500/10 border-rose-500/30'
                  }`}>
                    <span className="text-[10px] uppercase font-bold text-slate-400 font-sans block">Discrepancy</span>
                    <span className={`text-xl font-bold ${
                      (zerodhaReconReport.unapprovedCount || (zerodhaReconReport.discrepantCount - (zerodhaReconReport.approvedCount || 0))) === 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {zerodhaReconReport.unapprovedCount || (zerodhaReconReport.discrepantCount - (zerodhaReconReport.approvedCount || 0))} Pending
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5 font-sans">
                      {zerodhaReconReport.approvedCount ? `${zerodhaReconReport.approvedCount} approved exceptions` : `${formatCurrency(Math.abs(zerodhaReconReport.valuationVariance))} variance`}
                    </span>
                  </div>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setZerodhaReconFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      zerodhaReconFilter === 'ALL'
                        ? 'bg-slate-700 text-white'
                        : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    All Scrips ({zerodhaReconReport.totalScrips})
                  </button>
                  <button
                    onClick={() => setZerodhaReconFilter('DISCREPANT')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      zerodhaReconFilter === 'DISCREPANT'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    Unapproved Discrepancies ({zerodhaReconReport.unapprovedCount || (zerodhaReconReport.discrepantCount - (zerodhaReconReport.approvedCount || 0))})
                  </button>
                  <button
                    onClick={() => setZerodhaReconFilter('APPROVED')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      zerodhaReconFilter === 'APPROVED'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                        : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    Approved Exceptions ({zerodhaReconReport.approvedCount || 0})
                  </button>
                  <button
                    onClick={() => setZerodhaReconFilter('MATCHED')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      zerodhaReconFilter === 'MATCHED'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    Matched Only ({zerodhaReconReport.matchedCount})
                  </button>
                </div>

                {/* Mobile Horizontal Scroll Hint */}
                <div className="lg:hidden flex items-center justify-between text-[11px] font-mono px-3.5 py-2 mb-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 shadow-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    Swipe table horizontally to inspect all 10 reconciliation columns
                  </span>
                  <span className="text-cyan-400 font-bold text-xs">⟷</span>
                </div>

                {/* Comparison Table */}
                <div className="overflow-x-auto touch-scroll-container max-h-[460px] rounded-2xl border border-slate-800">
                  <table className="w-full text-xs text-left font-mono" style={{ minWidth: 1050 }}>
                    <thead className="sticky top-0 bg-slate-900 font-bold uppercase tracking-wider text-[10px] text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Symbol</th>
                        <th className="py-2.5 px-3">ISIN</th>
                        <th className="py-2.5 px-3 text-right">Demat Qty (API)</th>
                        <th className="py-2.5 px-3 text-right">Ledger Qty (FIFO)</th>
                        <th className="py-2.5 px-3 text-right">Variance Qty</th>
                        <th className="py-2.5 px-3 text-right">Demat Avg</th>
                        <th className="py-2.5 px-3 text-right">Ledger Avg</th>
                        <th className="py-2.5 px-3">Diagnosis / Audit Note</th>
                        <th className="py-2.5 px-3 text-right">User Approval</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {zerodhaReconReport.items
                        .filter((item: any) => {
                          if (zerodhaReconFilter === 'MATCHED') return item.status === 'MATCHED';
                          if (zerodhaReconFilter === 'DISCREPANT') return item.status !== 'MATCHED' && !item.isApproved;
                          if (zerodhaReconFilter === 'APPROVED') return item.isApproved;
                          return true;
                        })
                        .map((item: any) => (
                          <tr key={item.isin || item.symbol} className="hover:bg-slate-800/40">
                            <td className="py-2 px-3 font-sans">
                              {item.status === 'MATCHED' && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  ✓ MATCHED
                                </span>
                              )}
                              {item.status !== 'MATCHED' && item.isApproved && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                  ✓ APPROVED EXCEPTION
                                </span>
                              )}
                              {item.status === 'MISSING_IN_LEDGER' && !item.isApproved && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  MISSING IN LEDGER
                                </span>
                              )}
                              {item.status === 'EXCESS_IN_LEDGER' && !item.isApproved && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                  EXCESS IN LEDGER
                                </span>
                              )}
                              {item.status === 'ONLY_IN_API' && !item.isApproved && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                  ONLY IN DEMAT
                                </span>
                              )}
                              {item.status === 'ONLY_IN_LEDGER' && !item.isApproved && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                  ONLY IN LEDGER
                                </span>
                              )}
                              {item.status === 'CONSOLE_UNLISTED_HOLDING' && !item.isApproved && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                                   CONSOLE UNLISTED
                                </span>
                              )}
                              {item.status === 'HDFC_DEMAT_ALLOCATION' && !item.isApproved && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                   HDFC DEMAT 35411692
                                </span>
                              )}
                              {item.status === 'DUAL_DEMAT_ALLOCATION' && !item.isApproved && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                                   DUAL DEMAT ALLOCATED
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-bold text-white font-sans">{item.symbol}</td>
                            <td className="py-2 px-3 text-slate-400 text-[11px]">{item.isin || '-'}</td>
                            <td className="py-2 px-3 text-right text-cyan-300 font-bold">
                              {item.apiQty.toLocaleString('en-IN')}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-200">
                              {item.ledgerQty.toLocaleString('en-IN')}
                            </td>
                            <td className={`py-2 px-3 text-right font-bold ${
                              item.diffQty === 0 ? 'text-emerald-400' : item.diffQty > 0 ? 'text-amber-400' : 'text-rose-400'
                            }`}>
                              {item.diffQty === 0 ? '0' : (item.diffQty > 0 ? `+${item.diffQty.toLocaleString('en-IN')}` : item.diffQty.toLocaleString('en-IN'))}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-300">{formatCurrency(item.apiAvgPrice)}</td>
                            <td className="py-2 px-3 text-right text-slate-300">{formatCurrency(item.ledgerAvgPrice)}</td>
                            <td className="py-2 px-3 text-[11px] text-slate-400 font-sans max-w-[240px]">
                              {item.isApproved && item.exceptionRecord ? (
                                <div>
                                  <span className="font-bold text-purple-300 block">{item.exceptionRecord.reason_category}</span>
                                  <span>{item.exceptionRecord.reason_notes || item.explanation}</span>
                                </div>
                              ) : (
                                item.explanation
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-sans">
                              {item.status === 'MATCHED' ? (
                                <span className="text-[11px] text-emerald-400 font-semibold">✓ In Sync</span>
                              ) : item.isApproved ? (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleRevokeException(item.exceptionRecord.id)}
                                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 cursor-pointer"
                                    title="Revoke user approval"
                                  >
                                    Revoke
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setExceptionModalItem(item);
                                    setExceptionReasonCategory('OFF_MARKET_TRANSFER_OUT');
                                    setExceptionReasonNotes('');
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 hover:border-cyan-500/50 transition-all cursor-pointer whitespace-nowrap"
                                >
                                  + Approve Exception
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
          </div>

          {/* USER EXCEPTION APPROVAL MODAL */}
          {exceptionModalItem && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn">
              <div className="w-full max-w-lg p-6 rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <h4 className="text-base font-bold text-white font-display">Approve Reconciliation Exception</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {exceptionModalItem.symbol} ({exceptionModalItem.isin || 'N/A'}) • {zerodhaReconPortfolio}
                    </p>
                  </div>
                  <button
                    onClick={() => setExceptionModalItem(null)}
                    className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-sm cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-xs space-y-1">
                  <div className="text-[10px] uppercase font-bold text-slate-400 font-sans">Current Discrepancy:</div>
                  <div className="text-white font-bold">
                    Demat Qty (API): <span className="text-cyan-400">{exceptionModalItem.apiQty}</span> | Ledger Qty: <span className="text-slate-200">{exceptionModalItem.ledgerQty}</span>
                  </div>
                  <div className="text-amber-400 font-semibold">
                    Variance: {exceptionModalItem.diffQty > 0 ? `+${exceptionModalItem.diffQty}` : exceptionModalItem.diffQty} shares ({formatCurrency(exceptionModalItem.diffValue)})
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 block">
                    Reason Category:
                  </label>
                  <select
                    value={exceptionReasonCategory}
                    onChange={(e) => setExceptionReasonCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white font-bold cursor-pointer"
                  >
                    <option value="OFF_MARKET_TRANSFER_OUT">Off-Market Transfer Out / Gifted</option>
                    <option value="OFF_MARKET_TRANSFER_IN">Off-Market Transfer In from another broker</option>
                    <option value="CORPORATE_ACTION_BONUS_SPLIT">Corporate Action (Bonus / Stock Split / Demerger not in tradebook)</option>
                    <option value="IPO_DIRECT_ALLOTMENT">IPO / Rights Issue Direct Allotment (RTA direct credit)</option>
                    <option value="MANUAL_CONTRACT_NOTE">Contract Note / Statement Trade</option>
                    <option value="HISTORICAL_OPENING_BALANCE">Historical Opening Balance prior to tradebook export</option>
                    <option value="OTHER">Other Custom Reason</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 block">
                    Audit Reasoning / Explanation Notes:
                  </label>
                  <textarea
                    rows={3}
                    value={exceptionReasonNotes}
                    onChange={(e) => setExceptionReasonNotes(e.target.value)}
                    placeholder="e.g. Transferred 9,000 shares to Papa's Zerodha Demat off-market via DIS slip on June 2024..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 font-sans"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    onClick={() => setExceptionModalItem(null)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApproveException}
                    disabled={approvingException}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all cursor-pointer disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                  >
                    {approvingException ? 'Saving Approval...' : 'Confirm & Approve Exception'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab Content */}
      {subTab === 'BULK' && (
        <BulkImportView
          onValidate={onValidateBulk}
          onCommit={onCommitBulk}
          onUndoBatch={onUndoBatch}
          portfolios={portfolios}
        />
      )}

      {subTab === 'PMS' && (
        <PMSManagerView
          portfolios={pmsPortfolios}
          selectedPortfolio={selectedPortfolio}
          onPortfolioChange={onPortfolioChange}
          onUpload={onPMSUpload}
          formatCurrency={formatCurrency}
        />
      )}

      {subTab === 'CAMS' && (
        <CamsMutualFundsView
          formatCurrency={formatCurrency}
          selectedPortfolio={selectedPortfolio}
          portfolios={portfolios}
        />
      )}

      {subTab === 'RECONCILE' && (
        <ReconciliationView
          onReconcile={onReconcile}
          formatCurrency={formatCurrency}
          portfolios={portfolios}
          selectedPortfolio={selectedPortfolio}
          onAddTransaction={onAddTransaction}
        />
      )}
    </div>
  );
}

