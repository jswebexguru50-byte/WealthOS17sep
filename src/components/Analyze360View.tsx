import React, { useState, useEffect } from 'react';
import { Activity, Shield, FileText, Compass, AlertTriangle, CheckCircle, ArrowUpRight, TrendingUp, TrendingDown, Clock, Crosshair, Map, Bookmark, X, Zap } from 'lucide-react';
import { formatINR } from '../lib/formatters.js';
import { WealthOSApiClient, RemoteResponse } from '../lib/apiClient.js';

interface Analyze360ViewProps {
  symbol: string;
  candidateId?: string;
  signalIds?: string[];
  recommendedDate?: string;
  strategyIds?: string[];
  onClose: () => void;
}

const CHECKLIST_GROUP_LABELS: Record<string, string> = {
  Technical: 'Price and technical data',
  fundamentals: 'Fundamental data',
  QGLP: 'Quality, growth and valuation',
  FERE: 'Verified filing evidence',
  Sector: 'Sector context',
};

const CHECKLIST_FIELD_LABELS: Record<string, string> = {
  revenueGrowth: 'Revenue growth',
  fiveYearCagr: 'Five-year revenue growth',
  'profitability.operatingProfit': 'Operating profit',
  'profitability.pat': 'Profit after tax',
  'debtAndService.debtToEquity': 'Debt-to-equity',
  'debtAndService.totalBorrowings': 'Total borrowings',
  'cashFlow.cfo': 'Cash flow from operations',
  'cashFlow.freeCashFlow': 'Free cash flow',
  'cashFlow.fcfYield': 'Free-cash-flow yield',
  'efficiency.roe': 'Return on equity',
  'efficiency.roce': 'Return on capital employed',
  'holdings.promoterHolding': 'Promoter holding',
  'holdings.fiiHolding': 'Foreign institutional holding',
  'holdings.diiHolding': 'Domestic institutional holding',
  'valuation.pe': 'Price-to-earnings ratio',
  'outlook.demandOutlook': 'Demand outlook',
  'outlook.peerContext': 'Peer comparison',
  keyRisks: 'Key business risks',
  latestClose: 'Latest closing price',
  latestOhlcvDate: 'Latest price date',
  ema20: '20-day exponential moving average',
  sma20: '20-day moving average',
  sma50: '50-day moving average',
  sma200: '200-day moving average',
  rsi14: 'RSI (14)',
  atrPct: 'Average trading range',
};

const displayChecklistField = (field: string): string =>
  CHECKLIST_FIELD_LABELS[field] || field
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\./g, ' · ')
    .replace(/^./, char => char.toUpperCase());

const describeChecklistGap = (reason: string): string => {
  const descriptions: Record<string, string> = {
    NO_OHLCV: 'No daily price history has been promoted to the canonical market-data store.',
    NO_MATCHED_CFO_AND_CAPEX: 'Cash-flow and capital-expenditure facts are not available for the same reporting period.',
    NO_FERE_EVIDENCE: 'No verified filing evidence is available for this item.',
    NO_CANONICAL_FACT: 'No verified, canonical fact is available for this item.',
    SECTOR_UNMAPPED: 'The company is not yet mapped to a comparable sector index.',
    SECTOR_INDEX_OHLCV_MISSING: 'The comparable sector index has no daily price history in the canonical store.',
  };
  if (descriptions[reason]) return descriptions[reason];
  if (reason.startsWith('NO_')) return 'This item has not yet been verified and promoted into the canonical data store.';
  return 'This item cannot yet be assessed from the available verified evidence.';
};

const checklistNextAction = (group: string, reason: string): string => {
  if (reason === 'NO_OHLCV' || group === 'Technical') return 'Fetch and promote daily candles, then refresh this analysis.';
  if (group === 'FERE' || reason.includes('FERE')) return 'Collect the exchange filing and promote verified facts, then refresh this analysis.';
  if (group === 'Sector') return 'Complete sector mapping and sector-index price coverage, then refresh this analysis.';
  return 'Acquire a verified filing or approved provider fact for this metric, promote it, then refresh this analysis.';
};

