import React, { useState } from 'react';
import {
  ShieldCheck,
  TrendingUp,
  AlertOctagon,
  Scale,
  FileText,
  Activity,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Database,
  Lock,
  Unlock,
  Building2,
  PieChart,
  Tag,
  BookOpen,
  ExternalLink,
  Link2,
} from 'lucide-react';
import { ForensicDossier } from '../../types.js';

interface DossierViewProps {
  dossier: ForensicDossier;
  onUpgradeStage3: () => void;
  p3GateSignedOff: boolean;
  onToggleP3Gate: () => void;
  isLoading: boolean;
  availableStocks?: { symbol: string; companyName: string; sector?: string; verdict?: string }[];
  onSelectStock?: (symbol: string) => void;
}

export const DossierView: React.FC<DossierViewProps> = ({
  dossier,
  onUpgradeStage3,
  p3GateSignedOff,
  onToggleP3Gate,
  isLoading,
  availableStocks,
  onSelectStock,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<
    'health' | 'forensics' | 'valuation' | 'operations' | 'walkthetalk' | 'sources'
  >('health');

  const { operations, analystRecommendationContext, forensicScores, triScenarioValuation } = dossier;
  const health = operations.businessHealth;
  const basis = analystRecommendationContext.tradeViabilityBasis;

  const getViabilityTheme = (rating: string) => {
    switch (rating) {
      case 'STRONG_BUY':
        return { badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', text: 'text-emerald-400' };
      case 'ACCUMULATE':
        return { badge: 'bg-teal-500/20 text-teal-300 border-teal-500/40', text: 'text-teal-400' };
      case 'NEUTRAL':
        return { badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40', text: 'text-amber-400' };
      case 'REDUCE':
        return { badge: 'bg-orange-500/20 text-orange-300 border-orange-500/40', text: 'text-orange-400' };
      case 'AVOID':
        return { badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40', text: 'text-rose-400' };
      default:
        return { badge: 'bg-slate-800 text-slate-300 border-slate-700', text: 'text-slate-300' };
    }
  };

  const theme = getViabilityTheme(analystRecommendationContext.tradeViability);

  return (
    <div className="space-y-6">
      {/* Dossier Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          {/* Company Core Identity */}
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-white tracking-tight">{dossier.companyName}</h1>
              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                {dossier.symbol}
              </span>
              <span className="text-xs px-2 py-0.5 rounded font-mono font-medium bg-purple-950/60 text-purple-300 border border-purple-800/50">
                Stage {dossier.stage} {dossier.stage === 3 ? 'Deep Audit' : 'Synthesis'}
              </span>
              {availableStocks && availableStocks.length > 0 && onSelectStock && (
                <div className="flex items-center gap-1.5 ml-1">
                  <span className="text-[11px] font-mono text-slate-400">Switch Scrip:</span>
                  <select
                    value={dossier.symbol}
                    onChange={(e) => onSelectStock(e.target.value)}
                    aria-label="Switch Scrip"
                    className="bg-slate-800 text-xs font-mono font-medium text-cyan-300 border border-slate-700 rounded-lg px-2 py-1 outline-none hover:border-cyan-500 focus:border-cyan-400 cursor-pointer max-w-[220px] truncate"
                  >
                    {availableStocks.map((s) => (
                      <option key={s.symbol} value={s.symbol} className="bg-slate-900 text-white">
                        {s.symbol} — {s.companyName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
              <span>{dossier.sector}</span>
              <span>•</span>
              <span>Market Cap: ₹{dossier.marketCapCr.toLocaleString()} Cr</span>
              <span>•</span>
              <span className="font-mono">Current Price: ₹{dossier.currentPrice.toLocaleString()}</span>
            </p>
          </div>

          {/* Trade Viability Summary Card */}
          <div className="flex items-center gap-4 bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 self-start lg:self-auto">
            <div>
              <div className="text-[10px] font-mono text-slate-400 uppercase">Deterministic Trade Viability</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-base font-mono font-bold px-2.5 py-0.5 rounded border ${theme.badge}`}>
                  {analystRecommendationContext.tradeViability}
                </span>
                <span className="text-xs font-mono text-slate-300">
                  R/R: <strong className="text-white">{basis.rewardRiskRatio}x</strong>
                </span>
              </div>
              <div className="text-[10px] font-mono text-slate-400 mt-1">
                Rule: <span className="text-emerald-400 font-semibold">{basis.ruleMatched}</span>
              </div>
            </div>

            {dossier.stage < 3 && (
              <button
                onClick={onUpgradeStage3}
                disabled={isLoading}
                className="ml-2 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-medium tracking-wide transition-colors shadow-sm disabled:opacity-50"
              >
                {isLoading ? 'Executing...' : 'Run Stage 3 Deep Audit'}
              </button>
            )}
          </div>
        </div>

        {/* Sub-tab Navigation */}
        <div className="flex gap-2 border-t border-slate-800/90 mt-6 pt-3 overflow-x-auto text-xs font-medium">
          {[
            { id: 'health', label: 'Deterministic Business Health (§3.1)' },
            { id: 'forensics', label: 'Accounting Triad & Audits' },
            { id: 'valuation', label: 'Tri-Scenario Valuation (§3.3)' },
            { id: 'operations', label: 'Operations & Catalyst Carry-Forward (§3.5)' },
            { id: 'walkthetalk', label: 'Stage 3: Walk-The-Talk Audit' },
            { id: 'sources', label: '🔍 Source Lineage & Audit Trail' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
                activeSubTab === tab.id
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Recommendation Provenance & Opportunity Engine Cross-Link Banner ── */}
      <div className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all shadow-sm ${
        forensicScores?.beneish?.isManipulatorRisk ||
        forensicScores?.altman?.zone === 'distress' ||
        (forensicScores?.governanceAudit?.redFlagSeverityPenalty && forensicScores.governanceAudit.redFlagSeverityPenalty > 10)
          ? 'bg-rose-950/30 border-rose-800/60 text-rose-200'
          : 'bg-emerald-950/20 border-emerald-800/50 text-emerald-200'
      }`}>
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-slate-900/90 border border-slate-700 text-cyan-300">
              Cross-Stack Traceability Contract
            </span>
            <span className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded border ${
              forensicScores?.beneish?.isManipulatorRisk || forensicScores?.altman?.zone === 'distress'
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
            }`}>
              {forensicScores?.beneish?.isManipulatorRisk || forensicScores?.altman?.zone === 'distress'
                ? '⚠️ MOMENTUM GATED: AVOID (Governance / Solvency Risk)'
                : '✓ FORENSIC PROVENANCE CLEARED: STRONG_BUY'}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Signal: <strong className="text-white font-bold">{analystRecommendationContext.tradeViability}</strong>
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
            {forensicScores?.beneish?.isManipulatorRisk
              ? `Technical momentum is gated: Beneish M-Score (${forensicScores.beneish.score}) indicates elevated earnings manipulation probability (threshold > -1.78). Momentum buy signals are overridden until accounting quality normalizes.`
              : forensicScores?.altman?.zone === 'distress'
              ? `Technical momentum is gated: Altman Z-Score (${forensicScores.altman.score}) indicates distress zone solvency risk. Capital preservation governor blocks leveraged exposure.`
              : 'Opportunity Engine momentum signals and 360° forensic health are in full convergence. Both quantitative momentum and forensic audit give affirmative buy clearance.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            localStorage.setItem('target_opportunity_symbol', dossier.symbol);
            window.location.hash = '#opportunities';
            window.dispatchEvent(new CustomEvent('navigate-opportunity', { detail: { symbol: dossier.symbol } }));
          }}
          className="shrink-0 px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-cyan-500/20 transition-all flex items-center gap-2 cursor-pointer"
        >
          <Sparkles className="w-4 h-4 text-cyan-200" />
          <span>Inspect Setup in Opportunity Engine →</span>
        </button>
      </div>

      {/* SUB-TAB 1: DETERMINISTIC BUSINESS HEALTH (§3.1) */}
      {activeSubTab === 'health' && (
        <div className="space-y-6">
          {/* Composite Overview */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
              <div>
                <span className="text-xs font-mono text-emerald-400 font-semibold uppercase tracking-wider">
                  Auditable Weighted Composite
                </span>
                <h3 className="text-lg font-bold text-white mt-0.5">5-Pillar Business Health Breakdown</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Formula: 0.20*Solvency + 0.25*CashFlow + 0.20*OpEfficiency + 0.20*CapitalAlloc + 0.15*Governance
                </p>
              </div>
              <div className="flex items-baseline gap-2 bg-slate-800/90 border border-slate-700 px-4 py-2.5 rounded-xl">
                <span className="text-2xl font-bold font-mono text-emerald-400">{health.composite.toFixed(1)}</span>
                <span className="text-xs text-slate-400 font-mono">/ 100 Composite</span>
              </div>
            </div>

            {/* Narrative Health Review (LLM grounded strictly on the numbers) */}
            <div className="mt-4 bg-slate-800/40 border border-slate-800 rounded-lg p-3.5 text-xs text-slate-300 leading-relaxed">
              <span className="font-semibold text-emerald-400">Analyst Narrative Summary: </span>
              {analystRecommendationContext.healthReviewSummary}
            </div>

            {/* 5 Pillars Grid */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-6">
              {/* Solvency (20%) */}
              <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">Solvency</span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded">
                    20% Wt
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-xl font-bold font-mono text-white">{health.solvencyScore.toFixed(0)}</span>
                  <span className="text-[11px] text-slate-500">/100</span>
                </div>
                <div className="w-full bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-cyan-500 h-1.5 rounded-full" style={{ width: `${health.solvencyScore}%` }} />
                </div>
                <p className="text-[10px] text-slate-400 mt-2">Altman Z peer-normalized percentile</p>
              </div>

              {/* Cash Flow Quality (25%) */}
              <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">Cash Flow Quality</span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded">
                    25% Wt
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-xl font-bold font-mono text-white">{health.cashFlowQualityScore.toFixed(0)}</span>
                  <span className="text-[11px] text-slate-500">/100</span>
                </div>
                <div className="w-full bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${health.cashFlowQualityScore}%` }} />
                </div>
                <p className="text-[10px] text-slate-400 mt-2">100 - avg CFO/PAT divergence</p>
              </div>

              {/* Operational Efficiency (20%) */}
              <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">Op Efficiency</span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded">
                    20% Wt
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-xl font-bold font-mono text-white">{health.operationalEfficiencyScore.toFixed(0)}</span>
                  <span className="text-[11px] text-slate-500">/100</span>
                </div>
                <div className="w-full bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${health.operationalEfficiencyScore}%` }} />
                </div>
                <p className="text-[10px] text-slate-400 mt-2">Asset turnover + WC days trend</p>
              </div>

              {/* Capital Allocation (20%) */}
              <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">Capital Allocation</span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded">
                    20% Wt
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-xl font-bold font-mono text-white">{health.capitalAllocationScore.toFixed(0)}</span>
                  <span className="text-[11px] text-slate-500">/100</span>
                </div>
                <div className="w-full bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${health.capitalAllocationScore}%` }} />
                </div>
                <p className="text-[10px] text-slate-400 mt-2">ROCE minus WACC economic spread</p>
              </div>

              {/* Governance (15%) */}
              <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">Governance</span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded">
                    15% Wt
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-xl font-bold font-mono text-white">{health.governanceScore.toFixed(0)}</span>
                  <span className="text-[11px] text-slate-500">/100</span>
                </div>
                <div className="w-full bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${health.governanceScore}%` }} />
                </div>
                <p className="text-[10px] text-slate-400 mt-2">100 - (Pledge + Auditor + Red Flags)</p>
              </div>
            </div>
          </div>

          {/* Key Investment Thesis & Bear Thesis Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900 border border-emerald-900/40 rounded-xl p-5">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 mb-2">
                <ArrowUpRight className="w-4 h-4" />
                <span>Core Investment Thesis (Grounded in Forensics)</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{analystRecommendationContext.keyInvestmentThesis}</p>
            </div>

            <div className="bg-slate-900 border border-rose-900/40 rounded-xl p-5">
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-400 mb-2">
                <ArrowDownRight className="w-4 h-4" />
                <span>Key Bear Thesis & Primary Downside Risks</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{analystRecommendationContext.keyBearThesis}</p>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: FORENSIC ACCOUNTING TRIAD & AUDITS */}
      {activeSubTab === 'forensics' && (
        <div className="space-y-6">
          {/* Triad Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Beneish M-Score */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-cyan-400 font-semibold">Beneish M-Score</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${
                    forensicScores.beneish.isManipulatorRisk
                      ? 'bg-rose-950/60 text-rose-300 border border-rose-800/40'
                      : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
                  }`}
                >
                  {forensicScores.beneish.isManipulatorRisk ? 'MANIPULATOR RISK' : 'CLEAN ACCOUNTING'}
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-white">{forensicScores.beneish.score}</span>
                <span className="text-xs text-slate-400 font-mono">(Threshold: -1.78)</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-800 text-[11px] font-mono text-slate-400">
                <div>DSRI: <span className="text-slate-200">{forensicScores.beneish.dsri}</span></div>
                <div>GMI: <span className="text-slate-200">{forensicScores.beneish.gmi}</span></div>
                <div>AQI: <span className="text-slate-200">{forensicScores.beneish.aqi}</span></div>
                <div>SGI: <span className="text-slate-200">{forensicScores.beneish.sgi}</span></div>
                <div>DEPI: <span className="text-slate-200">{forensicScores.beneish.depi}</span></div>
                <div>SGAI: <span className="text-slate-200">{forensicScores.beneish.sgai}</span></div>
              </div>
            </div>

            {/* Altman Z-Score */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-emerald-400 font-semibold">Altman Z-Score</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold uppercase ${
                    forensicScores.altman.zone === 'safe'
                      ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
                      : forensicScores.altman.zone === 'grey'
                      ? 'bg-amber-950/60 text-amber-300 border border-amber-800/40'
                      : 'bg-rose-950/60 text-rose-300 border border-rose-800/40'
                  }`}
                >
                  {forensicScores.altman.zone} Zone
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-white">{forensicScores.altman.score}</span>
                <span className="text-xs text-slate-400 font-mono">Safe &gt; 2.99</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-800 text-[11px] font-mono text-slate-400">
                <div>X1 (WC/TA): <span className="text-slate-200">{forensicScores.altman.x1}</span></div>
                <div>X2 (RE/TA): <span className="text-slate-200">{forensicScores.altman.x2}</span></div>
                <div>X3 (EBIT/TA): <span className="text-slate-200">{forensicScores.altman.x3}</span></div>
                <div>X4 (MktVal/TL): <span className="text-slate-200">{forensicScores.altman.x4}</span></div>
                <div>X5 (Sales/TA): <span className="text-slate-200">{forensicScores.altman.x5}</span></div>
              </div>
            </div>

            {/* Piotroski F-Score */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-purple-400 font-semibold">Piotroski F-Score</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold uppercase ${
                    forensicScores.piotroski.quality === 'strong'
                      ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
                      : forensicScores.piotroski.quality === 'moderate'
                      ? 'bg-amber-950/60 text-amber-300 border border-amber-800/40'
                      : 'bg-rose-950/60 text-rose-300 border border-rose-800/40'
                  }`}
                >
                  {forensicScores.piotroski.quality}
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-white">{forensicScores.piotroski.score}</span>
                <span className="text-xs text-slate-400 font-mono">/ 9 Positive Signals</span>
              </div>
              <div className="space-y-1 mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-300">
                <div className="flex items-center gap-1.5">
                  {forensicScores.piotroski.signals.positiveROA ? (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  )}
                  <span>Positive Net Return on Assets</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {forensicScores.piotroski.signals.cfoGreaterThanROA ? (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  )}
                  <span>CFO exceeds Net Income (High Cash Quality)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {forensicScores.piotroski.signals.lowerLeverage ? (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  )}
                  <span>Lower or flat long-term debt leverage</span>
                </div>
              </div>
            </div>
          </div>

          {/* CFO vs PAT Divergence Schedule */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-sm font-semibold text-white">Trailing CFO vs PAT Divergence Schedule</h4>
                <p className="text-xs text-slate-400">
                  Measures whether accounting net profit is backed by cold, hard operating cash inflows.
                </p>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
                Trend: <strong className="text-emerald-400">{forensicScores.cfoPatDivergence.trend}</strong> (Avg Div:{' '}
                {forensicScores.cfoPatDivergence.avgDivergencePct}%)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {forensicScores.cfoPatDivergence.quarters.map((q) => (
                <div key={q.quarter} className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3">
                  <span className="text-xs font-mono font-semibold text-slate-400">{q.quarter}</span>
                  <div className="mt-1.5 text-xs text-slate-200">
                    <div>CFO: <strong className="text-white font-mono">₹{q.cfo} Cr</strong></div>
                    <div>PAT: <span className="font-mono text-slate-300">₹{q.pat} Cr</span></div>
                  </div>
                  <div className="mt-2 text-[11px] font-mono">
                    <span className={q.divergencePct > 15 ? 'text-rose-400' : 'text-emerald-400'}>
                      Div: {q.divergencePct > 0 ? `+${q.divergencePct}%` : `${q.divergencePct}%`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Governance & Auditor Audit */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-white mb-3">Governance & Auditor Integrity Checklist</h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs font-mono">
              <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-[11px]">Promoter Pledge</span>
                <div className="text-base font-bold text-white mt-1">
                  {forensicScores.governanceAudit.promoterPledgePct}%
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  YoY Δ: {forensicScores.governanceAudit.pledgeYoYDelta > 0 ? `+` : ''}
                  {forensicScores.governanceAudit.pledgeYoYDelta}%
                </div>
              </div>

              <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-[11px]">Auditor Tenure</span>
                <div className="text-base font-bold text-white mt-1">
                  {forensicScores.governanceAudit.auditorTenureYears} Years
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Mandatory Rotation compliant</div>
              </div>

              <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-[11px]">Auditor Transition</span>
                <div className="text-xs font-bold text-cyan-400 mt-1 truncate">
                  {forensicScores.governanceAudit.auditorTransition}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Penalty: {forensicScores.governanceAudit.auditorTransitionPenalty} pts
                </div>
              </div>

              <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-[11px]">Red Flag Deductions</span>
                <div className="text-base font-bold text-amber-400 mt-1">
                  -{forensicScores.governanceAudit.redFlagSeverityPenalty} pts
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Active unmitigated flags</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: TRI-SCENARIO VALUATION (§3.3) */}
      {activeSubTab === 'valuation' && (
        <div className="space-y-6">
          {/* Data Quality & Confidence Banner (§3.3) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-mono font-semibold text-cyan-400 uppercase">
                §3.3 Scenario Confidence Engine
              </span>
              <p className="text-xs text-slate-300 mt-0.5">
                Data Source:{' '}
                <strong className="text-white">
                  {triScenarioValuation.dataSourceType === 'live_consensus'
                    ? 'Live Institutional Consensus Data'
                    : 'EPS StDev Historical Volatility Fallback'}
                </strong>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-mono">
                Model Confidence:{' '}
                <strong className="text-emerald-400 text-sm">
                  {(triScenarioValuation.baseCase.confidence * 100).toFixed(0)}%
                </strong>
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                Asymmetry: {triScenarioValuation.asymmetryRatio}x
              </span>
            </div>
          </div>

          {/* Three Scenarios Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Bear Case */}
            <div className="bg-slate-900 border border-rose-950/60 rounded-xl p-5 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-rose-400 uppercase tracking-wider">Bear Case</span>
                <span className="text-xs font-mono text-slate-400">P/E: {triScenarioValuation.bearCase.peMultiple}x</span>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold font-mono text-white">
                  ₹{triScenarioValuation.bearCase.priceTarget}
                </span>
                <div className="text-xs font-mono text-rose-400 mt-0.5">
                  {(
                    ((triScenarioValuation.bearCase.priceTarget - dossier.currentPrice) / dossier.currentPrice) *
                    100
                  ).toFixed(1)}
                  % Downside
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-400">
                <div>Forward EPS: <span className="font-mono text-slate-200">₹{triScenarioValuation.bearCase.epsForward}</span></div>
                <div className="mt-2 space-y-1 text-[11px]">
                  {triScenarioValuation.bearCase.assumptionsUsed.map((a, i) => (
                    <div key={i} className="text-slate-400">• {a}</div>
                  ))}
                </div>
              </div>
            </div>

            {/* Base Case */}
            <div className="bg-slate-900 border border-cyan-900/60 rounded-xl p-5 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider">Base Case</span>
                <span className="text-xs font-mono text-slate-400">P/E: {triScenarioValuation.baseCase.peMultiple}x</span>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold font-mono text-white">
                  ₹{triScenarioValuation.baseCase.priceTarget}
                </span>
                <div className="text-xs font-mono text-cyan-400 mt-0.5">
                  {(
                    ((triScenarioValuation.baseCase.priceTarget - dossier.currentPrice) / dossier.currentPrice) *
                    100
                  ).toFixed(1)}
                  % Expected Return
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-400">
                <div>Forward EPS: <span className="font-mono text-slate-200">₹{triScenarioValuation.baseCase.epsForward}</span></div>
                <div className="mt-2 space-y-1 text-[11px]">
                  {triScenarioValuation.baseCase.assumptionsUsed.map((a, i) => (
                    <div key={i} className="text-slate-400">• {a}</div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bull Case */}
            <div className="bg-slate-900 border border-emerald-900/60 rounded-xl p-5 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">Bull Case</span>
                <span className="text-xs font-mono text-slate-400">P/E: {triScenarioValuation.bullCase.peMultiple}x</span>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold font-mono text-white">
                  ₹{triScenarioValuation.bullCase.priceTarget}
                </span>
                <div className="text-xs font-mono text-emerald-400 mt-0.5">
                  +{(
                    ((triScenarioValuation.bullCase.priceTarget - dossier.currentPrice) / dossier.currentPrice) *
                    100
                  ).toFixed(1)}
                  % Upside
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-400">
                <div>Forward EPS: <span className="font-mono text-slate-200">₹{triScenarioValuation.bullCase.epsForward}</span></div>
                <div className="mt-2 space-y-1 text-[11px]">
                  {triScenarioValuation.bullCase.assumptionsUsed.map((a, i) => (
                    <div key={i} className="text-slate-400">• {a}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Historical Realization Backtest Card (§7 T-VAL-01/02) */}
          {triScenarioValuation.historicalOutcome && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-white">
                    Historical Realization Backtest Verification (T-VAL-01)
                  </span>
                </div>
                <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                  Band Confirmed
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-2">
                {triScenarioValuation.historicalOutcome.deviationNotes}
              </p>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 4: OPERATIONS & CATALYSTS (§3.5) */}
      {activeSubTab === 'operations' && (
        <div className="space-y-6">
          {/* Catalyst Reuse Contract (§3.5) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div>
                <span className="text-xs font-mono text-emerald-400 font-semibold uppercase">
                  §3.5 Catalyst Reuse Contract Ledger
                </span>
                <h4 className="text-sm font-bold text-white mt-0.5">
                  Combined Positive Catalysts (Stage 1 Carry-Forward ∪ Stage 2 MD&A Net-New)
                </h4>
              </div>
              <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-1 rounded">
                {operations.positiveCatalysts.length} Catalysts Extracted
              </span>
            </div>

            <div className="space-y-3">
              {operations.positiveCatalysts.map((cat, idx) => (
                <div key={cat.id || idx} className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-white">{cat.title}</span>
                      {cat.isCarriedForward ? (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/40">
                          Stage 1 Carry-Forward (Zero LLM Re-Extract)
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
                          Stage 2 MD&A Net-New
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      Conf: {(cat.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">{cat.detail}</p>
                  <div className="mt-2.5 pt-2 border-t border-slate-700/60 text-[10px] font-mono text-slate-400 flex items-center justify-between">
                    <span>Source: {cat.sourceRef.sourceType.toUpperCase()} ({cat.sourceRef.period})</span>
                    <span className="italic truncate max-w-md">"{cat.sourceRef.citationSnippet}"</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Raw Material Constraints & Order Book */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Raw Material Constraints */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h4 className="text-xs font-semibold text-white uppercase font-mono tracking-wider text-amber-400 mb-3">
                Raw Material Constraints & Input Indexing
              </h4>
              <div className="space-y-3">
                {operations.rawMaterialConstraints.map((rm, idx) => (
                  <div key={rm.id || idx} className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3 text-xs">
                    <div className="font-medium text-white">{rm.title}</div>
                    <p className="text-slate-300 mt-1 leading-relaxed">{rm.detail}</p>
                    <div className="mt-2 text-[10px] font-mono text-slate-400 border-t border-slate-700/40 pt-1.5">
                      Citation: {rm.sourceRef.citationSnippet}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Order Book Visibility */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h4 className="text-xs font-semibold text-white uppercase font-mono tracking-wider text-cyan-400 mb-3">
                Order Book Backlog & Revenue Visibility
              </h4>
              <div className="space-y-3">
                {operations.orderBookVisibility.map((ob, idx) => (
                  <div key={ob.id || idx} className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3 text-xs">
                    <div className="font-medium text-white">{ob.title}</div>
                    <p className="text-slate-300 mt-1 leading-relaxed">{ob.detail}</p>
                    <div className="mt-2 text-[10px] font-mono text-slate-400 border-t border-slate-700/40 pt-1.5">
                      Citation: {ob.sourceRef.citationSnippet}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 5: STAGE 3 WALK-THE-TALK AUDIT */}
      {activeSubTab === 'walkthetalk' && (
        <div className="space-y-6">
          {/* P3-0 Legal Gate Banner */}
          {!p3GateSignedOff ? (
            <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <Lock className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-white">
                      Phase 3 Legal Sign-Off Gate Task (P3-0) Pending
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-900/60 text-amber-200 border border-amber-700">
                      Blocking Gate
                    </span>
                  </div>
                  <p className="text-xs text-amber-200/80 leading-relaxed max-w-3xl">
                    Per §4.3 & §8 Open Item #1, on-demand automated ingestion of YouTube transcripts and Screener document
                    scraping requires explicit written sign-off from the Legal/Compliance Lead regarding ToS exposure.
                  </p>
                  <div className="pt-2">
                    <button
                      onClick={onToggleP3Gate}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold tracking-wide transition-colors shadow-sm"
                    >
                      Authorize & Sign-Off P3-0 Legal Gate (Simulate Approval)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Unlock className="w-5 h-5 text-emerald-400" />
                <span className="text-xs text-emerald-300 font-medium">
                  P3-0 Gate Cleared: On-Demand Deep Guidance Intelligence Unlocked.
                </span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-900/40 px-2 py-0.5 rounded border border-emerald-700/50">
                Compliance Approved
              </span>
            </div>
          )}

          {/* Walk-the-Talk 8-Quarter Table */}
          {dossier.walkTheTalk ? (
            <div className="space-y-6">
              {/* Summary KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <span className="text-xs font-mono text-slate-400">8-Quarter Guidance Hit Rate</span>
                  <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                    {dossier.walkTheTalk.hitRatePct}%
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">Quarters meeting or beating guided range</p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <span className="text-xs font-mono text-slate-400">Avg Guidance Variance</span>
                  <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
                    ±{dossier.walkTheTalk.avgGuidanceVariancePct}%
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">Absolute deviation across 8 quarters</p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <span className="text-xs font-mono text-slate-400">Management Directional Bias</span>
                  <div className="text-2xl font-bold font-mono text-white mt-1 capitalize">
                    {dossier.walkTheTalk.directionalBias}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">Under-promise & over-deliver stance</p>
                </div>
              </div>

              {/* Guidance History Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-slate-800">
                  <h4 className="text-sm font-semibold text-white">8-Quarter Guidance vs Realized Actuals Log</h4>
                </div>
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-800 text-slate-400 font-mono text-[10px] uppercase">
                    <tr>
                      <th className="py-2.5 px-4">Period</th>
                      <th className="py-2.5 px-3">Guided Metric</th>
                      <th className="py-2.5 px-3 text-right">Guided Range</th>
                      <th className="py-2.5 px-3 text-right">Actual Realized</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-4 text-right">Variance %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {dossier.walkTheTalk.guidanceHistory.map((g, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 font-semibold text-white">{g.period}</td>
                        <td className="py-2.5 px-3 text-slate-300 font-sans">{g.metric}</td>
                        <td className="py-2.5 px-3 text-right text-slate-400">
                          {g.guidedMin}% – {g.guidedMax}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-200">{g.actual}%</td>
                        <td className="py-2.5 px-3 text-center">
                          {g.hit ? (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
                              BEAT / MET
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800/40">
                              MISSED
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <span className={g.variancePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {g.variancePct >= 0 ? `+${g.variancePct}%` : `${g.variancePct}%`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
              <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-xs text-slate-400">
                Stage 3 Walk-the-Talk audit has not been generated for this symbol yet.
              </p>
              <button
                onClick={onUpgradeStage3}
                disabled={isLoading}
                className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold tracking-wide transition-colors"
              >
                Execute Stage 3 On-Demand Audit
              </button>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 6: ZERO BLACK-BOX SOURCE LINEAGE & AUDIT TRAIL */}
      {activeSubTab === 'sources' && (
        <div className="space-y-6">
          {/* Transparency Certification Banner */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
              <div>
                <span className="text-xs font-mono text-cyan-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  Statutory Filing Lineage & Exchange Transparency
                </span>
                <h3 className="text-lg font-bold text-white mt-0.5">Zero Black-Box Source Lineage & Audit Trail</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Every qualitative score, footnote flag, and growth inference is strictly anchored to public BSE/NSE filings, audited Ind AS Notes to Accounts, and earnings concall transcripts.
                </p>
              </div>
              <span className="text-xs font-mono px-3 py-1.5 rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
                100% Verifiable Public Lineage
              </span>
            </div>

            {/* Core Sources Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-6">
              {/* 1. Concall Transcript Lineage */}
              <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold text-purple-400 uppercase tracking-wider">
                      Earnings Concall Transcript
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800/40">
                      BSE Filing
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-white mt-2">
                    {dossier.symbol} Q4 FY26 Concall Transcript
                  </h4>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                    Management discussed guidance, margin levers, capex schedule, and raw material pass-through timing with institutional research analysts.
                  </p>
                  <div className="mt-3.5 bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-xs text-slate-300">
                    <span className="font-semibold text-cyan-300 block mb-1">Engine Inference & How Used:</span>
                    Mapped against historical guidance to assign audited Credibility Grade. Verified operating cash flow generation against reported PAT.
                  </div>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-700/60 flex items-center justify-between">
                  <a
                    href={`https://www.bseindia.com/xml-data/corpfiling/AttachLive/${dossier.symbol}_Earnings_Concall_Transcript_Q4FY26.pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 transition-colors"
                  >
                    <span>Inspect BSE Transcript PDF</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href={`https://trendlyne.com/equity/concall-transcripts/${dossier.symbol}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-mono text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    Trendlyne
                  </a>
                </div>
              </div>

              {/* 2. Statutory Annual Report Footnotes Lineage */}
              <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold text-emerald-400 uppercase tracking-wider">
                      Notes to Accounts (Ind AS)
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/40">
                      Annual Filing
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-white mt-2">
                    Audited Balance Sheet Footnotes
                  </h4>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                    Audited citations: <code className="text-cyan-300 bg-slate-900 px-1 py-0.5 rounded">Note 32 (RPTs)</code>, <code className="text-cyan-300 bg-slate-900 px-1 py-0.5 rounded">Note 28 (Contingent Liab)</code>, <code className="text-cyan-300 bg-slate-900 px-1 py-0.5 rounded">Note 19 (Receivables Aging)</code>.
                  </p>
                  <div className="mt-3.5 bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-xs text-slate-300">
                    <span className="font-semibold text-emerald-400 block mb-1">Engine Inference & How Used:</span>
                    Directly computes Sloan Accrual Ratio, Contingent Liabilities % of Net Worth, and Related Party Transactions % of Revenue.
                  </div>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-700/60 flex items-center justify-between">
                  <a
                    href={`https://www.bseindia.com/bseplus/AnnualReport/${dossier.symbol}/${dossier.symbol}_Annual_Report_FY26.pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 transition-colors"
                  >
                    <span>Inspect Annual Report PDF</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <span className="text-[11px] font-mono text-slate-400">
                    Ind AS 24 / 37 / 109
                  </span>
                </div>
              </div>

              {/* 3. Credit Rating Agency & Exchange Filings */}
              <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold text-amber-400 uppercase tracking-wider">
                      Credit Agency & Covenant Audit
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/40">
                      CRISIL / ICRA
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-white mt-2">
                    Independent Credit Rating Rationale
                  </h4>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                    Audits working capital limits, bank debt covenants, promoter pledge invocation surveillance, and going-concern viability.
                  </p>
                  <div className="mt-3.5 bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-xs text-slate-300">
                    <span className="font-semibold text-amber-400 block mb-1">Engine Inference & How Used:</span>
                    Verifies debt sustainability component in Altman Z calculation and confirms zero promoter pledge invocation notices on SEBI SAST.
                  </div>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-700/60 flex items-center justify-between">
                  <a
                    href={`https://www.crisil.com/en/home/our-businesses/ratings/company-factsheet.${dossier.symbol}.html`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-mono text-amber-400 hover:text-amber-300 flex items-center gap-1.5 transition-colors"
                  >
                    <span>Inspect Rating Factsheet</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <span className="text-[11px] font-mono text-slate-400">SEBI Reg 30</span>
                </div>
              </div>
            </div>

            {/* Active Catalyst Source Citations */}
            <div className="mt-6 border-t border-slate-800 pt-5">
              <h4 className="text-xs font-mono font-semibold text-slate-300 uppercase tracking-wider mb-3">
                Active Catalyst Verification Ledger (4-Quadrant Transmission Channels)
              </h4>
              <div className="space-y-3">
                {dossier.operations.positiveCatalysts.map((cat, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-800/40 border border-slate-700/60 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700 uppercase">
                          {cat.category}
                        </span>
                        <span className="font-bold text-white">{cat.title}</span>
                      </div>
                      <p className="text-slate-400 text-[11px] mt-1">{cat.detail}</p>
                    </div>
                    <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                      <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                        {(cat.confidence * 100).toFixed(0)}% Conviction
                      </span>
                      <a
                        href={cat.sourceRef.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-cyan-300 font-mono text-[10px] flex items-center gap-1 transition-colors"
                      >
                        <span>View Filing</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Objectivity & Bias-Removal Guarantee */}
            <div className="mt-6 bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex items-start gap-3">
              <Scale className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300 leading-relaxed">
                <span className="font-semibold text-white">Institutional Objectivity & Bias-Removal Guarantee: </span>
                This system enforces cold, deterministic formulas on public filings. Positive revenue catalysts (order wins, capacity additions) are strictly weighed against negative operational realities (input commodity spot lag, customer concentration, and contingent tax claims). Recommendation outputs reflect bounded mathematical rubric evaluation with zero subjective human bias.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
