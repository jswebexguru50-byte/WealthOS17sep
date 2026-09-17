import React, { useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Minimize2,
  ExternalLink,
  Activity,
  Target,
  Shield,
  Clock,
  TrendingUp,
  Sparkles,
  Layers,
  Radio,
  Sliders
} from 'lucide-react';

interface TradingViewChartWidgetProps {
  symbol: string;
  height?: number | string;
  interval?: '30' | '60' | 'D' | 'W' | 'M';
  theme?: 'dark' | 'light';
  currentPrice?: number;
  changePct?: number;
  supportPrice?: number;
  resistancePrice?: number;
  momentumScore?: number;
  momentumLevel?: string;
  smasScore?: number;
  showOverlayStats?: boolean;
}

export const TradingViewChartWidget: React.FC<TradingViewChartWidgetProps> = ({
  symbol,
  height = 500,
  interval = 'D',
  theme = 'dark',
  currentPrice,
  changePct,
  supportPrice,
  resistancePrice,
  momentumScore,
  momentumLevel,
  smasScore,
  showOverlayStats = true
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeInterval, setActiveInterval] = useState<'30' | '60' | 'D' | 'W' | 'M'>(interval);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFiboOverlay, setShowFiboOverlay] = useState(false);
  const [exchange, setExchange] = useState<'BSE' | 'NSE'>('BSE');
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [liveTick, setLiveTick] = useState<{ price: number; changePct: number; timestamp: string } | null>(null);

  // Normalize symbol to TradingView format
  const getTradingViewSymbol = (rawSymbol: string, ex: 'BSE' | 'NSE'): string => {
    if (!rawSymbol) return 'NSE:NIFTY';
    const clean = rawSymbol.toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '').trim();

    // Check US stocks
    const usStocks = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'BRK.B', 'VOO', 'QQQ', 'SPY', 'VGT', 'SCHG'];
    if (usStocks.includes(clean) || clean.startsWith('US-') || clean.startsWith('US:')) {
      const usClean = clean.replace(/^US[:-]/, '').replace('.', '_');
      return usClean === 'BRK_B' ? 'NYSE:BRK.B' : `NASDAQ:${usClean}`;
    }

    if (clean === '^NSEI' || clean === 'NIFTY' || clean === 'NIFTY 50') return 'NSE:NIFTY';
    if (clean === '^BSESN' || clean === 'SENSEX') return 'BSE:SENSEX';
    if (clean === '^NSEBANK' || clean === 'BANKNIFTY') return 'NSE:BANKNIFTY';

    // Default to BSE for embed (BSE has unrestricted free embed on TradingView)
    return `${ex}:${clean}`;
  };

  const cleanSym = symbol.toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
  const tvSymbol = getTradingViewSymbol(symbol, exchange);

  // Real-time WebSocket connection to /ws/live-market
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      ws = new WebSocket(`${protocol}//${host}/ws/live-market`);

      ws.onopen = () => {
        setIsWsConnected(true);
        ws?.send(JSON.stringify({ action: 'subscribe', symbols: [cleanSym] }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'tick' && msg.symbol === cleanSym) {
            setLiveTick({
              price: msg.price,
              changePct: msg.changePct,
              timestamp: msg.timestamp
            });
          }
        } catch (_) {}
      };

      ws.onclose = () => setIsWsConnected(false);
      ws.onerror = () => setIsWsConnected(false);
    } catch (_) {}

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [cleanSym]);

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = '';

    const widgetContainer = document.createElement('div');
    const widgetId = `tradingview_${Math.random().toString(36).substring(7)}`;
    widgetContainer.id = widgetId;
    widgetContainer.style.width = '100%';
    widgetContainer.style.height = '100%';
    containerRef.current.appendChild(widgetContainer);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      if (typeof (window as any).TradingView !== 'undefined') {
        new (window as any).TradingView.widget({
          autosize: true,
          symbol: tvSymbol,
          interval: activeInterval,
          timezone: 'Asia/Kolkata',
          theme: theme === 'dark' ? 'dark' : 'light',
          style: '1',
          locale: 'en',
          toolbar_bg: theme === 'dark' ? '#0f172a' : '#f8fafc',
          enable_publishing: false,
          allow_symbol_change: true,
          container_id: widgetId,
          hide_side_toolbar: false,
          studies: [
            'RSI@tv-basicstudies',
            'MASimple@tv-basicstudies',
            'BollingerBands@tv-basicstudies'
          ],
          disabled_features: ['header_symbol_search'],
          enabled_features: ['study_templates', 'use_localstorage_for_settings']
        });
      }
    };

    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [tvSymbol, activeInterval, theme]);

  // Compute Fibonacci Retracement Levels
  const low = supportPrice || 1000;
  const high = resistancePrice || low * 1.15;
  const diff = high - low;
  const fiboLevels = [
    { label: '0.0% (Low / Support)', price: low, color: '#10B981' },
    { label: '23.6%', price: low + diff * 0.236, color: '#34D399' },
    { label: '38.2%', price: low + diff * 0.382, color: '#60A5FA' },
    { label: '50.0% (Equilibrium)', price: low + diff * 0.50, color: '#FBBF24' },
    { label: '61.8% (Golden Ratio)', price: low + diff * 0.618, color: '#F97316' },
    { label: '78.6%', price: low + diff * 0.786, color: '#FB7185' },
    { label: '100.0% (High / Resistance)', price: high, color: '#EF4444' }
  ];

  // Compute authentic display price (rejecting any implausible outlier simulated ticks)
  const isTickPlausible = liveTick && (!currentPrice || Math.abs(liveTick.price - currentPrice) / currentPrice < 0.12);
  const displayPrice = isTickPlausible ? liveTick.price : (currentPrice || liveTick?.price);
  const displayChangePct = isTickPlausible ? liveTick.changePct : (changePct !== undefined ? changePct : liveTick?.changePct);

  return (
    <div className={`relative flex flex-col rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 transition-all ${
      isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''
    }`}>
      {/* ── Header HUD Bar ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 gap-2">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="font-mono font-black text-sm text-white tracking-wide flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            {tvSymbol}
          </span>

          {/* Live Tick / Authentic Price Indicator */}
          {displayPrice !== undefined ? (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800/90 border border-slate-700 text-xs shadow-sm">
              <span className={`w-2 h-2 rounded-full ${isWsConnected && isTickPlausible ? 'bg-emerald-400 animate-pulse' : 'bg-cyan-400'}`} />
              <span className="font-mono text-slate-100 font-bold">
                ₹{displayPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              {displayChangePct !== undefined && (
                <span className={`font-mono text-[11px] font-semibold ${displayChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ({displayChangePct > 0 ? '+' : ''}{displayChangePct.toFixed(2)}%)
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700 text-[10px]">
              <span className={`w-2 h-2 rounded-full ${isWsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
              <span className="font-mono text-slate-300">Live Feed</span>
            </div>
          )}

          {/* Interval Selector */}
          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800">
            {(['30', '60', 'D', 'W', 'M'] as const).map(int => (
              <button
                key={int}
                onClick={() => setActiveInterval(int)}
                className={`px-2 py-0.5 text-xs font-mono font-bold rounded-md transition-all ${
                  activeInterval === int
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                {int === '30' ? '30m' : int === '60' ? '1h' : int}
              </button>
            ))}
          </div>

          {/* Fibonacci Toggle */}
          <button
            onClick={() => setShowFiboOverlay(!showFiboOverlay)}
            className={`px-2 py-0.5 text-xs font-mono font-bold rounded-md border transition-all flex items-center gap-1 ${
              showFiboOverlay
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'text-slate-400 border-slate-800 hover:text-white'
            }`}
            title="Toggle Fibonacci Retracement Price Matrix"
          >
            <Sliders className="w-3 h-3" /> Fib
          </button>

          {/* Exchange Switcher */}
          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800">
            {(['BSE', 'NSE'] as const).map(ex => (
              <button
                key={ex}
                onClick={() => setExchange(ex)}
                className={`px-1.5 py-0.5 text-[11px] font-mono font-bold rounded transition-all cursor-pointer ${
                  exchange === ex
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
                title={`Switch feed to ${ex}`}
              >
                {ex}
              </button>
            ))}
          </div>

          {/* Direct TradingView.com link */}
          <a
            href={`https://www.tradingview.com/chart/?symbol=${cleanSym.startsWith('US') ? tvSymbol : `NSE:${cleanSym}`}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-0.5 text-xs font-mono font-bold rounded-md bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 flex items-center gap-1 transition-all"
            title="Open live chart on TradingView.com"
          >
            <span>TV Web</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Live HUD Badges & Fullscreen Action */}
        <div className="flex items-center gap-2">
          {showOverlayStats && (
            <>
              {momentumScore !== undefined && (
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Momentum</span>
                  <span className="font-mono font-black text-xs text-blue-400">{momentumScore}/100</span>
                </div>
              )}

              {smasScore !== undefined && (
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400">SMAS</span>
                  <span className={`font-mono font-black text-xs ${smasScore >= 60 ? 'text-emerald-400' : smasScore <= 40 ? 'text-rose-400' : 'text-slate-400'}`}>
                    {smasScore}/100
                  </span>
                </div>
              )}

              {supportPrice && (
                <div className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs font-mono">
                  <Shield className="w-3 h-3 text-emerald-400" /> ₹{supportPrice.toFixed(2)}
                </div>
              )}

              {resistancePrice && (
                <div className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs font-mono">
                  <Target className="w-3 h-3 text-rose-400" /> ₹{resistancePrice.toFixed(2)}
                </div>
              )}
            </>
          )}

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Chart'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── Fibonacci Matrix Overlay Drawer ─────────────────────────── */}
      {showFiboOverlay && (
        <div className="p-3 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between overflow-x-auto gap-4 text-xs font-mono">
          <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider whitespace-nowrap">
            📐 Fibonacci Retracements:
          </div>
          <div className="flex items-center gap-3">
            {fiboLevels.map(f => (
              <div key={f.label} className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: f.color }} />
                <span className="text-[10px] text-slate-400">{f.label}:</span>
                <span className="font-bold text-white">₹{f.price.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TradingView Interactive Embed Canvas ───────────────────── */}
      <div
        ref={containerRef}
        style={{ height: isFullscreen ? 'calc(100vh - 48px)' : height }}
        className="w-full relative"
      />
    </div>
  );
};
