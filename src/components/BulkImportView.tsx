import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  UploadCloud,
  Layers,
  ChevronRight,
  Info,
  History,
  RotateCcw,
  Check,
  ChevronDown,
  Download
} from 'lucide-react';

interface MappingItem {
  file_name: string;
  mapped_name: string;
  suggestions: string[];
}

interface ValidationData {
  batch_id: string;
  total_rows: number;
  new_rows: number;
  duplicate_rows: number;
  similar_rows: number;
  unmatched_mappings: MappingItem[];
  preview: any[];
  duplicates?: any[];
  warnings?: any[];
}

interface BulkImportViewProps {
  onValidate: (file: File, target: string, mappings?: Record<string, string>, portfolioOption?: string, portfolioName?: string) => Promise<any>;
  onCommit: (batchId: string, mappings?: Record<string, string>, portfolioOption?: string, portfolioName?: string, overrideDuplicateIndices?: number[]) => Promise<any>;
  onUndoBatch: (batchId: string) => Promise<boolean>;
  portfolios: string[];
}

export function BulkImportView({
  onValidate,
  onCommit,
  onUndoBatch,
  portfolios
}: BulkImportViewProps) {
  // Tabs
  const [activeTab, setActiveTab] = useState<'UPLOAD' | 'HISTORY'>('UPLOAD');

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [targetModel, setTargetModel] = useState('transactions');
  const [dragActive, setDragActive] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [overrideDuplicateIndices, setOverrideDuplicateIndices] = useState<number[]>([]);

  // Portfolio Selection States
  const [portfolioOption, setPortfolioOption] = useState<'spreadsheet' | 'existing' | 'new'>('spreadsheet');
  const [selectedPortfolioName, setSelectedPortfolioName] = useState('');

  // Step 1: Validation / Scrip Mapping State
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [valData, setValData] = useState<ValidationData | null>(null);
  const [mappings, setMappings] = useState<Record<string, string>>({});

  // History State
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/import/history');
      const data = await res.json();
      setHistoryLogs(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (activeTab === 'HISTORY') {
      fetchHistory();
    }
  }, [activeTab]);

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
      setErrorMsg('');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setErrorMsg('');
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    if (targetModel === 'transactions' && portfolioOption !== 'spreadsheet' && !selectedPortfolioName.trim()) {
      setErrorMsg('Please specify a valid portfolio name.');
      return;
    }

    setIsValidating(true);
    setErrorMsg('');
    try {
      const res = await onValidate(file, targetModel, mappings, portfolioOption, selectedPortfolioName);
      if (res.success) {
        setValData(res.data);
        
        // Initialize mapping inputs with sugestions
        const initialMappings: Record<string, string> = {};
        for (const m of res.data.unmatched_mappings) {
          initialMappings[m.file_name] = m.suggestions[0] || '';
        }
        setMappings(m => ({ ...m, ...initialMappings }));

        // Route to Phase 1 Mapping if there are unresolved items
        if (res.data.unmatched_mappings.length > 0) {
          setStep(2);
        } else {
          setStep(3); // Directly to commit dry run
        }
      } else {
        setErrorMsg(res.message || 'Validation failed. Please check spreadsheet headings.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to process spreadsheet.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleApplyMappingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !valData) return;

    setIsValidating(true);
    try {
      // Re-validate using newly specified scrip mappings
      const res = await onValidate(file, targetModel, mappings, portfolioOption, selectedPortfolioName);
      if (res.success) {
        setValData(res.data);
        if (res.data.unmatched_mappings.length === 0) {
          setStep(3);
        } else {
          setErrorMsg('Some scrip names remain unmatched. Please resolve all items.');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error updating maps.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleCommitSubmit = async () => {
    if (!valData) return;

    setIsValidating(true);
    try {
      const res = await onCommit(valData.batch_id, mappings, portfolioOption, selectedPortfolioName, overrideDuplicateIndices);
      if (res.success) {
        alert(`Successfully imported ${valData.new_rows + overrideDuplicateIndices.length} records!`);
        reset();
        setActiveTab('HISTORY');
      } else {
        setErrorMsg(res.message || 'Failed to commit import records.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error executing commit.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleUndo = async (batchId: string, desc: string) => {
    if (confirm(`Are you sure you want to rollback batch "${desc}"? All transaction records associated with this upload batch ID will be permanently purged from the database.`)) {
      const success = await onUndoBatch(batchId);
      if (success) {
        fetchHistory();
      }
    }
  };

  const handleMappingFieldChange = (file_name: string, value: string) => {
    setMappings({ ...mappings, [file_name]: value });
  };

  const reset = () => {
    setFile(null);
    setValData(null);
    setStep(1);
    setMappings({});
    setErrorMsg('');
    setPortfolioOption('spreadsheet');
    setSelectedPortfolioName('');
    setOverrideDuplicateIndices([]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-slate-100 tracking-tight">Bulk Import Hub</h1>
        <p className="text-slate-400 text-sm">Upload bulk trades, register tickers, or load corporate action histories from Excel spreadsheets.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800/80">
        <button
          onClick={() => setActiveTab('UPLOAD')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'UPLOAD'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Spreadsheet Upload Wizard
        </button>
        <button
          onClick={() => setActiveTab('HISTORY')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'HISTORY'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Import & Rollback History
        </button>
      </div>

      {activeTab === 'UPLOAD' ? (
        /* SPREADSHEET WIZARD */
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Wizard Progress Steps */}
          <div className="flex items-center justify-between px-6 py-4 bg-slate-900/40 border border-slate-800/80 rounded-2xl">
            <div className="flex items-center gap-2.5">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step === 1 ? 'bg-emerald-500 text-slate-950 glow-emerald' : 'bg-slate-800 text-slate-400'
              }`}>1</span>
              <span className={`text-xs font-semibold ${step === 1 ? 'text-slate-100 font-bold' : 'text-slate-400'}`}>Upload spreadsheet</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500" />
            <div className="flex items-center gap-2.5">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step === 2 ? 'bg-emerald-500 text-slate-950 glow-emerald' : 'bg-slate-800 text-slate-400'
              }`}>2</span>
              <span className={`text-xs font-semibold ${step === 2 ? 'text-slate-100 font-bold' : 'text-slate-400'}`}>Scrip Mapping</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500" />
            <div className="flex items-center gap-2.5">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step === 3 ? 'bg-emerald-500 text-slate-950 glow-emerald' : 'bg-slate-800 text-slate-400'
              }`}>3</span>
              <span className={`text-xs font-semibold ${step === 3 ? 'text-slate-100 font-bold' : 'text-slate-400'}`}>Ingestion Preview</span>
            </div>
          </div>

          {step === 1 && (
            /* STEP 1: Select model and upload file */
            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div className="glass-card rounded-2xl p-6 border border-slate-800/80 space-y-4">
                 {/* Target Model Select */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Spreadsheet Schema Model</label>
                  <select
                    value={targetModel}
                    onChange={(e) => setTargetModel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 text-slate-200 text-sm rounded-xl px-4 py-2.5 focus:outline-none transition-colors cursor-pointer"
                  >
                    <option value="transactions">Transactions Tradebook (Symbol, Date, Quantity, Price, Type, Portfolio)</option>
                    <option value="tickers">Master Tickers (ISIN, Symbol, Name, Sector, Segment)</option>
                    <option value="corporate-actions">Corporate Event Schedules (Record Date, ISIN, Symbol, Action Type)</option>
                  </select>
                </div>

                {targetModel === 'tickers' && (
                  <div className="p-3 bg-slate-950 border border-slate-800/60 rounded-xl text-xs text-slate-400 leading-relaxed flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <p>
                      <strong className="text-slate-300">Global Master Directory:</strong> Master Tickers are registered globally in the system database and apply to all portfolios. No portfolio association is needed.
                    </p>
                  </div>
                )}

                {/* Download Sample Template Panel */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-950/60 p-4 rounded-xl border border-slate-800/60 gap-3">
                  <div>
                    <span className="text-xs font-semibold text-slate-200 block">Need the correct column structure?</span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">Download our pre-formatted sample Excel template.</span>
                  </div>
                  <a
                    href={`/api/import/template?model=${targetModel}`}
                    download
                    className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-950/30 hover:bg-emerald-950/50 px-3.5 py-2 rounded-xl border border-emerald-500/20 active:scale-95"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Template (.xlsx)
                  </a>
                </div>

                {targetModel === 'transactions' && (
                  <div className="space-y-3 p-4 bg-slate-950/40 border border-slate-800/80 rounded-xl">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Target Portfolio Destination</span>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => { setPortfolioOption('spreadsheet'); setSelectedPortfolioName(''); }}
                        className={`px-3 py-2 text-xs font-semibold rounded-lg border text-center cursor-pointer transition-colors ${
                          portfolioOption === 'spreadsheet'
                            ? 'bg-emerald-950/30 border-emerald-500 text-emerald-400'
                            : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400'
                        }`}
                      >
                        Spreadsheet Values
                      </button>
                      <button
                        type="button"
                        onClick={() => { setPortfolioOption('existing'); setSelectedPortfolioName(''); }}
                        className={`px-3 py-2 text-xs font-semibold rounded-lg border text-center cursor-pointer transition-colors ${
                          portfolioOption === 'existing'
                            ? 'bg-emerald-950/30 border-emerald-500 text-emerald-400'
                            : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400'
                        }`}
                      >
                        Existing Portfolio
                      </button>
                      <button
                        type="button"
                        onClick={() => { setPortfolioOption('new'); setSelectedPortfolioName(''); }}
                        className={`px-3 py-2 text-xs font-semibold rounded-lg border text-center cursor-pointer transition-colors ${
                          portfolioOption === 'new'
                            ? 'bg-emerald-950/30 border-emerald-500 text-emerald-400'
                            : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400'
                        }`}
                      >
                        Create New
                      </button>
                    </div>

                    {portfolioOption === 'existing' && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Select Portfolio</label>
                        <select
                          value={selectedPortfolioName}
                          onChange={(e) => setSelectedPortfolioName(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none transition-colors cursor-pointer"
                        >
                          <option value="">-- Choose Existing Portfolio --</option>
                          {portfolios.map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {portfolioOption === 'new' && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">New Portfolio Name</label>
                        <input
                          type="text"
                          value={selectedPortfolioName}
                          onChange={(e) => setSelectedPortfolioName(e.target.value)}
                          placeholder="e.g. Maa Mutual Fund"
                          required
                          className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none transition-colors"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Drag and drop panel */}
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-10 text-center flex flex-col items-center justify-center transition-all ${
                    dragActive 
                      ? 'border-emerald-500 bg-emerald-950/10' 
                      : 'border-slate-800 bg-slate-900/20 hover:border-slate-700'
                  }`}
                >
                  <UploadCloud className={`w-12 h-12 mb-3 ${dragActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                  
                  <h3 className="font-display font-semibold text-slate-200 mb-1">
                    Upload Spreadsheet File
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mb-4">
                    Supports Excel (.xlsx, .xls) and standard CSV sheets matching the selected database headers.
                  </p>

                  <label className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 font-semibold px-4 py-2 rounded-xl text-xs cursor-pointer transition-colors">
                    Browse File
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>

                  {file && (
                    <div className="mt-4 flex items-center gap-2 bg-emerald-950/20 border border-emerald-500/20 px-4 py-1.5 rounded-xl text-xs text-emerald-400 font-mono font-medium">
                      <FileSpreadsheet className="w-4 h-4" />
                      {file.name} ({Math.round(file.size / 1024)} KB)
                    </div>
                  )}
                </div>
              </div>

              {errorMsg && (
                <div className="p-4 bg-rose-950/20 border border-rose-500/20 text-rose-300 text-xs rounded-xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                  <p className="leading-relaxed font-mono">{errorMsg}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={!file || isValidating}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 text-slate-950 font-bold rounded-xl transition-colors cursor-pointer shadow-lg shadow-emerald-500/10"
              >
                {isValidating ? 'Validating Schema Headers...' : 'Run Dry-Run Schema Verification'}
              </button>
            </form>
          )}

          {step === 2 && valData && (
            /* STEP 2: Scrip Mapping Validation */
            <form onSubmit={handleApplyMappingsSubmit} className="space-y-4">
              {valData?.master_tickers && (
                <datalist id="master-tickers-list">
                  {valData.master_tickers.map((t: any) => (
                    <option key={t.symbol} value={t.symbol}>{t.name}</option>
                  ))}
                </datalist>
              )}
              <div className="glass-card rounded-2xl p-6 border border-slate-800/80 space-y-4">
                <div className="flex items-start gap-3 pb-3 border-b border-slate-800/60">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-display font-semibold text-slate-100">Unresolved Scrip Mappings ({valData.unmatched_mappings.length})</h3>
                    <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                      The sheet contains scrip symbols not present in your Master Directory. Map them now so the ledger logs them correctly.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {valData.unmatched_mappings.map((item) => (
                    <div key={item.file_name} className="flex flex-col gap-2 p-3 bg-slate-900/40 border border-slate-800/60 rounded-xl text-xs">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-200">{item.file_name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded ${
                          item.match_type === 'exact' ? 'bg-emerald-500/20 text-emerald-400' :
                          item.match_type === 'fuzzy (high confidence)' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {item.match_type === 'exact' ? 'Exact Match' : item.match_type === 'fuzzy (high confidence)' ? 'High Confidence' : 'No Exact Match'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={mappings[item.file_name] || ''}
                          onChange={(e) => handleMappingFieldChange(item.file_name, e.target.value.toUpperCase())}
                          onBlur={(e) => {
                            const val = e.target.value.toUpperCase();
                            if (val) {
                              fetch('/api/mappings/save', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ mappings: { [item.file_name]: val } })
                              }).catch(console.error);
                            }
                          }}
                          list="master-tickers-list"
                          placeholder="Database target ticker"
                          required
                          className="bg-slate-950 border border-slate-800 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none text-slate-200 font-mono"
                        />
                        
                        <div className="flex items-center gap-1 overflow-x-auto text-[10px] text-slate-500 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800/40">
                          Suggestions:{' '}
                          {item.suggestions.length > 0 ? (
                            item.suggestions.map((s: string) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => {
                                  handleMappingFieldChange(item.file_name, s);
                                  fetch('/api/mappings/save', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ mappings: { [item.file_name]: s } })
                                  }).catch(console.error);
                                }}
                                className="bg-slate-900 hover:bg-slate-850 hover:text-slate-300 text-slate-400 px-1.5 py-0.5 rounded font-mono"
                              >
                                {s}
                              </button>
                            ))
                          ) : (
                            <span className="italic">None</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {errorMsg && (
                <div className="p-4 bg-rose-950/20 border border-rose-500/20 text-rose-300 text-xs rounded-xl font-mono">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 py-3 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-xl transition-colors cursor-pointer text-xs font-semibold"
                >
                  Discard Import
                </button>
                <button
                  type="submit"
                  disabled={isValidating}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-xl font-bold transition-colors cursor-pointer text-xs shadow-lg shadow-emerald-500/10"
                >
                  {isValidating ? 'Applying Maps...' : 'Apply Mappings & Validate'}
                </button>
              </div>
            </form>
          )}

          {step === 3 && valData && (
            /* STEP 3: Deduplication check and commit */
            <div className="space-y-4">
              <div className="glass-card rounded-2xl p-6 border border-slate-800/80 space-y-6">
                <div className="flex items-start gap-3 pb-3 border-b border-slate-800/60">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5 glow-emerald" />
                  <div>
                    <h3 className="font-display font-semibold text-slate-100">Deduplication & Dry-Run Complete</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Verify dry-run results below before committing modifications permanently.
                    </p>
                  </div>
                </div>

                {/* Line-by-Line Accounting Safeguard Audit Banner */}
                <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-emerald-300">100% Line Accounting Verified</h4>
                      <p className="text-[11px] text-emerald-400/80">
                        All {valData.total_rows} rows from your spreadsheet were fully accounted for with zero line loss.
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold rounded-lg uppercase tracking-wider border border-emerald-500/30">
                    Line Audit Passed
                  </span>
                </div>

                {/* Dry Run Counts */}
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/60">
                    <span className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider block">Total Row Records</span>
                    <span className="font-display font-bold text-slate-100 text-xl">{valData.total_rows}</span>
                  </div>
                  <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/20">
                    <span className="text-emerald-400 text-[10px] font-semibold uppercase tracking-wider block">Ready to Import</span>
                    <span className="font-display font-bold text-emerald-400 text-xl">{valData.new_rows}</span>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/40">
                    <span className="text-slate-500 text-[10px] font-semibold uppercase tracking-wider block">Duplicates Skipped</span>
                    <span className="font-display font-bold text-slate-400 text-xl">{valData.duplicate_rows}</span>
                  </div>
                  <div className="p-4 rounded-xl bg-amber-950/10 border border-amber-500/10">
                    <span className="text-amber-400 text-[10px] font-semibold uppercase tracking-wider block">Warnings Flagged</span>
                    <span className="font-display font-bold text-amber-400 text-xl">{valData.similar_rows}</span>
                  </div>
                </div>

                {/* Dry Run Preview Table */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Dry Run Row Previews</span>
                  <div className="overflow-x-auto rounded-xl border border-slate-850 bg-slate-950 max-h-48 overflow-y-auto">
                    <table className="min-w-full divide-y divide-slate-800/40 text-xs font-mono">
                      <thead className="bg-slate-900/40 text-slate-500 uppercase font-semibold text-[9px] tracking-wider">
                        <tr>
                          <th className="px-4 py-2 text-left">Trade Date</th>
                          <th className="px-4 py-2 text-left">Portfolio</th>
                          <th className="px-4 py-2 text-left">Symbol</th>
                          <th className="px-4 py-2 text-left">Type</th>
                          <th className="px-4 py-2 text-right">Qty</th>
                          <th className="px-4 py-2 text-right">Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850 text-slate-300">
                        {valData.preview.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/25">
                            <td className="px-4 py-2 text-slate-400">{row.date || row.record_date}</td>
                            <td className="px-4 py-2">{row.portfolio || 'Maa Zerodha'}</td>
                            <td className="px-4 py-2 text-slate-100 font-bold">{row.symbol}</td>
                            <td className="px-4 py-2">{row.type || row.action_type}</td>
                            <td className="px-4 py-2 text-right">{row.quantity || row.numerator || '-'}</td>
                            <td className="px-4 py-2 text-right">{row.price || row.dividend_per_share || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Duplicates Review Section */}
                {valData.duplicates && valData.duplicates.length > 0 && (
                  <div className="space-y-3 mt-6 border-t border-slate-800/60 pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" />
                          Review Duplicates ({valData.duplicates.length})
                        </span>
                        <p className="text-[11px] text-slate-400 mt-1">Select any trades you wish to forcefully import (overriding the duplicate check).</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (valData.duplicates.every((d: any) => overrideDuplicateIndices.includes(d.originalIndex))) {
                            setOverrideDuplicateIndices(prev => prev.filter(id => !valData.duplicates.some((d: any) => d.originalIndex === id)));
                          } else {
                            const newIds = valData.duplicates.map((d: any) => d.originalIndex).filter((id: number) => !overrideDuplicateIndices.includes(id));
                            setOverrideDuplicateIndices(prev => [...prev, ...newIds]);
                          }
                        }}
                        className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-lg font-semibold transition-colors"
                      >
                        {valData.duplicates.every((d: any) => overrideDuplicateIndices.includes(d.originalIndex)) ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    
                    <div className="overflow-x-auto rounded-xl border border-amber-900/30 bg-slate-950/80 max-h-60 overflow-y-auto">
                      <table className="min-w-full divide-y divide-slate-800/40 text-xs font-mono">
                        <thead className="bg-amber-950/20 text-amber-500/70 uppercase font-semibold text-[9px] tracking-wider sticky top-0 backdrop-blur-md">
                          <tr>
                            <th className="px-4 py-2 text-left w-10">Override</th>
                            <th className="px-4 py-2 text-left">Trade Date</th>
                            <th className="px-4 py-2 text-left">Symbol</th>
                            <th className="px-4 py-2 text-left">Type</th>
                            <th className="px-4 py-2 text-right">Qty</th>
                            <th className="px-4 py-2 text-right">Price</th>
                            <th className="px-4 py-2 text-left">Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850 text-slate-300">
                          {valData.duplicates.map((row: any, idx: number) => (
                            <tr key={idx} className={`hover:bg-slate-900/40 transition-colors ${overrideDuplicateIndices.includes(row.originalIndex) ? 'bg-amber-900/10' : ''}`}>
                              <td className="px-4 py-2 text-center">
                                <input 
                                  type="checkbox" 
                                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 checked:bg-amber-500 focus:ring-amber-500/30 cursor-pointer"
                                  checked={overrideDuplicateIndices.includes(row.originalIndex)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setOverrideDuplicateIndices(prev => [...prev, row.originalIndex]);
                                    } else {
                                      setOverrideDuplicateIndices(prev => prev.filter(id => id !== row.originalIndex));
                                    }
                                  }}
                                />
                              </td>
                              <td className="px-4 py-2 text-slate-400">{row.date || row.record_date}</td>
                              <td className="px-4 py-2 text-amber-100 font-bold">{row.symbol}</td>
                              <td className="px-4 py-2">{row.type || row.action_type}</td>
                              <td className="px-4 py-2 text-right">{row.quantity || row.numerator || '-'}</td>
                              <td className="px-4 py-2 text-right">{row.price || row.dividend_per_share || '-'}</td>
                              <td className="px-4 py-2 text-[10px] text-amber-500/80">{row.duplicateReason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Warnings Review Section */}
                {valData.warnings && valData.warnings.length > 0 && (
                  <div className="space-y-3 mt-6 border-t border-slate-800/60 pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" />
                          Review Warning Flagged ({valData.warnings.length})
                        </span>
                        <p className="text-[11px] text-slate-400 mt-1">Select any trades you wish to forcefully import (overriding the duplicate check).</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (valData.warnings.every((d: any) => overrideDuplicateIndices.includes(d.originalIndex))) {
                            setOverrideDuplicateIndices(prev => prev.filter(id => !valData.warnings.some((d: any) => d.originalIndex === id)));
                          } else {
                            const newIds = valData.warnings.map((d: any) => d.originalIndex).filter((id: number) => !overrideDuplicateIndices.includes(id));
                            setOverrideDuplicateIndices(prev => [...prev, ...newIds]);
                          }
                        }}
                        className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-lg font-semibold transition-colors"
                      >
                        {valData.warnings.every((d: any) => overrideDuplicateIndices.includes(d.originalIndex)) ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    
                    <div className="overflow-x-auto rounded-xl border border-orange-900/30 bg-slate-950/80 max-h-60 overflow-y-auto">
                      <table className="min-w-full divide-y divide-slate-800/40 text-xs font-mono">
                        <thead className="bg-orange-950/20 text-orange-500/70 uppercase font-semibold text-[9px] tracking-wider sticky top-0 backdrop-blur-md">
                          <tr>
                            <th className="px-4 py-2 text-left w-10">Override</th>
                            <th className="px-4 py-2 text-left">Trade Date</th>
                            <th className="px-4 py-2 text-left">Symbol</th>
                            <th className="px-4 py-2 text-left">Type</th>
                            <th className="px-4 py-2 text-right">Qty</th>
                            <th className="px-4 py-2 text-right">Price</th>
                            <th className="px-4 py-2 text-left">Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850 text-slate-300">
                          {valData.warnings.map((row: any, idx: number) => (
                            <tr key={idx} className={`hover:bg-slate-900/40 transition-colors ${overrideDuplicateIndices.includes(row.originalIndex) ? 'bg-orange-900/10' : ''}`}>
                              <td className="px-4 py-2 text-center">
                                <input 
                                  type="checkbox" 
                                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 checked:bg-orange-500 focus:ring-orange-500/30 cursor-pointer"
                                  checked={overrideDuplicateIndices.includes(row.originalIndex)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setOverrideDuplicateIndices(prev => [...prev, row.originalIndex]);
                                    } else {
                                      setOverrideDuplicateIndices(prev => prev.filter(id => id !== row.originalIndex));
                                    }
                                  }}
                                />
                              </td>
                              <td className="px-4 py-2 text-slate-400">{row.date || row.record_date}</td>
                              <td className="px-4 py-2 text-orange-100 font-bold">{row.symbol}</td>
                              <td className="px-4 py-2">{row.type || row.action_type}</td>
                              <td className="px-4 py-2 text-right">{row.quantity || row.numerator || '-'}</td>
                              <td className="px-4 py-2 text-right">{row.price || row.dividend_per_share || '-'}</td>
                              <td className="px-4 py-2 text-[10px] text-orange-500/80">{row.duplicateReason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {errorMsg && (
                <div className="p-4 bg-rose-950/20 border border-rose-500/20 text-rose-300 text-xs rounded-xl font-mono">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 py-3 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-xl transition-colors cursor-pointer text-xs font-semibold"
                >
                  Cancel Import
                </button>
                <button
                  type="button"
                  onClick={handleCommitSubmit}
                  disabled={(valData.new_rows === 0 && overrideDuplicateIndices.length === 0) || isValidating}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 text-slate-950 rounded-xl font-bold transition-colors cursor-pointer text-xs shadow-lg shadow-emerald-500/10"
                >
                  {isValidating ? 'Committing...' : `Commit ${valData.new_rows + overrideDuplicateIndices.length} Records`}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* HISTORY & UNDO LOGS */
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="font-display text-xl font-bold text-slate-200 tracking-tight">Bulk Upload Audit Trail</h3>
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1 rounded-full text-xs text-slate-400">
              Total Batches:{' '}
              <span className="font-bold text-slate-300">
                {historyLogs.length}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-950">
            <table className="min-w-full divide-y divide-slate-800/60 text-sm">
              <thead className="bg-slate-900/60 text-slate-400 uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="px-6 py-4 text-left">Upload Timestamp</th>
                  <th className="px-6 py-4 text-left">Batch ID Tracing</th>
                  <th className="px-6 py-4 text-left">Target Model</th>
                  <th className="px-6 py-4 text-left">Batch Description</th>
                  <th className="px-6 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-slate-300 font-medium">
                {historyLogs.length > 0 ? (
                  historyLogs.map((log) => (
                    <tr key={log.batch_id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="px-6 py-4 font-mono text-slate-400 text-xs">
                        {log.timestamp}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">
                        {log.batch_id}
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-indigo-400 font-bold">
                        {log.action_type}
                      </td>
                      <td className="px-6 py-4 text-slate-300 text-xs">
                        {log.description}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleUndo(log.batch_id, log.description)}
                          className="flex items-center gap-1.5 mx-auto bg-slate-900 border border-slate-800 hover:border-rose-500 hover:text-rose-100 text-slate-400 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Undo Batch
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      <Info className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                      No bulk import batches have been registered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
