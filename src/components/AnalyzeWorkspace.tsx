/**
 * src/components/AnalyzeWorkspace.tsx
 *
 * Forwarding adapter to canonical #analyze/:symbol (StockIntelligenceView).
 * Replaces legacy component containing synthetic defaults with canonical evidence-backed view.
 */

import React, { useEffect, useState } from 'react';
import { StockIntelligenceView } from './StockIntelligenceView.js';
import { ScripSearchAutocomplete } from './ScripSearchAutocomplete.js';
import { WealthOSApiClient } from '../lib/apiClient.js';

export interface AnalyzeWorkspaceProps {
  initialSymbol?: string;
  onSelectSymbol?: (symbol: string) => void;
}

export const AnalyzeWorkspace: React.FC<AnalyzeWorkspaceProps> = ({
  initialSymbol,
  onSelectSymbol
}) => {
  const [symbol, setSymbol] = useState<string>(() => {
    const clean = initialSymbol ? initialSymbol.toUpperCase().replace('.NS', '').replace('.BO', '').trim() : '';
    return clean;
  });
  const [batchSymbols, setBatchSymbols] = useState('');
  const [batchJob, setBatchJob] = useState<any | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [onHandCohort, setOnHandCohort] = useState<any | null>(null);
  const [llmConfigured, setLlmConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    if (initialSymbol) {
      const clean = initialSymbol.toUpperCase().replace('.NS', '').replace('.BO', '').trim();
      setSymbol(clean);
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', `#analyze/${clean}`);
      }
    }
  }, [initialSymbol]);

  useEffect(() => {
    if (symbol) return;
    WealthOSApiClient.request<any>('/api/research-analysis/on-hand-cohort')
      .then(response => {
        if (response.data?.cohort) setOnHandCohort(response.data.cohort);
        if (typeof response.data?.llmConfigured === 'boolean') setLlmConfigured(response.data.llmConfigured);
      })
      .catch(() => {});
  }, [symbol]);

  const handleSelect = (sym: string) => {
    const clean = sym.toUpperCase().replace('.NS', '').replace('.BO', '').trim();
    if (!clean) return;
    setSymbol(clean);
    if (onSelectSymbol) onSelectSymbol(clean);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#analyze/${clean}`);
    }
  };

  const runBatchResearch = async () => {
    const symbols = [...new Set(batchSymbols.split(/[\s,;]+/).map(value => value.trim().toUpperCase().replace(/^NSE:/, '')).filter(Boolean))];
    if (!symbols.length) {
      setBatchError('Enter at least one symbol.');
      return;
    }
    setBatchError(null);
    setBatchRunning(true);
    const response = await WealthOSApiClient.request<any>('/api/research-analysis/jobs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols, asOfDate: new Date().toISOString().slice(0, 10), mode: 'LLM_IF_AVAILABLE' })
    });
    if (!response.data?.job) {
      setBatchError(response.error || 'Could not start batch research.');
      setBatchRunning(false);
      return;
    }
    let job = response.data.job;
    setBatchJob(job);
    for (let attempt = 0; attempt < 900 && ['QUEUED', 'RUNNING'].includes(job.status); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const poll = await WealthOSApiClient.request<any>(`/api/research-analysis/jobs/${encodeURIComponent(job.jobId)}`);
      if (!poll.data?.job) break;
      job = poll.data.job;
      setBatchJob(job);
    }
    if (job.status === 'FAILED') setBatchError(job.errors?.map((item: any) => `${item.symbol}: ${item.error}`).join('; ') || 'Batch failed.');
    setBatchRunning(false);
  };

  const runOnHandResearch = async () => {
    setBatchError(null);
    setBatchRunning(true);
    const response = await WealthOSApiClient.request<any>('/api/research-analysis/on-hand-jobs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asOfDate: new Date().toISOString().slice(0, 10), mode: 'LLM_IF_AVAILABLE' })
    });
    if (!response.data?.job) {
      setBatchError(response.error || 'Could not start on-hand research.');
      setBatchRunning(false);
      return;
    }
    if (response.data.cohort) setOnHandCohort(response.data.cohort);
    let job = response.data.job;
    setBatchJob(job);
    for (let attempt = 0; attempt < 7200 && ['QUEUED', 'RUNNING'].includes(job.status); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const poll = await WealthOSApiClient.request<any>(`/api/research-analysis/jobs/${encodeURIComponent(job.jobId)}`);
      if (!poll.data?.job) break;
      job = poll.data.job;
      setBatchJob(job);
    }
    if (job.status === 'FAILED') setBatchError(job.errors?.map((item: any) => `${item.symbol}: ${item.error}`).join('; ') || 'On-hand research failed.');
    setBatchRunning(false);
  };

  if (symbol) {
    return (
      <div className="w-full h-full">
        <StockIntelligenceView
          symbol={symbol}
          isOpen={true}
          onClose={() => {
            setSymbol('');
            if (typeof window !== 'undefined') {
              window.history.replaceState(null, '', '#discover');
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-black text-white tracking-tight">Canonical Stock Analysis</h2>
        <p className="text-xs text-slate-400">Search any security to inspect verified technical, fundamental, FERE and QGLP intelligence.</p>
      </div>

      <ScripSearchAutocomplete
        onSelectScrip={handleSelect}
        placeholder="Search NSE/BSE symbol, company name, or sector..."
        autoFocus
      />

      <div className="flex flex-wrap gap-2 justify-center">
        {['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'BHARTIARTL'].map((s) => (
          <button
            key={s}
            onClick={() => handleSelect(s)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-mono font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-8 p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-white">Batch Institutional Research Update</h3>
          <p className="text-[11px] text-slate-400 mt-1">Enter up to 50 NSE/BSE symbols. WealthOS rebuilds each evidence bundle, uses the configured backend LLM when available, and saves every version in the database.</p>
        </div>
        <textarea value={batchSymbols} onChange={event => setBatchSymbols(event.target.value)} rows={3} placeholder="AZAD, RRKABEL, TCS, INFY" className="w-full rounded-xl bg-slate-950 border border-slate-700 p-3 text-xs text-slate-200 font-mono focus:border-violet-500 outline-none" />
        <button onClick={runBatchResearch} disabled={batchRunning} className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold">
          {batchRunning ? 'Batch Running...' : 'Run and Save Batch Research'}
        </button>
        {batchJob && <div className="text-xs text-violet-200">{batchJob.jobId}: {batchJob.status} · {batchJob.completed}/{batchJob.total} complete · {batchJob.failed} failed{batchJob.currentSymbol ? ` · processing ${batchJob.currentSymbol}` : ''}</div>}
        {batchError && <div className="text-xs text-rose-300">{batchError}</div>}
      </div>

      <div className="p-4 rounded-2xl bg-slate-900 border border-emerald-900/60 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-white">All On-Hand Indian Equities</h3>
          <p className="text-[11px] text-slate-400 mt-1">
            Runs the same 29-question workflow in decreasing stored market-value order. Only verified NSE/BSE equity mappings are included; US and unlisted positions are reported separately.
          </p>
        </div>
        {onHandCohort && <div className="text-xs text-emerald-200">
          {onHandCohort.positions?.length || 0} eligible shares · ₹{Number(onHandCohort.totalMarketValue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })} mapped value · {onHandCohort.exclusions?.length || 0} excluded rows · valuation data through {onHandCohort.valuationAsOf || 'unknown'}
        </div>}
        {llmConfigured === false && <div className="text-[11px] text-amber-300">No backend LLM key is configured. The run will still save complete evidence bundles, but narrative 29-question reports require GEMINI_API_KEY.</div>}
        <button onClick={runOnHandResearch} disabled={batchRunning || !onHandCohort?.positions?.length} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold">
          {batchRunning ? 'Research Running...' : 'Run All On-Hand Research'}
        </button>
      </div>
    </div>
  );
};
