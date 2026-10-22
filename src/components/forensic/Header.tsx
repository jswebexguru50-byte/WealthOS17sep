import React from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Cpu,
  Layers,
  FlaskConical,
  Sliders,
  Sparkles,
  Database,
  Activity,
  CheckCircle2,
  Lock,
  Unlock,
} from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  p3GateSignedOff: boolean;
  toggleP3Gate: () => void;
  telemetry: {
    cacheHits: number;
    tokensConsumed: number;
    estimatedCostUsd: number;
  };
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  p3GateSignedOff,
  toggleP3Gate,
  telemetry,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Platform Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-emerald-600 to-cyan-500 flex items-center justify-center shadow-md shadow-emerald-950/40">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg tracking-tight text-white">Forensic Intelligence Layer</span>
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  v2.1 Spec
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Deterministic Forensics • Staged Funnel • Tri-Scenario Valuation • Auditable Rubric
              </p>
            </div>
          </div>

          {/* Telemetry & P3-0 Legal Gate Controls */}
          <div className="flex items-center gap-3">
            {/* Telemetry Pill */}
            <div className="hidden lg:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs font-mono text-slate-300">
              <div className="flex items-center gap-1.5" title="Content-Hash Cache Hits">
                <Database className="w-3.5 h-3.5 text-cyan-400" />
                <span>Hits: {telemetry.cacheHits}</span>
              </div>
              <span className="text-slate-600">|</span>
              <div className="flex items-center gap-1.5" title="LLM Tokens Consumed">
                <Activity className="w-3.5 h-3.5 text-amber-400" />
                <span>{telemetry.tokensConsumed.toLocaleString()} tok</span>
              </div>
              <span className="text-slate-600">|</span>
              <div className="flex items-center gap-1.5" title="Estimated API Run Cost">
                <span className="text-emerald-400 font-semibold">${telemetry.estimatedCostUsd.toFixed(4)}</span>
              </div>
            </div>

            {/* P3-0 Legal Sign-Off Gate Button */}
            <button
              onClick={toggleP3Gate}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                p3GateSignedOff
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-700/50 hover:bg-emerald-900/50'
                  : 'bg-amber-950/40 text-amber-300 border-amber-700/50 hover:bg-amber-900/50'
              }`}
              title={
                p3GateSignedOff
                  ? 'P3-0 Gate Signed Off: Stage 3 On-Demand intelligence is unlocked'
                  : 'P3-0 Gate Blocked: Legal review of YouTube/Screener scraping required'
              }
            >
              {p3GateSignedOff ? (
                <>
                  <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>P3-0 Signed Off</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>P3-0 Legal Gate Locked</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-1 border-t border-slate-800/80 pt-2 pb-1 overflow-x-auto">
          {[
            { id: 'funnel', label: 'Universe & Staged Funnel', icon: Layers },
            { id: 'dossier', label: 'Forensic Dossier Deep Dive', icon: ShieldCheck },
            { id: 'tests', label: 'Test Suite (§7 Verification)', icon: FlaskConical },
            { id: 'weights', label: 'Weight Calibrator (§3.1)', icon: Sliders },
            { id: 'custom', label: 'Custom Stock Analyzer', icon: Sparkles },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium rounded-md whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
