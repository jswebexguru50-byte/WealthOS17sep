import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  TrendingUp,
  Download,
  Search,
  ArrowUpDown,
  Filter,
  Shield,
  Sparkles,
  Award,
  Zap,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Info
} from 'lucide-react';
import { SunriseIndustrialScrip } from '../server/services/SunriseIndustrialUniverseService.js';
import { downloadCsv } from '../lib/csvExport.js';

interface SunriseIndustrialUniverseViewProps {
  onSelectSymbol?: (symbol: string) => void;
}

type SortColumn =
  | 'symbol'
  | 'industrialGroupName'
  | 'groupVintageYears'
  | 'verticalName'
  | 'backingModality'
  | 'marketCapTier'
  | 'currentPrice'
  | 'turnoverCagr3yPct'
  | 'ebitdaCagr3yPct'
  | 'freeRetailFloatPct'
  | 'compositeShgScore';

export const SunriseIndustrialUniverseView: React.FC<SunriseIndustrialUniverseViewProps> = ({
  onSelectSymbol
}) => {
  const [scrips, setScrips] = useState<SunriseIndustrialScrip[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [pliSectors, setPliSectors] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedModality, setSelectedModality] = useState<string>('ALL');
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');

  // Sorting
  const [sortCol, setSortCol] = useState<SortColumn>('compositeShgScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/opportunity-engine/sunrise-industrial-universe');
      if (!res.ok) throw new Error(`Server error: ${res.status} ${res.statusText}`);
      const json = await res.json();
      if (json.success && json.data) {
        setScrips(json.data.scrips || []);
        setGroups(json.data.groups || []);
        setPliSectors(json.data.pliSectors || []);
      } else {
        setError(json.error || 'Failed to fetch Sunrise & Industrial universe data');
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir(
        col === 'symbol' || col === 'industrialGroupName' || col === 'verticalName' || col === 'backingModality'
          ? 'asc'
          : 'desc'
      );
    }
  };

  // Filtered & Sorted Scrips
  const filteredScrips = useMemo(() => {
    return scrips.filter(s => {
      if (selectedModality !== 'ALL' && s.backingModality !== selectedModality) return false;
      if (selectedGroup !== 'ALL' && s.industrialGroupId !== selectedGroup) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          (s.symbol?.toLowerCase() ?? '').includes(q) ||
          (s.companyName?.toLowerCase() ?? '').includes(q) ||
          (s.industrialGroupName?.toLowerCase() ?? '').includes(q) ||
          (s.verticalName?.toLowerCase() ?? '').includes(q) ||
          (s.catalystsSummary?.toLowerCase() ?? '').includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [scrips, searchQuery, selectedModality, selectedGroup]);

  const sortedScrips = useMemo(() => {
    const list = [...filteredScrips];
    list.sort((a, b) => {
      let valA: any = a[sortCol];
      let valB: any = b[sortCol];

      if (typeof valA === 'string') {
        return sortDir === 'asc'
          ? valA.localeCompare(String(valB ?? ''))
          : String(valB ?? '').localeCompare(valA);
      }
      return sortDir === 'asc' ? Number(valA || 0) - Number(valB || 0) : Number(valB || 0) - Number(valA || 0);
    });
    return list;
  }, [filteredScrips, sortCol, sortDir]);

  // Export CSV
  const handleExportCsv = () => {
    const headers = [
      'Symbol',
      'Company Name',
      'Industrial Group House',
      'Group Vintage (Years)',
      'PLI Sector / Sunrise Vertical',
      'Modality',
      'Market Cap Category',
      'CMP (INR)',
      '3-Yr Turnover CAGR %',
      '3-Yr EBITDA CAGR %',
      'Free Float %',
      'Composite SHG Score',
      'Eligible For Re-Rating',
      'Re-Rating Potential Rationale'
    ];
    const rows = sortedScrips.map(s => [
      s.symbol,
      s.companyName,
      s.industrialGroupName,
      s.groupVintageYears,
      s.verticalName,
      s.backingModality,
      s.marketCapTier,
      s.currentPrice,
      s.turnoverCagr3yPct,
      s.ebitdaCagr3yPct,
      s.freeRetailFloatPct,
      s.compositeShgScore,
      s.convictionTier === 'TIER_1_TITANIUM' || s.convictionTier === 'TIER_2_GROWTH_RUNNER' ? 'YES' : 'NO',
      s.catalystsSummary
    ]);
    downloadCsv('sunrise_industrial_growth_universe', headers, rows);
  };

  const getModalityBadge = (modality: string) => {
    switch (modality) {
      case 'GROUP_SUBSIDIARY':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            Group Subsidiary
          </span>
        );
      case 'GROUP_TURNAROUND':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            Group Turnaround
          </span>
        );
      case 'GROUP_JV':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
            Group JV
          </span>
        );
      case 'GROUP_ANCHOR':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">
            Group Anchor
          </span>
        );
      case 'GROUP_SPINOFF':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-pink-500/20 text-pink-300 border border-pink-500/30">
            Group Spinoff
          </span>
        );
      case 'INDEPENDENT_VET_PIONEER':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            Veteran Pioneer
          </span>
        );
      default:
        return <span className="text-[10px] text-slate-400 font-mono">{modality}</span>;
    }
  };

  return (
    <div className="space-y-6 text-slate-100 font-sans pb-16 animate-in fade-in">
      {/* ── HEADER BANNER ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-950 to-amber-950/30 border border-slate-800 p-6 sm:p-8 shadow-2xl">
        <div className="relative z-10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  Sunrise &amp; Industrial Conglomerate-Backed Universe
                  <span className="text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    SHG-SIBM Framework
                  </span>
                </h1>
                <p className="text-xs sm:text-sm text-slate-400">
                  Small &amp; Mid-Cap scrips backed by 20–30+ year industrial conglomerates with PLI tailwinds, high EBITDA compounding, and low market float.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCsv}
                disabled={sortedScrips.length === 0}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-600/20 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Universe CSV</span>
              </button>
              <button
                onClick={fetchData}
                disabled={loading}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                title="Refresh Universe Catalog"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Key Framework Pillars Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Curated Scrips</span>
              <span className="text-lg font-black text-amber-300 font-mono">{scrips.length} Equities</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Small &amp; Mid-Cap Eligible</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Conglomerate Houses</span>
              <span className="text-lg font-black text-white font-mono">{groups.length} Houses</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">20–156 Yr Vintage</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">PLI / Sunrise Verticals</span>
              <span className="text-lg font-black text-cyan-300 font-mono">{pliSectors.length} Verticals</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Govt Scheme Tailwinds</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Turnaround Protocol</span>
              <span className="text-lg font-black text-emerald-400 font-mono">Permitted</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Under Group Modality</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── TOOLBAR & FILTERS ── */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="SEARCH BY SCRIP, COMPANY, GROUP, OR SECTOR..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Modality Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase font-mono text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Modality:
          </span>
          <button
            onClick={() => setSelectedModality('ALL')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
              selectedModality === 'ALL'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            All ({scrips.length})
          </button>
          <button
            onClick={() => setSelectedModality('GROUP_SUBSIDIARY')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
              selectedModality === 'GROUP_SUBSIDIARY'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-950 text-emerald-400 hover:text-emerald-300 border border-slate-800'
            }`}
          >
            Subsidiaries
          </button>
          <button
            onClick={() => setSelectedModality('GROUP_TURNAROUND')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
              selectedModality === 'GROUP_TURNAROUND'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-950 text-amber-400 hover:text-amber-300 border border-slate-800'
            }`}
          >
            Turnarounds
          </button>
          <button
            onClick={() => setSelectedModality('INDEPENDENT_VET_PIONEER')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
              selectedModality === 'INDEPENDENT_VET_PIONEER'
                ? 'bg-cyan-500 text-slate-950'
                : 'bg-slate-950 text-cyan-400 hover:text-cyan-300 border border-slate-800'
            }`}
          >
            Vet. Pioneers
          </button>
        </div>
      </div>

      {/* ── ERROR STATE ── */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
          {error}
        </div>
      )}

      {/* ── LOADING STATE ── */}
      {loading && (
        <div className="p-12 text-center rounded-3xl bg-slate-900 border border-slate-800 space-y-3">
          <RefreshCw className="w-8 h-8 mx-auto text-amber-400 animate-spin" />
          <p className="text-sm font-bold text-slate-200">Loading Sunrise &amp; Industrial Conglomerate Scrip Catalog...</p>
        </div>
      )}

      {/* ── MAIN SCRIP TABLE WITH CLICK-TO-SORT ── */}
      {!loading && !error && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-slate-400 font-mono">
              Showing <strong className="text-amber-400 font-bold">{sortedScrips.length}</strong> qualifying scrips in universe
            </span>
            <span className="text-[11px] text-slate-500 font-mono">
              Click any column header to sort (Asc / Desc)
            </span>
          </div>

          <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 text-[10px] uppercase">
                <tr>
                  <th
                    onClick={() => handleSort('symbol')}
                    className="py-3 px-3 cursor-pointer select-none hover:text-white transition"
                  >
                    <div className="flex items-center gap-1">
                      <span>Scrip</span>
                      {sortCol === 'symbol' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('industrialGroupName')}
                    className="py-3 px-3 cursor-pointer select-none hover:text-white transition"
                  >
                    <div className="flex items-center gap-1">
                      <span>Industrial House</span>
                      {sortCol === 'industrialGroupName' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('verticalName')}
                    className="py-3 px-3 cursor-pointer select-none hover:text-white transition"
                  >
                    <div className="flex items-center gap-1">
                      <span>PLI / Sunrise Vertical</span>
                      {sortCol === 'verticalName' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('backingModality')}
                    className="py-3 px-3 cursor-pointer select-none hover:text-white transition"
                  >
                    <div className="flex items-center gap-1">
                      <span>Modality</span>
                      {sortCol === 'backingModality' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('currentPrice')}
                    className="py-3 px-3 text-right cursor-pointer select-none hover:text-white transition"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>CMP (₹)</span>
                      {sortCol === 'currentPrice' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('turnoverCagr3yPct')}
                    className="py-3 px-3 text-right cursor-pointer select-none hover:text-white transition"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>3Y Sales CAGR</span>
                      {sortCol === 'turnoverCagr3yPct' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('ebitdaCagr3yPct')}
                    className="py-3 px-3 text-right cursor-pointer select-none hover:text-white transition"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>3Y EBITDA CAGR</span>
                      {sortCol === 'ebitdaCagr3yPct' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('freeRetailFloatPct')}
                    className="py-3 px-3 text-right cursor-pointer select-none hover:text-white transition"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Float %</span>
                      {sortCol === 'freeRetailFloatPct' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('compositeShgScore')}
                    className="py-3 px-3 text-right cursor-pointer select-none hover:text-white transition"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>SHG Score</span>
                      {sortCol === 'compositeShgScore' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : <ArrowUpDown className="w-3 h-3 text-slate-600" />}
                    </div>
                  </th>
                  <th className="py-3 px-3 text-left">Re-Rating Rationale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sortedScrips.map(scrip => (
                  <tr
                    key={scrip.symbol}
                    onClick={() => onSelectSymbol?.(scrip.symbol)}
                    className="hover:bg-slate-900/60 transition cursor-pointer group"
                  >
                    <td className="py-3 px-3">
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <span className="text-amber-400 group-hover:underline font-mono text-sm">{scrip.symbol}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-normal">
                          {scrip.marketCapTier === 'SMALLCAP' ? 'Small' : 'Mid'}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-sans block truncate max-w-[150px]">
                        {scrip.companyName}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <span className="text-slate-200 font-bold block">{scrip.industrialGroupName}</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        Vintage: {scrip.groupVintageYears} Yrs
                      </span>
                    </td>

                    <td className="py-3 px-3 font-sans">
                      <span className="text-cyan-300 font-semibold block">{scrip.verticalName}</span>
                    </td>

                    <td className="py-3 px-3">
                      {getModalityBadge(scrip.backingModality)}
                    </td>

                    <td className="py-3 px-3 text-right font-bold text-white">
                      ₹{scrip.currentPrice?.toLocaleString('en-IN') ?? '—'}
                    </td>

                    <td className="py-3 px-3 text-right font-bold text-emerald-400">
                      {scrip.turnoverCagr3yPct >= 0 ? '+' : ''}{scrip.turnoverCagr3yPct}%
                    </td>

                    <td className="py-3 px-3 text-right font-bold text-emerald-300">
                      {scrip.ebitdaCagr3yPct >= 0 ? '+' : ''}{scrip.ebitdaCagr3yPct}%
                    </td>

                    <td className="py-3 px-3 text-right font-semibold text-amber-300">
                      {scrip.freeRetailFloatPct}%
                    </td>

                    <td className="py-3 px-3 text-right">
                      <span
                        className={`px-2 py-0.5 rounded font-black text-xs ${
                          scrip.compositeShgScore >= 85
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-200'
                        }`}
                      >
                        {scrip.compositeShgScore}/100
                      </span>
                    </td>

                    <td className="py-3 px-3 font-sans text-[11px] text-slate-300 max-w-xs">
                      <p className="line-clamp-2" title={scrip.catalystsSummary}>
                        {scrip.catalystsSummary}
                      </p>
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