const displayAcquisitionSource = (source: string): string => {
  const labels: Record<string, string> = {
    NSE_BSE_SCREENER_PUBLIC: 'Exchange and public filings',
    CanonicalFactIngestionService: 'Canonical data store',
    NSE: 'NSE filings',
    BSE: 'BSE filings',
    SCREENER: 'Public financial data',
  };
  return labels[source] || source.replace(/[_-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
};

export function Analyze360View({ symbol, candidateId, signalIds, recommendedDate, strategyIds, onClose }: Analyze360ViewProps) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeTechnicals, setIncludeTechnicals] = useState(false);
  const [refreshResult, setRefreshResult] = useState<any | null>(null);
  const [savedAnalyses, setSavedAnalyses] = useState<any[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<any | null>(null);
  const [researchJob, setResearchJob] = useState<any | null>(null);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [activeEvidenceField, setActiveEvidenceField] = useState<string | null>(null);

  const [actionResults, setActionResults] = useState<any>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const [alertType, setAlertType] = useState<'PRICE_ABOVE' | 'PRICE_BELOW'>('PRICE_ABOVE');
  const [alertTargetPrice, setAlertTargetPrice] = useState<string>('');

  useEffect(() => {
    const techSection = data?.technical;
    const price = techSection?.latestClose?.value;
    if (price) {
      setAlertTargetPrice((price * (alertType === 'PRICE_ABOVE' ? 1.03 : 0.97)).toFixed(2));
    }
  }, [data?.technical?.latestClose?.value, alertType]);

  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
      try {
        let url = `/api/analyze360/${encodeURIComponent(symbol)}`;
        const params = new URLSearchParams();
        if (candidateId) params.append('candidateId', candidateId);
        if (signalIds && signalIds.length) params.append('signalIds', signalIds.join(','));
        if (recommendedDate) params.append('recommendedDate', recommendedDate);
        if (strategyIds && strategyIds.length) params.append('strategyIds', strategyIds.join(','));
        if (includeTechnicals) {
          params.append('includeTechnicals', 'true');
          params.append('includeSectorMomentum', 'true');
        }
        if (params.toString()) url += `?${params.toString()}`;

        const response: RemoteResponse = await WealthOSApiClient.request(url);
        if (!isMounted) return;
        
        if (response.data && !response.error) {
          setData(response.data);
          setError(null);
        } else {
          setError(response.error || 'Failed to load Analyze 360 data');
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Error fetching Analyze 360 view');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchData();
    return () => { isMounted = false; };
  }, [symbol, candidateId, signalIds, recommendedDate, strategyIds, includeTechnicals]);

  const loadSavedAnalyses = async () => {
    const response: RemoteResponse<any> = await WealthOSApiClient.request(`/api/analyze360/${encodeURIComponent(symbol)}/research-analyses?limit=25`);
    if (response.data?.records) {
      setSavedAnalyses(response.data.records);
      const latestNarrative = response.data.records.find((record: any) => record.analysisMarkdown);
      setSelectedAnalysis((current: any) => current || latestNarrative || response.data.records[0] || null);
    }
  };

  useEffect(() => {
    loadSavedAnalyses().catch(() => {});
  }, [symbol]);

  const startResearchUpdate = async () => {
    setResearchError(null);
    setActionLoading(prev => ({ ...prev, researchUpdate: true }));
    const response: RemoteResponse<any> = await WealthOSApiClient.request('/api/research-analysis/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: [symbol], asOfDate: new Date().toISOString().slice(0, 10), mode: 'LLM_IF_AVAILABLE' })
    });
    if (!response.data?.job) {
      setResearchError(response.error || 'Could not start research update');
      setActionLoading(prev => ({ ...prev, researchUpdate: false }));
      return;
    }
    let job = response.data.job;
    setResearchJob(job);
    for (let attempt = 0; attempt < 180 && ['QUEUED', 'RUNNING'].includes(job.status); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const poll: RemoteResponse<any> = await WealthOSApiClient.request(`/api/research-analysis/jobs/${encodeURIComponent(job.jobId)}`);
      if (!poll.data?.job) break;
      job = poll.data.job;
      setResearchJob(job);
    }
    if (job.status === 'FAILED') setResearchError(job.errors?.map((item: any) => `${item.symbol}: ${item.error}`).join('; ') || 'Research update failed');
    await loadSavedAnalyses();
    setActionLoading(prev => ({ ...prev, researchUpdate: false }));
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
        <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <h3 className="text-lg font-bold text-white tracking-tight">Loading Analyze 360...</h3>
          <p className="text-xs text-slate-400">Fetching QGLP, fundamental, and technical evidence for {symbol}</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
        <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <h3 className="text-lg font-bold text-white">Error</h3>
          <p className="text-xs text-slate-400">{error || 'Could not retrieve Analyze 360 data'}</p>
          <button onClick={onClose} className="px-6 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold transition-all cursor-pointer">Close</button>
        </div>
      </div>
    );
  }

  const executeAction = async (actionKey: string, endpoint: string, mode: 'preview' | 'create' = 'preview') => {
    try {
      setActionLoading(prev => ({...prev, [actionKey]: true}));
      const payload: any = {
        candidateId,
        signalIds,
        strategyIds,
        mode
      };
      
      // Default alert target for Create mode
      if (endpoint === 'alert' && mode === 'create') {
         const target = parseFloat(alertTargetPrice);
         if (isNaN(target) || target <= 0) return; // Prevent submission of invalid target
         payload.params = { type: alertType, targetPrice: target };
      }

      const res = await fetch(`/api/analyze360/${encodeURIComponent(symbol)}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const resultData = await res.json();
      setActionResults(prev => ({...prev, [actionKey]: resultData}));
    } catch (e: any) {
      setActionResults(prev => ({...prev, [actionKey]: { success: false, status: 'BLOCKED', blockers: [{ reason: e.message }] }}));
    } finally {
      setActionLoading(prev => ({...prev, [actionKey]: false}));
    }
  };

  const refreshStoredData = async () => {
    try {
      setActionLoading(prev => ({ ...prev, refreshData: true }));
      setRefreshResult(null);
      const res = await fetch(`/api/analyze360/${encodeURIComponent(symbol)}/refresh-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId, signalIds, strategyIds })
      });
      const resultData = await res.json();
      setRefreshResult(resultData);
      if (resultData?.success) {
        setLoading(true);
        setError(null);
        setData(null);
        const params = new URLSearchParams();
        if (candidateId) params.append('candidateId', candidateId);
        if (signalIds && signalIds.length) params.append('signalIds', signalIds.join(','));
        if (recommendedDate) params.append('recommendedDate', recommendedDate);
        if (strategyIds && strategyIds.length) params.append('strategyIds', strategyIds.join(','));
        if (includeTechnicals) {
          params.append('includeTechnicals', 'true');
          params.append('includeSectorMomentum', 'true');
        }
        const url = `/api/analyze360/${encodeURIComponent(symbol)}${params.toString() ? `?${params.toString()}` : ''}`;
        const response: RemoteResponse = await WealthOSApiClient.request(url);
        if (response.data && !response.error) {
          setData(response.data);
        } else {
          setError(response.error || 'Failed to reload Analyze 360 data');
        }
      }
    } catch (e: any) {
      setRefreshResult({ success: false, status: 'FAILED', blockers: [{ reason: e.message || 'Refresh failed' }] });
    } finally {
      setLoading(false);
      setActionLoading(prev => ({ ...prev, refreshData: false }));
    }
  };

  const FundamentalFieldDisplay = ({ label, field, prefix = '', suffix = '' }: { label: string, field: any, prefix?: string, suffix?: string }) => {
    if (!field) return null;
    const isEvidenceVisible = activeEvidenceField === label;
    return (
      <div className="min-w-0 space-y-1 bg-slate-800/30 p-2 rounded border border-slate-700/50">
        <div className="flex items-start justify-between gap-2">
          <span className="text-slate-400 block mb-1">{label}</span>
          <button
            type="button"
            onClick={() => setActiveEvidenceField(isEvidenceVisible ? null : label)}
            className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold text-cyan-300 hover:bg-cyan-500/10 hover:text-cyan-200 focus:outline-none focus:ring-1 focus:ring-cyan-400"
            aria-expanded={isEvidenceVisible}
            aria-label={`${isEvidenceVisible ? 'Hide' : 'Show'} evidence metadata for ${label}`}
          >
            Evidence
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <div>{getStatusBadge(field.status, field.missingReason)}</div>
          {field.status === 'AVAILABLE' && field.value !== null && (
            <div className="break-words font-bold text-white">
              {prefix}{typeof field.value === 'number' && !Number.isInteger(field.value) ? field.value.toFixed(2) : field.value}{suffix}
            </div>
          )}
        </div>
        {isEvidenceVisible && (
          <div className="mt-2 space-y-1 rounded border border-slate-700 bg-slate-950/70 p-2 text-[10px] leading-relaxed">
            <div className="font-bold text-white">Evidence metadata</div>
            <div className="flex justify-between gap-2"><span className="text-slate-400">Status</span><span className={field.status === 'AVAILABLE' ? 'text-emerald-400' : 'text-amber-400'}>{field.status}</span></div>
            {field.missingReason && <div className="break-words text-amber-400"><span className="text-slate-400">Reason: </span>{field.missingReason}</div>}
            {field.provider && <div className="break-words text-cyan-300"><span className="text-slate-400">Source: </span>{field.provider}</div>}
            {field.periodType && <div className="break-words text-slate-300"><span className="text-slate-400">Period: </span>{field.periodType}</div>}
            {field.periodEnd && <div className="break-words text-slate-300"><span className="text-slate-400">As of: </span>{field.periodEnd}</div>}
            {field.availableAt && <div className="break-words text-slate-300"><span className="text-slate-400">Audited at: </span>{new Date(field.availableAt).toISOString().split('T')[0]}</div>}
          </div>
        )}
      </div>
    );
  };

  const { companyName, sector, industry, qglp, fundamental, technical, sectorMomentum, fere, actionReadiness } = data;

  const getStatusBadge = (status: string, missingReason?: string) => {
    if (status === 'AVAILABLE') return <span className="text-emerald-400 font-bold">AVAILABLE</span>;
    if (status === 'MISSING') return <span className="text-rose-400 font-bold" title={missingReason}>MISSING ({missingReason})</span>;
    if (status === 'PASS') return <span className="text-emerald-400 font-bold">PASS</span>;
    if (status === 'FAIL') return <span className="text-rose-400 font-bold">FAIL</span>;
    if (status === 'DATA_INSUFFICIENT') return <span className="text-amber-400 font-bold">DATA_INSUFFICIENT</span>;
    if (status === 'VALID') return <span className="text-emerald-400 font-bold">VALID</span>;
    if (status === 'STALE') return <span className="text-rose-400 font-bold">STALE</span>;
    return <span className="text-slate-400 font-bold">{status}</span>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 animate-fadeIn">
      <div className="bg-[#0b1120] border border-[#1e293b] rounded-3xl w-full max-w-6xl overflow-hidden flex flex-col shadow-2xl transition-all max-h-[92vh] text-[#f8fafc]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 border-b border-[#1e293b] bg-slate-900/50">
          <div className="flex flex-wrap items-center gap-2">
            <div className="p-2.5 rounded-2xl bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">
              <Compass className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white">{symbol}</h2>
                {sector && <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">{sector}</span>}
              </div>
              <p className="text-xs text-slate-400 font-medium">{companyName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <button
               onClick={startResearchUpdate}
               disabled={!!actionLoading.researchUpdate}
               className="px-3 py-2 rounded-xl bg-violet-600/90 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold border border-violet-400/40"
               title="Rebuild the Institutional-29 evidence bundle, optionally synthesize it with the configured server-side LLM, and save a versioned result in WealthOS."
             >
               {actionLoading.researchUpdate ? 'Research Running...' : 'Update Research'}
             </button>
             <button
               onClick={refreshStoredData}
               disabled={!!actionLoading.refreshData}
               className="px-3 py-2 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold border border-emerald-400/40"
               title="Rebuild canonical facts for this scrip from already stored provider snapshots. This does not spend a live Trendlyne call."
             >
               {actionLoading.refreshData ? 'Updating...' : 'Fetch / Update Scrip'}
             </button>
             <button
               onClick={() => {
                 setLoading(true);
                 setIncludeTechnicals(v => !v);
               }}
               className={`px-3 py-2 rounded-xl text-xs font-bold border ${includeTechnicals ? 'bg-cyan-600/90 border-cyan-400/40 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'}`}
               title="Load technical OHLCV and sector momentum. This can be slower if DuckDB/Python is unavailable."
             >
               {includeTechnicals ? 'Technical: ON' : 'Load Technicals'}
             </button>
             <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {refreshResult && (
            <div className={`space-y-3 rounded-xl border p-4 text-xs ${refreshResult.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-100' : 'bg-amber-500/10 border-amber-500/30 text-amber-100'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold">{refreshResult.success ? 'Acquisition complete' : 'Acquisition needs attention'}</div>
                  <div className="mt-0.5 text-slate-300">{refreshResult.result?.nextStep || 'The update finished; refresh the analysis to use any promoted facts.'}</div>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${refreshResult.success ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200'}`}>
                  {refreshResult.success ? 'UPDATED' : 'REVIEW REQUIRED'}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-slate-950/20 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Canonical facts</div>
                  <div className="mt-1 font-semibold text-white">{refreshResult.result?.factsAdded ?? refreshResult.result?.factsInserted ?? 0} added or updated</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-950/20 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Data reuse</div>
                  <div className="mt-1 font-semibold text-white">{refreshResult.result?.cached || refreshResult.result?.acquisition === 'CACHED' ? 'Reused a fresh stored snapshot' : 'Checked public sources'}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-950/20 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">MCP usage</div>
                  <div className="mt-1 font-semibold text-white">{refreshResult.mcpUsed ? 'Used only if explicitly enabled' : 'Not used'}</div>
                </div>
              </div>
              {(refreshResult.sourceOutcomes || refreshResult.sources)?.length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Sources checked</div>
                  <div className="flex flex-wrap gap-2">
                    {(refreshResult.sourceOutcomes || refreshResult.sources).map((source: any, index: number) => {
                      const status = String(source.status || source.outcome || source.mode || '').toUpperCase();
                      const unavailable = /UNAVAILABLE|FAILED|ERROR/.test(status);
                      return (
                        <span key={`${source.source || source.provider || index}-${index}`} className={`rounded-full border px-2 py-1 text-[10px] ${unavailable ? 'border-amber-400/30 bg-amber-400/10 text-amber-200' : 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100'}`}>
                          {displayAcquisitionSource(source.source || source.provider || 'Verified source')}{unavailable ? ' — unavailable' : ''}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              {!refreshResult.success && (
                <div className="text-amber-100">No new verified values were promoted. The existing analysis has been preserved; use the next recommended action above before trying again.</div>
              )}
              <details className="text-[10px] text-slate-400">
                <summary className="cursor-pointer hover:text-slate-200">Technical update details</summary>
                <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-950/40 p-2 font-mono">{JSON.stringify({ status: refreshResult.status, result: refreshResult.result, blockers: refreshResult.blockers, sources: refreshResult.sourceOutcomes || refreshResult.sources }, null, 2)}</pre>
              </details>
            </div>
          )}
          {(researchJob || researchError) && (
            <div role={researchError ? 'alert' : undefined} className={`ui-status-banner p-3 rounded-xl border text-xs ${researchError ? 'ui-status-error' : 'ui-status-info'}`}>
              {researchJob && <div className="font-bold">Research job {researchJob.jobId}: {researchJob.status} — {researchJob.completed}/{researchJob.total} completed{researchJob.currentSymbol ? `; processing ${researchJob.currentSymbol}` : ''}</div>}
              {researchError && <div>{researchError}</div>}
              {researchJob?.results?.some((item: any) => item.llmStatus === 'NOT_CONFIGURED') && <div className="mt-1">Evidence bundle was saved. No server-side LLM key was configured, so narrative synthesis was skipped.</div>}
            </div>
          )}
          
          {/* Metadata context */}
          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700 grid grid-cols-2 md:grid-cols-6 gap-4">
            <div><span className="text-[10px] text-slate-400 block uppercase">Candidate ID</span><span className="text-sm font-mono text-cyan-300 truncate block" title={candidateId || 'N/A'}>{candidateId || 'N/A'}</span></div>
            <div><span className="text-[10px] text-slate-400 block uppercase">Signal IDs</span><span className="text-sm font-mono text-cyan-300 truncate block" title={signalIds?.join(', ') || 'N/A'}>{signalIds?.length ? signalIds.join(', ') : 'N/A'}</span></div>
            <div><span className="text-[10px] text-slate-400 block uppercase">Strategy IDs</span><span className="text-sm font-mono text-cyan-300 truncate block" title={strategyIds?.join(', ') || 'N/A'}>{strategyIds?.length ? strategyIds.join(', ') : 'N/A'}</span></div>
            <div><span className="text-[10px] text-slate-400 block uppercase">Recommended</span><div className="text-sm font-bold text-slate-200">{recommendedDate || 'N/A'}</div></div>
            <div><span className="text-[10px] text-slate-400 block uppercase">Sector Momentum</span><div className="text-sm font-bold truncate">{getStatusBadge(sectorMomentum?.status, sectorMomentum?.missingReason)} <span className="text-xs text-slate-400 font-normal">({sectorMomentum?.sectorIndex || 'N/A'})</span></div></div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase">FERE Status</span>
              <div className="text-sm font-bold">{getStatusBadge(fere?.status)} <span className="text-xs text-slate-400 font-normal">({fere?.evidenceCount} ev, {fere?.documentCount} doc)</span></div>
              <div className="text-[10px] text-slate-500 truncate mt-0.5" title={fere?.topEvidenceLabels?.join(', ')}>
                {fere?.evidenceLabelStatus === 'AVAILABLE' ? fere?.topEvidenceLabels?.join(', ') : fere?.evidenceLabelStatus}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Summary Snapshot */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 col-span-1 lg:col-span-2">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2"><CheckCircle className="w-4 h-4 text-emerald-400"/><h3 className="font-bold">Summary Snapshot</h3></div>
              <div className="break-words text-sm text-slate-300 leading-relaxed border-b border-slate-800/50 pb-3">{data.summarySnapshot.summaryText}</div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs pt-1">
                <FundamentalFieldDisplay label="Revenue Growth (5Y)" field={data.summarySnapshot.revenueGrowth} suffix="%" />
                <FundamentalFieldDisplay label="Operating Profit" field={data.summarySnapshot.operatingProfit} prefix="₹" suffix=" Cr" />
                <FundamentalFieldDisplay label="PAT" field={data.summarySnapshot.pat} prefix="₹" suffix=" Cr" />
                <FundamentalFieldDisplay label="Demand Outlook" field={data.summarySnapshot.demandOutlook} />
                <FundamentalFieldDisplay label="Peers" field={data.summarySnapshot.competitivePosition} />
                <FundamentalFieldDisplay label="Capacity Risk" field={data.summarySnapshot.capacityCapability} />
                <FundamentalFieldDisplay label="Raw Mat Risk" field={data.summarySnapshot.rawMaterialRisks} />
                <FundamentalFieldDisplay label="Debt/Equity" field={data.summarySnapshot.debtAndServicing} />
                <FundamentalFieldDisplay label="CFO" field={data.summarySnapshot.cashFlowAndWorkingCapital} prefix="₹" suffix=" Cr" />
                <FundamentalFieldDisplay label="Promoter Hldg" field={data.summarySnapshot.promoterHolding} suffix="%" />
                <FundamentalFieldDisplay label="ROE" field={data.summarySnapshot.roeRoce} suffix="%" />
                <FundamentalFieldDisplay label="PE Ratio" field={data.summarySnapshot.valuation} />
                <FundamentalFieldDisplay label="Key Risks" field={data.summarySnapshot.keyRisks} />
                <FundamentalFieldDisplay label="Watch Next" field={data.summarySnapshot.whatToWatchNext} />
                <div className="space-y-1 bg-slate-800/30 p-2 rounded border border-slate-700/50"><span className="text-slate-400 block mb-1">Overall Evidence State</span><div className="font-bold text-white text-sm">{data.summarySnapshot.evidenceState || 'MISSING_CONFLICTING'}</div></div>
              </div>
            </div>

            {/* Persisted Institutional Research */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 col-span-1 lg:col-span-2">
              <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2"><Bookmark className="w-4 h-4 text-violet-400"/><h3 className="font-bold">Saved Research History</h3></div>
                <span className="text-[10px] text-slate-500">Versioned in WealthOS DB · newest first</span>
              </div>
              {savedAnalyses.length === 0 ? (
                <div className="text-xs text-slate-500">No saved Institutional-29 analysis yet. Use Update Research to create the first evidence snapshot.</div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {savedAnalyses.map((record: any) => (
                      <button key={record.analysisId} onClick={() => setSelectedAnalysis(record)} className={`w-full text-left p-2 rounded-lg border ${selectedAnalysis?.analysisId === record.analysisId ? 'border-violet-400 bg-violet-500/10' : 'border-slate-700 bg-slate-800/40'} hover:border-violet-400/60`}>
                        <div className="text-xs font-bold text-white truncate">{record.title}</div>
                        <div className="text-[10px] text-slate-400">{record.kind} · {record.asOfDate}</div>
                        <div className="text-[10px] text-slate-500">{record.validationStatus}{record.modelName ? ` · ${record.modelName}` : ''}</div>
                      </button>
                    ))}
                  </div>
                  <div className="lg:col-span-3 rounded-lg border border-slate-700 bg-slate-950/60 p-4 max-h-96 overflow-y-auto">
                    {selectedAnalysis?.analysisMarkdown ? (
                      <div className="whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{selectedAnalysis.analysisMarkdown}</div>
                    ) : selectedAnalysis ? (
                      <div className="text-xs text-slate-400">Evidence bundle saved as <span className="font-mono text-cyan-300">{selectedAnalysis.analysisId}</span>. Narrative synthesis has not yet been created for this version.</div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
            
            {/* Technical */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2"><Activity className="w-4 h-4 text-cyan-400"/><h3 className="font-bold">Technical OHLCV</h3></div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1 bg-slate-800/30 p-2 rounded border border-slate-700/50 relative group">
                   <span className="text-slate-400 block mb-1">Momentum / Freshness</span>
                   <div className="font-bold">{technical.stockMomentumStatus}</div>
                   <div>{getStatusBadge(technical.freshnessStatus)}</div>
                </div>
                <FundamentalFieldDisplay label="Latest Close" field={technical.latestClose} prefix="₹" />
                <FundamentalFieldDisplay label="Signal Gap" field={technical.gapSignalToClose} suffix="%" />
                <FundamentalFieldDisplay label="RSI (14)" field={technical.rsi14} />
                <FundamentalFieldDisplay label="ATR %" field={technical.atrPct} suffix="%" />
                <FundamentalFieldDisplay label="EMA 20" field={technical.ema20} prefix="₹" />
                <FundamentalFieldDisplay label="SMA 20" field={technical.sma20} prefix="₹" />
                <FundamentalFieldDisplay label="SMA 50" field={technical.sma50} prefix="₹" />
                <FundamentalFieldDisplay label="SMA 200" field={technical.sma200} prefix="₹" />
                <FundamentalFieldDisplay label="Return 5D" field={technical.stockReturn5D} suffix="%" />
                <FundamentalFieldDisplay label="Return 20D" field={technical.stockReturn20D} suffix="%" />
              </div>
            </div>

            {/* QGLP */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2"><Shield className="w-4 h-4 text-emerald-400"/><h3 className="font-bold">Evidence-Safe QGLP</h3></div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-slate-400">Overall Status</div><div className="text-right">{getStatusBadge(qglp.status)}</div>
                <div className="text-slate-400">Quality Pillar</div><div className="text-right">{getStatusBadge(qglp.quality.status, qglp.quality.missingFields?.join(','))}</div>
                <div className="text-slate-400">Growth Pillar</div><div className="text-right">{getStatusBadge(qglp.growth.status, qglp.growth.missingFields?.join(','))}</div>
                <div className="text-slate-400">Longevity Pillar</div><div className="text-right">{getStatusBadge(qglp.longevity.status, qglp.longevity.missingFields?.join(','))}</div>
                <div className="text-slate-400">Price Pillar</div><div className="text-right">{getStatusBadge(qglp.price.status, qglp.price.missingFields?.join(','))}</div>
                <div className="text-slate-400 mt-2 font-bold col-span-2">Reason: <span className="text-slate-300 font-normal">{qglp.reason}</span></div>
              </div>
            </div>
            
            {/* Fundamental Snapshot */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 col-span-1 lg:col-span-2">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2"><FileText className="w-4 h-4 text-amber-400"/><h3 className="font-bold">Fundamental Snapshot Template</h3></div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                
                <div className="col-span-2 md:col-span-4 border-b border-slate-800 pb-1 mt-2 font-bold text-slate-300">Growth & Profitability</div>
                <FundamentalFieldDisplay label="Revenue Growth (3Y CAGR)" field={fundamental.revenueGrowth} suffix="%" />
                <FundamentalFieldDisplay label="Revenue Growth (5Y CAGR)" field={fundamental.revenueGrowth.fiveYearCagr} suffix="%" />
                <FundamentalFieldDisplay label="Operating Profit" field={fundamental.profitability.operatingProfit} prefix="₹" suffix=" Cr" />
                <FundamentalFieldDisplay label="PAT" field={fundamental.profitability.pat} prefix="₹" suffix=" Cr" />
                
                <div className="col-span-2 md:col-span-4 border-b border-slate-800 pb-1 mt-2 font-bold text-slate-300">Debt, Cash Flow & Efficiency</div>
                <FundamentalFieldDisplay label="Debt/Equity" field={fundamental.debtAndService.debtToEquity} />
                <FundamentalFieldDisplay label="Total Borrowings" field={fundamental.debtAndService.totalBorrowings} prefix="₹" suffix=" Cr" />
                <FundamentalFieldDisplay label="CFO" field={fundamental.cashFlow.cfo} prefix="₹" suffix=" Cr" />
                <FundamentalFieldDisplay label="ROE" field={fundamental.efficiency.roe} suffix="%" />
                <FundamentalFieldDisplay label="ROCE" field={fundamental.efficiency.roce} suffix="%" />
                
                <div className="col-span-2 md:col-span-4 border-b border-slate-800 pb-1 mt-2 font-bold text-slate-300">Holdings & Valuation</div>
                <FundamentalFieldDisplay label="Promoter Holding" field={fundamental.holdings.promoterHolding} suffix="%" />
                <FundamentalFieldDisplay label="FII Holding" field={fundamental.holdings.fiiHolding} suffix="%" />
                <FundamentalFieldDisplay label="DII Holding" field={fundamental.holdings.diiHolding} suffix="%" />
                <FundamentalFieldDisplay label="PE Ratio" field={fundamental.valuation.pe} />
                
                <div className="col-span-2 md:col-span-4 border-b border-slate-800 pb-1 mt-2 font-bold text-slate-300">Outlook & Risks</div>
                <FundamentalFieldDisplay label="Demand Outlook" field={fundamental.outlook.demandOutlook} />
                <FundamentalFieldDisplay label="Peer Context" field={fundamental.outlook.peerContext} />
                <FundamentalFieldDisplay label="Key Risks" field={fundamental.keyRisks} />
                <div className="space-y-1 bg-slate-800/30 p-2 rounded border border-slate-700/50"><span className="text-slate-400 block mb-1">Final Evidence State</span><div className="font-bold text-white text-sm">{fundamental.evidenceState || 'MISSING_CONFLICTING'}</div></div>
              </div>
            </div>

            {/* Missing Data Checklist */}
            {data.missingDataChecklist && data.missingDataChecklist.length > 0 && (
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 col-span-1 lg:col-span-2">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2"><AlertTriangle className="w-4 h-4 text-rose-400"/><h3 className="font-bold">Missing Data Checklist</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                  {Object.entries(
                    data.missingDataChecklist.reduce((acc: any, item: any) => {
                      if (!acc[item.group]) acc[item.group] = [];
                      acc[item.group].push(item);
                      return acc;
                    }, {})
                  ).map(([group, items]: [string, any]) => (
                    <div key={group} className="space-y-1">
                      <div className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mb-2">{CHECKLIST_GROUP_LABELS[group] || group}</div>
                      {items.map((item: any, i: number) => (
                        <div key={i} className="flex flex-col gap-1 p-2 bg-slate-800/30 rounded border border-slate-700/50">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-200">{displayChecklistField(item.field)}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${item.severity === 'HIGH' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>{item.severity}</span>
                          </div>
                          <span className="text-[10px] text-slate-400">{describeChecklistGap(item.reason)}</span>
                          <span className="text-[10px] text-cyan-300">Next: {checklistNextAction(group, item.reason)}</span>
                          <details className="mt-1 text-[9px] text-slate-500">
                            <summary className="cursor-pointer hover:text-slate-300">Technical detail</summary>
                            <div className="mt-1 break-all font-mono">{group} · {item.field} · {item.reason}</div>
                          </details>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 col-span-1 lg:col-span-2">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2"><Zap className="w-4 h-4 text-indigo-400"/><h3 className="font-bold">Action Readiness</h3></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { key: 'canBacktest', label: 'Backtest', endpoint: 'backtest', hideCreate: true },
                  { key: 'canPaperTrade', label: 'Paper Trade', endpoint: 'paper-trade' },
                  { key: 'canCreateAlert', label: 'Alert', endpoint: 'alert' }
                ].map(({ key, label, endpoint, hideCreate }) => {
                  const action = actionReadiness[key];
                  const isLoading = actionLoading[key];
                  const result = actionResults[key];
                  const isPreviewSuccess = result?.status === 'PREVIEW' && result?.success;
                  const isCreated = result?.status === 'CREATED';
                  
                  return (
                    <div key={key} className={`p-3 rounded-xl border flex flex-col h-full ${action.enabled ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-rose-500/30 bg-rose-500/10'}`}>
                       <h4 className="font-bold text-sm">{key}</h4>
                       {action.enabled ? (
                         <div className="flex-1 flex flex-col justify-start">
                           <div className="text-emerald-400 text-xs mt-1 font-bold mb-3">READY</div>
                           {!isCreated && (
                             <div className="mt-auto space-y-2">
                               {key === 'canCreateAlert' && isPreviewSuccess && (
                                 <div className="flex flex-col gap-2 p-2 bg-slate-800/50 rounded border border-slate-700">
                                   <select 
                                     value={alertType}
                                     onChange={(e) => setAlertType(e.target.value as 'PRICE_ABOVE' | 'PRICE_BELOW')}
                                     className="bg-slate-900 border border-slate-700 rounded p-1 text-xs text-slate-300"
                                   >
                                     <option value="PRICE_ABOVE">PRICE ABOVE</option>
                                     <option value="PRICE_BELOW">PRICE BELOW</option>
                                   </select>
                                   <input 
                                     type="number" 
                                     value={alertTargetPrice}
                                     onChange={(e) => setAlertTargetPrice(e.target.value)}
                                     placeholder="Target Price"
                                     className="bg-slate-900 border border-slate-700 rounded p-1 text-xs text-slate-300"
                                   />
                                 </div>
                               )}
                               <button 
                                 onClick={() => executeAction(key, endpoint, isPreviewSuccess && !hideCreate ? 'create' : 'preview')}
                                 disabled={isLoading || (key === 'canCreateAlert' && isPreviewSuccess && (!alertTargetPrice || parseFloat(alertTargetPrice) <= 0))}
                                 className={`disabled:opacity-50 text-white text-xs font-bold py-1.5 px-3 rounded w-full transition-colors cursor-pointer ${isPreviewSuccess && !hideCreate ? 'bg-amber-600 hover:bg-amber-500' : 'bg-slate-800 hover:bg-slate-700'}`}
                               >
                                 {isLoading ? 'Executing...' : (isPreviewSuccess && !hideCreate ? `Confirm ${label}` : `Preview ${label}`)}
                               </button>
                             </div>
                           )}
                         </div>
                       ) : (
                         <div className="text-rose-400 text-xs mt-1 flex-1">
                           <span className="font-bold">BLOCKED:</span> {action.blockerReason} <br/>
                           <span className="text-[10px] opacity-80">Missing: {action.missingData?.join(', ')}</span>
                         </div>
                       )}
                       
                       {result && (
                         <div className="mt-3 pt-3 border-t border-slate-700/50 text-[10px] space-y-1">
                           <div className={`font-bold px-2 py-0.5 rounded inline-block ${result.success ? 'bg-emerald-900/50 text-emerald-300' : 'bg-rose-900/50 text-rose-300'}`}>
                             {result.status || 'ERROR'}
                           </div>
                           {result.result && Object.entries(result.result as Record<string, unknown>).map(([k, v]) => (
                             <div key={k} className="flex justify-between text-slate-400">
                               <span className="capitalize text-[9px]">{k.replace(/([A-Z])/g, ' $1')}</span>
                               <span className="text-slate-300 font-mono ml-2 truncate max-w-[130px] text-[9px]">{String(v ?? '—')}</span>
                             </div>
                           ))}
                           {(result.blockers as any[])?.length > 0 && (
                             <div className="text-rose-400 mt-1">⚠ {(result.blockers as any[])[0]?.reason}</div>
                           )}
                         </div>
                       )}
                    </div>
                  )
                })}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
