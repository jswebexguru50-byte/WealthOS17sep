/**
 * src/components/FereForensicDeepDiveModal.tsx
 *
 * Full Interactive 360° Forensic Intelligence Deep Dive Modal.
 * Connected directly to the FERE Enriched Ledger (3,559 listed equities).
 * Displays Beneish M-Score, Altman Z-Score, Piotroski F-Score, Sloan Accrual,
 * Cash Conversion Cycle, and 100% transparent statutory regulatory links (BSE/NSE/MCA/SEBI).
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  Search,
  Activity,
  CheckCircle2,
  TrendingUp,
  Clock,
  Building2,
  RefreshCw,
  Award,
  ChevronRight,
  Database
} from 'lucide-react';

interface FereStockData {
  symbol: string;
  companyName: string;
  category: string;
  marketCapCr: number;
  cmp: number;
  peRatio: number;
  rocePct: number;
  debtToEquity: number;
  promoterPledgePct: number;
  beneishMScore: number;
  beneishFlag: string;
  altmanZScore: number;
  altmanZone: string;
  piotroskiFScore: number;
  sloanAccrualRatio: number;
  cashConversionCycle: number;
  dso: number;
  dio: number;
  dpo: number;
  cfoToEbitdaPct: number;
  compositeHealth: number;
  verdict: string;
  tier: string;
  batchNumber: number;
  enrichedAt: string;
  externalLinks: {
    bseAnnouncements: string;
    nseFilings: string;
    mca21Portal: string;
    sebiSastPortal: string;
    screenerOverview: string;
  };
  provenance: {
    primaryDataSource: string;
    recencyTimestamp: string;
    infoFetched: string;
    inferenceDerived: string;
  };
}

interface FereForensicDeepDiveModalProps {
  symbol: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectSymbol?: (symbol: string) => void;
}

interface FilingEvidence {
  status: string;
  isin: string | null;
  verifiedFactCount: number;
  verifiedMetricCount: number;
  documents: Array<{ sourceUrl: string; filingTimestamp: string | null; periodEnd: string | null; sha256: string | null; status: string }>;
  metricCoverage: Array<{ metric: string; periodEnd: string | null; status: string; missingFields: string[] }>;
  missingFields: string[];
}

interface CompanyCheck {
  status: string; symbol: string; period_end: string | null; previous_period_end: string | null;
  financials: Record<string, number | null>; derived: Record<string, number | null>;
  red_flags: Array<{ rule: string; severity: string; explanation: string; evidence: Array<Record<string, unknown>> }>;
  management_commitments: Array<{ id: number; metric: string; target: number | null; unit: string | null; deadline: string | null; status: string; source_url: string }>;
  events: Array<{ event_type: string; date: string; severity: string; explanation: string; source_url: string; document_url?: string | null }>;
  missing_information: string[]; evidence: Array<{ fact_id: number; metric: string; value: number; unit: string; source_url: string; sha256: string }>;
  data_freshness: string | null; synthetic_values: number; ghost_sources: number;
  revised_at: string;
  three_year_trends: Array<{ period_end: string; revenue: number | null; ebitda: number | null; pat: number | null; cfo: number | null; ebitda_margin: number | null }>;
  changes_since_previous_card: Array<{ field: string; before: unknown; after: unknown }>;
  source_coverage: Array<{ source: string; authority: 'OFFICIAL' | 'PRIMARY' | 'SECONDARY_DISCOVERY_ONLY'; status: string }>;
}

interface ClaimCandidate { id: number; claimDate: string; sourceUrl: string; evidenceText: string; metric: string; target: number | null; unit: string | null; deadline: string | null; }

export const FereForensicDeepDiveModal: React.FC<FereForensicDeepDiveModalProps> = ({
  symbol,
  isOpen,
  onClose,
  onSelectSymbol
}) => {
  const [data, setData] = useState<FereStockData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<FilingEvidence | null>(null);
  const [companyCheck, setCompanyCheck] = useState<CompanyCheck | null>(null);
  const [searchInput, setSearchInput] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStage, setRefreshStage] = useState<string | null>(null);
  const [claimCandidates, setClaimCandidates] = useState<ClaimCandidate[]>([]);

  const fetchStockForensics = async (targetSymbol: string) => {
    if (!targetSymbol) return;
    setLoading(true);
    setError(null);
    setData(null);
    setEvidence(null);
    setCompanyCheck(null);
    try {
      const clean = targetSymbol.trim().toUpperCase().replace('.NS', '').replace('.BO', '');
      const res = await fetch(`/api/forensic/fere-stock/${encodeURIComponent(clean)}`);
      const json = await res.json();
      if (json.success && json.data) {
        if (json.data.financials && json.data.missing_information) {
          setCompanyCheck(json.data);
          fetch(`/api/forensic/fere-stock/${encodeURIComponent(clean)}/claim-candidates`).then(r => r.json())
            .then(payload => setClaimCandidates(payload.success ? payload.data : [])).catch(() => setClaimCandidates([]));
        }
        else setData(json.data);
      } else {
        setError(json.error || `No FERE forensic data available for ${targetSymbol}`);
        setEvidence(json.evidence || null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch FERE forensic details');
    } finally {
      setLoading(false);
    }
  };

  const refreshCompany = async () => {
    if (!companyCheck?.symbol || refreshing) return;
    setRefreshing(true);
    try {
      let token = sessionStorage.getItem('fere-review-token') || '';
      if (!token) token = window.prompt('Enter FERE reviewer token') || '';
      if (!token) throw new Error('Reviewer token is required');
      sessionStorage.setItem('fere-review-token', token);
      const response = await fetch(`/api/forensic/fere-stock/${encodeURIComponent(companyCheck.symbol)}/refresh`,
        { method: 'POST', headers: { 'x-fere-review-token': token } });
      if (!response.ok) throw new Error('Refresh could not be started');
      const payload = await response.json();
      const poll = async () => {
        const state = await fetch(`/api/forensic/fere-refresh/${encodeURIComponent(payload.jobId)}`).then(r => r.json());
        if (!state.success) throw new Error('Refresh status unavailable');
        setRefreshStage(state.data.stage);
        if (state.data.status === 'COMPLETED') { setRefreshing(false); await fetchStockForensics(companyCheck.symbol); return; }
        if (state.data.status === 'FAILED') throw new Error(state.data.detail || 'Refresh failed');
        window.setTimeout(() => poll().catch(err => { setError(err.message); setRefreshing(false); }), 1500);
      };
      await poll();
    } catch (err: any) {
      setError(err.message || 'Refresh could not be started');
    } finally {
      setRefreshing(false);
    }
  };

  const decideClaim = async (candidate: ClaimCandidate, decision: 'ACCEPT' | 'EDIT' | 'IGNORE') => {
    let token = sessionStorage.getItem('fere-review-token') || window.prompt('Enter FERE reviewer token') || '';
    if (!token) return;
    sessionStorage.setItem('fere-review-token', token);
    const edits: Record<string, unknown> = {};
    if (decision === 'EDIT') {
      edits.metric = window.prompt('Metric', candidate.metric) || candidate.metric;
      const target = window.prompt('Target', candidate.target == null ? '' : String(candidate.target));
      edits.target = target ? Number(target) : null;
      edits.unit = window.prompt('Unit', candidate.unit || '') || null;
      edits.deadline = window.prompt('Deadline (YYYY-MM-DD)', candidate.deadline || '') || null;
    }
    const response = await fetch(`/api/forensic/fere-claim-candidates/${candidate.id}/decision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-fere-review-token': token },
      body: JSON.stringify({ decision, edits })
    });
    if (!response.ok) { setError('Claim decision was rejected'); return; }
    setClaimCandidates(rows => rows.filter(row => row.id !== candidate.id));
  };

  useEffect(() => {
    if (isOpen && symbol) {
      setSearchInput(symbol);
      fetchStockForensics(symbol);
    }
  }, [isOpen, symbol]);

  if (!isOpen) return null;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      if (onSelectSymbol) onSelectSymbol(searchInput.trim().toUpperCase());
      fetchStockForensics(searchInput.trim().toUpperCase());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans text-slate-200">
        
        {/* Modal Top Bar */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/30">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  FERE 360° Forensic Deep Dive
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Verification required
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Filing-backed results appear only after source verification
              </p>
            </div>
          </div>

          {/* Search bar inside modal */}
          <form onSubmit={handleSearchSubmit} className="hidden sm:flex items-center gap-2 max-w-xs w-full">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
                placeholder="Search symbol (e.g. INFY)..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold font-mono transition-colors"
            >
              Audit
            </button>
          </form>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {loading && (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-sm font-mono text-slate-400">Querying FERE Enriched Ledger & Statutory Lineage...</p>
            </div>
          )}

          {error && !loading && (
            <div className="p-6 bg-red-950/30 border border-red-900/50 rounded-xl text-center space-y-2">
              <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
              <p className="text-sm font-bold text-red-200">{error}</p>
              {evidence && (
                <div className="mt-4 text-left text-xs text-slate-300 space-y-2">
                  <p>ISIN: {evidence.isin || 'unresolved'} · Filing facts: {evidence.verifiedFactCount} · Complete FERE metrics: {evidence.verifiedMetricCount}</p>
                  <p>Still needed: {evidence.missingFields.join(', ') || 'none'}</p>
                  {evidence.metricCoverage?.map((metric) => (
                    <p key={metric.metric}>{metric.metric}: {metric.status}
                      {metric.periodEnd ? ` (${metric.periodEnd})` : ''}
                      {metric.missingFields.length ? ` — missing ${metric.missingFields.join(', ')}` : ''}
                    </p>
                  ))}
                  {evidence.documents.slice(0, 10).map((document) => (
                    <a key={document.sourceUrl} href={document.sourceUrl} target="_blank" rel="noopener noreferrer"
                       className="block text-cyan-300 hover:underline break-all">
                      {document.periodEnd || 'Undated'} · {document.status} · NSE filing · {document.sourceUrl}
                    </a>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-400">The legacy FERE ledger is awaiting verified financial statements and calculation lineage.</p>
            </div>
          )}

          {data && !loading && !error && (
            <>
              {/* Header Hero Card */}
              <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-5 relative overflow-hidden shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl font-extrabold text-white font-mono tracking-tight">{data.symbol}</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                        {data.category}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono uppercase tracking-wider ${
                        data.verdict === 'STRONG_BUY'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      }`}>
                        {data.verdict}
                      </span>
                    </div>
                    <div className="text-sm text-slate-300 font-medium mt-1">{data.companyName}</div>
                  </div>

                  <div className="flex items-center gap-6 font-mono text-right">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase">Current Market Price</div>
                      <div className="text-xl font-bold text-cyan-300">₹{data.cmp.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase">Market Cap</div>
                      <div className="text-xl font-bold text-white">₹{Math.round(data.marketCapCr).toLocaleString('en-IN')} Cr</div>
                    </div>
                    <div className="pl-4 border-l border-slate-800">
                      <div className="text-[10px] text-slate-400 uppercase">FERE Health</div>
                      <div className="text-xl font-bold text-emerald-400">{data.compositeHealth}/100</div>
                    </div>
                  </div>
                </div>

                {/* Secondary Quick Metrics Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800/80 font-mono text-xs">
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400">P/E Ratio:</span> <span className="text-white font-bold">{data.peRatio > 0 ? data.peRatio.toFixed(1) : 'N/A'}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400">ROCE:</span> <span className="text-emerald-400 font-bold">{data.rocePct.toFixed(1)}%</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400">Debt / Equity:</span> <span className="text-white font-bold">{data.debtToEquity.toFixed(2)}x</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400">Promoter Pledge:</span> <span className={`font-bold ${data.promoterPledgePct === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>{data.promoterPledgePct.toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              {/* Forensic 6-Pillar Intelligence Grid */}
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  Deterministic Forensic Pillars & Diagnostic Indicators
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Pillar 1: Beneish M-Score */}
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300">Beneish M-Score</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                          data.beneishMScore < -1.78 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {data.beneishFlag}
                        </span>
                      </div>
                      <div className="text-2xl font-bold font-mono text-white mt-2">
                        {data.beneishMScore.toFixed(2)}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Threshold: &lt; -1.78 (Safe from earnings manipulation)
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-3 pt-3 border-t border-slate-800/80">
                      Calculates 8-variable index measuring asset quality, depreciation rate, and accrual expansion.
                    </p>
                  </div>

                  {/* Pillar 2: Altman Z-Score */}
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300">Altman Z-Score</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                          data.altmanZScore >= 2.99 ? 'bg-emerald-500/20 text-emerald-400' : data.altmanZScore >= 1.81 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {data.altmanZone}
                        </span>
                      </div>
                      <div className="text-2xl font-bold font-mono text-white mt-2">
                        {data.altmanZScore.toFixed(2)}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Threshold: &gt; 2.99 (Safe Zone), 1.81 - 2.99 (Grey)
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-3 pt-3 border-t border-slate-800/80">
                      Multi-variable financial solvency formula assessing working capital, retained earnings, and leverage.
                    </p>
                  </div>

                  {/* Pillar 3: Piotroski F-Score */}
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300">Piotroski F-Score</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase bg-emerald-500/20 text-emerald-400">
                          {data.piotroskiFScore >= 8 ? 'Exceptional' : data.piotroskiFScore >= 6 ? 'Strong' : 'Moderate'}
                        </span>
                      </div>
                      <div className="text-2xl font-bold font-mono text-white mt-2">
                        {data.piotroskiFScore} <span className="text-sm font-normal text-slate-500">/ 9</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        9-criterion operational and balance sheet strength test.
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-3 pt-3 border-t border-slate-800/80">
                      Verifies positive ROA, CFO &gt; Net Income, margin expansion, and asset turnover acceleration.
                    </p>
                  </div>

                  {/* Pillar 4: Sloan Accrual Ratio */}
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300">Sloan Accrual Ratio</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                          data.sloanAccrualRatio <= 10.0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {data.sloanAccrualRatio <= 10.0 ? 'Earnings High Quality' : 'High Accrual Alert'}
                        </span>
                      </div>
                      <div className="text-2xl font-bold font-mono text-white mt-2">
                        {data.sloanAccrualRatio.toFixed(1)}%
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Benchmark: &lt; 10.0% of Total Operating Assets
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-3 pt-3 border-t border-slate-800/80">
                      Ensures reported profits are backed by cash flow rather than aggressive accounting accruals.
                    </p>
                  </div>

                  {/* Pillar 5: Cash Conversion Cycle */}
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300">Cash Conversion Cycle</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase bg-cyan-500/20 text-cyan-400">
                          {data.cashConversionCycle} Days
                        </span>
                      </div>
                      <div className="text-2xl font-bold font-mono text-white mt-2">
                        {data.cashConversionCycle} <span className="text-sm font-normal text-slate-500">Days</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        DSO: {data.dso}d • DIO: {data.dio}d • DPO: {data.dpo}d
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-3 pt-3 border-t border-slate-800/80">
                      Working capital velocity: time required to convert cash invested into operating cash inflows.
                    </p>
                  </div>

                  {/* Pillar 6: CFO to EBITDA Conversion */}
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300">CFO to EBITDA Conversion</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                          data.cfoToEbitdaPct >= 70.0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {data.cfoToEbitdaPct >= 70.0 ? 'Cash Generator' : 'Moderate'}
                        </span>
                      </div>
                      <div className="text-2xl font-bold font-mono text-white mt-2">
                        {data.cfoToEbitdaPct.toFixed(1)}%
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Institutional Floor: &gt; 70.0% conversion
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-3 pt-3 border-t border-slate-800/80">
                      Eliminates paper-profit companies by demanding genuine cash conversion from operating profit.
                    </p>
                  </div>
                </div>
              </div>

              {/* Data Lineage, Recency & Provenance */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Database className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Data Lineage & Transparent Provenance
                  </h4>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-slate-400 font-semibold">Primary Source Authority:</span>
                    <p className="text-slate-200">{data.provenance.primaryDataSource}</p>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-1">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Last Verified: {new Date(data.provenance.recencyTimestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-slate-400 font-semibold">Information Ingested:</span>
                    <p className="text-slate-300 text-[11px] leading-relaxed">{data.provenance.infoFetched}</p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-800 text-xs">
                  <span className="text-slate-400 font-semibold">Inference Derived:</span>
                  <p className="text-slate-300 text-[11px] leading-relaxed mt-0.5">{data.provenance.inferenceDerived}</p>
                </div>
              </div>

              {/* Direct Statutory Regulatory Links (100% External) */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                  Direct Statutory & Regulatory Disclosure Links
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  <a
                    href={data.externalLinks.bseAnnouncements}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/60 flex items-center justify-between text-xs transition-all group"
                  >
                    <span className="font-semibold">BSE Disclosures</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-400" />
                  </a>

                  <a
                    href={data.externalLinks.nseFilings}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/60 flex items-center justify-between text-xs transition-all group"
                  >
                    <span className="font-semibold">NSE Financials</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-400" />
                  </a>

                  <a
                    href={data.externalLinks.mca21Portal}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/60 flex items-center justify-between text-xs transition-all group"
                  >
                    <span className="font-semibold">MCA-21 Master</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-400" />
                  </a>

                  <a
                    href={data.externalLinks.sebiSastPortal}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/60 flex items-center justify-between text-xs transition-all group"
                  >
                    <span className="font-semibold">SEBI SAST</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-400" />
                  </a>

                  <a
                    href={data.externalLinks.screenerOverview}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/60 flex items-center justify-between text-xs transition-all group"
                  >
                    <span className="font-semibold">Screener.in</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-400" />
                  </a>
                </div>
              </div>
            </>
          )}

          {companyCheck && !loading && !error && (
            <div className="space-y-4">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between gap-3">
                  <div><div className="text-2xl font-bold text-white">{companyCheck.symbol}</div>
                    <div className="text-xs text-slate-400">Verified Company Check · {companyCheck.period_end || 'period unavailable'}</div></div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-cyan-300">{companyCheck.status}</span>
                    <div className="text-[10px] text-slate-500">Revised {new Date(companyCheck.revised_at).toLocaleString('en-IN')}</div>
                    <button onClick={refreshCompany} disabled={refreshing}
                      className="mt-1 inline-flex items-center gap-1 rounded bg-cyan-700 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50">
                      <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} /> {refreshing ? (refreshStage || 'Refreshing') : 'Refresh data'}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
                  {Object.entries(companyCheck.financials).map(([name, value]) => (
                    <div key={name} className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                      <div className="text-[10px] uppercase text-slate-500">{name.replaceAll('_', ' ')}</div>
                      <div className="text-sm font-mono text-white">{value == null ? 'NOT AVAILABLE' : Number(value).toLocaleString('en-IN')}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                <h3 className="text-xs font-bold text-slate-300 uppercase mb-3">Three-year financial trend</h3>
                <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-slate-500">
                  <th className="text-left p-2">Period</th><th className="text-right p-2">Revenue</th><th className="text-right p-2">EBITDA</th><th className="text-right p-2">PAT</th><th className="text-right p-2">CFO</th><th className="text-right p-2">Margin</th>
                </tr></thead><tbody>{(companyCheck.three_year_trends || []).map(row => <tr key={row.period_end} className="border-t border-slate-800">
                  <td className="p-2">{row.period_end}</td>{(['revenue','ebitda','pat','cfo'] as const).map(key => <td key={key} className="p-2 text-right font-mono">{row[key] == null ? 'N/A' : Number(row[key]).toLocaleString('en-IN')}</td>)}
                  <td className="p-2 text-right">{row.ebitda_margin == null ? 'N/A' : `${(row.ebitda_margin * 100).toFixed(1)}%`}</td></tr>)}</tbody></table></div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-slate-300 uppercase mb-3">What changed</h3>
                  {(companyCheck.changes_since_previous_card || []).length === 0 ? <p className="text-sm text-slate-500">No material field changes since the previous revision.</p> :
                    companyCheck.changes_since_previous_card.slice(0, 20).map((change, index) => <div key={`${change.field}-${index}`} className="text-xs text-slate-300 mb-2"><b>{change.field}</b>: {String(change.before ?? 'N/A')} → {String(change.after ?? 'N/A')}</div>)}
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-slate-300 uppercase mb-3">Commitments awaiting review</h3>
                  {claimCandidates.length === 0 ? <p className="text-sm text-slate-500">No pending candidates.</p> : claimCandidates.map(candidate => <div key={candidate.id} className="border-b border-slate-800 pb-3 mb-3">
                    <a href={candidate.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-cyan-300">{candidate.evidenceText}</a>
                    <div className="text-xs text-slate-400 mt-1">{candidate.metric} · {candidate.target ?? 'target?'} {candidate.unit || ''}</div>
                    <div className="flex gap-2 mt-2">{(['ACCEPT','EDIT','IGNORE'] as const).map(action => <button key={action} onClick={() => decideClaim(candidate, action)} className="rounded bg-slate-800 px-2 py-1 text-[10px] text-white">{action}</button>)}</div>
                  </div>)}
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                <h3 className="text-xs font-bold text-slate-300 uppercase mb-3">Latest verified material events</h3>
                {companyCheck.events.length === 0 ? <p className="text-sm text-slate-500">No classified official events in the current archive.</p> :
                  companyCheck.events.slice(0, 15).map((event, index) => <a key={`${event.event_type}-${event.date}-${index}`} href={event.document_url || event.source_url} target="_blank" rel="noreferrer" className="block border-b border-slate-800 py-2 text-xs">
                    <span className="font-bold text-amber-300">{event.severity} · {event.event_type}</span>
                    <span className="ml-2 text-slate-500">{event.date}</span><div className="text-slate-300 mt-1">{event.explanation}</div>
                  </a>)}
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                <h3 className="text-xs font-bold text-slate-300 uppercase mb-3">Source coverage</h3>
                <div className="grid md:grid-cols-2 gap-2">{(companyCheck.source_coverage || []).map(item => <div key={item.source} className="rounded border border-slate-800 bg-slate-900 p-3">
                  <div className="text-xs font-semibold text-slate-200">{item.source}</div>
                  <div className="mt-1 text-[10px] text-slate-500">{item.authority.replaceAll('_', ' ')} · {item.status.replaceAll('_', ' ')}</div>
                </div>)}</div>
                <p className="mt-3 text-[11px] text-slate-500">Secondary sources can identify items to investigate. Card facts require a matching official or primary filing.</p>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-slate-300 uppercase mb-3">Active red flags</h3>
                  {companyCheck.red_flags.length === 0 ? <p className="text-sm text-slate-500">None from available verified data.</p> :
                    companyCheck.red_flags.map(flag => <div key={`${flag.rule}-${flag.explanation}`} className="mb-3 text-sm">
                      <div className="text-amber-300 font-bold">{flag.severity} · {flag.rule}</div><div className="text-slate-300">{flag.explanation}</div></div>)}
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-slate-300 uppercase mb-3">Management commitments</h3>
                  {companyCheck.management_commitments.length === 0 ? <p className="text-sm text-slate-500">No accepted measurable commitments.</p> :
                    companyCheck.management_commitments.map(claim => <a key={claim.id} href={claim.source_url} target="_blank" rel="noreferrer" className="block text-sm text-cyan-300 mb-2">
                      {claim.metric}: {claim.target ?? 'target unavailable'} {claim.unit || ''} · {claim.status}</a>)}
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                <h3 className="text-xs font-bold text-slate-300 uppercase mb-2">Missing information</h3>
                <p className="text-sm text-slate-400">{companyCheck.missing_information.join(', ') || 'None'}</p>
                <p className="text-xs text-slate-500 mt-2">Synthetic values: {companyCheck.synthetic_values} · Ghost sources: {companyCheck.ghost_sources} · Freshness: {companyCheck.data_freshness || 'unknown'}</p>
                <div className="mt-3 space-y-1">{companyCheck.evidence.slice(0, 20).map(fact =>
                  <a key={fact.fact_id} href={fact.source_url} target="_blank" rel="noreferrer" className="block text-xs text-cyan-300 hover:underline">{fact.metric}: {fact.value.toLocaleString('en-IN')} {fact.unit}</a>)}</div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between text-xs font-mono text-slate-400">
          <div>
            Data sourced strictly from statutory filings • Zero internal portfolio DB linkages
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};

export default FereForensicDeepDiveModal;
