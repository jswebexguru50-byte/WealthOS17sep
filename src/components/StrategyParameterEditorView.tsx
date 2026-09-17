import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Settings, Save, Copy, Trash2, RefreshCw, ChevronDown, ChevronUp,
  Sliders, Play, CheckCircle2, AlertTriangle, Plus, Edit2, X
} from 'lucide-react';
import {
  STRATEGY_CATALOG, PARAM_METADATA, FAMILY_LABELS,
  getDefaultsForStrategy, getParamValue, setParamValue, mergeWithDefaults,
  type StrategyId, type StrategyParameterConfig, type ParameterFamily,
  type ParameterMeta, type StrategyMeta
} from '../server/services/StrategyParameterConfig.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CustomStrategy {
  id: string;
  name: string;
  base_template_id: string;
  description?: string;
  parameters_json: string;
  created_at: string;
  last_backtest_at?: string;
  backtest_win_rate?: number;
  backtest_sharpe?: number;
  backtest_total_signals?: number;
}

const STRATEGY_COLORS: Record<string, string> = {
  S1: 'emerald', S2: 'cyan', S3: 'amber', S4: 'pink',
  S5: 'violet', S6: 'sky', S7: 'orange', S8: 'rose',
  S9: 'teal', S10: 'indigo',
};

const CATEGORY_BADGE: Record<string, string> = {
  BREAKOUT: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  PULLBACK: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  MEAN_REVERSION: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  MOMENTUM: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  INTRADAY_HYBRID: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
};

const FAMILY_ORDER: ParameterFamily[] = [
  'universe', 'trend', 'impulse', 'pullback', 'volume',
  'volatility', 'entry', 'smartMoney', 'risk', 'filters'
];

// ─── Sub-Components ───────────────────────────────────────────────────────────

