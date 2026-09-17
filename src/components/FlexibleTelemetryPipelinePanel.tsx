import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Download,
  ArrowUpDown,
  Building2,
  Globe,
  Filter,
  Flame,
  Layers,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  XCircle,
  Zap,
  Sliders,
  SlidersHorizontal,
  Info,
  BookmarkPlus,
  Trash2,
  Copy,
  Table as TableIcon,
  CheckSquare,
  Square
} from 'lucide-react';
import { ConsolidatedOpportunity } from '../server/services/ConsolidatedOpportunityEngine.js';
import {
  FlexibleTelemetryPipelineService,
  PipelineStageId,
  PipelineExecutionResult,
  PipelineStepTelemetry
} from '../server/services/FlexibleTelemetryPipelineService.js';
import { formatINR } from '../lib/formatters.js';
import { downloadCsv } from '../lib/csvExport.js';

export interface SavedSubUniverse {
  id: string;
  name: string;
  stageOrder: PipelineStageId[];
  thresholds: any;
  universeBaseline: 'ALL_753' | 'SUNRISE_INDUSTRIAL_GROWTH';
  opportunities: ConsolidatedOpportunity[];
  createdAt: string;
  isCustom?: boolean;
}

interface FlexibleTelemetryPipelinePanelProps {
  opportunities: ConsolidatedOpportunity[];
  totalUniverseCount?: number;
  onOpenDossier?: (symbol: string) => void;
  onSelectScrip?: (opp: ConsolidatedOpportunity) => void;
  initialPreset?: string;
}

