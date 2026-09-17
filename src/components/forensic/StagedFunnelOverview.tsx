import React, { useState } from 'react';
import {
  Layers,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Filter,
  ShieldCheck,
  Search,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Info,
  Lock,
  Unlock,
} from 'lucide-react';
import { ForensicDossier } from '../../types.js';

interface StagedFunnelOverviewProps {
  dossiers: ForensicDossier[];
  onSelectDossier: (symbol: string) => void;
  p3GateSignedOff: boolean;
  onRefreshFunnel: () => void;
  isLoading: boolean;
}

export const StagedFunnelOverview: React.FC<StagedFunnelOverviewProps> = ({
  dossiers,
  onSelectDossier,
  p3GateSignedOff,
  onRefreshFunnel,
  isLoading,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sectorFilter, setSectorFilter] = useState('ALL');
  const [viabilityFilter, setViabilityFilter] = useState('ALL');

  const filteredDossiers = dossiers.filter((d) => {
    const matchesSearch =
      d.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.sector.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSector = sectorFilter === 'ALL' || d.sector.includes(sectorFilter);
    const matchesViability =
      viabilityFilter === 'ALL' || d.analystRecommendationContext.tradeViability === viabilityFilter;
    return matchesSearch && matchesSector && matchesViability;
  });

  const getViabilityBadge = (rating: string) => {
    switch (rating) {
      case 'STRONG_BUY':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'ACCUMULATE':
        return 'bg-teal-500/15 text-teal-400 border-teal-500/30';
      case 'NEUTRAL':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'REDUCE':
        return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
      case 'AVOID':
        return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-700 text-slate-300 border-slate-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Visual Staged Funnel Banner (§ v2.1 Architecture) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div>
            <h2 className="text-xl font-semibold text-white tracking-tight flex items-center gap-2.5">
              <Layers className="w-5 h-5 text-emerald-400" />
              <span>Three-Tier Institutional Forensic Funnel</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">
              Strict multi-stage pipeline designed to eliminate hallucination and guarantee deterministic auditability.
              Stage 1 wide-net screening feeds promoted symbols into Stage 2 deep extraction, with Stage 3 on-demand guidance audit.
            </p>
          </div>
          <button
            onClick={onRefreshFunnel}
            disabled={isLoading}
            className="self-start md:self-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold tracking-wide transition-colors shadow-sm disabled:opacity-50"
          >
            {isLoading ? 'Recalculating Funnel...' : 'Re-Run Universe Funnel'}
          </button>
        </div>

        {/* Funnel 3-Stage Diagram */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {/* Stage 1 Card */}
          <div className="bg-slate-800/60 border border-slate-700/70 rounded-lg p-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider">
                Stage 1: Universe Gating
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/50">
                Wide Net
              </span>
            </div>
            <p className="text-xs text-slate-300 font-medium mt-2">NER Match Gate & Quantitative Screening</p>
            <ul className="text-[11px] text-slate-400 mt-2 space-y-1">
              <li>• NER entity disambiguation (no namesakes)</li>
              <li>• High-confidence news red flag classification</li>
              <li>• Altman Z, Beneish M & Piotroski initial rank</li>
            </ul>
            <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">§3.4 Promotion Gate:</span>
              <span className="font-mono text-emerald-300 font-semibold">Percentile ≥80 OR Score ≥0.65</span>
            </div>
          </div>

          {/* Stage 2 Card */}
          <div className="bg-slate-800/60 border border-slate-700/70 rounded-lg p-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">
                Stage 2: Deep Synthesis
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/50">
                Promoted Only
              </span>
            </div>
            <p className="text-xs text-slate-300 font-medium mt-2">Deterministic Scoring & Valuation</p>
            <ul className="text-[11px] text-slate-400 mt-2 space-y-1">
              <li>• Catalyst reuse contract (Stage 1 cache ∪ MD&A net-new)</li>
              <li>• 5-Pillar deterministic businessHealth composite (§3.1)</li>
              <li>• 6-Rule auditable tradeViability decision table (§3.2)</li>
              <li>• Tri-Scenario valuation with confidence weighting (§3.3)</li>
            </ul>
            <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">LLM Scope:</span>
              <span className="font-mono text-slate-300">Grounded prose only (no freehand score)</span>
            </div>
          </div>

          {/* Stage 3 Card */}
          <div className="bg-slate-800/60 border border-slate-700/70 rounded-lg p-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-purple-400 uppercase tracking-wider">
                Stage 3: On-Demand
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded border flex items-center gap-1 ${
                  p3GateSignedOff
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50'
                    : 'bg-amber-950/60 text-amber-300 border-amber-800/50'
                }`}
              >
                {p3GateSignedOff ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                <span>{p3GateSignedOff ? 'P3-0 Unlocked' : 'P3-0 Gated'}</span>
              </span>
            </div>
            <p className="text-xs text-slate-300 font-medium mt-2">8-Quarter Walk-The-Talk Audit</p>
            <ul className="text-[11px] text-slate-400 mt-2 space-y-1">
              <li>• Historical guidance vs actual variance & hit-rate</li>
              <li>• Directional bias: conservative vs aggressive</li>
              <li>• Peer concall cross-referencing & common headwinds</li>
            </ul>
            <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Execution Mode:</span>
              <span className="font-mono text-slate-300">On-demand watchlist only (never batch)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Universe Filter & Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {/* Table Controls */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search ticker, company or sector..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <select
              value={viabilityFilter}
              onChange={(e) => setViabilityFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">All Trade Viabilities</option>
              <option value="STRONG_BUY">STRONG_BUY</option>
              <option value="ACCUMULATE">ACCUMULATE</option>
              <option value="NEUTRAL">NEUTRAL</option>
              <option value="REDUCE">REDUCE</option>
              <option value="AVOID">AVOID</option>
            </select>
          </div>
        </div>

        {/* Universe Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/80 text-slate-400 uppercase font-mono text-[10px] tracking-wider border-b border-slate-700">
              <tr>
                <th className="py-3 px-4 font-semibold">Symbol & Company</th>
                <th className="py-3 px-3 font-semibold">Sector</th>
                <th className="py-3 px-3 font-semibold text-right">Price</th>
                <th className="py-3 px-3 font-semibold text-center">Stage 1 Score</th>
                <th className="py-3 px-3 font-semibold text-center">Priority Tier</th>
                <th className="py-3 px-3 font-semibold text-center">Health Composite</th>
                <th className="py-3 px-3 font-semibold text-center">Reward/Risk</th>
                <th className="py-3 px-3 font-semibold text-center">Viability Rating</th>
                <th className="py-3 px-3 font-semibold">Rule Matched (§3.2)</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredDossiers.map((dossier) => {
                const isHighPriority = dossier.priorityTier === 'high';
                const healthComp = dossier.operations.businessHealth.composite;
                const viability = dossier.analystRecommendationContext.tradeViability;
                const basis = dossier.analystRecommendationContext.tradeViabilityBasis;

                return (
                  <tr
                    key={dossier.symbol}
                    className="hover:bg-slate-800/50 transition-colors group cursor-pointer"
                    onClick={() => onSelectDossier(dossier.symbol)}
                  >
                    {/* Symbol & Name */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                        <span>{dossier.symbol}</span>
                        {dossier.stage === 3 && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-900/60 text-purple-300 border border-purple-700/50 font-mono">
                            Stage 3
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[180px]">{dossier.companyName}</div>
                    </td>

                    {/* Sector */}
                    <td className="py-3.5 px-3 text-slate-400 truncate max-w-[150px]">{dossier.sector}</td>

                    {/* Price */}
                    <td className="py-3.5 px-3 text-right font-mono font-medium text-slate-200">
                      ₹{dossier.currentPrice.toLocaleString()}
                    </td>

                    {/* Stage 1 Score */}
                    <td className="py-3.5 px-3 text-center font-mono">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          dossier.stage1CompositeScore >= 0.65
                            ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {dossier.stage1CompositeScore.toFixed(2)}
                      </span>
                    </td>

                    {/* Priority Tier */}
                    <td className="py-3.5 px-3 text-center">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-medium uppercase ${
                          isHighPriority
                            ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-800/50'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {dossier.priorityTier}
                      </span>
                    </td>

                    {/* Business Health Composite */}
                    <td className="py-3.5 px-3 text-center font-mono font-medium">
                      <div className="flex items-center justify-center gap-1">
                        <span
                          className={`${
                            healthComp >= 70
                              ? 'text-emerald-400'
                              : healthComp >= 50
                              ? 'text-cyan-400'
                              : healthComp >= 35
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {healthComp.toFixed(1)}
                        </span>
                        <span className="text-[10px] text-slate-500">/100</span>
                      </div>
                    </td>

                    {/* Reward/Risk */}
                    <td className="py-3.5 px-3 text-center font-mono text-slate-300">
                      {basis.rewardRiskRatio >= 0 ? `${basis.rewardRiskRatio}x` : '—'}
                    </td>

                    {/* Viability Rating */}
                    <td className="py-3.5 px-3 text-center">
                      <span
                        className={`text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full border ${getViabilityBadge(
                          viability
                        )}`}
                      >
                        {viability}
                      </span>
                    </td>

                    {/* Rule Matched (§3.2 Audit) */}
                    <td className="py-3.5 px-3 font-mono text-[11px] text-slate-400">
                      <span className="text-slate-300 underline decoration-slate-600 decoration-dotted cursor-help" title={basis.notes}>
                        {basis.ruleMatched}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectDossier(dossier.symbol);
                        }}
                        className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-medium group-hover:translate-x-0.5 transition-transform"
                      >
                        <span>Inspect</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
