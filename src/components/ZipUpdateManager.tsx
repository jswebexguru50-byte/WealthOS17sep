import React, { useState, useEffect } from 'react';
import { Upload, FileCode, AlertTriangle, CheckCircle2, RefreshCw, Layers, ShieldAlert, History, PlusCircle, Check, RotateCcw, Camera, ShieldCheck } from 'lucide-react';
import { safeFetchJson } from '../lib/api';

interface AnalysisFile {
  path: string;
  status: 'NEW' | 'MODIFIED' | 'UNCHANGED';
  risk: 'HIGH_RISK' | 'MEDIUM' | 'LOW';
  conflictWarning: string | null;
  size: number;
  selected: boolean;
}

interface ChangelogEntry {
  id: number;
  timestamp: string;
  version_tag: string;
  summary: string;
  file_count: number;
  applied_files?: string;
  source: string;
}

interface FrontendSnapshot {
  batchId: string;
  timestamp: string;
  summary: string;
  fileCount: number;
  files: string[];
}

export const ZipUpdateManager: React.FC<{
  onToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  onRefreshApp?: () => void;
}> = ({ onToast, onRefreshApp }) => {
  const [selectedZipFile, setSelectedZipFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    files: AnalysisFile[];
    summary: string;
    totalFilesInZip: number;
    modifiedCount: number;
    newCount: number;
  } | null>(null);

  const [selectedFilePaths, setSelectedFilePaths] = useState<Set<string>>(new Set());
  const [editableSummary, setEditableSummary] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  // Changelog State
  const [changelogs, setChangelogs] = useState<ChangelogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [newLogSummary, setNewLogSummary] = useState('');
  const [isAddingLog, setIsAddingLog] = useState(false);
  const [showAddLogModal, setShowAddLogModal] = useState(false);

  // Frontend Rollback & Snapshot State
  const [snapshots, setSnapshots] = useState<FrontendSnapshot[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [selectedRollbackBatch, setSelectedRollbackBatch] = useState<FrontendSnapshot | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);

  const fetchChangelogs = async () => {
    setIsLoadingLogs(true);
    try {
      const { ok, data, error } = await safeFetchJson('/api/admin/changelog');
      if (ok && data?.success && Array.isArray(data.changelog)) {
        setChangelogs(data.changelog);
      } else if (error) {
        console.warn('Could not load changelogs:', error);
      }
    } catch (e) {
      console.error('Failed to load changelogs:', e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const fetchSnapshots = async () => {
    setIsLoadingSnapshots(true);
    try {
      const { ok, data, error } = await safeFetchJson('/api/admin/frontend-backups');
      if (ok && data?.success && Array.isArray(data.snapshots)) {
        setSnapshots(data.snapshots);
      } else if (error) {
        console.warn('Could not load snapshots:', error);
      }
    } catch (e) {
      console.error('Failed to load snapshots:', e);
    } finally {
      setIsLoadingSnapshots(false);
    }
  };

  useEffect(() => {
    fetchChangelogs();
    fetchSnapshots();
  }, []);

  const handleCreateSnapshot = async () => {
    setIsCreatingSnapshot(true);
    try {
      const { ok, data, error } = await safeFetchJson('/api/admin/create-frontend-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: 'Manual frontend baseline safety snapshot before UI updates.'
        })
      });
      if (ok && data?.success) {
        onToast?.(data.message || 'Frontend snapshot created!', 'success');
        fetchSnapshots();
        fetchChangelogs();
      } else {
        onToast?.(data?.message || error || 'Failed to create snapshot', 'error');
      }
    } catch (err: any) {
      onToast?.(`Error creating snapshot: ${err.message}`, 'error');
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  const handleRollbackFrontend = async () => {
    if (!selectedRollbackBatch) return;
    setIsRollingBack(true);
    try {
      const { ok, data, error } = await safeFetchJson('/api/admin/rollback-frontend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: selectedRollbackBatch.batchId })
      });
      if (ok && data?.success) {
        onToast?.(data.message || 'Frontend roll back complete!', 'success');
        setSelectedRollbackBatch(null);
        fetchSnapshots();
        fetchChangelogs();
        if (onRefreshApp) onRefreshApp();
      } else {
        onToast?.(data?.message || error || 'Rollback failed', 'error');
      }
    } catch (err: any) {
      onToast?.(`Error performing rollback: ${err.message}`, 'error');
    } finally {
      setIsRollingBack(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.endsWith('.zip')) {
        onToast?.('Please upload a valid .zip file', 'error');
        return;
      }
      setSelectedZipFile(file);
      setAnalysisResult(null);
    }
  };

  const handleAnalyzeZip = async () => {
    if (!selectedZipFile) return;
    setIsAnalyzing(true);
    const formData = new FormData();
    formData.append('zipFile', selectedZipFile);

    try {
      const res = await fetch('/api/admin/analyze-project-zip', {
        method: 'POST',
        body: formData,
      });
      
      const responseText = await res.text();
      let data: any = null;
      if (responseText && responseText.trim().length > 0) {
        try {
          data = JSON.parse(responseText);
        } catch {
          if (responseText.includes('<html') || responseText.includes('<!DOCTYPE') || responseText.includes('<!doctype')) {
            throw new Error(`Server returned HTML error page (HTTP ${res.status}). The uploaded file may be too large or the server route failed.`);
          }
          throw new Error(`Server returned non-JSON response (HTTP ${res.status}): ${responseText.substring(0, 100)}`);
        }
      }

      if (res.ok && data?.success) {
        setAnalysisResult(data);
        setEditableSummary(data.summary || '');
        const initialSelected = new Set<string>();
        data.files.forEach((f: AnalysisFile) => {
          if (f.selected) initialSelected.add(f.path);
        });
        setSelectedFilePaths(initialSelected);
        onToast?.(`ZIP analysis complete. Identified ${data.files.length} changed files.`, 'success');
      } else {
        onToast?.(data?.message || `Failed to analyze ZIP file (HTTP ${res.status})`, 'error');
      }
    } catch (err: any) {
      onToast?.(`Error analyzing zip: ${err.message}`, 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleFileSelection = (path: string) => {
    const updated = new Set(selectedFilePaths);
    if (updated.has(path)) {
      updated.delete(path);
    } else {
      updated.add(path);
    }
    setSelectedFilePaths(updated);
  };

  const toggleSelectAll = () => {
    if (!analysisResult) return;
    if (selectedFilePaths.size === analysisResult.files.length) {
      setSelectedFilePaths(new Set());
    } else {
      const allPaths = new Set(analysisResult.files.map(f => f.path));
      setSelectedFilePaths(allPaths);
    }
  };

  const toggleDeselectHighRisk = () => {
    if (!analysisResult) return;
    const safePaths = new Set(
      analysisResult.files.filter(f => f.risk !== 'HIGH_RISK').map(f => f.path)
    );
    setSelectedFilePaths(safePaths);
  };

  const handleApplyZip = async () => {
    if (!selectedZipFile) return;
    if (selectedFilePaths.size === 0) {
      onToast?.('Please select at least one file to import.', 'error');
      return;
    }

    setIsApplying(true);
    const formData = new FormData();
    formData.append('zipFile', selectedZipFile);
    formData.append('selectedFiles', JSON.stringify(Array.from(selectedFilePaths)));
    formData.append('summary', editableSummary.trim());

    try {
      const res = await fetch('/api/admin/apply-project-zip', {
        method: 'POST',
        body: formData,
      });
      
      const responseText = await res.text();
      let data: any = null;
      if (responseText && responseText.trim().length > 0) {
        try {
          data = JSON.parse(responseText);
        } catch {
          if (responseText.includes('<html') || responseText.includes('<!DOCTYPE') || responseText.includes('<!doctype')) {
            throw new Error(`Server returned HTML error page (HTTP ${res.status}). The uploaded file may be too large or the server route failed.`);
          }
          throw new Error(`Server returned non-JSON response (HTTP ${res.status}): ${responseText.substring(0, 100)}`);
        }
      }

      if (res.ok && data?.success) {
        onToast?.(data.message || 'Zip updates successfully imported!', 'success');
        setAnalysisResult(null);
        setSelectedZipFile(null);
        fetchChangelogs();
        if (data.requiresRestart) {
          onToast?.('Server-side code was updated. Dev server restarting...', 'info');
        }
        if (onRefreshApp) onRefreshApp();
      } else {
        onToast?.(data?.message || `Failed to apply zip changes (HTTP ${res.status})`, 'error');
      }
    } catch (err: any) {
      onToast?.(`Error applying zip changes: ${err.message}`, 'error');
    } finally {
      setIsApplying(false);
    }
  };

  const handleAddManualLog = async () => {
    if (!newLogSummary.trim()) return;
    setIsAddingLog(true);
    try {
      const res = await fetch('/api/admin/add-changelog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: newLogSummary.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        onToast?.('Changelog entry logged successfully', 'success');
        setNewLogSummary('');
        setShowAddLogModal(false);
        fetchChangelogs();
      } else {
        onToast?.(data.message || 'Failed to add changelog', 'error');
      }
    } catch (err: any) {
      onToast?.(`Error adding log: ${err.message}`, 'error');
    } finally {
      setIsAddingLog(false);
    }
  };

  const highRiskCount = analysisResult?.files.filter(f => f.risk === 'HIGH_RISK' && selectedFilePaths.has(f.path)).length || 0;

  return (
    <div className="space-y-6 text-slate-200">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div>
            <h2 className="text-lg font-display font-semibold text-slate-100 flex items-center gap-2">
              <Upload className="w-5 h-5 text-indigo-400" />
              Incremental Code ZIP Upload & Conflict Manager
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Import project ZIP packages safely. The system analyzes changes, flags functional conflicts, allows selective file imports, and records plain English changelogs.
            </p>
          </div>
          <button
            onClick={fetchChangelogs}
            className="self-start md:self-auto bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin' : ''}`} />
            Refresh Changelog
          </button>
        </div>

        {/* Upload Zone */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Select Project ZIP File (*.zip):
            </label>
            <input
              type="file"
              accept=".zip"
              onChange={handleFileChange}
              className="w-full text-xs text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-950/80 file:text-indigo-300 hover:file:bg-indigo-900 border border-slate-800 bg-slate-950/50 rounded-xl p-2 cursor-pointer focus:outline-none"
            />
          </div>

          <button
            onClick={handleAnalyzeZip}
            disabled={!selectedZipFile || isAnalyzing}
            className="w-full mt-4 md:mt-6 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-3 rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Analyzing Package Code...
              </>
            ) : (
              <>
                <FileCode className="w-4 h-4" />
                Analyze ZIP & Check Conflicts
              </>
            )}
          </button>
        </div>
      </div>

      {/* Analysis & Conflict Resolution Section */}
      {analysisResult && (
        <div className="bg-slate-900 border border-indigo-900/60 rounded-2xl p-6 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-indigo-300 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                ZIP Inspection Results & Selective Import
              </h3>
              <p className="text-xs text-slate-400">
                Found {analysisResult.files.length} changed or new file(s) across {analysisResult.totalFilesInZip} total entries.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 px-2.5 py-1 rounded-full font-medium">
                +{analysisResult.newCount} New
              </span>
              <span className="bg-amber-950/80 border border-amber-800/80 text-amber-300 px-2.5 py-1 rounded-full font-medium">
                ~{analysisResult.modifiedCount} Modified
              </span>
            </div>
          </div>

          {/* Conflict Alert Banner if High Risk Files Selected */}
          {highRiskCount > 0 && (
            <div className="bg-rose-950/50 border border-rose-800/80 rounded-xl p-4 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-rose-200">
                  Potential Functional Conflict Warning ({highRiskCount} High Risk File{highRiskCount > 1 ? 's' : ''})
                </p>
                <p className="text-rose-300/90 leading-relaxed">
                  The selected changes include core server or dependency logic. Review the flagged files below. You can uncheck high-risk files to perform a safe frontend-only import.
                </p>
              </div>
            </div>
          )}

          {/* Plain English Summary Input */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2">
            <label className="text-xs font-semibold text-slate-200 flex items-center justify-between">
              <span>Plain English Incremental Change Log (1-2 sentences):</span>
              <span className="text-[11px] font-normal text-slate-400">Auto-generated & editable</span>
            </label>
            <textarea
              value={editableSummary}
              onChange={(e) => setEditableSummary(e.target.value)}
              rows={2}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              placeholder="e.g. Added selective portfolio purge functionality and streaming database export."
            />
          </div>

          {/* File Selection Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-300">
              Selected: {selectedFilePaths.size} of {analysisResult.files.length} file(s)
            </span>
            <div className="flex gap-2">
              <button
                onClick={toggleSelectAll}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                {selectedFilePaths.size === analysisResult.files.length ? 'Deselect All' : 'Select All'}
              </button>
              <button
                onClick={toggleDeselectHighRisk}
                className="bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                Exclude High Risk
              </button>
            </div>
          </div>

          {/* File List Table */}
          <div className="max-h-72 overflow-y-auto border border-slate-800 rounded-xl divide-y divide-slate-800/60 bg-slate-950/40">
            {analysisResult.files.map((file) => {
              const isChecked = selectedFilePaths.has(file.path);
              return (
                <div
                  key={file.path}
                  onClick={() => toggleFileSelection(file.path)}
                  className={`p-3 text-xs flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isChecked ? 'bg-slate-900/80 hover:bg-slate-800/80' : 'opacity-60 hover:opacity-80'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}} // handled by parent div onClick
                      className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 cursor-pointer"
                    />
                    <span className="font-mono text-slate-200 truncate">{file.path}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {file.status === 'NEW' && (
                      <span className="bg-emerald-950 border border-emerald-800 text-emerald-400 text-[10px] px-2 py-0.5 rounded font-semibold">
                        NEW
                      </span>
                    )}
                    {file.status === 'MODIFIED' && (
                      <span className="bg-amber-950 border border-amber-800 text-amber-300 text-[10px] px-2 py-0.5 rounded font-semibold">
                        MODIFIED
                      </span>
                    )}

                    {file.risk === 'HIGH_RISK' && (
                      <span className="bg-rose-950 border border-rose-800 text-rose-300 text-[10px] px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        CRITICAL CONFLICT
                      </span>
                    )}
                    {file.risk === 'MEDIUM' && (
                      <span className="bg-indigo-950 border border-indigo-800 text-indigo-300 text-[10px] px-2 py-0.5 rounded font-medium">
                        UI MODULE
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setAnalysisResult(null)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-4 py-2.5 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyZip}
              disabled={isApplying || selectedFilePaths.size === 0}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition-all shadow-lg cursor-pointer flex items-center gap-2"
            >
              {isApplying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Importing Updates...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Import Selected Changes ({selectedFilePaths.size} Files)
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Frontend Rollback & Safety Snapshots Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-cyan-400" />
              Roll Back Frontend Changes & Safety Snapshots
            </h3>
            <p className="text-xs text-slate-400">
              Restore previous frontend states with 1-click. Automatic safety snapshots are saved whenever ZIP packages are imported.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateSnapshot}
              disabled={isCreatingSnapshot}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
            >
              <Camera className={`w-3.5 h-3.5 ${isCreatingSnapshot ? 'animate-spin' : ''}`} />
              Create Safety Snapshot
            </button>

            <button
              onClick={fetchSnapshots}
              disabled={isLoadingSnapshots}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-2 rounded-xl font-medium transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSnapshots ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {isLoadingSnapshots ? (
          <div className="p-6 text-center text-xs text-slate-500 animate-pulse">
            Loading frontend backup snapshots...
          </div>
        ) : snapshots.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl space-y-2">
            <p>No frontend backup snapshots available yet.</p>
            <p className="text-[11px] text-slate-600">
              Snapshots are automatically created when importing ZIP updates or when clicking "Create Safety Snapshot".
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {snapshots.map((snap) => (
              <div
                key={snap.batchId}
                className="bg-slate-950/80 border border-slate-800 hover:border-cyan-800/80 rounded-xl p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 text-xs min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-semibold text-cyan-300 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                      {snap.batchId}
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      {new Date(snap.timestamp).toLocaleString()}
                    </span>
                    <span className="text-slate-500 text-[11px]">
                      ({snap.fileCount} files)
                    </span>
                  </div>
                  <p className="text-slate-200 text-xs truncate font-medium">
                    {snap.summary}
                  </p>
                </div>

                <button
                  onClick={() => setSelectedRollbackBatch(snap)}
                  className="self-start sm:self-auto bg-cyan-950 hover:bg-cyan-900 border border-cyan-800 text-cyan-300 hover:text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Roll Back To This Snapshot
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historical Changelog Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <History className="w-4 h-4 text-emerald-400" />
              Application Incremental Updates & Changelog
            </h3>
            <p className="text-xs text-slate-400">
              Plain English record capturing all incorporated features and functional updates.
            </p>
          </div>
          <button
            onClick={() => setShowAddLogModal(true)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <PlusCircle className="w-3.5 h-3.5 text-indigo-400" />
            Add Note
          </button>
        </div>

        {isLoadingLogs ? (
          <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
            Loading historical application logs...
          </div>
        ) : changelogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
            No change log records logged yet.
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {changelogs.map((log) => (
              <div
                key={log.id}
                className="bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 rounded-xl p-4 transition-all space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="bg-indigo-950 text-indigo-300 font-mono text-[10px] font-semibold px-2 py-0.5 rounded border border-indigo-800/80">
                      {log.version_tag || 'v1.0.0'}
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  {log.file_count > 0 && (
                    <span className="text-[11px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      {log.file_count} File{log.file_count > 1 ? 's' : ''} Updated
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-200 leading-relaxed font-normal">
                  {log.summary}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal to add manual changelog note */}
      {showAddLogModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-indigo-400" />
              Add Plain English Changelog Entry
            </h3>
            <p className="text-xs text-slate-400">
              Provide a 1-2 sentence description of functional updates incorporated into the system.
            </p>

            <textarea
              value={newLogSummary}
              onChange={(e) => setNewLogSummary(e.target.value)}
              rows={3}
              placeholder="e.g. Added selective portfolio transactions purge and updated SQLite export handlers."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddLogModal(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-4 py-2 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleAddManualLog}
                disabled={isAddingLog || !newLogSummary.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-1.5"
              >
                {isAddingLog ? 'Saving...' : 'Save Log Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal for Rollback Confirmation */}
      {selectedRollbackBatch && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-cyan-400">
              <RotateCcw className="w-5 h-5" />
              <h3 className="text-base font-semibold font-display">Confirm Frontend Rollback</h3>
            </div>

            <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
              <p>
                You are about to roll back frontend files to snapshot <strong className="text-white">{selectedRollbackBatch.batchId}</strong> ({new Date(selectedRollbackBatch.timestamp).toLocaleString()}).
              </p>
              
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1 text-[11px]">
                <p className="text-emerald-300 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  What will be restored ({selectedRollbackBatch.fileCount} files):
                </p>
                <div className="max-h-28 overflow-y-auto font-mono text-[10px] text-slate-400 space-y-0.5 pt-1">
                  {selectedRollbackBatch.files.map((f) => (
                    <div key={f} className="truncate">• {f}</div>
                  ))}
                </div>
              </div>

              <p className="text-slate-400">
                This will revert all modified frontend component files back to this exact snapshot baseline without altering database records or tradebooks.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedRollbackBatch(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRollbackFrontend}
                disabled={isRollingBack}
                className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs px-5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-lg"
              >
                {isRollingBack ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Rolling back...
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    Confirm Rollback
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
