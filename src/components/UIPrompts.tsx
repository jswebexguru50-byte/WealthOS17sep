import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertTriangle, XCircle, Info, Loader2 } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  text: string;
}

interface ToastManagerProps {
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
}

export function ToastManager({ toasts, removeToast }: ToastManagerProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-md w-full">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
            className={`flex items-start gap-3 p-4 rounded-xl shadow-lg border backdrop-blur-md ${
              t.type === 'success'
                ? 'bg-slate-900/95 border-emerald-500/30 text-emerald-100 shadow-emerald-950/20'
                : t.type === 'error'
                ? 'bg-slate-900/95 border-rose-500/30 text-rose-100 shadow-rose-950/20'
                : t.type === 'warning'
                ? 'bg-slate-900/95 border-amber-500/30 text-amber-100 shadow-amber-950/20'
                : 'bg-slate-900/95 border-blue-500/30 text-blue-100 shadow-blue-950/20'
            }`}
          >
            <div className="mt-0.5">
              {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 glow-emerald" />}
              {t.type === 'error' && <XCircle className="w-5 h-5 text-rose-400 glow-rose" />}
              {t.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400" />}
              {t.type === 'info' && <Info className="w-5 h-5 text-blue-400" />}
            </div>
            <div className="flex-1 text-sm font-medium tracking-tight">
              {t.text}
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-slate-400 hover:text-slate-100 transition-colors focus:outline-none"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

interface WaitGlassProps {
  active: boolean;
  message?: string;
  subMessage?: string;
}

export function WaitGlass({ active, message = 'Processing Request...', subMessage = 'Please wait a moment while the system calculates the financial metrics...' }: WaitGlassProps) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (active) {
      timer = setInterval(() => {
        setSeconds(s => s + 1);
      }, 1000);
    } else {
      setSeconds(0);
    }
    return () => clearInterval(timer);
  }, [active]);

  if (!active) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md"
      >
        <div className="text-center max-w-md p-8 rounded-2xl glass-card border border-emerald-500/20 flex flex-col items-center">
          <div className="relative mb-6">
            <div className="absolute inset-0 rounded-full bg-emerald-500/10 blur-xl"></div>
            <Loader2 className="w-16 h-16 text-emerald-500 animate-spin glow-emerald" />
          </div>
          
          <h3 className="font-display text-xl font-semibold text-slate-100 mb-2 tracking-tight">
            {message}
          </h3>
          <p className="text-sm text-slate-400 leading-relaxed mb-4">
            {subMessage}
          </p>
          
          <div className="font-mono text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-500/10 px-3 py-1.5 rounded-full">
            Elapsed Time: {seconds}s
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
