import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldAlert,
  X,
  Activity,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Scale,
  RefreshCw,
  Layers,
  Zap,
  Info,
  DollarSign
} from 'lucide-react';
import { formatINR } from '../lib/formatters.js';
import type { PortfolioRiskReport, StressScenario } from '../server/services/RiskAnalyticsEngine.js';

interface RiskAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPortfolio?: string;
  formatCurrency?: (val: number) => string;
}

export function RiskAnalyticsModal({
  isOpen,
  onClose,
  selectedPortfolio,
  formatCurrency = (v) => formatINR(v)
}: RiskAnalyticsModalProps) {
  const [report, setReport] = useState<PortfolioRiskReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedScenario, setSelectedScenario] = useState<string>('NIFTY_CORRECTION_10');

  const fetchRiskReport = async () => {
    setLoading(true);
    try {
      const portParam = selectedPortfolio ? `?portfolio=${encodeURIComponent(selectedPortfolio)}` : '';
      const res = await fetch(`/api/analytics/risk${portParam}`);
      const data = await res.json();
      if (data.success) {
        setReport(data.data || data);
      }
    } catch (e) {
      console.error('Failed to load risk report:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchRiskReport();
  }, [isOpen, selectedPortfolio]);

  if (!isOpen) return null;

  const activeScenarioObj = report?.stressScenarios.find(s => s.id === selectedScenario) || report?.stressScenarios[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 animate-fadeIn">
      <div
        className="rounded-3xl w-full max-w-4xl overflow-hidden flex flex-col shadow-2xl transition-all border max-h-[90vh]"
        style={{
          background: 'var(--bg-modal, #0f172a)',
          borderColor: 'var(--border-card, #334155)',
          color: 'var(--text-primary, #f8fafc)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{
            borderColor: 'var(--border-card, #334155)',
            background: 'var(--bg-table-alt, rgba(30, 41, 59, 0.9))'
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-2xl border shadow-sm flex items-center justify-center font-bold"
              style={{
                background: 'rgba(168, 85, 247, 0.15)',
                color: 'var(--accent-purple, #A855F7)',
                borderColor: 'rgba(168, 85, 247, 0.4)'
              }}
            >
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-display tracking-tight flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                Institutional Risk Analytics & Stress Testing
                <span
                  className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold border"
                  style={{
                    background: 'rgba(168, 85, 247, 0.18)',
                    color: 'var(--accent-purple, #A855F7)',
                    borderColor: 'rgba(168, 85, 247, 0.4)'
                  }}
                >
                  VaR 95% + Beta + Multi-Factor Shock
                </span>
              </h3>
              <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
                Risk-adjusted performance metrics, downside volatility, and macroeconomic simulation.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchRiskReport}
              className="p-2.5 rounded-xl border transition-all cursor-pointer shadow-sm hover:opacity-80"
              style={{
                background: 'var(--bg-card)',
                borderColor: 'var(--border-card)',
                color: 'var(--text-primary)'
              }}
              title="Refresh risk metrics"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2.5 rounded-xl border transition-all cursor-pointer shadow-sm hover:opacity-80"
              style={{
                background: 'var(--bg-card)',
                borderColor: 'var(--border-card)',
                color: 'var(--text-primary)'
              }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1" style={{ background: 'var(--bg-modal)' }}>
          {loading || !report ? (
            <div className="py-16 text-center space-y-3" style={{ color: 'var(--text-secondary)' }}>
              <RefreshCw className="w-8 h-8 mx-auto animate-spin text-purple-400" />
              <p className="text-xs font-semibold">Computing parametric VaR & stress testing models...</p>
            </div>
          ) : (
            <>
              {/* ── Key Risk Ratios Row ── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div
                  className="p-4 rounded-2xl border shadow-sm space-y-1"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
                >
                  <span className="text-[11px] font-mono uppercase font-bold tracking-wider block" style={{ color: 'var(--text-secondary)' }}>
                    Sharpe Ratio
                  </span>
                  <div className="text-2xl font-black font-mono text-emerald-400 mt-1">{report.sharpeRatio}</div>
                  <span className="text-[10px] font-semibold block" style={{ color: 'var(--text-muted)' }}>Risk-free rate: 6.85%</span>
                </div>

                <div
                  className="p-4 rounded-2xl border shadow-sm space-y-1"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
                >
                  <span className="text-[11px] font-mono uppercase font-bold tracking-wider block" style={{ color: 'var(--text-secondary)' }}>
                    Sortino Ratio
                  </span>
                  <div className="text-2xl font-black font-mono text-cyan-400 mt-1">{report.sortinoRatio}</div>
                  <span className="text-[10px] font-semibold block" style={{ color: 'var(--text-muted)' }}>Downside deviation only</span>
                </div>

                <div
                  className="p-4 rounded-2xl border shadow-sm space-y-1"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
                >
                  <span className="text-[11px] font-mono uppercase font-bold tracking-wider block" style={{ color: 'var(--text-secondary)' }}>
                    Beta vs Nifty 50
                  </span>
                  <div className="text-2xl font-black font-mono text-indigo-400 mt-1">{report.portfolioBetaNifty}</div>
                  <span className="text-[10px] font-semibold block" style={{ color: 'var(--text-muted)' }}>Market sensitivity</span>
                </div>

                <div
                  className="p-4 rounded-2xl border shadow-sm space-y-1"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
                >
                  <span className="text-[11px] font-mono uppercase font-bold tracking-wider block" style={{ color: 'var(--text-secondary)' }}>
                    Daily VaR (95%)
                  </span>
                  <div className="text-2xl font-black font-mono text-rose-400 mt-1">{formatCurrency(report.var95DailyINR)}</div>
                  <span className="text-[10px] font-semibold block" style={{ color: 'var(--text-muted)' }}>Max expected 1-day loss</span>
                </div>
              </div>

              {/* ── Macroeconomic Stress-Testing Simulator ── */}
              <div
                className="p-5 rounded-3xl border shadow-md space-y-4"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold font-display flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                      <Zap className="w-4 h-4 text-amber-400" /> Macroeconomic Stress-Testing Simulator
                    </h4>
                    <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Simulate portfolio drawdowns and P&L shocks under systemic market scenarios.
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    {report.stressScenarios.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedScenario(s.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
                          selectedScenario === s.id
                            ? 'bg-amber-500 text-slate-950 font-black shadow-md border-amber-400'
                            : 'hover:opacity-80'
                        }`}
                        style={selectedScenario === s.id ? {} : {
                          background: 'var(--bg-table-alt)',
                          borderColor: 'var(--border-card)',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        {s.name.split('(')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                {activeScenarioObj && (
                  <div
                    className="p-5 rounded-2xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
                    style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black font-display" style={{ color: 'var(--text-primary)' }}>
                          {activeScenarioObj.name}
                        </span>
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-md font-bold font-mono border ${
                          activeScenarioObj.severity === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400 border-rose-500/40' :
                          activeScenarioObj.severity === 'HIGH' ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                        }`}>
                          {activeScenarioObj.severity} SHOCK
                        </span>
                      </div>
                      <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                        {activeScenarioObj.description}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[11px] font-mono font-bold uppercase tracking-wider block" style={{ color: 'var(--text-muted)' }}>
                        Simulated Net Impact
                      </span>
                      <span className={`text-2xl font-black font-mono ${
                        activeScenarioObj.portfolioImpactINR >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {activeScenarioObj.portfolioImpactINR >= 0 ? '+' : ''}{formatCurrency(activeScenarioObj.portfolioImpactINR)}
                      </span>
                      <span className={`text-xs font-mono font-black block ${
                        activeScenarioObj.portfolioImpactPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        ({activeScenarioObj.portfolioImpactPct >= 0 ? '+' : ''}{activeScenarioObj.portfolioImpactPct}%)
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Asset-Level Risk Breakdown Table ── */}
              <div className="space-y-3">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                  <Layers className="w-3.5 h-3.5 text-cyan-400" /> Asset-Level Volatility & Risk Attribution
                </h4>

                <div className="overflow-x-auto rounded-2xl border shadow-sm" style={{ borderColor: 'var(--border-card)' }}>
                  <table className="w-full text-xs">
                    <thead style={{ background: 'var(--bg-table-alt)', color: 'var(--text-primary)' }}>
                      <tr className="border-b" style={{ borderColor: 'var(--border-card)' }}>
                        <th className="p-3 text-left font-mono font-bold uppercase text-[11px] tracking-wider">Symbol</th>
                        <th className="p-3 text-left font-mono font-bold uppercase text-[11px] tracking-wider">Portfolio</th>
                        <th className="p-3 text-right font-mono font-bold uppercase text-[11px] tracking-wider">Weight</th>
                        <th className="p-3 text-right font-mono font-bold uppercase text-[11px] tracking-wider">Annual Vol</th>
                        <th className="p-3 text-right font-mono font-bold uppercase text-[11px] tracking-wider">Beta</th>
                        <th className="p-3 text-right font-mono font-bold uppercase text-[11px] tracking-wider">Sharpe</th>
                        <th className="p-3 text-right font-mono font-bold uppercase text-[11px] tracking-wider">1D VaR</th>
                      </tr>
                    </thead>
                    <tbody style={{ background: 'var(--bg-card)' }}>
                      {report.assetRiskBreakdown.slice(0, 10).map((a, i) => (
                        <tr key={i} className="border-b transition-colors hover:opacity-90" style={{ borderColor: 'var(--border-card)' }}>
                          <td className="p-3 font-black" style={{ color: 'var(--text-primary)' }}>{a.symbol}</td>
                          <td className="p-3 font-semibold" style={{ color: 'var(--text-secondary)' }}>{a.portfolio}</td>
                          <td className="p-3 text-right font-mono font-bold text-cyan-400">{a.weightPct}%</td>
                          <td className="p-3 text-right font-mono font-semibold" style={{ color: 'var(--text-secondary)' }}>{a.volatilityAnnualPct}%</td>
                          <td className="p-3 text-right font-mono font-bold text-indigo-400">{a.betaNifty}</td>
                          <td className="p-3 text-right font-mono font-black text-emerald-400">{a.sharpeRatio}</td>
                          <td className="p-3 text-right font-mono font-black text-rose-400">{formatCurrency(a.var95DailyINR)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default RiskAnalyticsModal;
