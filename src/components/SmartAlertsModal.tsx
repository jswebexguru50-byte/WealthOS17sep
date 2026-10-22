import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  X,
  TrendingUp,
  AlertTriangle,
  ShieldAlert,
  Zap,
  CheckCircle,
  ExternalLink,
  RefreshCw,
  Clock,
  Sparkles,
  Info
} from 'lucide-react';
import type { SmartAlert } from '../server/services/AlertEngine.js';

interface SmartAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectScrip?: (symbol: string) => void;
}

export function SmartAlertsModal({ isOpen, onClose, onSelectScrip }: SmartAlertsModalProps) {
  const [alerts, setAlerts] = useState<SmartAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/alerts');
      const data = await res.json();
      if (data.success && Array.isArray(data.alerts)) {
        setAlerts(data.alerts);
      }
    } catch (e) {
      console.error('Failed to load alerts:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchAlerts();
  }, [isOpen]);

  if (!isOpen) return null;

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'OPPORTUNITY':
        return (
          <span
            className="px-2.5 py-1 rounded-full font-mono text-[11px] font-black tracking-wide border shadow-sm flex items-center gap-1"
            style={{
              background: 'rgba(16, 185, 129, 0.18)',
              color: 'var(--accent-green, #10B981)',
              borderColor: 'rgba(16, 185, 129, 0.45)'
            }}
          >
            <TrendingUp className="w-3 h-3" /> BREAKOUT
          </span>
        );
      case 'CRITICAL':
        return (
          <span
            className="px-2.5 py-1 rounded-full font-mono text-[11px] font-black tracking-wide border shadow-sm flex items-center gap-1"
            style={{
              background: 'rgba(239, 68, 68, 0.18)',
              color: 'var(--accent-red, #EF4444)',
              borderColor: 'rgba(239, 68, 68, 0.45)'
            }}
          >
            <ShieldAlert className="w-3 h-3" /> CRITICAL
          </span>
        );
      case 'WARNING':
        return (
          <span
            className="px-2.5 py-1 rounded-full font-mono text-[11px] font-black tracking-wide border shadow-sm flex items-center gap-1"
            style={{
              background: 'rgba(245, 158, 11, 0.18)',
              color: 'var(--accent-gold, #F59E0B)',
              borderColor: 'rgba(245, 158, 11, 0.45)'
            }}
          >
            <AlertTriangle className="w-3 h-3" /> WARNING
          </span>
        );
      default:
        return (
          <span
            className="px-2.5 py-1 rounded-full font-mono text-[11px] font-black tracking-wide border shadow-sm flex items-center gap-1"
            style={{
              background: 'rgba(59, 130, 246, 0.18)',
              color: 'var(--accent-blue, #3B82F6)',
              borderColor: 'rgba(59, 130, 246, 0.45)'
            }}
          >
            <Info className="w-3 h-3" /> INFO
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 animate-fadeIn">
      <div
        className="rounded-3xl w-full max-w-2xl overflow-hidden flex flex-col shadow-2xl transition-all border max-h-[85vh]"
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
                background: 'rgba(245, 158, 11, 0.15)',
                color: 'var(--accent-gold, #F59E0B)',
                borderColor: 'rgba(245, 158, 11, 0.4)'
              }}
            >
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-display tracking-tight flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                Portfolio Smart Alerts
                <span
                  className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold border"
                  style={{
                    background: 'rgba(245, 158, 11, 0.18)',
                    color: 'var(--accent-gold, #F59E0B)',
                    borderColor: 'rgba(245, 158, 11, 0.4)'
                  }}
                >
                  {alerts.length} Active
                </span>
              </h3>
              <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
                Rule-based market signals, 52W breakouts, drawdowns, and concentration limits.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchAlerts}
              className="p-2.5 rounded-xl border transition-all cursor-pointer shadow-sm hover:opacity-80"
              style={{
                background: 'var(--bg-card)',
                borderColor: 'var(--border-card)',
                color: 'var(--text-primary)'
              }}
              title="Refresh alerts"
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

        {/* Alerts List Body */}
        <div className="p-6 overflow-y-auto space-y-3.5 flex-1" style={{ background: 'var(--bg-modal)' }}>
          {loading && alerts.length === 0 ? (
            <div className="py-16 text-center space-y-3" style={{ color: 'var(--text-secondary)' }}>
              <RefreshCw className="w-8 h-8 mx-auto animate-spin text-cyan-400" />
              <p className="text-xs font-semibold">Scanning portfolio instruments...</p>
            </div>
          ) : alerts.length === 0 ? (
            <div className="py-16 text-center space-y-3" style={{ color: 'var(--text-secondary)' }}>
              <CheckCircle className="w-10 h-10 mx-auto text-emerald-400" />
              <h4 className="text-sm font-bold font-display" style={{ color: 'var(--text-primary)' }}>All Systems Optimal</h4>
              <p className="text-xs font-medium max-w-sm mx-auto" style={{ color: 'var(--text-secondary)' }}>
                No critical drawdowns, limit violations, or abnormal surges detected across your active portfolios.
              </p>
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                onClick={() => {
                  if (onSelectScrip) {
                    onSelectScrip(alert.symbol);
                    onClose();
                  }
                }}
                className="p-4 rounded-2xl transition-all cursor-pointer group flex flex-col justify-between space-y-2.5 border shadow-md hover:border-cyan-500/60"
                style={{
                  background: 'var(--bg-card)',
                  borderColor: 'var(--border-card)'
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-sm font-black font-display tracking-wide group-hover:text-cyan-400 transition-colors"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {alert.symbol}
                    </span>
                    <span
                      className="text-xs font-mono font-bold px-2 py-0.5 rounded-md border"
                      style={{
                        background: 'var(--bg-table-alt)',
                        color: 'var(--text-secondary)',
                        borderColor: 'var(--border-card)'
                      }}
                    >
                      {alert.portfolio}
                    </span>
                  </div>
                  {getSeverityBadge(alert.severity)}
                </div>

                <p
                  className="text-xs leading-relaxed font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {alert.message}
                </p>

                <div
                  className="flex items-center justify-between text-xs pt-2.5 border-t"
                  style={{ borderColor: 'var(--border-card)' }}
                >
                  <span
                    className="flex items-center gap-1.5 font-mono text-[11px] font-semibold"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Clock className="w-3.5 h-3.5 text-cyan-400" /> Live Market Signal
                  </span>
                  <span className="text-xs font-bold font-mono text-cyan-400 group-hover:underline flex items-center gap-1">
                    Analyze Scrip <ExternalLink className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default SmartAlertsModal;
