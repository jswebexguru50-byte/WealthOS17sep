import React, { useState } from 'react';
import { Sliders, RotateCcw, AlertCircle, CheckCircle2, ShieldCheck, Scale } from 'lucide-react';
import { FORENSIC_WEIGHTS, ForensicWeights } from '../../types.js';

export const WeightCalibrator: React.FC = () => {
  const [weights, setWeights] = useState<ForensicWeights>({ ...FORENSIC_WEIGHTS });

  const totalWeight = Number(
    (
      weights.solvency +
      weights.cashFlowQuality +
      weights.operationalEfficiency +
      weights.capitalAllocation +
      weights.governance
    ).toFixed(2)
  );

  const isValidSum = Math.abs(totalWeight - 1.0) < 0.001;

  const resetWeights = () => {
    setWeights({ ...FORENSIC_WEIGHTS });
  };

  const handleSliderChange = (key: keyof ForensicWeights, val: number) => {
    setWeights((prev) => ({
      ...prev,
      [key]: Number(val.toFixed(2)),
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <Sliders className="w-6 h-6 text-emerald-400" />
              <h2 className="text-xl font-bold text-white tracking-tight">
                §3.1 Forensic Weight Calibrator & Governance Simulator
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">
              Simulate adjusting the 5 pillars of the deterministic composite business health formula.
              Per §8 Open Item #2, production weight adjustments require Quantitative Research Committee sign-off.
            </p>
          </div>

          <button
            onClick={resetWeights}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors border border-slate-700 self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Standard Weights</span>
          </button>
        </div>

        {/* Total Weight Status */}
        <div className="mt-5 flex items-center justify-between bg-slate-800/60 border border-slate-700/60 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 text-xs">
            <Scale className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-300">Sum of Pillar Weights:</span>
            <strong className={`font-mono text-sm ${isValidSum ? 'text-emerald-400' : 'text-rose-400'}`}>
              {(totalWeight * 100).toFixed(0)}%
            </strong>
          </div>
          {!isValidSum && (
            <span className="text-xs font-mono text-rose-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Must sum strictly to 100%</span>
            </span>
          )}
        </div>

        {/* Sliders Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-6">
          {/* Solvency */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">Solvency</span>
              <span className="font-mono text-cyan-400 font-bold">{(weights.solvency * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.50"
              step="0.01"
              value={weights.solvency}
              onChange={(e) => handleSliderChange('solvency', parseFloat(e.target.value))}
              className="w-full mt-3 accent-cyan-400 cursor-pointer"
            />
            <p className="text-[10px] text-slate-400 mt-2">Altman Z peer percentile</p>
          </div>

          {/* Cash Flow Quality */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">Cash Flow Quality</span>
              <span className="font-mono text-emerald-400 font-bold">
                {(weights.cashFlowQuality * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.50"
              step="0.01"
              value={weights.cashFlowQuality}
              onChange={(e) => handleSliderChange('cashFlowQuality', parseFloat(e.target.value))}
              className="w-full mt-3 accent-emerald-400 cursor-pointer"
            />
            <p className="text-[10px] text-slate-400 mt-2">CFO vs PAT divergence</p>
          </div>

          {/* Operational Efficiency */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">Operational Efficiency</span>
              <span className="font-mono text-indigo-400 font-bold">
                {(weights.operationalEfficiency * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.50"
              step="0.01"
              value={weights.operationalEfficiency}
              onChange={(e) => handleSliderChange('operationalEfficiency', parseFloat(e.target.value))}
              className="w-full mt-3 accent-indigo-400 cursor-pointer"
            />
            <p className="text-[10px] text-slate-400 mt-2">Asset turnover & WC days</p>
          </div>

          {/* Capital Allocation */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">Capital Allocation</span>
              <span className="font-mono text-amber-400 font-bold">
                {(weights.capitalAllocation * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.50"
              step="0.01"
              value={weights.capitalAllocation}
              onChange={(e) => handleSliderChange('capitalAllocation', parseFloat(e.target.value))}
              className="w-full mt-3 accent-amber-400 cursor-pointer"
            />
            <p className="text-[10px] text-slate-400 mt-2">ROCE vs WACC spread</p>
          </div>

          {/* Governance */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">Governance</span>
              <span className="font-mono text-purple-400 font-bold">{(weights.governance * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.50"
              step="0.01"
              value={weights.governance}
              onChange={(e) => handleSliderChange('governance', parseFloat(e.target.value))}
              className="w-full mt-3 accent-purple-400 cursor-pointer"
            />
            <p className="text-[10px] text-slate-400 mt-2">Pledge & auditor audit</p>
          </div>
        </div>
      </div>

      {/* Governance Process Note (§8 Open Item #2) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-xs text-slate-300">
        <div className="flex items-center gap-2 font-semibold text-emerald-400 mb-2">
          <ShieldCheck className="w-4 h-4" />
          <span>Governance & Recalibration Procedure (§8 Open Item #2)</span>
        </div>
        <p className="leading-relaxed text-slate-400">
          The 5 weights are stored as explicit constants in <code className="font-mono text-slate-200">ForensicScoringService.ts</code>.
          Any proposal to modify pillar weighting must be submitted to the Quantitative Research Committee with backtested
          simulations across 10 years of market data to ensure predictive stability and avoid curve-fitting.
        </p>
      </div>
    </div>
  );
};
