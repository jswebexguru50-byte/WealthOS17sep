import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGoogleLogin } from '@react-oauth/google';
import {
  Settings,
  Database,
  Trash2,
  AlertTriangle,
  RefreshCw,
  KeyRound,
  FileText,
  Info,
  CheckCircle2,
  Unplug,
  HardDrive,
  ExternalLink,
  Cloud,
  Upload,
  Download
} from 'lucide-react';
import { exportToGoogleDrive, exportDatabaseToGoogleDrive, ExportProgress } from '../lib/driveExport';
import { ConfirmationModal } from './ConfirmationModal.js';
import { ZipUpdateManager } from './ZipUpdateManager.js';
import { DatabaseSizeInspector } from './DatabaseSizeInspector.js';
import { Palette, Check, Sparkles } from 'lucide-react';
import { ThemeSelectorModal, THEME_OPTIONS, getActiveThemeId, applyTheme, ThemeId } from './ThemeSelectorModal.js';

interface SettingsViewProps {
  onPurgeBankBook?: (portfolio?: string, purgeMappings?: boolean) => Promise<boolean>;
  onPurgeTransactions: (portfolio?: string, purgeMappings?: boolean) => Promise<boolean>;
  onPurgeEverything: () => Promise<boolean>;
}

export function SettingsView({
  onPurgeBankBook,
  onPurgeTransactions,
  onPurgeEverything
}: SettingsViewProps) {
  // Upstox States
  const [upstoxKey, setUpstoxKey] = useState('');
  const [upstoxSecret, setUpstoxSecret] = useState('');
  const [upstoxRedirect, setUpstoxRedirect] = useState('');
  const [upstoxToken, setUpstoxToken] = useState('');
  const [isSavingUpstox, setIsSavingUpstox] = useState(false);

  // Alpaca States
  const [alpacaKey, setAlpacaKey] = useState('');
  const [alpacaSecret, setAlpacaSecret] = useState('');
  const [isSavingAlpaca, setIsSavingAlpaca] = useState(false);

  // Diagnostics States
  const [stats, setStats] = useState<any | null>(null);
  const [unpriced, setUnpriced] = useState<any[]>([]);
  const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState(false);

  // Google Drive Export States
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgress>({
    status: 'idle',
    processedCount: 0,
    totalCount: 0
  });
  const [dbExportProgress, setDbExportProgress] = useState<ExportProgress>({
    status: 'idle',
    processedCount: 0,
    totalCount: 0
  });
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Database Restore, Download & Purge States
  const [isRestoring, setIsRestoring] = useState(false);
  const [isDownloadingDb, setIsDownloadingDb] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [selectedRestoreFile, setSelectedRestoreFile] = useState<File | null>(null);
  const [purgeTxnsModalOpen, setPurgeTxnsModalOpen] = useState(false);
  const [purgeAllModalOpen, setPurgeAllModalOpen] = useState(false);

  // Theme Modal State
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [currentThemeId, setCurrentThemeId] = useState<ThemeId>(getActiveThemeId());

  // Portfolio Purge States
  const [selectedPurgePortfolio, setSelectedPurgePortfolio] = useState<string>('ALL');
  const [portfoliosList, setPortfoliosList] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/portfolios')
      .then(res => res.json())
      .then(data => {
        const rawList = Array.isArray(data)
          ? data
          : (data?.portfolios || data?.list || data?.detailedPortfolios || []);
        const names = rawList.map((p: any) => typeof p === 'string' ? p : (p.name || p.portfolio)).filter(Boolean);
        setPortfoliosList(Array.from(new Set(names)));
      })
      .catch(() => {});
  }, []);

  const handleDownloadDatabase = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setIsDownloadingDb(true);
    setRestoreMessage(null);

    try {
      const res = await fetch('/api/download-database?format=gz');
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}: ${res.statusText}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portfolio_${new Date().toISOString().split('T')[0]}.db.gz`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 200);
      setIsDownloadingDb(false);
      setRestoreMessage({ type: 'success', text: 'Portfolio database backup downloaded successfully!' });
    } catch (err: any) {
      setIsDownloadingDb(false);
      setRestoreMessage({ type: 'error', text: `Failed to download database: ${err.message}` });
    }
  };

  const handleDownloadProjectZip = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setIsDownloadingZip(true);
    setRestoreMessage(null);

    try {
      const res = await fetch('/api/download-project-zip');
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}: ${res.statusText}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `project_backup_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);
      setRestoreMessage({ type: 'success', text: 'Project ZIP backup downloaded successfully!' });
    } catch (err: any) {
      console.error('Failed to download project zip:', err);
      setRestoreMessage({ type: 'error', text: `Failed to download project ZIP: ${err.message}` });
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const handleRestoreFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedRestoreFile(file);
    setRestoreModalOpen(true);
    e.target.value = ''; // Reset input to allow selecting same file
  };

  const compressBlob = async (file: Blob): Promise<Blob> => {
    if (typeof CompressionStream !== 'undefined') {
      try {
        const stream = file.stream().pipeThrough(new CompressionStream('gzip'));
        const compressedArrayBuffer = await new Response(stream).arrayBuffer();
        return new Blob([compressedArrayBuffer], { type: 'application/gzip' });
      } catch (e) {
        console.warn('Compression failed, using raw file:', e);
      }
    }
    return file;
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const uploadInChunks = async (blob: Blob): Promise<any> => {
    const initRes = await fetch('/api/restore-database/chunk/init', { method: 'POST' });
    if (!initRes.ok) throw new Error(`Failed to initialize chunked upload: status ${initRes.status}`);
    const initData = await initRes.json();
    if (!initData.success) throw new Error(initData.message || 'Chunk init failed');
    const uploadId = initData.uploadId;

    const CHUNK_SIZE = 512 * 1024; // 512 KB per chunk to ensure zero HTTP 413 body size errors
    const totalChunks = Math.ceil(blob.size / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(blob.size, start + CHUNK_SIZE);
      const chunk = blob.slice(start, end);

      const pct = Math.round(((i + 1) / totalChunks) * 100);
      setRestoreMessage({ type: 'success', text: `Uploading database restore: Chunk ${i + 1} of ${totalChunks} (${pct}%)...` });

      let chunkUploaded = false;
      
      // Attempt 1: Raw binary octet-stream
      try {
        const rawRes = await fetch(`/api/restore-database/chunk/upload?uploadId=${uploadId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-upload-id': uploadId,
          },
          body: chunk,
        });

        if (rawRes.ok) {
          const rawData = await rawRes.json();
          if (rawData.success) chunkUploaded = true;
        }
      } catch (e) {
        console.warn(`Binary upload failed for chunk ${i + 1}, retrying via JSON Base64...`, e);
      }

      // Attempt 2: Base64 JSON fallback
      if (!chunkUploaded) {
        const base64Str = await blobToBase64(chunk);
        const jsonRes = await fetch('/api/restore-database/chunk/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadId, chunkBase64: base64Str }),
        });

        if (!jsonRes.ok) {
          const errTxt = await jsonRes.text();
          throw new Error(`Chunk ${i + 1} upload failed: ${errTxt.substring(0, 150)}`);
        }

        const jsonDb = await jsonRes.json();
        if (!jsonDb.success) {
          throw new Error(`Chunk ${i + 1} failed: ${jsonDb.message || 'Unknown error'}`);
        }
      }
    }

    setRestoreMessage({ type: 'success', text: 'Finalizing database restore & verifying ledger...' });
    const completeRes = await fetch('/api/restore-database/chunk/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId }),
    });

    if (!completeRes.ok) {
      const errText = await completeRes.text();
      throw new Error(`Restore completion failed: ${errText.substring(0, 200)}`);
    }

    return await completeRes.json();
  };

  const handleConfirmRestore = async () => {
    if (!selectedRestoreFile) return;
    setRestoreModalOpen(false);
    setIsRestoring(true);
    setRestoreMessage({ type: 'success', text: 'Compressing and preparing database restore payload...' });

    try {
      const compressedBlob = await compressBlob(selectedRestoreFile);
      let data: any = null;

      if (compressedBlob.size <= 4 * 1024 * 1024) {
        const formData = new FormData();
        formData.append('file', compressedBlob, selectedRestoreFile.name);
        formData.append('confirm', 'true');

        const res = await fetch('/api/restore-database', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          data = await res.json();
        } else if (res.status === 413) {
          data = await uploadInChunks(compressedBlob);
        } else {
          const text = await res.text();
          throw new Error(text.substring(0, 200) || `Server status ${res.status}`);
        }
      } else {
        data = await uploadInChunks(compressedBlob);
      }

      if (data && data.success) {
        setRestoreMessage({ type: 'success', text: 'Database restored successfully! Reloading page...' });
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setRestoreMessage({ type: 'error', text: data?.message || 'Failed to restore database.' });
      }
    } catch (err: any) {
      console.error('Database restore error:', err);
      setRestoreMessage({ type: 'error', text: err.message || 'An error occurred during restore.' });
    } finally {
      setIsRestoring(false);
      setSelectedRestoreFile(null);
    }
  };

  const driveLogin = useGoogleLogin({
    onSuccess: (tokenResponse) => {
      setDriveToken(tokenResponse.access_token);
      setIsLoggingIn(false);
    },
    onError: () => {
      alert('Failed to authenticate with Google Drive.');
      setIsLoggingIn(false);
    },
    scope: 'https://www.googleapis.com/auth/drive.file',
  });

  const handleDriveLogin = () => {
    setIsLoggingIn(true);
    driveLogin();
  };

  const handleStartExport = async () => {
    if (!driveToken) return;
    setExportProgress({
      status: 'fetching',
      processedCount: 0,
      totalCount: 0
    });
    
    await exportToGoogleDrive(driveToken, (progress) => {
      setExportProgress(progress);
    });
  };

  const handleStartDbExport = async () => {
    if (!driveToken) return;
    setDbExportProgress({
      status: 'fetching',
      processedCount: 0,
      totalCount: 0
    });
    
    await exportDatabaseToGoogleDrive(driveToken, (progress) => {
      setDbExportProgress(progress);
    });
  };

  const fetchUpstoxConfig = async () => {
    try {
      const res = await fetch('/api/settings/upstox');
      const data = await res.json();
      if (data.config) {
        setUpstoxKey(data.config.client_id || '');
        setUpstoxSecret(data.config.client_secret || '');
        setUpstoxRedirect(data.config.redirect_uri || '');
      }

      const tokenRes = await fetch('/api/settings');
      const tokenData = await tokenRes.json();
      if (tokenData) {
        setUpstoxToken(tokenData.upstox_token ? tokenData.upstox_token.trim() : '');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDiagnostics = async () => {
    setIsLoadingDiagnostics(true);
    try {
      const statsRes = await fetch('/api/diagnostics/stats');
      const statsData = await statsRes.json();
      
      const unpricedRes = await fetch('/api/diagnostics/unpriced');
      const unpricedData = await unpricedRes.json();

      setStats(statsData);
      setUnpriced(unpricedData);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingDiagnostics(false);
    }
  };

  const fetchAlpacaConfig = async () => {
    try {
      const res = await fetch('/api/settings/alpaca');
      const data = await res.json();
      if (data.config) {
        setAlpacaKey(data.config.alpaca_key || '');
        setAlpacaSecret(data.config.alpaca_secret || '');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveAlpaca = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingAlpaca(true);
    try {
      const res = await fetch('/api/settings/alpaca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alpaca_key: alpacaKey,
          alpaca_secret: alpacaSecret
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('Alpaca Market Data API credentials saved successfully!');
      } else {
        alert(data.message || 'Failed to save Alpaca settings.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingAlpaca(false);
    }
  };

  useEffect(() => {
    fetchUpstoxConfig();
    fetchAlpacaConfig();
    fetchDiagnostics();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'UPSTOX_AUTH_SUCCESS') {
        alert('Successfully authenticated with Upstox API!');
        fetchUpstoxConfig();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSaveUpstox = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingUpstox(true);
    try {
      const res1 = await fetch('/api/settings/upstox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: upstoxKey,
          client_secret: upstoxSecret,
          redirect_uri: upstoxRedirect
        })
      });
      const data1 = await res1.json();

      const res2 = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upstox_token: upstoxToken
        })
      });
      const data2 = await res2.json();

      if (data1.success && data2.success) {
        alert('Upstox API configurations and Access Token saved successfully!');
      } else {
        alert((data1.message || data2.message) || 'Failed to save settings.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingUpstox(false);
    }
  };

  const handlePurgeTxns = () => {
    setPurgeTxnsModalOpen(true);
  };

  const handleConfirmPurgeTxns = async () => {
    setPurgeTxnsModalOpen(false);
    const success = await onPurgeTransactions(selectedPurgePortfolio);
    if (success) {
      fetchDiagnostics();
      setRestoreMessage({
        type: 'success',
        text: selectedPurgePortfolio && selectedPurgePortfolio !== 'ALL'
          ? `Successfully purged transactions & corporate actions for portfolio "${selectedPurgePortfolio}". Master Tickers and User Scrip Mappings were preserved!`
          : 'Successfully purged transactions & corporate actions across all portfolios. Master Tickers and User Scrip Mappings were preserved!'
      });
    }
  };

  const handlePurgeAll = () => {
    setPurgeAllModalOpen(true);
  };

  const handleConfirmPurgeAll = async () => {
    setPurgeAllModalOpen(false);
    const success = await onPurgeEverything();
    if (success) fetchDiagnostics();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-slate-100 tracking-tight">System Settings</h1>
        <p className="text-slate-400 text-sm">Configure broker integrations, view engine telemetry, and manage local database states.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* UI Design System & Theme Selector Card */}
        <div
          className="glass-card rounded-2xl p-6 space-y-4 lg:col-span-2 border"
          style={{
            background: 'var(--bg-card)',
            borderColor: 'var(--border-card)',
            color: 'var(--text-primary)'
          }}
        >
          <div
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4"
            style={{ borderColor: 'var(--border-card)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="p-3 rounded-2xl border shadow-lg flex items-center justify-center"
                style={{
                  background: 'var(--accent-green-bg)',
                  color: 'var(--accent-green)',
                  borderColor: 'var(--border-card)'
                }}
              >
                <Palette className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  UI Design Systems & Theme Switcher
                  <span
                    className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border"
                    style={{
                      background: 'var(--accent-gold)',
                      color: '#000',
                      borderColor: 'var(--border-card)'
                    }}
                  >
                    12 Themes Available
                  </span>
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  Transform the entire application typography, color palette, card geometries, and contrast ratios instantly.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setThemeModalOpen(true)}
              className="px-5 py-2.5 font-bold text-xs rounded-xl transition-all shadow-lg flex items-center gap-2 shrink-0 cursor-pointer hover:opacity-90"
              style={{
                background: 'var(--accent-gold)',
                color: '#000'
              }}
            >
              <Palette className="w-4 h-4" />
              <span>Browse All 12 Themes</span>
            </button>
          </div>

          <div className="space-y-4 pt-1">
            {/* Section 1: Dark */}
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-2" style={{ color: 'var(--text-secondary)' }}>
                <span>🌙</span> Institutional Dark & Luxury OLED (6 Themes)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
                {THEME_OPTIONS.filter(t => t.category === 'dark').map((theme) => {
                  const isSelected = currentThemeId === theme.id;
                  return (
                    <div
                      key={theme.id}
                      onClick={() => {
                        setCurrentThemeId(theme.id);
                        applyTheme(theme.id);
                      }}
                      className="p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between hover:scale-[1.01]"
                      style={{
                        backgroundColor: isSelected ? 'var(--bg-card-hover)' : 'var(--bg-table-alt)',
                        borderColor: isSelected ? 'var(--accent-gold)' : 'var(--border-card)',
                        boxShadow: isSelected ? 'var(--shadow-card-hover)' : 'var(--shadow-card)',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                          {theme.name.split('&')[0]}
                        </span>
                        {isSelected && (
                          <span
                            className="w-2 h-2 rounded-full animate-pulse inline-block shrink-0"
                            style={{ backgroundColor: 'var(--accent-green)' }}
                          />
                        )}
                      </div>
                      <span className="text-[9px] mt-0.5 block truncate" style={{ color: 'var(--text-secondary)' }}>
                        {theme.tagline}
                      </span>
                      <div
                        className="flex items-center gap-1 mt-2 pt-1.5 border-t"
                        style={{ borderColor: 'var(--border-card)' }}
                      >
                        <span
                          className="w-3 h-3 rounded-full border shadow-xs inline-block"
                          style={{ backgroundColor: theme.bgHex, borderColor: 'var(--border-card)' }}
                        />
                        <span
                          className="w-3 h-3 rounded-full border shadow-xs inline-block"
                          style={{ backgroundColor: theme.accentHex, borderColor: 'var(--border-card)' }}
                        />
                        <span
                          className="w-3 h-3 rounded-full border shadow-xs inline-block"
                          style={{ backgroundColor: theme.secondaryHex, borderColor: 'var(--border-card)' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Trading */}
            <div className="pt-2 border-t" style={{ borderColor: 'var(--border-card)' }}>
              <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-2" style={{ color: 'var(--text-secondary)' }}>
                <span>⚡</span> Trading Desks & High-Contrast Terminals (3 Themes)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {THEME_OPTIONS.filter(t => t.category === 'trading').map((theme) => {
                  const isSelected = currentThemeId === theme.id;
                  return (
                    <div
                      key={theme.id}
                      onClick={() => {
                        setCurrentThemeId(theme.id);
                        applyTheme(theme.id);
                      }}
                      className="p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between hover:scale-[1.01]"
                      style={{
                        backgroundColor: isSelected ? 'var(--bg-card-hover)' : 'var(--bg-table-alt)',
                        borderColor: isSelected ? 'var(--accent-gold)' : 'var(--border-card)',
                        boxShadow: isSelected ? 'var(--shadow-card-hover)' : 'var(--shadow-card)',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                          {theme.name}
                        </span>
                        {isSelected && (
                          <span
                            className="w-2 h-2 rounded-full animate-pulse inline-block shrink-0"
                            style={{ backgroundColor: 'var(--accent-green)' }}
                          />
                        )}
                      </div>
                      <span className="text-[9px] mt-0.5 block truncate" style={{ color: 'var(--text-secondary)' }}>
                        {theme.tagline}
                      </span>
                      <div
                        className="flex items-center gap-1 mt-2 pt-1.5 border-t"
                        style={{ borderColor: 'var(--border-card)' }}
                      >
                        <span
                          className="w-3 h-3 rounded-full border shadow-xs inline-block"
                          style={{ backgroundColor: theme.bgHex, borderColor: 'var(--border-card)' }}
                        />
                        <span
                          className="w-3 h-3 rounded-full border shadow-xs inline-block"
                          style={{ backgroundColor: theme.accentHex, borderColor: 'var(--border-card)' }}
                        />
                        <span
                          className="w-3 h-3 rounded-full border shadow-xs inline-block"
                          style={{ backgroundColor: theme.secondaryHex, borderColor: 'var(--border-card)' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Light */}
            <div className="pt-2 border-t" style={{ borderColor: 'var(--border-card)' }}>
              <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-2" style={{ color: 'var(--text-secondary)' }}>
                <span>☀️</span> Daylight Executive Light — Zero White-on-White (3 Themes)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {THEME_OPTIONS.filter(t => t.category === 'light').map((theme) => {
                  const isSelected = currentThemeId === theme.id;
                  return (
                    <div
                      key={theme.id}
                      onClick={() => {
                        setCurrentThemeId(theme.id);
                        applyTheme(theme.id);
                      }}
                      className="p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between hover:scale-[1.01]"
                      style={{
                        backgroundColor: isSelected ? 'var(--bg-card-hover)' : 'var(--bg-table-alt)',
                        borderColor: isSelected ? 'var(--accent-gold)' : 'var(--border-card)',
                        boxShadow: isSelected ? 'var(--shadow-card-hover)' : 'var(--shadow-card)',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                          {theme.name}
                        </span>
                        {isSelected && (
                          <span
                            className="w-2 h-2 rounded-full animate-pulse inline-block shrink-0"
                            style={{ backgroundColor: 'var(--accent-green)' }}
                          />
                        )}
                      </div>
                      <span className="text-[9px] mt-0.5 block truncate" style={{ color: 'var(--text-secondary)' }}>
                        {theme.tagline}
                      </span>
                      <div
                        className="flex items-center gap-1 mt-2 pt-1.5 border-t"
                        style={{ borderColor: 'var(--border-card)' }}
                      >
                        <span
                          className="w-3 h-3 rounded-full border shadow-xs inline-block"
                          style={{ backgroundColor: theme.bgHex, borderColor: 'var(--border-card)' }}
                        />
                        <span
                          className="w-3 h-3 rounded-full border shadow-xs inline-block"
                          style={{ backgroundColor: theme.accentHex, borderColor: 'var(--border-card)' }}
                        />
                        <span
                          className="w-3 h-3 rounded-full border shadow-xs inline-block"
                          style={{ backgroundColor: theme.secondaryHex, borderColor: 'var(--border-card)' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Upstox developer configurations */}
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
            <KeyRound className="w-5 h-5 text-emerald-400" />
            <h3 className="font-display font-semibold text-slate-200">Upstox API Integrations</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Specify credentials from the Upstox Developer Portal. This enables automated daily balance, dividend, and contract note fetches directly from Console.
          </p>

          <form onSubmit={handleSaveUpstox} className="space-y-4 text-sm">
            {/* Key */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Client ID / API Key</label>
              <input
                type="text"
                value={upstoxKey}
                onChange={(e) => setUpstoxKey(e.target.value)}
                placeholder="Enter Upstox API key..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 text-slate-200 rounded-xl px-4 py-2"
              />
            </div>

            {/* Secret */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Client Secret Key</label>
              <input
                type="password"
                value={upstoxSecret}
                onChange={(e) => setUpstoxSecret(e.target.value)}
                placeholder="••••••••••••••••••••••••••••"
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 text-slate-200 rounded-xl px-4 py-2"
              />
            </div>

            {/* Redirect */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">OAuth Redirect URL</label>
              <input
                type="text"
                value={upstoxRedirect}
                onChange={(e) => setUpstoxRedirect(e.target.value)}
                placeholder="e.g. http://localhost:3000/api/auth/upstox/callback"
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 text-slate-200 rounded-xl px-4 py-2 font-mono text-xs"
              />
            </div>

            {/* Access Token */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Access Token / Bearer Token</label>
              <textarea
                value={upstoxToken}
                onChange={(e) => setUpstoxToken(e.target.value)}
                placeholder="Pasted bearer token or generated via Login..."
                rows={2}
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 text-slate-200 rounded-xl px-4 py-2 font-mono text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                type="submit"
                disabled={isSavingUpstox}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 text-slate-950 font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-lg shadow-emerald-500/10"
              >
                {isSavingUpstox ? 'Saving...' : 'Save Settings'}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!upstoxKey || !upstoxRedirect) {
                    alert('Please configure and save Client ID and Redirect URL first.');
                    return;
                  }
                  const authUrl = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${encodeURIComponent(upstoxKey)}&redirect_uri=${encodeURIComponent(upstoxRedirect)}`;
                  window.open(authUrl, '_blank', 'width=600,height=700');
                }}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Login with Upstox
              </button>
            </div>
          </form>
        </div>

        {/* Alpaca US Market Data API Configuration */}
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-200 text-base">Alpaca Market Data API (US Equities)</h3>
                <p className="text-xs text-slate-400">Configure free Alpaca API keys to fetch instant US stock prices & corporate actions</p>
              </div>
            </div>
            <a
              href="https://alpaca.markets"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
            >
              Get Free Keys <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Alpaca provides 5 requests/sec with no daily limit for US stocks. When set, US assets (like VOO, QQQ, SCHG, VGT, AAPL, MSFT) use Alpaca Market Data v2 API with instant fallback to Yahoo Finance.
          </p>

          <form onSubmit={handleSaveAlpaca} className="space-y-4 text-sm">
            {/* Key */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">APCA API Key ID</label>
              <input
                type="text"
                value={alpacaKey}
                onChange={(e) => setAlpacaKey(e.target.value)}
                placeholder="Enter Alpaca APCA-API-KEY-ID..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 text-slate-200 rounded-xl px-4 py-2 font-mono text-xs"
              />
            </div>

            {/* Secret */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">APCA Secret Key</label>
              <input
                type="password"
                value={alpacaSecret}
                onChange={(e) => setAlpacaSecret(e.target.value)}
                placeholder="••••••••••••••••••••••••••••"
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 text-slate-200 rounded-xl px-4 py-2 font-mono text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={isSavingAlpaca}
              className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-800 text-slate-950 font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-lg shadow-blue-500/10"
            >
              {isSavingAlpaca ? 'Saving...' : 'Save Alpaca Keys'}
            </button>
          </form>
        </div>

        {/* Database Diagnostics and Statistics */}
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <Database className="w-5 h-5 text-indigo-400" />
              <h3 className="font-display font-semibold text-slate-200">Diagnostics & Telemetry</h3>
            </div>
            <button
              onClick={fetchDiagnostics}
              disabled={isLoadingDiagnostics}
              className="p-1.5 hover:text-slate-100 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingDiagnostics ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {stats ? (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-900/40 border border-slate-800/60 rounded-xl">
                <span className="text-slate-400 block font-semibold mb-0.5">Trade Transactions</span>
                <strong className="text-slate-200 text-lg font-mono">{stats.transactions_count}</strong>
              </div>
              <div className="p-3 bg-slate-900/40 border border-slate-800/60 rounded-xl">
                <span className="text-slate-400 block font-semibold mb-0.5">Corporate Actions</span>
                <strong className="text-slate-200 text-lg font-mono">{stats.corporate_actions_count}</strong>
              </div>
              <div className="p-3 bg-slate-900/40 border border-slate-800/60 rounded-xl">
                <span className="text-slate-400 block font-semibold mb-0.5">Active Master Tickers</span>
                <strong className="text-slate-200 text-lg font-mono">{stats.tickers_count}</strong>
              </div>
              <div className="p-3 bg-slate-900/40 border border-slate-800/60 rounded-xl">
                <span className="text-slate-400 block font-semibold mb-0.5">Market Price Records</span>
                <strong className="text-slate-200 text-lg font-mono">{stats.prices_count}</strong>
              </div>
            </div>
          ) : (
            <div className="shimmer h-24 rounded-xl"></div>
          )}

          {/* Unpriced stocks list */}
          <div className="space-y-1.5 pt-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Unpriced Holdings ({unpriced.length})</span>
            {unpriced.length > 0 ? (
              <div className="border border-slate-850 bg-slate-950 rounded-xl p-3 text-xs font-mono max-h-36 overflow-y-auto space-y-1.5">
                {unpriced.map((item) => (
                  <div key={item.symbol} className="flex items-center justify-between text-slate-300 py-0.5">
                    <span>{item.symbol} <strong className="text-slate-500">({item.isin})</strong></span>
                    <span className="bg-amber-950/40 text-amber-400 border border-amber-500/15 text-[10px] px-1.5 py-0.5 rounded">Needs Feed</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-slate-900/20 border border-slate-800/60 p-4 rounded-xl text-center text-xs text-slate-500">
                All listed master tickers have current market price feeds.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Google Drive Export & Backup Center */}
      <div className="glass-card rounded-2xl p-6 border-cyan-500/10 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
          <Cloud className="w-5 h-5 text-cyan-400" />
          <h3 className="font-display font-semibold text-slate-200">Google Drive Export (KiloNew)</h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
          Export the entire KiloNew portfolio tracker source code and configuration files directly into a new folder named <code className="text-cyan-400 font-mono">KiloNew</code> on your Google Drive.
        </p>

        {!driveToken ? (
          <div className="pt-2">
            <button
              onClick={handleDriveLogin}
              disabled={isLoggingIn}
              className="gsi-material-button w-full sm:w-auto"
              style={{ margin: 0 }}
            >
              <div className="gsi-material-button-state"></div>
              <div className="gsi-material-button-content-wrapper">
                <div className="gsi-material-button-icon">
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: "block" }}>
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    <path fill="none" d="M0 0h48v48H0z"></path>
                  </svg>
                </div>
                <span className="gsi-material-button-contents font-sans">
                  {isLoggingIn ? 'Connecting...' : 'Sign in with Google to Export'}
                </span>
              </div>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-xs text-slate-300">
                Connected to Google Drive successfully. Ready to export!
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2" id="drive-export-blocks-container">
              {/* Codebase Export */}
              <div className="space-y-3 p-4 rounded-xl bg-slate-900/40 border border-slate-800/60" id="codebase-drive-export-card">
                <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-cyan-400" />
                  Codebase & Configs Backup
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Export the entire portfolio tracker source code and configurations as a <code className="text-cyan-400 font-mono">KiloNew</code> folder on your Drive.
                </p>

                {exportProgress.status === 'idle' ? (
                  <button
                    onClick={handleStartExport}
                    className="w-full bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 font-display"
                    id="export-codebase-drive-btn"
                  >
                    <HardDrive className="w-3.5 h-3.5" />
                    Export Source Code
                  </button>
                ) : (
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-850 space-y-2">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-400 truncate max-w-[150px]">
                        {exportProgress.status === 'fetching' && 'Scanning files...'}
                        {exportProgress.status === 'creating_root' && 'Creating root...'}
                        {exportProgress.status === 'uploading' && `Uploading: ${exportProgress.currentFile}`}
                        {exportProgress.status === 'success' && 'Exported!'}
                        {exportProgress.status === 'error' && 'Failed'}
                      </span>
                      <span className="text-slate-500 font-mono">
                        {exportProgress.processedCount}/{exportProgress.totalCount}
                      </span>
                    </div>
                    {exportProgress.totalCount > 0 && (
                      <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full bg-cyan-500 transition-all duration-300"
                          style={{ width: `${(exportProgress.processedCount / exportProgress.totalCount) * 100}%` }}
                        />
                      </div>
                    )}
                    {exportProgress.status === 'success' && exportProgress.folderUrl && (
                      <a
                        href={exportProgress.folderUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-emerald-950/40 border border-emerald-500/30 hover:border-emerald-400 text-emerald-300 font-semibold py-1.5 rounded-lg text-[10px] text-center flex items-center justify-center gap-1.5 transition-all font-display"
                        id="open-codebase-drive-folder-link"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View Folder on Drive
                      </a>
                    )}
                    {exportProgress.status === 'error' && (
                      <div className="text-rose-400 text-[10px]">{exportProgress.errorMessage}</div>
                    )}
                  </div>
                )}
              </div>

              {/* Database Backup */}
              <div className="space-y-3 p-4 rounded-xl bg-slate-900/40 border border-slate-800/60" id="database-drive-export-card">
                <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                  SQLite Database Backup (portfolio.db)
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Securely save the live SQLite database file containing all your transaction ledgers and configurations directly into <code className="text-emerald-400 font-mono">KiloPortfoliosBackup</code>.
                </p>

                {dbExportProgress.status === 'idle' ? (
                  <button
                    onClick={handleStartDbExport}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 font-display"
                    id="export-db-drive-btn"
                  >
                    <Cloud className="w-3.5 h-3.5" />
                    Backup Database to Drive
                  </button>
                ) : (
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-850 space-y-2">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-400 truncate max-w-[150px]">
                        {dbExportProgress.status === 'fetching' && 'Retrieving database...'}
                        {dbExportProgress.status === 'creating_root' && 'Creating backup folder...'}
                        {dbExportProgress.status === 'uploading' && 'Uploading portfolio.db...'}
                        {dbExportProgress.status === 'success' && 'Saved to Drive!'}
                        {dbExportProgress.status === 'error' && 'Failed'}
                      </span>
                    </div>
                    {dbExportProgress.status === 'success' && dbExportProgress.folderUrl && (
                      <a
                        href={dbExportProgress.folderUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-emerald-950/40 border border-emerald-500/30 hover:border-emerald-400 text-emerald-300 font-semibold py-1.5 rounded-lg text-[10px] text-center flex items-center justify-center gap-1.5 transition-all font-display"
                        id="open-db-drive-folder-link"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View Backups on Drive
                      </a>
                    )}
                    {dbExportProgress.status === 'error' && (
                      <div className="text-rose-400 text-[10px]">{dbExportProgress.errorMessage}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Database Restore & Backup Upload Center */}
      <div className="glass-card rounded-2xl p-6 border-indigo-500/10 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
          <Upload className="w-5 h-5 text-indigo-400" />
          <h3 className="font-display font-semibold text-slate-200">Local Downloads & Database Restore</h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
          Download your entire portfolio tracker as a full project ZIP, or just backup your database. You can also upload a previously exported <code className="text-indigo-400 font-mono">portfolio.db</code> file to completely restore all your transactions, custom settings, and system mappings.
        </p>

        <div className="pt-2 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-3 rounded-xl transition-all cursor-pointer font-display" id="upload-db-label">
            <Upload className="w-4 h-4" />
            {isRestoring ? 'Restoring Database...' : 'Upload & Restore portfolio.db'}
            <input
              type="file"
              accept=".db,.sqlite,.sqlite3,.gz,.zip"
              onChange={handleRestoreFileSelected}
              disabled={isRestoring}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={handleDownloadDatabase}
            disabled={isDownloadingDb}
            className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-200 text-xs font-semibold px-4 py-3 rounded-xl transition-all font-display cursor-pointer disabled:opacity-50"
            id="download-db-link"
          >
            <Database className="w-4 h-4 text-emerald-400" />
            {isDownloadingDb ? 'Downloading DB...' : 'Download portfolio.db'}
          </button>

          <button
            type="button"
            onClick={handleDownloadProjectZip}
            disabled={isDownloadingZip}
            className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-200 text-xs font-semibold px-4 py-3 rounded-xl transition-all font-display cursor-pointer disabled:opacity-50"
            id="download-full-project-zip-link"
          >
            <Download className="w-4 h-4 text-cyan-400" />
            {isDownloadingZip ? 'Zipping Project...' : 'Download Full Project ZIP'}
          </button>
        </div>

        {restoreMessage && (
          <div className={`p-4 rounded-xl border text-xs leading-relaxed max-w-2xl ${
            restoreMessage.type === 'success'
              ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-300'
              : 'bg-rose-950/20 border-rose-500/20 text-rose-300'
          }`}>
            {restoreMessage.text}
          </div>
        )}
      </div>

      {/* Incremental ZIP Upload & Changelog Manager */}
      <ZipUpdateManager
        onToast={(msg, type) => {
          setRestoreMessage({ type: type === 'error' ? 'error' : 'success', text: msg });
        }}
      />

      {/* Database Size Review, Cache Purge & Backup Options */}
      <DatabaseSizeInspector
        onToast={(msg, type) => {
          setRestoreMessage({ type: type === 'error' ? 'error' : 'success', text: msg });
        }}
      />

      {/* Database Purge Center */}
      <div className="glass-card rounded-2xl p-6 border-rose-500/10 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
          <Trash2 className="w-5 h-5 text-rose-400" />
          <h3 className="font-display font-semibold text-slate-200">Database Administration & Wipe</h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
          Select a portfolio or purge all trade books. Master Tickers and User Scrip Mappings offered at import are always preserved when purging transactions.
        </p>

        {/* Portfolio Selector for Purge */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2">
          <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>Target Portfolio to Purge:</span>
            <span className="text-[11px] font-normal text-slate-400">Master Tickers & Scrip Mappings will stay intact</span>
          </label>
          <select
            value={selectedPurgePortfolio}
            onChange={(e) => setSelectedPurgePortfolio(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 text-slate-100 text-xs font-semibold rounded-lg px-3 py-2.5 focus:border-rose-500 focus:outline-none"
          >
            <option value="ALL">⚠️ ALL Portfolios (Wipe Entire Trade Book & Corporate Actions)</option>
            {portfoliosList.map((p) => (
              <option key={p} value={p}>
                Portfolio: {p}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch gap-4 pt-1">
          <button
            onClick={handlePurgeTxns}
            className="flex-1 bg-slate-900 border border-rose-900/80 hover:border-rose-500/50 hover:bg-rose-950/20 text-rose-300 font-semibold px-4 py-3 rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            Wipe Trades & CAs ({selectedPurgePortfolio === 'ALL' ? 'ALL Portfolios' : `Portfolio: ${selectedPurgePortfolio}`})
          </button>

          <button
            onClick={handlePurgeAll}
            className="flex-1 bg-rose-950/60 border border-rose-500/30 hover:border-rose-500 text-rose-100 font-bold px-4 py-3 rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4 text-rose-100" />
            Full Purge SQLite portfolio.db WIPE
          </button>
        </div>
      </div>

      <ConfirmationModal
        isOpen={restoreModalOpen}
        title="Restore Database"
        message={`Are you sure you want to replace the current application database with "${selectedRestoreFile?.name || 'uploaded file'}"?

This will completely overwrite all your active portfolios, transactions, custom settings, and system mappings. This operation cannot be undone.`}
        confirmText="Yes, Overwrite & Restore"
        cancelText="Cancel Restore"
        isDangerous={true}
        onConfirm={handleConfirmRestore}
        onCancel={() => {
          setRestoreModalOpen(false);
          setSelectedRestoreFile(null);
        }}
      />

      <ConfirmationModal
        isOpen={purgeTxnsModalOpen}
        title={`Purge Transactions & Corporate Actions (${selectedPurgePortfolio === 'ALL' ? 'ALL Portfolios' : `Portfolio: ${selectedPurgePortfolio}`})`}
        message={`CRITICAL WARNING: This will permanently delete all transaction tradebook records and corporate action logs for ${selectedPurgePortfolio === 'ALL' ? 'ALL portfolios' : `portfolio "${selectedPurgePortfolio}"`}.

Master Tickers and Custom User Scrip Mappings offered at import will be COMPLETELY PRESERVED. Are you sure you want to proceed?`}
        confirmText={`Yes, Purge ${selectedPurgePortfolio === 'ALL' ? 'All Transactions' : `Portfolio "${selectedPurgePortfolio}"`}`}
        cancelText="Cancel"
        isDangerous={true}
        onConfirm={handleConfirmPurgeTxns}
        onCancel={() => setPurgeTxnsModalOpen(false)}
      />

      <ConfirmationModal
        isOpen={purgeAllModalOpen}
        title="Full Database Purge & Wipe"
        message="CRITICAL WARNING: This will completely wipe everything from the local SQLite database, including transactions, corporate actions, master tickers, price logs, and mappings, resetting the database schema back to a completely blank, empty state. Are you absolutely certain?"
        confirmText="Yes, Permanently Purge Everything"
        cancelText="Cancel Purge"
        isDangerous={true}
        onConfirm={handleConfirmPurgeAll}
        onCancel={() => setPurgeAllModalOpen(false)}
      />

      <ThemeSelectorModal
        isOpen={themeModalOpen}
        onClose={() => setThemeModalOpen(false)}
        onThemeChanged={(tid) => setCurrentThemeId(tid)}
      />
    </div>
  );
}
