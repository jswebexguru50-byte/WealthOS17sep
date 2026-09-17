import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  TrendingUp,
  TrendingDown,
  Info,
  Calendar,
  XCircle,
  Hash,
  Activity,
  History,
  Inbox
} from 'lucide-react';

interface BuyLot {
  date: string;
  portfolio: string;
  isin: string;
  symbol: string;
  original_qty: number;
  remaining_qty: number;
  price: number;
  unrealized_pnl: number;
  unrealized_pct: number;
  holding_days: number;
}

interface MatchLot {
  buy_date: string;
  matched_qty: number;
  buy_price: number;
  sell_date: string;
  sell_price: number;
  realized_pnl: number;
  holding_days: number;
  tax_category: string;
}

interface StockDrilldownProps {
  symbol: string;
  onClose: () => void;
  formatCurrency: (val: number) => string;
}

export function StockDrilldown({ symbol, onClose, formatCurrency }: StockDrilldownProps) {
  const [activeTab, setActiveTab] = useState<'BUY' | 'MATCH'>('BUY');
  const [buyLots, setBuyLots] = useState<BuyLot[]>([]);
  const [matchLots, setMatchLots] = useState<MatchLot[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchLots = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/holdings/lots?symbol=${encodeURIComponent(symbol)}`);
        const data = await res.json();
        if (data.success) {
          setBuyLots(data.buy_lots);
          setMatchLots(data.matches);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLots();
  }, [symbol]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          className="max-w-2xl w-full rounded-2xl glass-card border border-slate-800/80 p-6 space-y-4 h-[550px] flex flex-col justify-between"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800/60 pb-3 shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-semibold text-lg text-slate-100">{symbol}</span>
                <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono font-bold">FIFO LOT LEDGER</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Granular purchase lot breakdowns and matched historic realized sales.</p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-100 transition-colors focus:outline-none"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>

          {/* Toggle Tabs */}
          <div className="flex border-b border-slate-850 shrink-0">
            <button
              onClick={() => setActiveTab('BUY')}
              className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'BUY'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Remaining BUY Lots ({buyLots.filter(l => l.remaining_qty > 0).length})
            </button>
            <button
              onClick={() => setActiveTab('MATCH')}
              className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'MATCH'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Matched FIFO Sales ({matchLots.length})
            </button>
          </div>

          {/* Lot Table Body */}
          <div className="flex-1 overflow-y-auto py-3">
            {isLoading ? (
              <div className="space-y-3">
                <div className="shimmer h-12 rounded-xl"></div>
                <div className="shimmer h-12 rounded-xl"></div>
                <div className="shimmer h-12 rounded-xl"></div>
              </div>
            ) : activeTab === 'BUY' ? (
              /* Remaining Buy Lots */
              buyLots.length > 0 ? (
                <div className="space-y-3">
                  {buyLots.map((lot, idx) => {
                    const isPositive = lot.unrealized_pnl >= 0;

                    return (
                      <div key={idx} className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/60 flex items-center justify-between hover:border-slate-700 transition-all">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono text-slate-400 flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              {lot.date}
                            </span>
                            <span className="bg-slate-950 text-slate-400 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono">
                              {lot.portfolio}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs font-semibold">
                            <span className="text-slate-300">
                              Unit Cost:{' '}
                              <strong className="text-slate-200 font-mono font-bold">
                                {formatCurrency(lot.price)}
                              </strong>
                            </span>
                            <span className="text-slate-400">
                              Remaining:{' '}
                              <strong className="text-slate-200 font-mono font-bold">
                                {lot.remaining_qty.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                              </strong>{' '}
                              / {lot.original_qty.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className={`text-xs font-bold font-mono ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isPositive ? '+' : ''}{(lot.unrealized_pct || 0).toFixed(2)}% Return
                          </span>
                          <span className="block text-xs text-slate-500 font-mono">
                            {lot.holding_days} Days Held
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <Inbox className="w-8 h-8 mb-2 text-slate-600" />
                  No open buy lots found for {symbol}.
                </div>
              )
            ) : (
              /* Matched Historic Sales */
              matchLots.length > 0 ? (
                <div className="space-y-3">
                  {matchLots.map((match, idx) => {
                    const isPositive = match.realized_pnl >= 0;

                    return (
                      <div key={idx} className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/60 flex items-center justify-between hover:border-slate-700 transition-all">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                            <span className="bg-slate-950 px-1.5 py-0.5 rounded font-extrabold text-indigo-400 border border-indigo-500/15">{match.tax_category}</span>
                            <span>{match.holding_days} Days</span>
                          </div>
                          
                          <div className="text-xs text-slate-300 space-y-0.5">
                            <div className="flex items-center gap-1">
                              <span className="w-8 text-slate-500">BUY:</span>
                              <span className="font-mono font-bold">{match.buy_date}</span>
                              <span className="text-slate-500 font-mono">@ {formatCurrency(match.buy_price)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="w-8 text-slate-500">SELL:</span>
                              <span className="font-mono font-bold">{match.sell_date}</span>
                              <span className="text-slate-500 font-mono">@ {formatCurrency(match.sell_price)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-mono text-slate-400 block font-semibold">Matched Qty: {match.matched_qty.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                          <span className={`text-xs font-bold font-mono ${isPositive ? 'text-emerald-400 glow-emerald' : 'text-rose-400 glow-rose'}`}>
                            {isPositive ? '+' : ''}{formatCurrency(match.realized_pnl)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <Inbox className="w-8 h-8 mb-2 text-slate-600" />
                  No realized matching sales found for {symbol}.
                </div>
              )
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
