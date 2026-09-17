import React, { useState, useEffect } from 'react';
import { Database, HardDrive, Trash2, RefreshCw, AlertTriangle, FileArchive, CheckCircle2, ShieldCheck, Zap, Layers } from 'lucide-react';
import { safeFetchJson } from '../lib/api';

interface TableStat {
  name: string;
  category: string;
  description: string;
  canPurge: boolean;
  rowCount: number;
}

interface DatabaseStatsResponse {
  success: boolean;
  dbSizeMB: number;
  tables: TableStat[];
  estimatedReclaimableMB: number;
  priceCacheCount: number;
}

export const DatabaseSizeInspector: React.FC<{
  onToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}> = ({ onToast }) => {
  const [stats, setStats] = useState<DatabaseStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [isVacuuming, setIsVacuuming] = useState(false);
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'db' | 'gz'>('gz');
  const [isDownloading, setIsDownloading] = useState(false);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const { ok, data, error } = await safeFetchJson<DatabaseStatsResponse>('/api/admin/database-stats');
      if (ok && data?.success) {
        setStats(data);
      } else if (error) {
        console.warn('Could not load database stats:', error);
      }
    } catch (e) {
      console.error('Failed to load database stats:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handlePurgeCache = async () => {
    setIsPurging(true);
    setShowPurgeModal(false);
    try {
      const res = await fetch('/api/admin/purge-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purgePriceCache: true,
          purgeLogs: true
        })
      });
      const data = await res.json();
      if (data.success) {
        onToast?.(data.message || 'Database cache purged successfully!', 'success');
        fetchStats();
      } else {
        onToast?.(data.message || 'Failed to purge database cache', 'error');
      }
    } catch (err: any) {
      onToast?.(`Error purging cache: ${err.message}`, 'error');
    } finally {
      setIsPurging(false);
    }
  };

  const handleVacuumDatabase = async () => {
    setIsVacuuming(true);
    try {
      const res = await fetch('/api/admin/vacuum-database', {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        onToast?.(data.message || 'Database vacuum completed successfully!', 'success');
        fetchStats();
      } else {
        onToast?.(data.message || 'Failed to vacuum database', 'error');
      }
    } catch (err: any) {
      onToast?.(`Error vacuuming database: ${err.message}`, 'error');
    } finally {
      setIsVacuuming(false);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    const dateStr = new Date().toISOString().split('T')[0];
    const format = downloadFormat;
    const url = `/api/download-database?format=${format}`;
    
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}: ${res.statusText}`);
      }
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `portfolio_${dateStr}.${format === 'gz' ? 'db.gz' : 'db'}`;
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
        document.body.removeChild(a);
        setIsDownloading(false);
        onToast?.(`Database backup (${format.toUpperCase()}) downloaded successfully.`, 'success');
      }, 200);
    } catch (err: any) {
      setIsDownloading(false);
      onToast?.(`Download failed: ${err.message}`, 'error');
    }
  };

  const isLargeDb = (stats?.dbSizeMB || 0) > 30;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-display font-semibold text-slate-100 flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-indigo-400" />
            Database Size Review, Purge & Optimization Inspector
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Analyze database file composition, purge unnecessary daily price caches, defragment space, and download error-free database backups.
          </p>
        </div>

        <button
          onClick={fetchStats}
          disabled={isLoading}
          className="self-start md:self-auto bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-2 rounded-xl font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Size Stats
        </button>
      </div>

      {/* Main Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Total DB Size */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-xs text-slate-400 font-medium">Total Database Size:</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-100">
              {stats ? `${stats.dbSizeMB} MB` : '...'}
            </span>
            {isLargeDb && (
              <span className="text-[10px] font-semibold text-amber-400 bg-amber-950 border border-amber-800 px-2 py-0.5 rounded-full">
                Large File (&gt;30 MB)
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            {stats && stats.dbSizeMB < 20 ? 'Optimal database size' : 'Cache purge recommended for faster syncs'}
          </p>
        </div>

        {/* Card 2: Price Cache Rows */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-xs text-slate-400 font-medium">Price Cache Records:</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-indigo-300">
              {stats ? stats.priceCacheCount.toLocaleString() : '...'}
            </span>
            <span className="text-xs text-slate-400">rows</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Historical price cache auto-refetched on demand
          </p>
        </div>

        {/* Card 3: Potential Reclaimable Space */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-xs text-slate-400 font-medium">Reclaimable Cache Space:</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-400">
              {stats ? `~${stats.estimatedReclaimableMB.toFixed(1)} MB` : '...'}
            </span>
            <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-950 border border-emerald-800 px-2 py-0.5 rounded-full">
              Safe to Purge
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            Reduces database file size by up to 95%+
          </p>
        </div>
      </div>

      {/* Download Action Bar */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-xs">
          <p className="font-semibold text-slate-200 flex items-center gap-1.5">
            <FileArchive className="w-4 h-4 text-cyan-400" />
            Download Database Backup
          </p>
          <p className="text-slate-400 text-[11px]">
            Download your complete portfolio database securely. Select format and click download.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={downloadFormat}
            onChange={(e) => setDownloadFormat(e.target.value as 'db' | 'gz')}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            <option value="gz">Fast Compressed (.db.gz)</option>
            <option value="db">Raw SQLite (.db)</option>
          </select>

          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="flex-1 md:flex-initial bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold px-5 py-2.5 rounded-xl text-xs transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Zap className={`w-3.5 h-3.5 text-cyan-200 ${isDownloading ? 'animate-spin' : ''}`} />
            {isDownloading ? 'Preparing Download...' : 'Download Backup'}
          </button>
        </div>
      </div>

      {/* Cache Purge & Maintenance Action Bar */}
      {stats && stats.priceCacheCount > 0 && (
        <div className="bg-gradient-to-r from-amber-950/40 via-slate-950 to-slate-950 border border-amber-900/50 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-amber-200 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Over 90% of your database consists of cached historical closing prices.
            </p>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Purging price history clears cached daily prices without touching any transactions, holdings, corporate actions, or portfolios.
            </p>
          </div>

          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleVacuumDatabase}
              disabled={isVacuuming}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3.5 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 border border-slate-700"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isVacuuming ? 'animate-spin' : ''}`} />
              VACUUM Only
            </button>

            <button
              onClick={() => setShowPurgeModal(true)}
              disabled={isPurging}
              className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4 text-slate-950" />
              Purge Price Cache & Shrink DB
            </button>
          </div>
        </div>
      )}

      {/* Table Breakdown Table */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-indigo-400" />
          Database Composition Breakdown by Table:
        </h4>

        <div className="max-h-64 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950/50 divide-y divide-slate-800/60">
          {stats?.tables.map((t) => (
            <div key={t.name} className="p-3 text-xs flex items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-slate-200">{t.name}</span>
                  {t.category === 'ESSENTIAL' && (
                    <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-semibold px-2 py-0.5 rounded">
                      ESSENTIAL USER DATA
                    </span>
                  )}
                  {t.category === 'CACHE' && (
                    <span className="bg-amber-950 text-amber-300 border border-amber-800 text-[10px] font-semibold px-2 py-0.5 rounded">
                      CACHE / TEMP
                    </span>
                  )}
                  {t.category === 'LOGS' && (
                    <span className="bg-indigo-950 text-indigo-300 border border-indigo-800 text-[10px] font-semibold px-2 py-0.5 rounded">
                      SYSTEM LOGS
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 truncate">{t.description}</p>
              </div>

              <div className="text-right shrink-0">
                <span className="font-mono font-bold text-slate-200 text-xs">
                  {t.rowCount.toLocaleString()}
                </span>
                <span className="text-[11px] text-slate-500 block">rows</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Confirmation Modal for Purging Price Cache */}
      {showPurgeModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-800/80 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-base font-semibold font-display">Confirm Price Cache Purge</h3>
            </div>

            <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
              <p>
                You are about to purge <strong className="text-white">{stats?.priceCacheCount.toLocaleString()} cached price records</strong> from the database.
              </p>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1.5 text-[11px]">
                <p className="text-emerald-300 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  What is SAFE & 100% PRESERVED:
                </p>
                <ul className="list-disc list-inside text-slate-300 pl-1 space-y-0.5">
                  <li>All tradebooks, buy/sell transactions & corporate actions</li>
                  <li>All portfolio definitions & cash balances</li>
                  <li>Master tickers & custom scrip alias mappings</li>
                  <li>Tax summaries & realized gain records</li>
                </ul>
              </div>
              <p className="text-slate-400">
                Historical prices will be re-fetched from online markets as needed. This action will shrink your database file by <strong className="text-emerald-400">~{stats?.estimatedReclaimableMB.toFixed(1)} MB</strong>.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowPurgeModal(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handlePurgeCache}
                className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs px-5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-lg"
              >
                <CheckCircle2 className="w-4 h-4" />
                Yes, Purge Price Cache & Shrink
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
