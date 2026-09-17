import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDangerous = false,
  onConfirm,
  onCancel
}: ConfirmationModalProps) {
  const [confirmInput, setConfirmInput] = useState('');

  // Reset input when modal open state changes
  useEffect(() => {
    if (!isOpen) {
      setConfirmInput('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isDisabled = isDangerous && confirmInput.trim() !== 'DELETE';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
        />

        {/* Modal Panel */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-800/60">
            <h3 className="font-display font-bold text-slate-100 text-base flex items-center gap-2">
              <AlertTriangle className={`w-5 h-5 ${isDangerous ? 'text-rose-500' : 'text-amber-500'}`} />
              {title}
            </h3>
            <button
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 text-slate-300 text-sm leading-relaxed space-y-4 whitespace-pre-line">
            {message}
          </div>

          {/* Confirm Guard input field */}
          {isDangerous && (
            <div className="px-6 pb-6 space-y-2">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                To verify, type <span className="text-rose-500 font-bold select-all">DELETE</span> below:
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="Type DELETE..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-rose-500/50 transition-colors"
                autoComplete="off"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 p-5 bg-slate-950/40 border-t border-slate-800/60">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-slate-400 border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              {cancelText}
            </button>
            <button
              type="button"
              disabled={isDisabled}
              onClick={async () => {
                if (isDangerous) {
                  try {
                    await fetch('/api/backup', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ tag: 'pre_deletion_guard' })
                    });
                  } catch (e) {
                    console.warn('Backup trigger warning:', e);
                  }
                }
                onConfirm();
                onCancel();
              }}
              className={`px-5 py-2 font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md ${
                isDisabled
                  ? 'bg-rose-950 text-rose-500/50 border border-rose-900/50 cursor-not-allowed opacity-50'
                  : isDangerous
                  ? 'bg-rose-500 hover:bg-rose-600 text-white'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
