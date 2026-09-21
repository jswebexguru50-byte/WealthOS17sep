// EvidenceSpineHeader.tsx
// Agent B — ANALYZE / EvidenceSpine (display-only)
//
// CONSTRAINT: This component is a DISPLAY-ONLY compositor.
// It surfaces backend-provided values from props.
// It must NEVER:
//   - Recompute strategy scores
//   - Re-derive FERE results
//   - Re-calculate valuation, QGLP gates, risk, or Signal Quality
//   - Invent a ranking or composite score
// All fields must come from the backend API response, passed as props.

import React from 'react';
import {
  Shield,
  Zap,
  Activity,
  Target,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  HelpCircle,
  Ban,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { DataStateBadge, DataState } from './UISystemPrimitives.js';

// ─────────────────────────────────────────────
// Types — all fields sourced from backend only
// ─────────────────────────────────────────────
export interface EvidenceSpineProps {
  symbol: string;
  companyName?: string;

  // From backend signal / verdict
  actionDirective?: string;      // e.g. "BUY", "HOLD", "TRIM_EXIT", "SHORT_HEDGE"
  actionDirectiveRaw?: string;   // verbatim backend value if differs
  confidenceLabel?: string;      // backend-provided string, e.g. "HIGH", "MODERATE"
  timeHorizon?: string;          // backend-provided, e.g. "SWING (1-5W)"

  // From backend SignalQualityOverlay
  signalQuality?: string;        // e.g. "ACTIONABLE", "INFORMATIONAL", "BLOCKED"
  signalQualityScore?: number;   // backend-provided numeric

  // From backend QGLP gate
  qglpVerdict?: string;          // e.g. "QGLP_PASS", "QGLP_PARTIAL", "QGLP_FAIL"
  qglpDetails?: Record<string, string>; // per-criterion from backend

  // From backend FERE
  fereResult?: string;           // e.g. "FERE_BULLISH", "FERE_NEUTRAL", "FERE_BEARISH"
  fereScore?: number;            // backend-provided numeric

  // Data state
  dataState?: DataState;         // backend-reported state, never invented

  // Navigation
  onViewFullAnalysis?: () => void;
}

// ─────────────────────────────────────────────
// Directive color mapping — display only
// ─────────────────────────────────────────────
function directiveStyles(d?: string) {
  if (!d) return { bg: 'bg-slate-700/30', text: 'text-slate-400', border: 'border-slate-600/30' };
  const u = d.toUpperCase();
  if (u === 'BUY' || u === 'ACCUMULATE' || u === 'STRONG_BUY')
    return { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/40' };
  if (u.includes('SELL') || u.includes('SHORT') || u.includes('TRIM') || u.includes('EXIT'))
    return { bg: 'bg-rose-500/15', text: 'text-rose-300', border: 'border-rose-500/40' };
  if (u === 'HOLD' || u === 'MONITOR' || u === 'WATCH')
    return { bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/40' };
  return { bg: 'bg-slate-700/30', text: 'text-slate-400', border: 'border-slate-600/40' };
}

function qglpStyles(v?: string) {
  if (!v) return { text: 'text-slate-400', icon: HelpCircle };
  if (v.includes('PASS')) return { text: 'text-emerald-400', icon: CheckCircle };
  if (v.includes('PARTIAL')) return { text: 'text-amber-400', icon: AlertTriangle };
  if (v.includes('FAIL') || v.includes('BLOCK')) return { text: 'text-rose-400', icon: XCircle };
  return { text: 'text-slate-400', icon: HelpCircle };
}

function fereStyles(v?: string) {
  if (!v) return { text: 'text-slate-400' };
  if (v.includes('BULL')) return { text: 'text-emerald-400' };
  if (v.includes('BEAR')) return { text: 'text-rose-400' };
  return { text: 'text-amber-400' };
}

function sigQStyles(v?: string) {
  if (!v) return { text: 'text-slate-400' };
  if (v === 'ACTIONABLE') return { text: 'text-emerald-400' };
  if (v === 'INFORMATIONAL') return { text: 'text-amber-400' };
  if (v === 'BLOCKED') return { text: 'text-rose-400' };
  return { text: 'text-slate-400' };
}

// ─────────────────────────────────────────────
// EvidenceSpineHeader Component
// ─────────────────────────────────────────────
export function EvidenceSpineHeader({
  symbol,
  companyName,
  actionDirective,
  confidenceLabel,
  timeHorizon,
  signalQuality,
  signalQualityScore,
  qglpVerdict,
  qglpDetails,
  fereResult,
  fereScore,
  dataState,
  onViewFullAnalysis
}: EvidenceSpineProps) {
  const dirStyle = directiveStyles(actionDirective);
  const { text: qglpText, icon: QglpIcon } = qglpStyles(qglpVerdict);
  const { text: fereText } = fereStyles(fereResult);
  const { text: sigText } = sigQStyles(signalQuality);

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
    >
      {/* Header Row */}
      <div
        className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b"
        style={{ borderColor: 'var(--border-card)' }}
      >
        <div className="min-w-0">
          <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">
            Evidence Spine
          </span>
          <h2 className="text-base font-bold text-white tracking-tight truncate mt-0.5">
            {companyName || symbol}
          </h2>
          <span className="text-[10px] font-mono text-slate-400">{symbol}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Data State Badge — must reflect backend value exactly */}
          {dataState && <DataStateBadge state={dataState} size="xs" />}

          {/* Action Directive — verbatim from backend */}
          {actionDirective && (
            <span className={`px-3 py-1.5 rounded-xl font-mono font-bold text-xs border ${dirStyle.bg} ${dirStyle.text} ${dirStyle.border}`}>
              {actionDirective}
            </span>
          )}

          {onViewFullAnalysis && (
            <button
              onClick={onViewFullAnalysis}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-700 border border-slate-700/50 transition-all cursor-pointer"
            >
              Full Analysis <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Evidence Grid — all values from backend props */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px" style={{ background: 'var(--border-card)' }}>

        {/* Signal Quality — from SignalQualityOverlay backend */}
        <div className="p-3 space-y-1" style={{ background: 'var(--bg-card)' }}>
          <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase text-slate-500">
            <Zap className="w-2.5 h-2.5" /> Signal Quality
          </div>
          <div className={`font-bold text-xs font-mono ${sigText}`}>
            {signalQuality || <span className="text-slate-600 italic">—</span>}
          </div>
          {typeof signalQualityScore === 'number' && (
            <div className="text-[10px] text-slate-500 font-mono">Score: {signalQualityScore.toFixed(2)}</div>
          )}
        </div>

        {/* QGLP Gate — from backend QGLP engine */}
        <div className="p-3 space-y-1" style={{ background: 'var(--bg-card)' }}>
          <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase text-slate-500">
            <Shield className="w-2.5 h-2.5" /> QGLP Gate
          </div>
          <div className={`font-bold text-xs font-mono flex items-center gap-1 ${qglpText}`}>
            <QglpIcon className="w-3 h-3" />
            {qglpVerdict || <span className="text-slate-600 italic">—</span>}
          </div>
          {qglpDetails && (
            <div className="text-[9px] text-slate-500 font-mono space-y-0.5 mt-1">
              {Object.entries(qglpDetails).map(([k, v]) => (
                <div key={k}>{k}: <span className={v === 'PASS' ? 'text-emerald-400' : v === 'FAIL' ? 'text-rose-400' : 'text-amber-400'}>{v}</span></div>
              ))}
            </div>
          )}
        </div>

        {/* FERE Result — from backend FERE engine */}
        <div className="p-3 space-y-1" style={{ background: 'var(--bg-card)' }}>
          <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase text-slate-500">
            <Activity className="w-2.5 h-2.5" /> FERE
          </div>
          <div className={`font-bold text-xs font-mono ${fereText}`}>
            {fereResult || <span className="text-slate-600 italic">—</span>}
          </div>
          {typeof fereScore === 'number' && (
            <div className="text-[10px] text-slate-500 font-mono">Score: {fereScore.toFixed(2)}</div>
          )}
        </div>

        {/* Confidence + Horizon — from backend verdict */}
        <div className="p-3 space-y-1" style={{ background: 'var(--bg-card)' }}>
          <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase text-slate-500">
            <Target className="w-2.5 h-2.5" /> Confidence & Horizon
          </div>
          <div className="font-bold text-xs font-mono text-white">
            {confidenceLabel || <span className="text-slate-600 italic">—</span>}
          </div>
          {timeHorizon && (
            <div className="text-[10px] text-slate-400 font-mono">{timeHorizon}</div>
          )}
        </div>
      </div>

      {/* No-data guard — backend data state is missing or blocked */}
      {(dataState === 'BLOCKED' || dataState === 'DATA_INSUFFICIENT') && (
        <div
          className="px-4 py-2.5 border-t text-[11px] font-mono text-amber-400 flex items-center gap-2"
          style={{ borderColor: 'var(--border-card)', background: 'rgb(245 158 11 / 0.05)' }}
        >
          <AlertTriangle className="w-3 h-3 shrink-0" />
          Evidence unavailable: backend reports <strong>{dataState}</strong>. Do not interpret missing fields as zero or null.
        </div>
      )}
    </div>
  );
}
