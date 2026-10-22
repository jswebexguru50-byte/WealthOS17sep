import React, { useState } from 'react';
import { Sparkles, Play, Building2, RotateCcw, AlertTriangle, ArrowRight } from 'lucide-react';
import { ForensicDossier } from '../../types.js';
import { DossierView } from './DossierView.js';

interface CustomAnalyzerProps {
  onAnalyzeComplete: (dossier: ForensicDossier) => void;
  p3GateSignedOff: boolean;
  onToggleP3Gate: () => void;
}

export const CustomAnalyzer: React.FC<CustomAnalyzerProps> = ({
  onAnalyzeComplete,
  p3GateSignedOff,
  onToggleP3Gate,
}) => {
  const [formData, setFormData] = useState({
    symbol: 'PIDILITIND',
    companyName: 'Pidilite Industries Limited',
    sector: 'Specialty Chemicals / Consumer Adhesives',
    currentPrice: 3120,
    marketCapCr: 158000,
    peMultiple: 78,
    trailingEps: 39.5,
    growthRatePct: 18,
    sales_t: 12400,
    sales_prev: 10800,
    cfo_t: 2100,
    netIncome_t: 1800,
    longTermDebt_t: 150,
    promoterPledgePct: 0.0,
    newsHeadline: 'Pidilite commissions new water-proofing polymers plant in Gujarat',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [resultDossier, setResultDossier] = useState<ForensicDossier | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/custom-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to analyze custom stock');
      }

      setResultDossier(json.data);
      onAnalyzeComplete(json.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Form Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-slate-800 pb-4">
          <Sparkles className="w-6 h-6 text-emerald-400" />
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Custom Security Forensic Evaluation</h2>
            <p className="text-xs text-slate-400">
              Submit custom financial parameters to run the deterministic 5-pillar composite, 6-rule viability rubric,
              and tri-scenario valuation.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Ticker Symbol</label>
              <input
                type="text"
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Company Name</label>
              <input
                type="text"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Sector</label>
              <input
                type="text"
                value={formData.sector}
                onChange={(e) => setFormData({ ...formData, sector: e.target.value })}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Current Market Price (₹)</label>
              <input
                type="number"
                value={formData.currentPrice}
                onChange={(e) => setFormData({ ...formData, currentPrice: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Market Cap (₹ Cr)</label>
              <input
                type="number"
                value={formData.marketCapCr}
                onChange={(e) => setFormData({ ...formData, marketCapCr: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Base P/E Multiple</label>
              <input
                type="number"
                value={formData.peMultiple}
                onChange={(e) => setFormData({ ...formData, peMultiple: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Trailing EPS (₹)</label>
              <input
                type="number"
                value={formData.trailingEps}
                onChange={(e) => setFormData({ ...formData, trailingEps: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Annual Sales t (₹ Cr)</label>
              <input
                type="number"
                value={formData.sales_t}
                onChange={(e) => setFormData({ ...formData, sales_t: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Annual CFO t (₹ Cr)</label>
              <input
                type="number"
                value={formData.cfo_t}
                onChange={(e) => setFormData({ ...formData, cfo_t: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Net Income t (₹ Cr)</label>
              <input
                type="number"
                value={formData.netIncome_t}
                onChange={(e) => setFormData({ ...formData, netIncome_t: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Promoter Pledge %</label>
              <input
                type="number"
                value={formData.promoterPledgePct}
                onChange={(e) => setFormData({ ...formData, promoterPledgePct: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Recent BSE Filing / News Headline</label>
            <input
              type="text"
              value={formData.newsHeadline}
              onChange={(e) => setFormData({ ...formData, newsHeadline: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800 text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold tracking-wide transition-colors shadow-sm disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <RotateCcw className="w-4 h-4 animate-spin" />
                  <span>Executing Pipeline...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Generate Forensic Dossier</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Generated Dossier View */}
      {resultDossier && (
        <div className="pt-4 border-t border-slate-800">
          <DossierView
            dossier={resultDossier}
            onUpgradeStage3={() => {}}
            p3GateSignedOff={p3GateSignedOff}
            onToggleP3Gate={onToggleP3Gate}
            isLoading={false}
          />
        </div>
      )}
    </div>
  );
};
