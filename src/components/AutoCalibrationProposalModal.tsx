import React, { useState, useEffect } from 'react';
import {
  BrainCircuit,
  CheckCircle2,
  XCircle,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Zap,
  Layers,
  X
} from 'lucide-react';

interface AutoCalibrationProposal {
  id: string;
  created_at: string;
  trigger_reason: string;
  attribution_summary: string;
  old_weights_json: string;
  proposed_weights_json: string;
  simulated_winrate_delta_pct: number;
  brier_score_improvement: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

interface AutoCalibrationProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProposalApproved?: () => void;
}

export const AutoCalibrationProposalModal: React.FC<AutoCalibrationProposalModalProps> = ({
  isOpen,
  onClose,
  onProposalApproved
}) => {
  const [proposals, setProposals] = useState<AutoCalibrationProposal[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchProposals = () => {
    setLoading(true);
    fetch('/api/scrip-dossier/calibration/proposals')
      .then(res => res.json())
      .then(json => {
        if (json.success && Array.isArray(json.data)) {
          setProposals(json.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isOpen) {
      fetchProposals();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const pendingProposals = proposals.filter(p => p.status === 'PENDING');
  const activeProposal = pendingProposals[0] || proposals[0];

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/scrip-dossier/calibration/proposals/${id}/approve`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        fetchProposals();
        onProposalApproved?.();
      }
    } catch {}
    setProcessingId(null);
  };

  const handleReject = async (id: string) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/scrip-dossier/calibration/proposals/${id}/reject`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        fetchProposals();
      }
    } catch {}
    setProcessingId(null);
  };

  const parseWeights = (jsonStr: string) => {
    try {
      return JSON.parse(jsonStr);
    } catch {
      return {};
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-950/80 via-slate-900 to-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Auto-Calibration Governance Proposal
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Human-in-the-Loop
                </span>
              </h3>
              <p className="text-xs text-slate-400">Review and ratify algorithmic weight mutations before production rollout</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">Loading calibration proposals...</div>
          ) : !activeProposal ? (
            <div className="py-12 text-center space-y-2">
              <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">All Models in Optimal Calibration</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                The attribution delta engine has detected no systemic divergence. Current factor weights are tracking within calibrated error bounds.
              </p>
            </div>
          ) : (
            <>
              {/* Proposal Trigger & Attribution Rationale */}
              <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" /> Trigger: {activeProposal.trigger_reason}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                    activeProposal.status === 'PENDING' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                    activeProposal.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                    'bg-slate-700 text-slate-400'
                  }`}>
                    {activeProposal.status}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {activeProposal.attribution_summary}
                </p>
              </div>

              {/* Simulated Metrics Card */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-slate-400">Simulated Out-of-Sample Win Rate</div>
                    <div className="text-lg font-black text-emerald-400 flex items-center gap-1">
                      +{activeProposal.simulated_winrate_delta_pct}% Delta
                    </div>
                  </div>
                  <TrendingUp className="w-6 h-6 text-emerald-400/60" />
                </div>
                <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-slate-400">Brier Score Uncertainty Reduction</div>
                    <div className="text-lg font-black text-blue-400 flex items-center gap-1">
                      -{activeProposal.brier_score_improvement.toFixed(3)} (Sharper)
                    </div>
                  </div>
                  <ShieldCheck className="w-6 h-6 text-blue-400/60" />
                </div>
              </div>

              {/* Side-by-Side Weight Diff Table */}
              <div>
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" /> Factor Weight Mutation Matrix
                </h4>
                <div className="rounded-xl border border-slate-700/80 overflow-hidden bg-slate-900/50">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-800/80 text-slate-400 font-semibold border-b border-slate-700">
                      <tr>
                        <th className="px-3.5 py-2">Pillar</th>
                        <th className="px-3.5 py-2 text-center">Current Weight</th>
                        <th className="px-3.5 py-2 text-center">Proposed Weight</th>
                        <th className="px-3.5 py-2 text-right">Mutation Delta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {Object.entries(parseWeights(activeProposal.proposed_weights_json)).map(([key, newW]) => {
                        const oldW = parseWeights(activeProposal.old_weights_json)[key] ?? newW;
                        const delta = (Number(newW) - Number(oldW));
                        const label = key.replace(/Weight$/, '').replace(/([A-Z])/g, ' $1');

                        return (
                          <tr key={key} className="hover:bg-slate-800/30">
                            <td className="px-3.5 py-2 font-medium text-white capitalize">{label}</td>
                            <td className="px-3.5 py-2 text-center text-slate-400">{Number(oldW)}%</td>
                            <td className="px-3.5 py-2 text-center font-bold text-white">{Number(newW)}%</td>
                            <td className="px-3.5 py-2 text-right">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                delta > 0 ? 'bg-emerald-500/20 text-emerald-400' :
                                delta < 0 ? 'bg-rose-500/20 text-rose-400' :
                                'bg-slate-700 text-slate-300'
                              }`}>
                                {delta > 0 ? `+${delta}%` : delta < 0 ? `${delta}%` : '0%'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        {activeProposal && activeProposal.status === 'PENDING' && (
          <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
            <button
              onClick={() => handleReject(activeProposal.id)}
              disabled={Boolean(processingId)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <XCircle className="w-4 h-4 text-slate-400" />
              <span>Reject Proposal</span>
            </button>

            <button
              onClick={() => handleApprove(activeProposal.id)}
              disabled={Boolean(processingId)}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-lg hover:shadow-emerald-500/25 cursor-pointer flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{processingId === activeProposal.id ? 'Applying...' : 'Approve & Mutate Production Weights'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