export const FlexibleTelemetryPipelinePanel: React.FC<FlexibleTelemetryPipelinePanelProps> = ({
  opportunities = [],
  totalUniverseCount = 753,
  onOpenDossier,
  onSelectScrip,
  initialPreset = 'COMBINATION_1'
}) => {
  // Navigation between Pipeline Funnel and Sub-Universes Comparator
  const [panelView, setPanelView] = useState<'PIPELINE' | 'COMPARE_UNIVERSES'>('PIPELINE');

  // Baseline Selection
  const [universeBaseline, setUniverseBaseline] = useState<'ALL_753' | 'SUNRISE_INDUSTRIAL_GROWTH'>('ALL_753');
  const [sunriseSymbols, setSunriseSymbols] = useState<Set<string>>(new Set());

  // Active Pipeline Stages (User can pick ANY subset in ANY order)
  const [stageOrder, setStageOrder] = useState<PipelineStageId[]>([
    'SECTOR_ROTATION',
    'SMART_MONEY',
    'FUNDAMENTALS',
    'TECHNICAL_VPA'
  ]);
  const [activePreset, setActivePreset] = useState<string>(initialPreset);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [viewMode, setViewMode] = useState<'TABLE' | 'CARDS'>('TABLE');
  const [showThresholdControls, setShowThresholdControls] = useState<boolean>(false);

  // New Sub-Universe Naming state
  const [subUniverseNameInput, setSubUniverseNameInput] = useState<string>('');
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // Table sorting state
  type SortKey =
    | 'symbol'
    | 'sector'
    | 'currentPrice'
    | 'convergenceScore'
    | 'rocePct'
    | 'floatSqueezeRatio'
    | 'vpaStage'
    | 'tranche1Price';
  const [sortKey, setSortKey] = useState<SortKey>('convergenceScore');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Sub-Universe Compare & Contrast States
  const [compareSearch, setCompareSearch] = useState<string>('');
  const [compareSortKey, setCompareSortKey] = useState<string>('overlapCount');
  const [compareSortDir, setCompareSortDir] = useState<'asc' | 'desc'>('desc');

  // Custom Threshold Overrides State
  const [thresholds, setThresholds] = useState({
    minSectorAlpha: 0.0,
    minFloatSqueezeRatio: 0.50,
    minRocePct: 20.0,
    minVpaAsymmetry: 1.20
  });

  const pipelineService = useMemo(() => FlexibleTelemetryPipelineService.getInstance(), []);

  // Fetch sunrise scrip symbols for baseline toggle
  useEffect(() => {
    fetch('/api/opportunity-engine/sunrise-industrial-universe')
      .then(res => res.json())
      .then(json => {
        if (json.success && json.data?.scrips) {
          const syms = new Set<string>(json.data.scrips.map((s: any) => s.symbol));
          setSunriseSymbols(syms);
        }
      })
      .catch(() => {});
  }, []);

  // Baseline filtering
  const baseOpportunities = useMemo(() => {
    if (universeBaseline === 'SUNRISE_INDUSTRIAL_GROWTH' && sunriseSymbols.size > 0) {
      return opportunities.filter(o => sunriseSymbols.has(o.symbol));
    }
    return opportunities;
  }, [opportunities, universeBaseline, sunriseSymbols]);

  // Compute live pipeline cascade execution
  const executionResult: PipelineExecutionResult = useMemo(() => {
    return pipelineService.executePipeline(
      baseOpportunities,
      stageOrder,
      {
        ...thresholds,
        sunriseSymbols: Array.from(sunriseSymbols)
      },
      activePreset
    );
  }, [baseOpportunities, stageOrder, thresholds, activePreset, sunriseSymbols, pipelineService]);

  // Filtered survivors
  const finalSurvivors = useMemo(() => {
    let list = executionResult.finalOpportunities || [];
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      list = list.filter(
        o =>
          o.symbol.toLowerCase().includes(q) ||
          o.companyName.toLowerCase().includes(q) ||
          o.sector.toLowerCase().includes(q) ||
          (o.vpaStage && o.vpaStage.toLowerCase().includes(q))
      );
    }
    return list;
  }, [executionResult, searchFilter]);

  // Sorted survivors
  const sortedSurvivors = useMemo(() => {
    const list = [...finalSurvivors];
    list.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;
      if (sortKey === 'symbol') { valA = a.symbol; valB = b.symbol; }
      else if (sortKey === 'sector') { valA = a.sector || ''; valB = b.sector || ''; }
      else if (sortKey === 'currentPrice') { valA = a.currentPrice || 0; valB = b.currentPrice || 0; }
      else if (sortKey === 'convergenceScore') { valA = a.convergenceScore || 0; valB = b.convergenceScore || 0; }
      else if (sortKey === 'rocePct') { valA = a.rocePct || 0; valB = b.rocePct || 0; }
      else if (sortKey === 'floatSqueezeRatio') { valA = a.floatSqueezeRatio || 0; valB = b.floatSqueezeRatio || 0; }
      else if (sortKey === 'vpaStage') { valA = a.vpaStage || ''; valB = b.vpaStage || ''; }
      else if (sortKey === 'tranche1Price') { valA = a.tranches?.tranche1Price || 0; valB = b.tranches?.tranche1Price || 0; }

      if (typeof valA === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });
    return list;
  }, [finalSurvivors, sortKey, sortOrder]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder(key === 'symbol' || key === 'sector' ? 'asc' : 'desc');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // SUB-UNIVERSES CATALOG & STORAGE
  // ─────────────────────────────────────────────────────────────────────────────

  // Generate 4 Pre-Configured Sub-Universes
  const defaultSubUniverses: SavedSubUniverse[] = useMemo(() => {
    const resA = pipelineService.executePipeline(
      opportunities.filter(o => sunriseSymbols.size === 0 || sunriseSymbols.has(o.symbol)),
      ['SUNRISE_INDUSTRIAL', 'SMART_MONEY', 'FUNDAMENTALS'],
      { ...thresholds, sunriseSymbols: Array.from(sunriseSymbols) },
      'SUNRISE_GROWTH'
    );

    const resB = pipelineService.executePipeline(
      opportunities,
      ['SECTOR_ROTATION', 'TECH_STRATEGY_1', 'SMART_MONEY'],
      thresholds,
      'MOMENTUM_BREAKOUT'
    );

    const resC = pipelineService.executePipeline(
      opportunities,
      ['SMART_MONEY', 'TECH_STRATEGY_2', 'TECH_STRATEGY_3'],
      thresholds,
      'FVG_WAVE_SETUPS'
    );

    const resD = pipelineService.executePipeline(
      opportunities,
      ['SECTOR_ROTATION', 'SMART_MONEY', 'FUNDAMENTALS', 'TECHNICAL_VPA'],
      thresholds,
      'COMBINATION_1'
    );

    return [
      {
        id: 'UNIV_A',
        name: 'Universe A: Conglomerate Sunrise Leaders',
        stageOrder: ['SUNRISE_INDUSTRIAL', 'SMART_MONEY', 'FUNDAMENTALS'],
        thresholds,
        universeBaseline: 'SUNRISE_INDUSTRIAL_GROWTH',
        opportunities: resA.finalOpportunities,
        createdAt: 'Predefined Default',
        isCustom: false
      },
      {
        id: 'UNIV_B',
        name: 'Universe B: High-Velocity VPA Breakouts',
        stageOrder: ['SECTOR_ROTATION', 'TECH_STRATEGY_1', 'SMART_MONEY'],
        thresholds,
        universeBaseline: 'ALL_753',
        opportunities: resB.finalOpportunities,
        createdAt: 'Predefined Default',
        isCustom: false
      },
      {
        id: 'UNIV_C',
        name: 'Universe C: Institutional FVG & Sequential Waves',
        stageOrder: ['SMART_MONEY', 'TECH_STRATEGY_2', 'TECH_STRATEGY_3'],
        thresholds,
        universeBaseline: 'ALL_753',
        opportunities: resC.finalOpportunities,
        createdAt: 'Predefined Default',
        isCustom: false
      },
      {
        id: 'UNIV_D',
        name: 'Universe D: Top-Down Fundamental Funnel',
        stageOrder: ['SECTOR_ROTATION', 'SMART_MONEY', 'FUNDAMENTALS', 'TECHNICAL_VPA'],
        thresholds,
        universeBaseline: 'ALL_753',
        opportunities: resD.finalOpportunities,
        createdAt: 'Predefined Default',
        isCustom: false
      }
    ];
  }, [opportunities, sunriseSymbols, thresholds, pipelineService]);

  const [savedSubUniverses, setSavedSubUniverses] = useState<SavedSubUniverse[]>(defaultSubUniverses);
  const [selectedUniverseIdsToCompare, setSelectedUniverseIdsToCompare] = useState<string[]>([
    'UNIV_A',
    'UNIV_B',
    'UNIV_C'
  ]);

  // Save current pipeline as new Sub-Universe
  const handleSaveSubUniverse = async () => {
    const name = subUniverseNameInput.trim() || `Custom Sub-Universe #${savedSubUniverses.length + 1}`;
    const newSubUniverse: SavedSubUniverse = {
      id: `UNIV_CUSTOM_${Date.now()}`,
      name,
      stageOrder: [...stageOrder],
      thresholds: { ...thresholds },
      universeBaseline,
      opportunities: executionResult.finalOpportunities,
      createdAt: new Date().toISOString(),
      isCustom: true
    };

    setSavedSubUniverses(prev => [...prev, newSubUniverse]);
    setSelectedUniverseIdsToCompare(prev => [...prev, newSubUniverse.id]);
    setSubUniverseNameInput('');
    setSaveSuccessNotice(`Sub-Universe "${name}" created with ${newSubUniverse.opportunities.length} scrips!`);
    setTimeout(() => setSaveSuccessNotice(null), 4000);

    // Persist to backend
    try {
      await fetch('/api/quant/funnel-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSubUniverse.name,
          gate_sequence: newSubUniverse.stageOrder.join(','),
          thresholds_snapshot: JSON.stringify(newSubUniverse.thresholds),
          is_favorite: false
        })
      });
    } catch (e) {
      console.warn('[PipelinePanel] Failed to persist funnel preset:', e);
    }
  };

  const handleDeleteSubUniverse = (id: string) => {
    setSavedSubUniverses(prev => prev.filter(u => u.id !== id));
    setSelectedUniverseIdsToCompare(prev => prev.filter(uid => uid !== id));
  };

  // Toggle stage inclusion in active pipeline
  const toggleStageInclusion = (stageId: PipelineStageId) => {
    if (stageOrder.includes(stageId)) {
      if (stageOrder.length <= 1) return; // Keep at least 1 stage
      setStageOrder(stageOrder.filter(s => s !== stageId));
    } else {
      setStageOrder([...stageOrder, stageId]);
    }
    setActivePreset('CUSTOM');
  };

  // Move stage left/right
  const moveStage = (index: number, direction: 'LEFT' | 'RIGHT') => {
    const targetIndex = direction === 'LEFT' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= stageOrder.length) return;

    const newOrder = [...stageOrder];
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;

    setStageOrder(newOrder);
    setActivePreset('CUSTOM');
  };

  // Export pipeline survivors to CSV
  const handleExportCsv = () => {
    const headers = [
      'Symbol',
      'Company Name',
      'Sector',
      'CMP (INR)',
      'Convergence Score',
      'ROCE %',
      'Float Squeeze Ratio',
      'VPA Stage',
      'Tranche 1 Price (INR)',
      'Tranche 2 Price (INR)',
      'Stop Loss (INR)',
      'Target 1 (INR)',
      'Target 2 (INR)',
      'Actionable Now'
    ];
    const rows = sortedSurvivors.map(opp => [
      opp.symbol,
      opp.companyName,
      opp.sector,
      opp.currentPrice,
      opp.convergenceScore,
      opp.rocePct,
      opp.floatSqueezeRatio,
      opp.vpaStage,
      opp.tranches?.tranche1Price ?? '',
      opp.tranches?.tranche2Price ?? '',
      opp.tranches?.stopLossPrice ?? '',
      opp.tranches?.targetPrice1 ?? '',
      opp.tranches?.targetPrice2 ?? '',
      opp.actionableNow ? 'YES' : 'NO'
    ]);
    downloadCsv(`telemetry_survivors_${activePreset.toLowerCase()}_${universeBaseline.toLowerCase()}`, headers, rows);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // COMPARE & CONTRAST DIFFERENT SUB-UNIVERSES MATRIX COMPUTATION
  // ─────────────────────────────────────────────────────────────────────────────

  const comparedUniverses = useMemo(() => {
    return savedSubUniverses.filter(u => selectedUniverseIdsToCompare.includes(u.id));
  }, [savedSubUniverses, selectedUniverseIdsToCompare]);

  interface UniverseComparisonRow {
    symbol: string;
    companyName: string;
    sector: string;
    cmp: number;
    convergenceScore: number;
    rocePct: number;
    floatSqueezeRatio: number;
    vpaStage: string;
    universePresence: Record<string, boolean>;
    overlapCount: number;
    overlapPct: number;
    isSuperConvergence: boolean;
  }

  const comparisonMatrixData = useMemo(() => {
    if (comparedUniverses.length === 0) return [];

    const map = new Map<string, UniverseComparisonRow>();

    comparedUniverses.forEach(universe => {
      universe.opportunities.forEach(opp => {
        if (!map.has(opp.symbol)) {
          map.set(opp.symbol, {
            symbol: opp.symbol,
            companyName: opp.companyName || opp.symbol,
            sector: opp.sector || 'Unassigned',
            cmp: opp.currentPrice || 0,
            convergenceScore: opp.convergenceScore || 0,
            rocePct: opp.rocePct || 0,
            floatSqueezeRatio: opp.floatSqueezeRatio || 0,
            vpaStage: opp.vpaStage || 'N/A',
            universePresence: {},
            overlapCount: 0,
            overlapPct: 0,
            isSuperConvergence: false
          });
        }
        const row = map.get(opp.symbol)!;
        row.universePresence[universe.id] = true;
      });
    });

    // Compute overlap count
    const totalCompared = comparedUniverses.length;
    const list = Array.from(map.values()).map(row => {
      let count = 0;
      comparedUniverses.forEach(u => {
        if (row.universePresence[u.id]) count++;
      });
      return {
        ...row,
        overlapCount: count,
        overlapPct: totalCompared > 0 ? Number(((count / totalCompared) * 100).toFixed(0)) : 0,
        isSuperConvergence: count === totalCompared && totalCompared > 1
      };
    });

    return list;
  }, [comparedUniverses]);

  // Filter & sort comparison matrix data
  const filteredComparisonData = useMemo(() => {
    let list = [...comparisonMatrixData];
    if (compareSearch.trim()) {
      const q = compareSearch.toLowerCase().trim();
      list = list.filter(
        r =>
          r.symbol.toLowerCase().includes(q) ||
          r.companyName.toLowerCase().includes(q) ||
          r.sector.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let valA: any = (a as any)[compareSortKey];
      let valB: any = (b as any)[compareSortKey];

      if (typeof valA === 'string') {
        return compareSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return compareSortDir === 'asc'
        ? Number(valA || 0) - Number(valB || 0)
        : Number(valB || 0) - Number(valA || 0);
    });

    return list;
  }, [comparisonMatrixData, compareSearch, compareSortKey, compareSortDir]);

  const handleCompareSort = (key: string) => {
    if (compareSortKey === key) {
      setCompareSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setCompareSortKey(key);
      setCompareSortDir(key === 'symbol' || key === 'sector' ? 'asc' : 'desc');
    }
  };

  // Export Compare & Contrast Matrix to CSV
  const handleExportComparisonMatrixCsv = () => {
    const universeCols = comparedUniverses.map(u => u.name);
    const headers = [
      'Symbol',
      'Company Name',
      'Sector',
      'CMP (INR)',
      ...universeCols,
      'Overlap Count',
      'Overlap %',
      'Super Convergence',
      'Convergence Score',
      'ROCE %',
      'Float Squeeze Ratio',
      'VPA Stage'
    ];

    const rows = filteredComparisonData.map(r => [
      r.symbol,
      r.companyName,
      r.sector,
      r.cmp,
      ...comparedUniverses.map(u => (r.universePresence[u.id] ? 'INCLUDED' : 'EXCLUDED')),
      `${r.overlapCount} of ${comparedUniverses.length}`,
      `${r.overlapPct}%`,
      r.isSuperConvergence ? 'SUPER_CONVERGENCE' : 'PARTIAL',
      r.convergenceScore,
      r.rocePct,
      r.floatSqueezeRatio,
      r.vpaStage
    ]);

    downloadCsv('sub_universes_side_by_side_comparison', headers, rows);
  };

  // All 7 available filter modalities
  const ALL_MODALITIES: { id: PipelineStageId; label: string; icon: any; color: string; desc: string }[] = [
    {
      id: 'SUNRISE_INDUSTRIAL',
      label: 'Sunrise & Conglomerates',
      icon: Building2,
      color: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
      desc: '20–30+ yr conglomerate backing & Govt PLI tailwinds'
    },
    {
      id: 'SECTOR_ROTATION',
      label: 'Sector Rotation Alpha',
      icon: Globe,
      color: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10',
      desc: 'Outperforming sectors with positive relative strength'
    },
    {
      id: 'SMART_MONEY',
      label: 'Smart Money Squeeze',
      icon: Zap,
      color: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',
      desc: 'Institutional float squeeze & block volume accumulation'
    },
    {
      id: 'FUNDAMENTALS',
      label: 'QGLP Fundamentals',
      icon: Shield,
      color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
      desc: 'ROCE >= 20%, low gearing, high sales & EBITDA growth'
    },
    {
      id: 'TECH_STRATEGY_1',
      label: 'Strategy 1: VPA Compaction',
      icon: Activity,
      color: 'text-teal-400 border-teal-500/40 bg-teal-500/10',
      desc: '+20% impulse, 15–25b base, ATR ratio < 0.70, vol drying'
    },
    {
      id: 'TECH_STRATEGY_2',
      label: 'Strategy 2: FVG / CE Pullback',
      icon: TrendingUp,
      color: 'text-sky-400 border-sky-500/40 bg-sky-500/10',
      desc: 'Day turnover > ₹2 Cr, FVG 50% Consequent Encroachment entry'
    },
    {
      id: 'TECH_STRATEGY_3',
      label: 'Strategy 3: HH / HL Waves',
      icon: Flame,
      color: 'text-pink-400 border-pink-500/40 bg-pink-500/10',
      desc: 'Higher High & Higher Low wave compaction with institutional alert'
    }
  ];

  return (
    <div className="space-y-6 rounded-3xl bg-slate-900/90 border border-slate-800 p-5 sm:p-7 shadow-2xl font-sans text-slate-100 animate-in fade-in">
      {/* ── TOP PRIMARY VIEW SWITCHER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-500/10">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2">
              Multi-Dimensional Sub-Universe Pipeline &amp; Comparator
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase font-bold">
                Dynamic Sequencer
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Select one, some, or all filter modalities in any custom sequence to generate tailored sub-universes, then compare and contrast outcomes side-by-side.
            </p>
          </div>
        </div>

        {/* View Switcher: Interactive Pipeline vs Compare & Contrast */}
        <div className="flex items-center p-1 rounded-2xl bg-slate-950 border border-slate-800 shrink-0">
          <button
            onClick={() => setPanelView('PIPELINE')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              panelView === 'PIPELINE'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>1. Pipeline Sequencer</span>
          </button>
          <button
            onClick={() => setPanelView('COMPARE_UNIVERSES')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              panelView === 'COMPARE_UNIVERSES'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-purple-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>2. Compare Sub-Universes ({savedSubUniverses.length})</span>
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════
          VIEW 1: INTERACTIVE PIPELINE SEQUENCER & TELEMETRY FUNNEL
      ════════════════════════════════════════════════════════════════════════════ */}
      {panelView === 'PIPELINE' && (
        <div className="space-y-6">
          {/* ── BASELINE & PRESETS BAR ── */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono text-slate-400 uppercase mr-1 flex items-center gap-1">
                <Globe className="w-3 h-3" /> Baseline Universe:
              </span>
              <button
                onClick={() => setUniverseBaseline('ALL_753')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  universeBaseline === 'ALL_753'
                    ? 'bg-slate-800 text-cyan-300 border border-cyan-500/40 shadow'
                    : 'text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <span>Broad Liquid (753 Stocks)</span>
              </button>
              <button
                onClick={() => setUniverseBaseline('SUNRISE_INDUSTRIAL_GROWTH')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  universeBaseline === 'SUNRISE_INDUSTRIAL_GROWTH'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow'
                    : 'text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <Building2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Sunrise &amp; Conglomerates ({sunriseSymbols.size || 15})</span>
              </button>
            </div>

            {/* Quick Combinations */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono text-slate-400 uppercase mr-1">Presets:</span>
              <button
                onClick={() => {
                  setStageOrder(['SECTOR_ROTATION', 'SMART_MONEY', 'FUNDAMENTALS', 'TECHNICAL_VPA']);
                  setActivePreset('COMBINATION_1');
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activePreset === 'COMBINATION_1'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                Comb 1: Fundamental First
              </button>
              <button
                onClick={() => {
                  setStageOrder(['SECTOR_ROTATION', 'SMART_MONEY', 'TECH_STRATEGY_1', 'FUNDAMENTALS']);
                  setActivePreset('COMBINATION_2');
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activePreset === 'COMBINATION_2'
                    ? 'bg-purple-500 text-slate-950'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                Comb 2: Technical First
              </button>
              <button
                onClick={() => {
                  setStageOrder(['SUNRISE_INDUSTRIAL', 'SMART_MONEY', 'FUNDAMENTALS']);
                  setActivePreset('SUNRISE_GROWTH');
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activePreset === 'SUNRISE_GROWTH'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                Conglomerate Growth
              </button>
              <button
                onClick={() => setShowThresholdControls(prev => !prev)}
                className={`p-1.5 rounded-lg border text-xs font-bold transition cursor-pointer ${
                  showThresholdControls
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    : 'bg-slate-900 text-slate-400 hover:text-white border-slate-800'
                }`}
                title="Configure Cutoff Thresholds"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Optional Threshold Tuning Drawer */}
          {showThresholdControls && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-cyan-500/30 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs font-mono animate-in fade-in">
              <div>
                <span className="text-[10px] text-slate-400 block mb-1">Sector RS Alpha Floor</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="-5"
                    max="10"
                    step="0.5"
                    value={thresholds.minSectorAlpha}
                    onChange={e => setThresholds({ ...thresholds, minSectorAlpha: parseFloat(e.target.value) })}
                    className="w-full accent-cyan-400"
                  />
                  <span className="text-cyan-300 font-bold w-12">{thresholds.minSectorAlpha}%</span>
                </div>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block mb-1">Float Squeeze Ratio</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0.2"
                    max="1.5"
                    step="0.05"
                    value={thresholds.minFloatSqueezeRatio}
                    onChange={e => setThresholds({ ...thresholds, minFloatSqueezeRatio: parseFloat(e.target.value) })}
                    className="w-full accent-amber-400"
                  />
                  <span className="text-amber-300 font-bold w-12">{thresholds.minFloatSqueezeRatio}x</span>
                </div>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block mb-1">ROCE Compounding Moat</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="10"
                    max="35"
                    step="1"
                    value={thresholds.minRocePct}
                    onChange={e => setThresholds({ ...thresholds, minRocePct: parseFloat(e.target.value) })}
                    className="w-full accent-emerald-400"
                  />
                  <span className="text-emerald-300 font-bold w-12">{thresholds.minRocePct}%</span>
                </div>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block mb-1">VPA Asymmetry Floor</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="1.0"
                    max="2.0"
                    step="0.05"
                    value={thresholds.minVpaAsymmetry}
                    onChange={e => setThresholds({ ...thresholds, minVpaAsymmetry: parseFloat(e.target.value) })}
                    className="w-full accent-purple-400"
                  />
                  <span className="text-purple-300 font-bold w-12">{thresholds.minVpaAsymmetry}x</span>
                </div>
              </div>
            </div>
          )}

          {/* ── FILTER MODALITY PALETTE (SELECT ONE, SOME, OR ALL) ── */}
          <div className="p-4 sm:p-5 rounded-3xl bg-slate-950 border border-slate-800 space-y-3 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Filter className="w-4 h-4 text-cyan-400" />
                  Filter Modalities Palette
                  <span className="text-[10px] text-slate-400 font-normal">
                    (Click to include/exclude in current pipeline sequence)
                  </span>
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Active Stages: <strong className="text-cyan-300">{stageOrder.length}</strong> / 7 Modalities Selected
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
              {ALL_MODALITIES.map(mod => {
                const Icon = mod.icon;
                const isSelected = stageOrder.includes(mod.id);
                const orderIndex = stageOrder.indexOf(mod.id);

                return (
                  <div
                    key={mod.id}
                    onClick={() => toggleStageInclusion(mod.id)}
                    className={`p-3 rounded-2xl border transition cursor-pointer flex flex-col justify-between space-y-2 ${
                      isSelected
                        ? `${mod.color} shadow-lg shadow-cyan-950/20`
                        : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="font-bold text-xs leading-tight">{mod.label}</span>
                      </div>
                      {isSelected ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-white/20 text-white shrink-0">
                          #{orderIndex + 1}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-600 font-mono uppercase">Inactive</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400/90 leading-snug">{mod.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── ACTIVE SEQUENCING FUNNEL CARDS ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                Active Execution Sequence (Drag or Click Arrows to Re-Order):
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                Input: {baseOpportunities.length} scrips → Survivors: {executionResult.finalOpportunitiesCount} scrips
              </span>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {stageOrder.map((stageId, idx) => {
                const conf = FlexibleTelemetryPipelineService.STAGE_DEFINITIONS[stageId];
                const stepData = executionResult.steps[idx];

                return (
                  <React.Fragment key={stageId}>
                    <div
                      className="p-4 rounded-2xl bg-slate-950 border border-slate-800 min-w-[220px] max-w-[260px] shrink-0 space-y-2 relative"
                      style={{ borderTop: `3px solid ${conf.color}` }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-900 text-slate-300 font-bold">
                          Step #{idx + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => moveStage(idx, 'LEFT')}
                            disabled={idx === 0}
                            className="p-1 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-slate-400 hover:text-white cursor-pointer"
                          >
                            <ArrowLeft className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => moveStage(idx, 'RIGHT')}
                            disabled={idx === stageOrder.length - 1}
                            className="p-1 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-slate-400 hover:text-white cursor-pointer"
                          >
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <h4 className="font-bold text-xs text-white truncate" style={{ color: conf.color }}>
                        {conf.name}
                      </h4>

                      <div className="grid grid-cols-2 gap-1 font-mono text-[11px] pt-1">
                        <div className="p-1.5 rounded bg-slate-900 text-center">
                          <span className="text-[9px] text-slate-500 block">Passed</span>
                          <span className="font-bold text-emerald-400">{stepData?.passedCount ?? '--'}</span>
                        </div>
                        <div className="p-1.5 rounded bg-slate-900 text-center">
                          <span className="text-[9px] text-slate-500 block">Dropped</span>
                          <span className="font-bold text-rose-400">-{stepData?.dropCount ?? '--'}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-900">
                        <span>Survival:</span>
                        <strong className="text-white">{stepData?.cumulativeSurvivalPct ?? '--'}%</strong>
                      </div>
                    </div>

                    {idx < stageOrder.length - 1 && (
                      <ArrowRight className="w-4 h-4 text-slate-600 shrink-0" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* ── CREATE / SAVE SUB-UNIVERSE CONTROLS ── */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-950 border border-indigo-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xl">
            <div className="flex items-center gap-2.5">
              <BookmarkPlus className="w-5 h-5 text-indigo-400 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-white">Save Current Pipeline as a Named Sub-Universe</h4>
                <p className="text-xs text-slate-400">
                  Save this sequence ({stageOrder.length} stages, {executionResult.finalOpportunitiesCount} survivors) to compare and contrast against other sub-universes.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={subUniverseNameInput}
                onChange={e => setSubUniverseNameInput(e.target.value)}
                placeholder="SUB-UNIVERSE NAME (E.G. ALPHA 1)..."
                className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500 w-60"
              />
              <button
                onClick={handleSaveSubUniverse}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-indigo-600/20"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span>Save Sub-Universe</span>
              </button>
            </div>
          </div>

          {saveSuccessNotice && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{saveSuccessNotice}</span>
            </div>
          )}

          {/* ── FINAL QUALIFIED OPPORTUNITIES OUTPUT ── */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  Surviving Recommended Opportunities
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold border border-emerald-500/30">
                    {sortedSurvivors.length} Scrips
                  </span>
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    placeholder="FILTER SURVIVORS..."
                    className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Download CSV Button */}
                <button
                  onClick={handleExportCsv}
                  disabled={sortedSurvivors.length === 0}
                  className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 hover:border-emerald-500/50 hover:bg-slate-800 disabled:opacity-40 text-emerald-400 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                  title="Download surviving opportunities to CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>

                <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800">
                  <button
                    onClick={() => setViewMode('TABLE')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                      viewMode === 'TABLE' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Table
                  </button>
                  <button
                    onClick={() => setViewMode('CARDS')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                      viewMode === 'CARDS' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Cards
                  </button>
                </div>
              </div>
            </div>

            {/* Empty State */}
            {sortedSurvivors.length === 0 && (
              <div className="p-12 text-center rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <Shield className="w-8 h-8 mx-auto text-slate-600" />
                <p className="text-sm font-bold text-slate-300">No scrips survived all selected sequential gates</p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Try relaxing gate thresholds or toggling fewer filter stages using the palette above.
                </p>
              </div>
            )}

            {/* Table View */}
            {viewMode === 'TABLE' && sortedSurvivors.length > 0 && (
              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 text-[10px] uppercase">
                    <tr>
                      <th
                        onClick={() => handleSort('symbol')}
                        className="py-2.5 px-3 cursor-pointer select-none hover:text-white transition"
                      >
                        <div className="flex items-center gap-1">
                          <span>Symbol</span>
                          {sortKey === 'symbol' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('sector')}
                        className="py-2.5 px-3 cursor-pointer select-none hover:text-white transition"
                      >
                        <div className="flex items-center gap-1">
                          <span>Sector</span>
                          {sortKey === 'sector' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('currentPrice')}
                        className="py-2.5 px-3 text-right cursor-pointer select-none hover:text-white transition"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>CMP (₹)</span>
                          {sortKey === 'currentPrice' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('convergenceScore')}
                        className="py-2.5 px-3 text-right cursor-pointer select-none hover:text-white transition"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Convergence</span>
                          {sortKey === 'convergenceScore' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('rocePct')}
                        className="py-2.5 px-3 text-right cursor-pointer select-none hover:text-white transition"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>ROCE %</span>
                          {sortKey === 'rocePct' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('floatSqueezeRatio')}
                        className="py-2.5 px-3 text-right cursor-pointer select-none hover:text-white transition"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Float Squeeze</span>
                          {sortKey === 'floatSqueezeRatio' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('vpaStage')}
                        className="py-2.5 px-3 text-right cursor-pointer select-none hover:text-white transition"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>VPA Stage</span>
                          {sortKey === 'vpaStage' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('tranche1Price')}
                        className="py-2.5 px-3 text-right cursor-pointer select-none hover:text-white transition"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Tranche 1 (₹)</span>
                          {sortKey === 'tranche1Price' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                        </div>
                      </th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {sortedSurvivors.map(opp => (
                      <tr
                        key={opp.symbol}
                        onClick={() => {
                          onSelectScrip?.(opp);
                          onOpenDossier?.(opp.symbol);
                        }}
                        className="hover:bg-slate-900/60 transition cursor-pointer group"
                      >
                        <td className="py-2.5 px-3 font-bold text-white flex items-center gap-1.5">
                          <span className="text-cyan-400 group-hover:underline">{opp.symbol}</span>
                          <span className="text-[10px] text-slate-500 font-sans font-normal truncate max-w-[120px]">
                            {opp.companyName}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 font-sans">{opp.sector}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-100">
                          ₹{opp.currentPrice?.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span
                            className={`px-2 py-0.5 rounded font-black text-xs ${
                              opp.convergenceScore >= 80
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-cyan-500/20 text-cyan-300'
                            }`}
                          >
                            {opp.convergenceScore}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-emerald-400">
                          {opp.rocePct ? `${opp.rocePct}%` : '--'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-amber-400 font-semibold">
                          {opp.floatSqueezeRatio ? `${opp.floatSqueezeRatio}x` : '--'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-[11px] text-purple-300 font-mono">
                          {opp.vpaStage}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-300 font-mono">
                          ₹{opp.tranches?.tranche1Price || '--'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onOpenDossier?.(opp.symbol);
                            }}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-cyan-300 transition"
                          >
                            Dossier
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Cards View */}
            {viewMode === 'CARDS' && sortedSurvivors.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedSurvivors.map(opp => (
                  <div
                    key={opp.symbol}
                    onClick={() => {
                      onSelectScrip?.(opp);
                      onOpenDossier?.(opp.symbol);
                    }}
                    className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-cyan-500/40 transition shadow-lg space-y-3 cursor-pointer group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-base font-black text-white font-mono group-hover:text-cyan-400 transition">
                          {opp.symbol}
                        </h4>
                        <span className="text-xs text-slate-400 font-sans block truncate max-w-[180px]">
                          {opp.companyName}
                        </span>
                      </div>
                      <div className="text-right font-mono">
                        <span className="text-base font-black text-white block">
                          ₹{opp.currentPrice?.toLocaleString('en-IN')}
                        </span>
                        <span className="text-[10px] text-slate-500">{opp.sector}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-[9px] text-slate-500 block">Convergence</span>
                        <span className="font-bold text-emerald-400">{opp.convergenceScore}</span>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-[9px] text-slate-500 block">ROCE</span>
                        <span className="font-bold text-cyan-300">{opp.rocePct}%</span>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-[9px] text-slate-500 block">Squeeze</span>
                        <span className="font-bold text-amber-300">{opp.floatSqueezeRatio}x</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono pt-1 text-slate-400 border-t border-slate-900">
                      <span>VPA: <strong className="text-purple-300">{opp.vpaStage}</strong></span>
                      <span className="text-cyan-400 text-[10px] group-hover:underline">Open 360° Dossier →</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════
          VIEW 2: COMPARE & CONTRAST DIFFERENT SUB-UNIVERSES SIDE-BY-SIDE MATRIX
      ════════════════════════════════════════════════════════════════════════════ */}
      {panelView === 'COMPARE_UNIVERSES' && (
        <div className="space-y-5 animate-in fade-in">
          {/* Sub-Universes Selection Strip */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-bold text-white">
                  Select Sub-Universes to Compare &amp; Contrast Side-by-Side:
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Comparing {comparedUniverses.length} of {savedSubUniverses.length} Sub-Universes
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
              {savedSubUniverses.map(univ => {
                const isChecked = selectedUniverseIdsToCompare.includes(univ.id);

                return (
                  <div
                    key={univ.id}
                    onClick={() => {
                      if (isChecked) {
                        if (selectedUniverseIdsToCompare.length <= 1) return;
                        setSelectedUniverseIdsToCompare(prev => prev.filter(uid => uid !== univ.id));
                      } else {
                        setSelectedUniverseIdsToCompare(prev => [...prev, univ.id]);
                      }
                    }}
                    className={`p-3 rounded-2xl border transition cursor-pointer flex flex-col justify-between space-y-2 ${
                      isChecked
                        ? 'bg-purple-950/40 border-purple-500/60 shadow-lg shadow-purple-950/20'
                        : 'bg-slate-900/50 border-slate-800 text-slate-500 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-purple-400 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-600 shrink-0" />
                        )}
                        <span className="font-bold text-xs text-white leading-tight">{univ.name}</span>
                      </div>
                      {univ.isCustom && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleDeleteSubUniverse(univ.id);
                          }}
                          className="text-slate-500 hover:text-rose-400 p-1 transition"
                          title="Delete Custom Sub-Universe"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between font-mono text-[10px] text-slate-400 pt-1 border-t border-slate-900">
                      <span>{univ.opportunities.length} Scrips</span>
                      <span>{univ.stageOrder.length} Stages</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Comparative Summary Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 uppercase block">Total Scrips in Comparison</span>
              <span className="text-xl font-black text-white font-mono">{filteredComparisonData.length}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Union across selected universes</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-500/30">
              <span className="text-[10px] font-mono text-emerald-400 uppercase block font-bold flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-400" /> Core Super-Overlap
              </span>
              <span className="text-xl font-black text-emerald-300 font-mono">
                {filteredComparisonData.filter(r => r.isSuperConvergence).length}
              </span>
              <span className="text-[10px] text-emerald-500 block mt-0.5">Survived ALL selected universes</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 uppercase block">Average ROCE</span>
              <span className="text-xl font-black text-cyan-300 font-mono">
                {filteredComparisonData.length > 0
                  ? (
                      filteredComparisonData.reduce((acc, r) => acc + (r.rocePct || 0), 0) /
                      filteredComparisonData.length
                    ).toFixed(1)
                  : '--'}
                %
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Capital efficiency</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 uppercase block">Average Float Squeeze</span>
              <span className="text-xl font-black text-amber-300 font-mono">
                {filteredComparisonData.length > 0
                  ? (
                      filteredComparisonData.reduce((acc, r) => acc + (r.floatSqueezeRatio || 0), 0) /
                      filteredComparisonData.length
                    ).toFixed(2)
                  : '--'}
                x
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Institutional lock</span>
            </div>
          </div>

          {/* Search & Export Toolbar */}
          <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={compareSearch}
                onChange={e => setCompareSearch(e.target.value)}
                placeholder="SEARCH COMPARISON BY SCRIP, COMPANY, OR SECTOR..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-purple-500"
              />
            </div>

            <button
              onClick={handleExportComparisonMatrixCsv}
              disabled={filteredComparisonData.length === 0}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-purple-600/20 shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Comparison Matrix CSV</span>
            </button>
          </div>

          {/* ── SIDE-BY-SIDE COMPARE & CONTRAST MATRIX TABLE ── */}
          <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 text-[10px] uppercase">
                <tr>
                  <th
                    onClick={() => handleCompareSort('symbol')}
                    className="py-3 px-3 cursor-pointer select-none hover:text-white transition"
                  >
                    <div className="flex items-center gap-1">
                      <span>Scrip</span>
                      {compareSortKey === 'symbol' ? (compareSortDir === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                    </div>
                  </th>
                  <th
                    onClick={() => handleCompareSort('sector')}
                    className="py-3 px-3 cursor-pointer select-none hover:text-white transition"
                  >
                    <div className="flex items-center gap-1">
                      <span>Sector</span>
                      {compareSortKey === 'sector' ? (compareSortDir === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                    </div>
                  </th>
                  <th
                    onClick={() => handleCompareSort('cmp')}
                    className="py-3 px-3 text-right cursor-pointer select-none hover:text-white transition"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>CMP (₹)</span>
                      {compareSortKey === 'cmp' ? (compareSortDir === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                    </div>
                  </th>

                  {/* Columns for Each Selected Sub-Universe */}
                  {comparedUniverses.map(univ => (
                    <th key={univ.id} className="py-3 px-3 text-center text-slate-300">
                      <div className="max-w-[140px] mx-auto truncate" title={univ.name}>
                        {univ.name}
                      </div>
                    </th>
                  ))}

                  <th
                    onClick={() => handleCompareSort('overlapCount')}
                    className="py-3 px-3 text-center cursor-pointer select-none hover:text-white transition"
                  >
                    <div className="flex items-center justify-center gap-1 text-purple-400">
                      <span>Overlap Tier</span>
                      {compareSortKey === 'overlapCount' ? (compareSortDir === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                    </div>
                  </th>
                  <th
                    onClick={() => handleCompareSort('convergenceScore')}
                    className="py-3 px-3 text-right cursor-pointer select-none hover:text-white transition"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Score</span>
                      {compareSortKey === 'convergenceScore' ? (compareSortDir === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                    </div>
                  </th>
                  <th
                    onClick={() => handleCompareSort('rocePct')}
                    className="py-3 px-3 text-right cursor-pointer select-none hover:text-white transition"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>ROCE %</span>
                      {compareSortKey === 'rocePct' ? (compareSortDir === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                    </div>
                  </th>
                  <th
                    onClick={() => handleCompareSort('floatSqueezeRatio')}
                    className="py-3 px-3 text-right cursor-pointer select-none hover:text-white transition"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Squeeze</span>
                      {compareSortKey === 'floatSqueezeRatio' ? (compareSortDir === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                    </div>
                  </th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredComparisonData.map(row => (
                  <tr key={row.symbol} className="hover:bg-slate-900/60 transition group">
                    <td className="py-3 px-3">
                      <span className="font-bold text-white text-sm block font-mono">{row.symbol}</span>
                      <span className="text-[10px] text-slate-400 font-sans block truncate max-w-[130px]">
                        {row.companyName}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-slate-300 font-sans text-xs">{row.sector}</td>

                    <td className="py-3 px-3 text-right font-bold text-white">
                      ₹{row.cmp.toLocaleString('en-IN')}
                    </td>

                    {/* Checkmark or Dash for each Sub-Universe */}
                    {comparedUniverses.map(univ => (
                      <td key={univ.id} className="py-3 px-3 text-center">
                        {row.universePresence[univ.id] ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" /> INCLUDED
                          </span>
                        ) : (
                          <span className="text-slate-600 font-mono text-sm">—</span>
                        )}
                      </td>
                    ))}

                    {/* Overlap Tier Badge */}
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-xl font-black text-[11px] inline-flex items-center gap-1 ${
                          row.isSuperConvergence
                            ? 'bg-gradient-to-r from-emerald-500 via-cyan-500 to-amber-500 text-slate-950 font-black shadow-md shadow-cyan-500/30'
                            : row.overlapCount > 1
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                            : 'bg-slate-900 text-slate-500 border border-slate-800'
                        }`}
                      >
                        {row.isSuperConvergence && <Sparkles className="w-3 h-3" />}
                        {row.overlapCount} of {comparedUniverses.length} ({row.overlapPct}%)
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right font-bold text-emerald-400">
                      {row.convergenceScore}
                    </td>

                    <td className="py-3 px-3 text-right text-cyan-300 font-semibold">
                      {row.rocePct ? `${row.rocePct}%` : '--'}
                    </td>

                    <td className="py-3 px-3 text-right text-amber-300 font-semibold">
                      {row.floatSqueezeRatio ? `${row.floatSqueezeRatio}x` : '--'}
                    </td>

                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => onOpenDossier?.(row.symbol)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] font-bold transition"
                      >
                        Dossier
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
