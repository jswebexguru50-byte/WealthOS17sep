import React, { useState, useEffect } from 'react';
import {
  Flame,
  AlertTriangle,
  ShieldAlert,
  Search,
  X,
  Bell,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Zap,
  TrendingUp,
  Sparkles
} from 'lucide-react';
import { formatINR } from '../lib/formatters.js';

export interface RealTimeAlert {
  id: string;
  timestamp: string;
  symbol: string;
  company_name: string;
  severity: 'BREAKOUT' | 'RISK' | 'THESIS_STRAIN';
  title: string;
  message: string;
  catalyst_source: string;
  price_at_alert: number;
  target_price?: number;
  stop_loss?: number;
  calibrated_prob?: number;
  dismissed: boolean;
}

interface RealTimeAlertBannerProps {
  onInspectSecurity: (symbol: string) => void;
}

export const RealTimeAlertBanner: React.FC<RealTimeAlertBannerProps> = ({ onInspectSecurity }) => {
  const [alerts, setAlerts] = useState<RealTimeAlert[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [showDrawer, setShowDrawer] = useState<boolean>(false);

  // Fetch initial alerts and subscribe to SSE
  useEffect(() => {
    let isMounted = true;

    // 1. Initial snapshot fetch
    fetch('/api/alerts/active')
      .then(res => res.json())
      .then(json => {
        if (isMounted && json.success && Array.isArray(json.data)) {
          setAlerts(json.data.filter((a: RealTimeAlert) => !a.dismissed));
        }
      })
      .catch(() => {});

    // 2. Server-Sent Events subscription
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/alerts/stream');

      eventSource.onmessage = (event) => {
        try {
          const newAlert: RealTimeAlert = JSON.parse(event.data);
          if (newAlert && newAlert.symbol) {
            setAlerts(prev => [newAlert, ...prev.filter(a => a.id !== newAlert.id)]);
            setCurrentIndex(0); // auto-focus on freshest alert
          }
        } catch {}
      };
    } catch (e) {
      console.warn('[RealTimeAlertBanner] SSE connection failed, relying on active polling:', e);
    }

    return () => {
      isMounted = false;
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  const activeAlerts = alerts.filter(a => !a.dismissed);
  const currentAlert = activeAlerts[currentIndex] || activeAlerts[0];

  const handleDismiss = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch(`/api/alerts/${id}/dismiss`, { method: 'POST' });
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, dismissed: true } : a));
      if (currentIndex >= activeAlerts.length - 1 && currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
      }
    } catch {}
  };

  if (!currentAlert) {
    return null;
  }

  // Styling by severity
  const isBreakout = currentAlert.severity === 'BREAKOUT';
  const isRisk = currentAlert.severity === 'RISK';

  const bannerBg = isBreakout
    ? 'bg-gradient-to-r from-emerald-950/90 via-teal-950/80 to-slate-900 border-emerald-500/40 text-emerald-200'
    : isRisk
    ? 'bg-gradient-to-r from-rose-950/90 via-red-950/80 to-slate-900 border-rose-500/40 text-rose-200'
    : 'bg-gradient-to-r from-amber-950/90 via-orange-950/80 to-slate-900 border-amber-500/40 text-amber-200';

  const badgeBg = isBreakout
    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-emerald-500/10'
    : isRisk
    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-rose-500/10'
    : 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-amber-500/10';

  return (
    <div className="relative z-40 mb-3">
      {/* Sticky Alert Bar */}
      <div className={`w-full px-4 py-2.5 rounded-xl border backdrop-blur-md shadow-lg flex items-center justify-between gap-3 ${bannerBg}`}>
        {/* Left: Icon & Alert Payload */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex-shrink-0 animate-pulse">
            {isBreakout ? (
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                <Flame className="w-5 h-5 text-emerald-400" />
              </div>
            ) : isRisk ? (
              <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${badgeBg}`}>
              {isBreakout ? '⚡ Breakout Alert' : isRisk ? '🚨 Risk Alert' : '⚠️ Thesis Strain'}
            </span>

            <span className="font-extrabold text-white tracking-wide text-sm">
              [{currentAlert.symbol}] {currentAlert.company_name}
            </span>

            <span className="text-xs text-slate-300 truncate max-w-xl">
              {currentAlert.title} — {currentAlert.message}
            </span>

            {currentAlert.calibrated_prob && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 border border-blue-500/40 text-blue-300">
                Win Prob: {currentAlert.calibrated_prob}%
              </span>
            )}

            <span className="text-[11px] text-slate-400 hidden lg:inline">
              via {currentAlert.catalyst_source}
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Cycle alerts button if multiple */}
          {activeAlerts.length > 1 && (
            <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700 text-xs text-slate-300">
              <button
                onClick={() => setCurrentIndex(prev => (prev > 0 ? prev - 1 : activeAlerts.length - 1))}
                className="hover:text-white px-1 font-bold"
              >
                ‹
              </button>
              <span>{currentIndex + 1}/{activeAlerts.length}</span>
              <button
                onClick={() => setCurrentIndex(prev => (prev < activeAlerts.length - 1 ? prev + 1 : 0))}
                className="hover:text-white px-1 font-bold"
              >
                ›
              </button>
            </div>
          )}

          {/* Inspect Dossier Deep-Link Button */}
          <button
            onClick={() => onInspectSecurity(currentAlert.symbol)}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md hover:shadow-indigo-500/25 cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Inspect Dossier</span>
          </button>

          {/* Drawer Toggle */}
          <button
            onClick={() => setShowDrawer(prev => !prev)}
            title="All Active Alerts"
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <Bell className="w-4 h-4" />
          </button>

          {/* Dismiss Alert */}
          <button
            onClick={(e) => handleDismiss(e, currentAlert.id)}
            title="Dismiss Alert"
            className="p-1.5 rounded-lg hover:bg-slate-800/80 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expandable Notification History Drawer */}
      {showDrawer && (
        <div className="absolute top-full left-0 right-0 mt-2 p-4 bg-slate-900/95 border border-slate-700/80 rounded-xl shadow-2xl backdrop-blur-xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <h4 className="font-bold text-white text-sm">Real-Time Market Radar Stream ({activeAlerts.length} active)</h4>
            </div>
            <button
              onClick={() => setShowDrawer(false)}
              className="text-slate-400 hover:text-white text-xs font-semibold"
            >
              Close
            </button>
          </div>

          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {activeAlerts.map(alert => (
              <div
                key={alert.id}
                className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/60 hover:border-slate-600 transition-colors flex items-start justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                      alert.severity === 'BREAKOUT' ? 'bg-emerald-500/20 text-emerald-400' :
                      alert.severity === 'RISK' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {alert.severity}
                    </span>
                    <span className="font-bold text-white text-xs">[{alert.symbol}] {alert.company_name}</span>
                    <span className="text-[10px] text-slate-400 ml-auto">{new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-xs text-slate-300 mb-1">{alert.message}</p>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400">
                    <span>Source: <strong className="text-slate-300">{alert.catalyst_source}</strong></span>
                    {alert.target_price && <span>Target: <strong className="text-emerald-400">₹{alert.target_price}</strong></span>}
                    {alert.stop_loss && <span>SL: <strong className="text-rose-400">₹{alert.stop_loss}</strong></span>}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => {
                      setShowDrawer(false);
                      onInspectSecurity(alert.symbol);
                    }}
                    className="px-2.5 py-1 rounded bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs font-semibold flex items-center gap-1"
                  >
                    Inspect
                  </button>
                  <button
                    onClick={(e) => handleDismiss(e, alert.id)}
                    className="p-1 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