const StrategyBadge: React.FC<{ id: StrategyId }> = ({ id }) => {
  const short = STRATEGY_CATALOG.find(s => s.id === id)?.shortName || id;
  const color = STRATEGY_COLORS[short] || 'slate';
  return (
    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border bg-${color}-500/10 text-${color}-300 border-${color}-500/30`}>
      {short}
    </span>
  );
};

const ParamRow: React.FC<{
  meta: ParameterMeta;
  value: any;
  templateValue: any;
  onChange: (key: string, val: any) => void;
  onReset: (key: string) => void;
}> = ({ meta, value, templateValue, onChange, onReset }) => {
  const isDiff = value !== templateValue;

  return (
    <div className={`flex items-center gap-3 py-1.5 px-2 rounded-lg transition-colors ${isDiff ? 'bg-amber-500/5 border border-amber-500/20' : 'hover:bg-slate-800/40'}`}>
      {/* Label */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-xs font-medium ${isDiff ? 'text-amber-300' : 'text-slate-200'}`}>
            {meta.label}
          </span>
          {meta.unit && <span className="text-[10px] text-slate-500 font-mono">{meta.unit}</span>}
          {isDiff && <span className="text-[9px] text-amber-400 font-mono">MODIFIED</span>}
        </div>
        <div className="flex items-center gap-1 flex-wrap mt-0.5">
          {meta.usedBy.slice(0, 6).map(id => <StrategyBadge key={id} id={id} />)}
        </div>
      </div>

      {/* Control */}
      <div className="flex items-center gap-2 shrink-0">
        {meta.type === 'boolean' && (
          <label className="relative cursor-pointer">
            <input
              type="checkbox"
              checked={!!value}
              onChange={e => onChange(meta.key, e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-8 h-4 bg-slate-700 rounded-full peer peer-checked:bg-indigo-500 transition-colors" />
            <div className="absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
          </label>
        )}

        {meta.type === 'number' && (
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={meta.min ?? 0}
              max={meta.max ?? 100}
              step={meta.step ?? 1}
              value={value ?? meta.default}
              onChange={e => onChange(meta.key, parseFloat(e.target.value))}
              className="w-24 h-1 bg-slate-700 rounded-full appearance-none cursor-pointer accent-indigo-500"
            />
            <span className="text-xs font-mono text-white w-12 text-right tabular-nums">
              {typeof value === 'number' ? value.toFixed(value < 10 && meta.step && meta.step < 1 ? 2 : 0) : value}
            </span>
          </div>
        )}

        {meta.type === 'enum' && (
          <select
            value={value ?? meta.default}
            onChange={e => onChange(meta.key, e.target.value)}
            className="text-[10px] font-mono bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200 cursor-pointer focus:outline-none focus:border-indigo-500 max-w-[130px]"
          >
            {(meta.enumValues || []).map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        )}

        {isDiff && (
          <button
            onClick={() => onReset(meta.key)}
            title="Reset to template default"
            className="w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:text-amber-400 hover:bg-slate-700 transition cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};

const FamilySection: React.FC<{
  family: ParameterFamily;
  params: ParameterMeta[];
  config: StrategyParameterConfig;
  templateConfig: StrategyParameterConfig;
  onChange: (key: string, val: any) => void;
  onReset: (key: string) => void;
  activeStrategyFamilies: ParameterFamily[];
}> = ({ family, params, config, templateConfig, onChange, onReset, activeStrategyFamilies }) => {
  const [open, setOpen] = useState(activeStrategyFamilies.includes(family));
  const diffCount = params.filter(p => getParamValue(config, p.key) !== getParamValue(templateConfig, p.key)).length;

  return (
    <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/40 transition cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white">{FAMILY_LABELS[family]}</span>
          {diffCount > 0 && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
              {diffCount} modified
            </span>
          )}
          {!activeStrategyFamilies.includes(family) && (
            <span className="text-[9px] font-mono text-slate-500">not used by selected strategy</span>
          )}
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-0.5 border-t border-slate-800/60">
          {params.map(p => (
            <ParamRow
              key={p.key}
              meta={p}
              value={getParamValue(config, p.key)}
              templateValue={getParamValue(templateConfig, p.key)}
              onChange={onChange}
              onReset={onReset}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────

export const StrategyParameterEditorView: React.FC = () => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<StrategyId>('S1_VPA_BASE_BREAKOUT');
  const [config, setConfig] = useState<StrategyParameterConfig>(() => getDefaultsForStrategy('S1_VPA_BASE_BREAKOUT'));
  const [strategyName, setStrategyName] = useState('');
  const [savedStrategies, setSavedStrategies] = useState<CustomStrategy[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [backtesting, setBacktesting] = useState(false);
  const [runningAllBacktests, setRunningAllBacktests] = useState(false);
  const [backtestResult, setBacktestResult] = useState<{
    totalSignals: number;
    winRatePct: string;
    sharpeRatio: string;
    avgReturnPct: string;
    topSignals: {symbol: string; cmp: number; gain: string}[];
  } | null>(null);

  // Column management state
  const [schemaColumns, setSchemaColumns] = useState<Array<{name: string; type: string; isSystem: boolean}>>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [showSchemaPanel, setShowSchemaPanel] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState<'TEXT' | 'INTEGER' | 'REAL'>('TEXT');
  const [schemaActionLoading, setSchemaActionLoading] = useState(false);

  const templateConfig = useMemo(() => getDefaultsForStrategy(selectedTemplateId), [selectedTemplateId]);
  const selectedMeta = STRATEGY_CATALOG.find(s => s.id === selectedTemplateId)!;

  const paramsByFamily = useMemo(() => {
    const map: Partial<Record<ParameterFamily, ParameterMeta[]>> = {};
    for (const family of FAMILY_ORDER) {
      map[family] = PARAM_METADATA.filter(p => p.family === family);
    }
    return map;
  }, []);

  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchSaved = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch('/api/strategies/custom');
      const json = await res.json();
      if (json.success) setSavedStrategies(json.data || []);
    } catch { /* silent */ } finally { setLoadingList(false); }
  }, []);

  useEffect(() => { fetchSaved(); }, [fetchSaved]);

  const fetchSchema = useCallback(async () => {
    setSchemaLoading(true);
    try {
      const res = await fetch('/api/strategies/custom/schema');
      const json = await res.json();
      if (json.success) setSchemaColumns(json.data.columns || []);
      else showToast(json.error || 'Could not load schema', 'error');
    } catch { showToast('Network error loading schema', 'error'); }
    finally { setSchemaLoading(false); }
  }, [showToast]);

  const handleAddColumn = async () => {
    const name = newColName.trim().replace(/[^a-zA-Z0-9_]/g, '_');
    if (!name) { showToast('Enter a valid column name (letters, numbers, underscore)', 'error'); return; }
    setSchemaActionLoading(true);
    try {
      const res = await fetch('/api/strategies/custom/schema/columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnName: name, columnType: newColType }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Column "${json.data.columnName}" (${json.data.columnType}) added`, 'success');
        setNewColName('');
        fetchSchema();
        fetchSaved();
      } else {
        showToast(json.error || 'Add column failed', 'error');
      }
    } catch (e: any) { showToast(e.message || 'Network error', 'error'); }
    finally { setSchemaActionLoading(false); }
  };

  const handleDeleteColumn = async (colName: string) => {
    if (!confirm(`Drop column "${colName}" from CustomStrategies? All existing data in that column will be lost.`)) return;
    setSchemaActionLoading(true);
    try {
      const res = await fetch(`/api/strategies/custom/schema/columns/${encodeURIComponent(colName)}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        showToast(`Column "${colName}" deleted`, 'success');
        fetchSchema();
        fetchSaved();
      } else {
        showToast(json.error || 'Delete column failed', 'error');
      }
    } catch (e: any) { showToast(e.message || 'Network error', 'error'); }
    finally { setSchemaActionLoading(false); }
  };

  const handleTemplateChange = (id: StrategyId) => {
    setSelectedTemplateId(id);
    setConfig(getDefaultsForStrategy(id));
    setStrategyName('');
  };

  const handleParamChange = (key: string, val: any) => {
    setConfig(prev => setParamValue(prev, key, val));
  };

  const handleParamReset = (key: string) => {
    const defaultVal = getParamValue(templateConfig, key);
    setConfig(prev => setParamValue(prev, key, defaultVal));
  };

  const handleResetAll = () => {
    setConfig(getDefaultsForStrategy(selectedTemplateId));
    showToast('Reset to template defaults', 'info');
  };

  const handleSave = async () => {
    const name = strategyName.trim();
    if (!name) { showToast('Please enter a strategy name', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/strategies/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          baseTemplateId: selectedTemplateId,
          parametersJson: JSON.stringify(config)
        })
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Strategy "${name}" saved`, 'success');
        setStrategyName('');
        fetchSaved();
      } else {
        showToast(json.error || 'Save failed', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Network error', 'error');
    } finally { setSaving(false); }
  };

  const handleLoad = (s: CustomStrategy) => {
    try {
      const parsed = JSON.parse(s.parameters_json);
      setConfig(mergeWithDefaults(parsed));
      setSelectedTemplateId(s.base_template_id as StrategyId);
      setStrategyName(s.name + ' (copy)');
      showToast(`Loaded "${s.name}"`, 'success');
    } catch { showToast('Failed to parse strategy config', 'error'); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete strategy "${name}"?`)) return;
    try {
      const res = await fetch(`/api/strategies/custom/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) { showToast('Deleted', 'success'); fetchSaved(); }
      else showToast(json.error || 'Delete failed', 'error');
    } catch { showToast('Network error', 'error'); }
  };

  const handleDuplicate = (s: CustomStrategy) => {
    try {
      const parsed = JSON.parse(s.parameters_json);
      setConfig(mergeWithDefaults(parsed));
      setSelectedTemplateId(s.base_template_id as StrategyId);
      setStrategyName(`${s.name} (copy)`);
      showToast(`Duplicating "${s.name}" — edit and save`, 'info');
    } catch { showToast('Failed to duplicate', 'error'); }
  };

  const handleRunAllBacktests = async () => {
    if (savedStrategies.length === 0) { showToast('No saved strategies to backtest', 'info'); return; }
    if (!confirm(`Run backtest for all ${savedStrategies.length} saved strategies? This may take a few minutes.`)) return;
    setRunningAllBacktests(true);
    try {
      const res = await fetch('/api/strategies/custom/run-all-backtests', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showToast(`All backtests done: ${json.data.ran} strategies processed`, 'success');
        fetchSaved();
      } else {
        showToast(json.error || 'Run all backtests failed', 'error');
      }
    } catch (e: any) { showToast(e.message || 'Network error', 'error'); }
    finally { setRunningAllBacktests(false); }
  };

  const handleBacktest = async (s?: CustomStrategy) => {
    const stratId = s?.id;
    if (!stratId) {
      showToast('Save the strategy first, then run backtest', 'info');
      return;
    }
    setBacktesting(true);
    setBacktestResult(null);
    try {
      const res = await fetch(`/api/strategies/custom/${stratId}/run-backtest`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setBacktestResult(json.data);
        showToast(`Backtest done: ${json.data.totalSignals} signals, ${json.data.winRatePct}% win rate`, 'success');
        fetchSaved();
      } else {
        showToast(json.error || 'Backtest failed', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Network error', 'error');
    } finally { setBacktesting(false); }
  };

  const totalModified = useMemo(() => {
    return PARAM_METADATA.filter(p =>
      getParamValue(config, p.key) !== getParamValue(templateConfig, p.key)
    ).length;
  }, [config, templateConfig]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 space-y-5">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-xl flex items-center gap-2 transition-all
          ${toast.type === 'success' ? 'bg-emerald-900/90 border border-emerald-500/40 text-emerald-200' :
            toast.type === 'error' ? 'bg-rose-900/90 border border-rose-500/40 text-rose-200' :
            'bg-indigo-900/90 border border-indigo-500/40 text-indigo-200'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white flex items-center gap-2">
                Strategy Parameter Editor
                {totalModified > 0 && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    {totalModified} changes from template
                  </span>
                )}
              </h1>
              <p className="text-xs text-slate-400">Clone any of the 10 built-in strategies, tune parameters, and save as a custom strategy</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCompareMode(m => !m)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer
                ${compareMode ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'}`}
            >
              {compareMode ? 'Hide Compare' : 'Compare vs Template'}
            </button>
            <button
              onClick={handleResetAll}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" /> Reset All
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-5">
        {/* LEFT PANEL: Template selector + Save + Saved list */}
        <div className="space-y-4">
          {/* Template Selector */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
              <Settings className="w-3.5 h-3.5 text-indigo-400" /> Select Base Template
            </h3>
            <div className="space-y-1.5">
              {STRATEGY_CATALOG.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleTemplateChange(s.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition cursor-pointer
                    ${selectedTemplateId === s.id
                      ? 'bg-indigo-500/15 border-indigo-500/40 text-white'
                      : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{s.shortName}: {s.name}</span>
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${CATEGORY_BADGE[s.category]}`}>
                      {s.category.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{s.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Save Strategy */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
              <Save className="w-3.5 h-3.5 text-emerald-400" /> Save Custom Strategy
            </h3>
            <input
              type="text"
              value={strategyName}
              onChange={e => setStrategyName(e.target.value)}
              placeholder="My Custom Strategy Name..."
              className="w-full px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving || !strategyName.trim()}
                className="flex-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3 h-3" />
                {saving ? 'Saving...' : 'Save Strategy'}
              </button>
              <button
                onClick={() => {
                  const saved = savedStrategies.find(s => s.name === strategyName.trim()) || savedStrategies[0];
                  handleBacktest(saved);
                }}
                disabled={saving || backtesting}
                className="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-slate-600"
              >
                <Play className="w-3 h-3" /> {backtesting ? 'Running...' : 'Backtest'}
              </button>
            </div>
          </div>

          {backtestResult && (
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-emerald-500/30 space-y-3 mt-0">
              <h3 className="text-xs font-bold text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5" /> Backtest Results
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-xl bg-slate-800/60">
                  <p className="text-[10px] text-slate-400">Win Rate</p>
                  <p className="text-lg font-black text-emerald-400">{backtestResult.winRatePct}%</p>
                </div>
                <div className="p-2 rounded-xl bg-slate-800/60">
                  <p className="text-[10px] text-slate-400">Signals</p>
                  <p className="text-lg font-black text-white">{backtestResult.totalSignals}</p>
                </div>
                <div className="p-2 rounded-xl bg-slate-800/60">
                  <p className="text-[10px] text-slate-400">Avg Return</p>
                  <p className="text-lg font-black text-cyan-400">{backtestResult.avgReturnPct}%</p>
                </div>
                <div className="p-2 rounded-xl bg-slate-800/60">
                  <p className="text-[10px] text-slate-400">Sharpe</p>
                  <p className="text-lg font-black text-violet-400">{backtestResult.sharpeRatio}</p>
                </div>
              </div>
              {backtestResult.topSignals.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 mb-1">Top Signals</p>
                  <div className="space-y-1">
                    {backtestResult.topSignals.slice(0, 5).map(s => (
                      <div key={s.symbol} className="flex items-center justify-between px-2 py-1 rounded-lg bg-slate-800/40 text-[10px]">
                        <span className="font-mono font-bold text-white">{s.symbol}</span>
                        <span className={parseFloat(s.gain) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{parseFloat(s.gain) >= 0 ? '+' : ''}{s.gain}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Saved Strategies */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <Edit2 className="w-3.5 h-3.5 text-amber-400" /> Saved Strategies
                {savedStrategies.length > 0 && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                    {savedStrategies.length}
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-1.5">
                {savedStrategies.length > 0 && (
                  <button
                    onClick={handleRunAllBacktests}
                    disabled={runningAllBacktests || backtesting}
                    title="Run backtest for all saved strategies"
                    className="px-2 py-1 rounded-lg bg-emerald-700/60 hover:bg-emerald-600/70 disabled:opacity-40 text-emerald-200 text-[10px] font-bold transition flex items-center gap-1 cursor-pointer border border-emerald-600/40"
                  >
                    <Play className="w-2.5 h-2.5" />
                    {runningAllBacktests ? 'Running...' : 'Backtest All'}
                  </button>
                )}
                <button onClick={fetchSaved} className="p-1 rounded text-slate-400 hover:text-white transition cursor-pointer">
                  <RefreshCw className={`w-3 h-3 ${loadingList ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
            {savedStrategies.length === 0 && !loadingList && (
              <p className="text-[10px] text-slate-500 text-center py-3">No saved strategies yet</p>
            )}
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {savedStrategies.map(s => (
                <div key={s.id} className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{s.name}</p>
                      <p className="text-[9px] text-slate-400 font-mono">
                        Base: {STRATEGY_CATALOG.find(x => x.id === s.base_template_id)?.shortName || s.base_template_id}
                        {s.backtest_win_rate != null && ` · Win: ${s.backtest_win_rate.toFixed(1)}%`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleLoad(s)} title="Load" className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-indigo-400 hover:bg-slate-700 cursor-pointer transition">
                        <Plus className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleDuplicate(s)} title="Duplicate" className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-amber-400 hover:bg-slate-700 cursor-pointer transition">
                        <Copy className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleBacktest(s)} title="Run Backtest" className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-emerald-400 hover:bg-slate-700 cursor-pointer transition">
                        <Play className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleDelete(s.id, s.name)} title="Delete" className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-rose-400 hover:bg-slate-700 cursor-pointer transition">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Manage Columns */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
            <button
              className="w-full flex items-center justify-between cursor-pointer group"
              onClick={() => {
                const next = !showSchemaPanel;
                setShowSchemaPanel(next);
                if (next && schemaColumns.length === 0) fetchSchema();
              }}
            >
              <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-violet-400" /> Manage Strategy Columns
              </h3>
              {showSchemaPanel
                ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition" />
                : <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition" />}
            </button>

            {showSchemaPanel && (
              <div className="space-y-3">
                {/* Add new column */}
                <div className="space-y-2 p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Add Column</p>
                  <input
                    type="text"
                    value={newColName}
                    onChange={e => setNewColName(e.target.value)}
                    placeholder="column_name"
                    className="w-full px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                  />
                  <div className="flex gap-2">
                    <select
                      value={newColType}
                      onChange={e => setNewColType(e.target.value as any)}
                      className="flex-1 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-violet-500 cursor-pointer"
                    >
                      <option value="TEXT">TEXT</option>
                      <option value="INTEGER">INTEGER</option>
                      <option value="REAL">REAL (decimal)</option>
                    </select>
                    <button
                      onClick={handleAddColumn}
                      disabled={schemaActionLoading || !newColName.trim()}
                      className="px-3 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>
                </div>

                {/* Existing columns */}
                {schemaLoading
                  ? <p className="text-[10px] text-slate-500 text-center py-2">Loading schema...</p>
                  : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {schemaColumns.map(col => (
                        <div key={col.name} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px] ${col.isSystem ? 'bg-slate-800/30 opacity-60' : 'bg-slate-800/60 border border-slate-700/40'}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono font-bold text-white truncate">{col.name}</span>
                            <span className="font-mono text-slate-500 shrink-0">{col.type}</span>
                            {col.isSystem && <span className="text-[9px] text-slate-500 shrink-0">system</span>}
                          </div>
                          {!col.isSystem && (
                            <button
                              onClick={() => handleDeleteColumn(col.name)}
                              disabled={schemaActionLoading}
                              title={`Drop column "${col.name}"`}
                              className="w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:text-rose-400 hover:bg-slate-700 transition cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                }
                <button
                  onClick={fetchSchema}
                  disabled={schemaLoading}
                  className="w-full py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${schemaLoading ? 'animate-spin' : ''}`} /> Refresh Schema
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Parameter families */}
        <div className="space-y-3">
          {/* Active strategy info bar */}
          <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center gap-3 flex-wrap">
            <span className={`text-[10px] font-mono font-bold px-2 py-1 rounded border ${CATEGORY_BADGE[selectedMeta.category]}`}>
              {selectedMeta.category.replace('_', ' ')}
            </span>
            <span className="text-sm font-bold text-white">{selectedMeta.shortName}: {selectedMeta.name}</span>
            <span className="text-xs text-slate-400">{selectedMeta.description}</span>
            {compareMode && (
              <span className="ml-auto text-[10px] text-amber-400 font-mono">COMPARE MODE: amber = differs from template</span>
            )}
          </div>

          {FAMILY_ORDER.map(family => {
            const params = (paramsByFamily[family] || []);
            if (params.length === 0) return null;
            return (
              <FamilySection
                key={family}
                family={family}
                params={params}
                config={config}
                templateConfig={templateConfig}
                onChange={handleParamChange}
                onReset={handleParamReset}
                activeStrategyFamilies={selectedMeta.families}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default StrategyParameterEditorView;
