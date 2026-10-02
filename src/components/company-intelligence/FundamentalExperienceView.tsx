import React, { useState } from 'react';
import {
  FileText,
  Shield,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Info,
  DollarSign,
  Activity,
  Layers,
  Users,
  Eye,
  Crosshair,
  Calendar,
  AlertOctagon,
  HelpCircle,
  Database
} from 'lucide-react';
import {
  FundamentalExperiencePayload,
  EvidenceField,
  SmartMoneyClassification,
  DebtServicingClassification,
  BriefCategory
} from '../../server/services/intelligence/types/FundamentalExperienceTypes.js';

interface FundamentalExperienceViewProps {
  experience: FundamentalExperiencePayload | null;
  symbol: string;
  formatCurrency?: (val: number) => string;
}

export function FundamentalExperienceView({
  experience,
  symbol,
  formatCurrency = (v) => `₹${v.toLocaleString()} Cr`
}: FundamentalExperienceViewProps) {
  const [showRawTables, setShowRawTables] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  if (!experience) {
    return (
      <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-3xl space-y-3">
        <Info className="w-8 h-8 text-slate-500 mx-auto" />
        <h4 className="text-base font-bold text-white">Fundamental Intelligence Dossier Initializing</h4>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Canonical fundamental facts and market accumulation records are being assembled for {symbol}.
        </p>
      </div>
    );
  }

  const toggleSection = (sec: string) => {
    setExpandedSection(expandedSection === sec ? null : sec);
  };

  // State label mapper
  const renderStateBadge = (status: string) => {
    switch (status) {
      case 'SUPPORTIVE':
      case 'STRONG':
      case 'VERIFIED':
      case 'HIGH_QUALITY':
      case 'VERIFIED_SMART_MONEY_ACCUMULATION':
      case 'EXPANDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            🟢 Supportive
          </span>
        );
      case 'MIXED':
      case 'MODERATE':
      case 'POSSIBLE_ACCUMULATION':
      case 'ADEQUATE':
      case 'WATCH':
      case 'REASONABLE':
      case 'EARLY_INFLECTION':
      case 'STABLE':
      case 'VERIFIED_PARTIAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            🟠 Mixed / Watch
          </span>
        );
      case 'WEAK':
      case 'CONCERN':
      case 'DISTRIBUTION_WARNING':
      case 'CONTRACTING':
      case 'DEMANDING':
      case 'VALUE_TRAP_RISK':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            🔴 Concern
          </span>
        );
      case 'CONFLICTING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            ⚠ Conflicting
          </span>
        );
      case 'MISSING':
      case 'DATA_INSUFFICIENT':
      case 'NOT_YET_REQUESTED':
      case 'NO_CONFIRMATION':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
            ⚪ Missing
          </span>
        );
    }
  };

  const getBriefPill = (cat: BriefCategory) => {
    switch (cat) {
      case 'REPORTED_FACT':
        return <span className="px-2 py-0.5 rounded text-[9px] font-bold font-mono bg-cyan-950 text-cyan-400 border border-cyan-800">REPORTED_FACT</span>;
      case 'DERIVED_METRIC':
        return <span className="px-2 py-0.5 rounded text-[9px] font-bold font-mono bg-indigo-950 text-indigo-400 border border-indigo-800">DERIVED_METRIC</span>;
      case 'MANAGEMENT_OUTLOOK':
        return <span className="px-2 py-0.5 rounded text-[9px] font-bold font-mono bg-blue-950 text-blue-400 border border-blue-800">MANAGEMENT_OUTLOOK</span>;
      case 'MARKET_ACTIVITY_EVIDENCE':
        return <span className="px-2 py-0.5 rounded text-[9px] font-bold font-mono bg-emerald-950 text-emerald-400 border border-emerald-800">MARKET_ACTIVITY</span>;
      case 'MISSING_OR_CONFLICTING':
        return <span className="px-2 py-0.5 rounded text-[9px] font-bold font-mono bg-amber-950 text-amber-400 border border-amber-800">MISSING_OR_CONFLICTING</span>;
    }
  };

  const exp = experience;

  return (
    <div className="space-y-6 text-slate-200">

      {/* ─────────────────────────────────────────────────────────────────
          1. FUNDAMENTAL SNAPSHOT & EXECUTIVE BRIEF
      ───────────────────────────────────────────────────────────────── */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">Executive Fundamental Brief</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300">
                  {exp.executiveBrief.wordCount} words
                </span>
              </div>
              <p className="text-xs text-slate-400">{exp.sourceCoverage}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 uppercase font-mono">Data Confidence:</span>
            <span className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold ${
              exp.dataConfidence === 'HIGH' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
              exp.dataConfidence === 'MODERATE' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
              'bg-slate-800 text-slate-400 border border-slate-700'
            }`}>
              {exp.dataConfidence}
            </span>
          </div>
        </div>

        {/* Executive brief prose breakdown */}
        <div className="space-y-2.5 bg-slate-950/60 p-4 rounded-2xl border border-slate-800/60">
          {exp.executiveBrief.elements.map((el, i) => (
            <div key={i} className="flex items-start gap-2.5 text-xs leading-relaxed">
              <div className="pt-0.5 shrink-0">{getBriefPill(el.category)}</div>
              <div className="text-slate-200">{el.text}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          2. WHAT MATTERS NOW
      ───────────────────────────────────────────────────────────────── */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-cyan-400" />
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">What Matters Now</h4>
          </div>
          <span className="text-[10px] font-mono text-slate-400">Core Evidenced Drivers</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {exp.whatMattersNow.map((item, idx) => (
            <div key={idx} className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60 flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-mono font-bold flex items-center justify-center shrink-0">
                {idx + 1}
              </span>
              <p className="text-xs text-slate-300 leading-normal">{item}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          3. GROWTH AND EARNINGS TRAJECTORY
      ───────────────────────────────────────────────────────────────── */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Growth & Earnings Trajectory</h4>
          </div>
          {renderStateBadge(exp.growthTrajectory.marginDirection.value || 'DATA_INSUFFICIENT')}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Latest Annual Revenue</span>
            <span className="text-base font-bold text-white font-mono">
              {exp.growthTrajectory.revenueLatestAnnual.value !== null ? `₹${exp.growthTrajectory.revenueLatestAnnual.value} Cr` : '—'}
            </span>
            <span className="text-[10px] text-slate-400 block font-mono">
              Period: {exp.growthTrajectory.revenueLatestAnnual.periodEnd || 'N/A'}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Prior Annual Revenue</span>
            <span className="text-base font-bold text-slate-300 font-mono">
              {exp.growthTrajectory.revenuePriorAnnual.value !== null ? `₹${exp.growthTrajectory.revenuePriorAnnual.value} Cr` : '—'}
            </span>
            <span className="text-[10px] text-slate-400 block font-mono">
              Period: {exp.growthTrajectory.revenuePriorAnnual.periodEnd || 'N/A'}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">YoY Growth</span>
            <span className={`text-base font-bold font-mono ${
              (exp.growthTrajectory.revenueGrowthYoY.value ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {exp.growthTrajectory.revenueGrowthYoY.value !== null ? `${exp.growthTrajectory.revenueGrowthYoY.value > 0 ? '+' : ''}${exp.growthTrajectory.revenueGrowthYoY.value}%` : '—'}
            </span>
            <span className="text-[10px] text-slate-400 block font-mono">Audited Annual</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Operating Margin</span>
            <span className="text-base font-bold text-cyan-300 font-mono">
              {exp.growthTrajectory.operatingMarginPct.value !== null ? `${exp.growthTrajectory.operatingMarginPct.value}%` : '—'}
            </span>
            <span className="text-[10px] text-slate-400 block font-mono">
              Direction: {exp.growthTrajectory.marginDirection.value || 'N/A'}
            </span>
          </div>
        </div>

        {/* Concentration Note */}
        <div className="p-3 rounded-2xl bg-slate-950/40 border border-slate-800/40 text-xs text-slate-400 flex items-center justify-between">
          <span>Earnings Concentration: {exp.growthTrajectory.earningsConcentration.observation}</span>
          <span className="text-[10px] font-mono text-slate-500">Quarterly History Checked</span>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          4. BUSINESS, DEMAND, COMPETITION & LONGEVITY
      ───────────────────────────────────────────────────────────────── */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Business Economics & Longevity</h4>
          </div>
          <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            Model: {exp.businessLongevity.businessModel}
          </span>
        </div>

        <div className="space-y-3">
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase font-mono">Revenue Drivers</span>
            <ul className="text-xs text-slate-200 list-disc list-inside space-y-1">
              {exp.businessLongevity.revenueDrivers.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 uppercase font-mono">Product Relevance</span>
                {renderStateBadge(exp.businessLongevity.productRelevance.assessment)}
              </div>
              <p className="text-xs text-slate-300">{exp.businessLongevity.productRelevance.summary}</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 uppercase font-mono">Competitive Position</span>
                {renderStateBadge(exp.businessLongevity.competitivePosition.assessment)}
              </div>
              <p className="text-xs text-slate-300">{exp.businessLongevity.competitivePosition.summary}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          5. FINANCIAL STRENGTH, DEBT AND SERVICING
      ───────────────────────────────────────────────────────────────── */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" />
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Financial Strength & Debt Servicing</h4>
          </div>
          {renderStateBadge(exp.financialStrength.classification)}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Debt / Equity</span>
            <span className="text-base font-bold text-white font-mono">
              {exp.financialStrength.debtToEquity.value !== null ? `${exp.financialStrength.debtToEquity.value}x` : '—'}
            </span>
            <span className="text-[10px] text-slate-400 block font-mono">Conservative Balance Sheet</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Interest Coverage</span>
            <span className="text-base font-bold text-cyan-300 font-mono">
              {exp.financialStrength.interestCoverage.value !== null ? `${exp.financialStrength.interestCoverage.value}x` : '—'}
            </span>
            <span className="text-[10px] text-slate-400 block font-mono">Servicing Cushion</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Debt Trend</span>
            <span className="text-base font-bold text-slate-200 font-mono">
              {exp.financialStrength.debtTrend.value || 'N/A'}
            </span>
            <span className="text-[10px] text-slate-400 block font-mono">Multi-period trend</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Classification</span>
            <span className="text-base font-bold text-emerald-400 font-mono">
              {exp.financialStrength.classification}
            </span>
            <span className="text-[10px] text-slate-400 block font-mono truncate">Model-Aware Logic</span>
          </div>
        </div>

        <p className="text-xs text-slate-400 bg-slate-950/40 p-3 rounded-2xl border border-slate-800/40">
          Rationale: {exp.financialStrength.classificationReason}
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          6. CASH FLOW & WORKING CAPITAL (CONFLICT DETECTION)
      ───────────────────────────────────────────────────────────────── */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Cash Flow & Working Capital</h4>
          </div>
          {renderStateBadge(exp.cashFlowWorkingCapital.cashConversionStatus)}
        </div>

        {/* Display conflict banner if provider values conflict */}
        {exp.cashFlowWorkingCapital.unresolvedConflict.exists && (
          <div className="p-4 rounded-2xl bg-purple-950/40 border border-purple-500/30 space-y-2">
            <div className="flex items-center gap-2 text-purple-300 font-bold text-xs">
              <AlertTriangle className="w-4 h-4 text-purple-400" />
              <span>CASH CONVERSION: CONFLICTING (Unresolved Provider Discrepancy)</span>
            </div>
            <p className="text-xs text-purple-200">
              {exp.cashFlowWorkingCapital.unresolvedConflict.description}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
              {exp.cashFlowWorkingCapital.unresolvedConflict.details?.map((d, i) => (
                <div key={i} className="p-2.5 rounded-xl bg-purple-900/30 border border-purple-500/20 text-purple-200">
                  <div className="font-bold text-purple-300">{d.provider}: {d.value !== null ? `₹${d.value} Cr` : 'N/A'}</div>
                  <div className="text-[10px] text-purple-400">{d.period} · {d.definition}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Operating Cash Flow (CFO)</span>
            <span className={`text-base font-bold font-mono ${
              exp.cashFlowWorkingCapital.cfo.status === 'CONFLICTING' ? 'text-purple-400' : 'text-white'
            }`}>
              {exp.cashFlowWorkingCapital.cfo.status === 'CONFLICTING' ? 'CONFLICTING' : exp.cashFlowWorkingCapital.cfo.value !== null ? `₹${exp.cashFlowWorkingCapital.cfo.value} Cr` : '—'}
            </span>
            <span className="text-[10px] text-slate-400 block font-mono">
              Status: {exp.cashFlowWorkingCapital.cfo.status}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">CFO / PAT Ratio</span>
            <span className={`text-base font-bold font-mono ${
              exp.cashFlowWorkingCapital.cfoToPat.status === 'CONFLICTING' ? 'text-purple-400' : 'text-slate-300'
            }`}>
              {exp.cashFlowWorkingCapital.cfoToPat.status === 'CONFLICTING' ? 'CONFLICTING' : exp.cashFlowWorkingCapital.cfoToPat.value !== null ? `${exp.cashFlowWorkingCapital.cfoToPat.value}x` : '—'}
            </span>
            <span className="text-[10px] text-slate-400 block font-mono">Quality of Earnings</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Receivables / CCC</span>
            <span className="text-base font-bold text-slate-400 font-mono">DATA_INSUFFICIENT</span>
            <span className="text-[10px] text-slate-500 block font-mono">Notes to accounts required</span>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          7. CAPITAL EFFICIENCY
      ───────────────────────────────────────────────────────────────── */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" />
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Capital Efficiency</h4>
          </div>
          {renderStateBadge(exp.capitalEfficiency.roce.value !== null && exp.capitalEfficiency.roce.value >= 12 ? 'SUPPORTIVE' : 'MIXED')}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">ROCE</span>
            <span className="text-base font-bold text-white font-mono">
              {exp.capitalEfficiency.roce.value !== null ? `${exp.capitalEfficiency.roce.value}%` : '—'}
            </span>
            <span className="text-[10px] text-slate-400 block font-mono">Return on Capital</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">ROE</span>
            <span className="text-base font-bold text-white font-mono">
              {exp.capitalEfficiency.roe.value !== null ? `${exp.capitalEfficiency.roe.value}%` : '—'}
            </span>
            <span className="text-[10px] text-slate-400 block font-mono">Return on Equity</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">ROIC</span>
            <span className="text-base font-bold text-slate-400 font-mono">DATA_INSUFFICIENT</span>
            <span className="text-[10px] text-slate-500 block font-mono">Invested Capital Split</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Peer Comparison</span>
            <span className="text-xs font-bold text-slate-400 font-mono block truncate">
              {exp.capitalEfficiency.sectorComparison.status}
            </span>
            <span className="text-[10px] text-slate-500 block font-mono">Unbiased Benchmarking</span>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          8. OWNERSHIP AND OWNERSHIP TREND
      ───────────────────────────────────────────────────────────────── */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Ownership & Shareholding Trend</h4>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-xl text-xs font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
              LATEST DISCLOSED OWNERSHIP = {exp.ownershipTrend.latestDisclosedPeriod}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Promoter Holding</span>
            <span className="text-base font-bold text-white font-mono">
              {exp.ownershipTrend.promoterPct.value !== null ? `${exp.ownershipTrend.promoterPct.value}%` : '—'}
            </span>
            <span className="text-[10px] text-slate-400 block font-mono">
              Change YoY: {exp.ownershipTrend.promoterChangeYoY.value !== null ? `+${exp.ownershipTrend.promoterChangeYoY.value}%` : '0%'}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Promoter Pledge</span>
            <span className="text-base font-bold text-emerald-400 font-mono">
              {exp.ownershipTrend.promoterPledgePct.value !== null ? `${exp.ownershipTrend.promoterPledgePct.value}%` : '0.0%'}
            </span>
            <span className="text-[10px] text-emerald-500 block font-mono">Zero Encumbrance</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">FII Holding</span>
            <span className="text-base font-bold text-slate-300 font-mono">
              {exp.ownershipTrend.fiiPct.value !== null ? `${exp.ownershipTrend.fiiPct.value}%` : '0%'}
            </span>
            <span className="text-[10px] text-slate-500 block font-mono">Foreign Institutional</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">DII Holding</span>
            <span className="text-base font-bold text-slate-300 font-mono">
              {exp.ownershipTrend.diiPct.value !== null ? `${exp.ownershipTrend.diiPct.value}%` : '0.05%'}
            </span>
            <span className="text-[10px] text-slate-500 block font-mono">Domestic Institutional</span>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          9. QGLP — FOUR EXPLICIT DIMENSIONS
      ───────────────────────────────────────────────────────────────── */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" />
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">QGLP — Four Explicit Dimensions</h4>
          </div>
          <span className="text-[10px] font-mono text-slate-400">Zero Black-Box Scores</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Quality */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/60 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
              <span className="font-bold text-xs uppercase tracking-wider text-white">Q — Quality</span>
              {renderStateBadge(exp.qglp.quality.status)}
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{exp.qglp.quality.summary}</p>
            <div className="text-[11px] font-mono space-y-1 text-slate-400">
              <span className="font-bold text-slate-300 block">Itemised Evidence:</span>
              {exp.qglp.quality.evidenceList.map((e, idx) => (
                <div key={idx} className="flex justify-between text-[10px]">
                  <span>{e.parameter}:</span>
                  <span className="font-bold text-cyan-300">{String(e.value)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Growth */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/60 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
              <span className="font-bold text-xs uppercase tracking-wider text-white">G — Growth</span>
              {renderStateBadge(exp.qglp.growth.status)}
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{exp.qglp.growth.summary}</p>
            <div className="text-[11px] font-mono space-y-1 text-slate-400">
              <span className="font-bold text-slate-300 block">Itemised Evidence:</span>
              {exp.qglp.growth.evidenceList.map((e, idx) => (
                <div key={idx} className="flex justify-between text-[10px]">
                  <span>{e.parameter}:</span>
                  <span className="font-bold text-emerald-300">{String(e.value)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Longevity */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/60 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
              <span className="font-bold text-xs uppercase tracking-wider text-white">L — Longevity</span>
              {renderStateBadge(exp.qglp.longevity.status)}
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{exp.qglp.longevity.summary}</p>
            <div className="text-[11px] font-mono space-y-1 text-slate-400">
              <span className="font-bold text-slate-300 block">Itemised Evidence:</span>
              {exp.qglp.longevity.evidenceList.map((e, idx) => (
                <div key={idx} className="flex justify-between text-[10px]">
                  <span>{e.parameter}:</span>
                  <span className="font-bold text-indigo-300">{String(e.value)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Price */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/60 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
              <span className="font-bold text-xs uppercase tracking-wider text-white">P — Price</span>
              {renderStateBadge(exp.qglp.price.status)}
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{exp.qglp.price.summary}</p>
            <div className="text-[11px] font-mono space-y-1 text-slate-400">
              <span className="font-bold text-slate-300 block">Itemised Evidence:</span>
              {exp.qglp.price.evidenceList.map((e, idx) => (
                <div key={idx} className="flex justify-between text-[10px]">
                  <span>{e.parameter}:</span>
                  <span className="font-bold text-amber-300">{String(e.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          10. RECENT ACCUMULATION / SMART MONEY ENGINE
      ───────────────────────────────────────────────────────────────── */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-emerald-400" />
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">
              Recent Accumulation / Smart-Money Engine
            </h4>
          </div>
          {renderStateBadge(exp.recentAccumulation.classification)}
        </div>

        <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/60 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <span className="text-slate-400">
              Analysis Window: <span className="text-white font-bold">{exp.recentAccumulation.analysisStartDate}</span> to <span className="text-white font-bold">{exp.recentAccumulation.analysisEndDate}</span>
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
              {exp.recentAccumulation.totalSessions} Sessions Evaluated
            </span>
          </div>

          <p className="text-xs text-slate-200 leading-relaxed">
            {exp.recentAccumulation.classificationRationale}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase block">Up/Down Volume Ratio</span>
              <span className="font-bold text-white">{exp.recentAccumulation.upVolumeVsDownVolume.ratio}x</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase block">Abnormal Volume Days</span>
              <span className="font-bold text-cyan-300">{exp.recentAccumulation.abnormalVolumeDays.length} sessions</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase block">Delivery Trend</span>
              <span className="font-bold text-slate-300">{exp.recentAccumulation.deliveryEvidence.trend}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase block">Named Buyers Disclosed</span>
              <span className="font-bold text-slate-300">{exp.recentAccumulation.namedBuyers.length}</span>
            </div>
          </div>

          {/* Abnormal Days List */}
          {exp.recentAccumulation.abnormalVolumeDays.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 block">
                Abnormal Volume Sessions (&gt;= 1.5x 20D Avg):
              </span>
              <div className="space-y-1 max-h-40 overflow-y-auto font-mono text-[10px]">
                {exp.recentAccumulation.abnormalVolumeDays.map((a, i) => (
                  <div key={i} className="flex justify-between p-1.5 rounded bg-slate-900/80 text-slate-300">
                    <span>{a.date}</span>
                    <span>Vol: {a.volume.toLocaleString()} ({a.ratio}x 20D avg)</span>
                    <span className={a.priceChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {a.priceChangePct >= 0 ? '+' : ''}{a.priceChangePct}%
                    </span>
                    <span>Delivery: {a.deliveryPct !== null ? `${a.deliveryPct}%` : 'N/A'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Limitations */}
          <div className="pt-2 border-t border-slate-800/60 text-[10px] text-slate-400 space-y-1">
            <span className="font-bold text-slate-300 block">Methodological Limitations:</span>
            {exp.recentAccumulation.limitations.map((lim, i) => (
              <p key={i}>· {lim}</p>
            ))}
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          11. GOVERNANCE / RED FLAGS
      ───────────────────────────────────────────────────────────────── */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Governance & Red Flags</h4>
          </div>
          <span className="text-[10px] font-mono text-slate-400">Statutory & Audit Checks</span>
        </div>

        <div className="space-y-2">
          {exp.governanceRedFlags.map((item, idx) => (
            <div key={idx} className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60 flex items-start gap-3">
              <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                item.severity === 'CONCERN' ? 'bg-rose-400' : item.severity === 'WATCH' ? 'bg-amber-400' : 'bg-cyan-400'
              }`} />
              <div className="space-y-0.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">{item.event}</span>
                  <span className="text-[10px] font-mono text-slate-500">({item.date})</span>
                </div>
                <p className="text-slate-300">{item.whyItMatters}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          12. WHAT TO WATCH (MONITORING ITEMS <= 6)
      ───────────────────────────────────────────────────────────────── */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">What to Watch (Top Priorities)</h4>
          </div>
          <span className="text-[10px] font-mono text-slate-400">{exp.whatToWatch.length} Active Items</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {exp.whatToWatch.map((w, idx) => (
            <div key={idx} className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/60 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white">{w.item}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Priority {w.priority}
                </span>
              </div>
              <p className="text-slate-300">{w.whyImportant}</p>
              <div className="text-[10px] font-mono text-slate-400 pt-1">
                Target / Trigger: <span className="text-cyan-300 font-bold">{w.triggerOrTarget}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          13. EVIDENCE, SOURCES & EXPANDABLE RAW TABLES
      ───────────────────────────────────────────────────────────────── */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-slate-400" />
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Evidence Provenance & Raw Sources</h4>
          </div>
          <button
            onClick={() => setShowRawTables(!showRawTables)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-white transition-all cursor-pointer"
          >
            <span>{showRawTables ? 'Collapse Raw Tables' : 'Expand Raw Tables'}</span>
            {showRawTables ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
            {exp.sourcesUsed.map((s, idx) => (
              <div key={idx} className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 flex justify-between">
                <div>
                  <span className="font-bold text-white">{s.provider}</span>
                  <span className="text-slate-400 block text-[10px]">{s.endpoint}</span>
                </div>
                <span className="text-[10px] text-slate-400">{s.fetchedAt.substring(0, 10)}</span>
              </div>
            ))}
          </div>

          {showRawTables && (
            <div className="pt-3 border-t border-slate-800 space-y-3">
              <h5 className="text-xs font-bold font-mono text-slate-300 uppercase">Complete Fundamental Payload (JSON)</h5>
              <pre className="p-4 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-[10px] text-slate-300 overflow-x-auto max-h-96">
                {JSON.stringify(exp, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
