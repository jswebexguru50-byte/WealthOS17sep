import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  FileWarning,
  Landmark,
  ListChecks,
  TrendingDown,
  TrendingUp,
  Activity,
  GitBranch,
  Shield,
  Eye,
  Clock,
  Sparkles,
  ExternalLink,
  ChevronRight,
  BellRing,
  Layers,
  ArrowRight,
} from 'lucide-react';

export interface EvidenceDrawerItem {
  headline: string;
  sourceName?: string;
  sourceUrl?: string;
  sourceType?: string;
  documentDate?: string;
  availableAt?: string;
  periodEnd?: string;
  factId?: string;
  formula?: string;
  currentValue?: any;
  priorValue?: any;
  quote?: string;
}

export interface CompanyIntelligenceOverviewProps {
  modules: Record<string, any>;
  overview?: any;
  freshness?: any;
  monitoring?: any;
  onViewEvidence?: (item: EvidenceDrawerItem) => void;
}

const STATUS_STYLE: Record<string, string> = {
  WORKING: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  PARTIAL: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  DATA_INSUFFICIENT: 'border-slate-600 bg-slate-800 text-slate-300',
  SOURCE_UNAVAILABLE: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  IDENTITY_REVIEW: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  ERROR: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
};

function StatusBadge({ module }: { module?: any }) {
  const label = module?.dataStatus || module?.status || 'NOT_REQUESTED';
  return (
    <span className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold ${STATUS_STYLE[label] || 'border-slate-700 bg-slate-900 text-slate-400'}`}>
      {String(label).replaceAll('_', ' ')}
    </span>
  );
}

function Unavailable({ module, subject }: { module?: any; subject: string }) {
  const reasons = module?.missingRequirements?.filter(Boolean) || [];
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-xs text-slate-400">
      <div className="flex items-center gap-2">
        <CircleHelp className="h-4 w-4 shrink-0 text-slate-500" />
        <span>No sourced {subject.toLowerCase()} is available for this company.</span>
        <StatusBadge module={module} />
      </div>
      {reasons.length > 0 && <p className="mt-2 text-[11px] text-slate-500">{reasons.join(' · ')}</p>}
    </div>
  );
}

function EvidenceNote({ module }: { module?: any }) {
  const count = module?.evidenceRefs?.length ?? 0;
  const asOf = module?.dataAsOf;
  if (count === 0 && !asOf) return null;
  return <p className="text-[10px] font-mono text-slate-500">{count} evidence reference{count === 1 ? '' : 's'}{asOf ? ` · data as of ${asOf}` : ''}</p>;
}

function hasEvidence(item: any, module?: any): boolean {
  return Array.isArray(item?.evidence) ? item.evidence.length > 0 : (module?.evidenceRefs?.length ?? 0) > 0;
}

function evidenceItems(items: any[], module?: any): any[] {
  return items.filter(item => hasEvidence(item, module));
}

function formatObservedValuation(metric: any): string {
  if (metric?.current == null) return 'N/A';
  const name = String(metric.metric || '').toLowerCase();
  return name.includes('yield') ? `${metric.current}%` : `${metric.current}x`;
}

export function CompanyIntelligenceOverview({
  modules,
  overview,
  freshness,
  monitoring,
  onViewEvidence,
}: CompanyIntelligenceOverviewProps) {
  const driversModule = modules.businessDrivers;
  const deltaModule = modules.delta;
  const contradictionModule = modules.contradictions;
  const managementModule = modules.management;
  const valuationModule = modules.valuation;
  const thesisModule = modules.thesis;
  const attentionModule = modules.attention;
  const technicalModule = modules.technical;

  // When rendered without a synthetic/orchestrated 10-point overview object,
  // render the pure sourced module evidence view
  if (!overview) {
    const rawDrivers = evidenceItems(driversModule?.result?.primaryDrivers || driversModule?.result?.drivers || [], driversModule)
      .filter((driver: any) => driver.direction && driver.direction !== 'UNKNOWN')
      .slice(0, 5);
    const rawDeltas = evidenceItems(deltaModule?.result?.deltas || [], deltaModule)
      .filter((delta: any) => delta.materiality === 'HIGH' || delta.materiality === 'MEDIUM')
      .slice(0, 5);
    const rawContradictions = evidenceItems(contradictionModule?.result?.contradictions || [], contradictionModule)
      .filter((item: any) => item.status === 'OPEN' || item.status === 'EXPLAINED' || !item.status)
      .slice(0, 5);
    const rawCommitments = evidenceItems(managementModule?.result?.commitments || [], managementModule).slice(0, 5);
    const rawPillars = evidenceItems(thesisModule?.result?.pillars || [], thesisModule).slice(0, 5);
    const rawQuestions = (attentionModule?.result?.questions || []).filter((question: any) => Array.isArray(question.triggerEvidence) && question.triggerEvidence.length > 0).slice(0, 5);
    const rawAttention = (attentionModule?.result?.items || []).filter((item: any) => Array.isArray(item.relatedEvidenceIds) && item.relatedEvidenceIds.length > 0).slice(0, 5);

    const val = valuationModule?.result;
    const valuationMetrics = [val?.pe, val?.pb, val?.evEbitda, val?.dividendYield]
      .filter((metric: any) => metric?.current != null && Array.isArray(metric?.evidence) && metric.evidence.length > 0);

    return (
      <div className="space-y-6">
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/10 p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-emerald-400" /><h3 className="text-sm font-black uppercase tracking-wider text-emerald-300">Business drivers</h3></div>
              <StatusBadge module={driversModule} />
            </div>
            {rawDrivers.length > 0 ? (
              <div className="space-y-2">
                {rawDrivers.map((driver: any) => (
                  <div key={driver.driverId || driver.name} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-slate-100">{driver.name}</span>
                      <span className={`font-mono text-[10px] font-bold ${driver.direction === 'IMPROVING' ? 'text-emerald-300' : driver.direction === 'DETERIORATING' ? 'text-rose-300' : 'text-amber-300'}`}>{driver.direction}</span>
                    </div>
                    {driver.currentState && <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{driver.currentState}</p>}
                  </div>
                ))}
              </div>
            ) : <Unavailable module={driversModule} subject="business-driver evidence" />}
            <div className="mt-3"><EvidenceNote module={driversModule} /></div>
          </div>

          <div className="rounded-2xl border border-amber-500/30 bg-amber-950/10 p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-400" /><h3 className="text-sm font-black uppercase tracking-wider text-amber-300">What changed or needs attention</h3></div>
              <StatusBadge module={attentionModule || deltaModule} />
            </div>
            {rawAttention.length > 0 || rawDeltas.length > 0 ? (
              <div className="space-y-2">
                {rawAttention.map((item: any) => (
                  <div key={item.itemId || item.headline} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                    <p className="text-xs font-bold text-slate-100">{item.headline}</p>
                    {item.reasonChain?.[0] && <p className="mt-1 text-[11px] text-slate-400">{item.reasonChain[0]}</p>}
                  </div>
                ))}
                {rawDeltas.map((delta: any) => (
                  <div key={delta.deltaId || delta.item} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-slate-100">{delta.item}</span>
                      <span className="text-[10px] font-mono text-amber-300">{delta.direction} · {delta.materiality}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">{delta.explanation}</p>
                  </div>
                ))}
              </div>
            ) : <Unavailable module={attentionModule || deltaModule} subject="attention or material-change evidence" />}
            <div className="mt-3"><EvidenceNote module={attentionModule || deltaModule} /></div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><FileWarning className="h-5 w-5 text-rose-300" /><h3 className="text-sm font-black uppercase tracking-wider text-slate-200">Open contradictions</h3></div>
              <StatusBadge module={contradictionModule} />
            </div>
            {rawContradictions.length > 0 ? (
              <div className="space-y-2">
                {rawContradictions.map((item: any) => (
                  <div key={item.contradictionId || item.patternId} className="rounded-xl border border-rose-500/20 bg-slate-950/60 p-3">
                    <p className="text-xs font-bold text-slate-100">{item.observationA}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{item.observationB}</p>
                  </div>
                ))}
              </div>
            ) : <Unavailable module={contradictionModule} subject="contradiction evidence" />}
            <div className="mt-3"><EvidenceNote module={contradictionModule} /></div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-violet-300" /><h3 className="text-sm font-black uppercase tracking-wider text-slate-200">Management delivery</h3></div>
              <StatusBadge module={managementModule} />
            </div>
            {rawCommitments.length > 0 ? (
              <div className="space-y-2">
                {rawCommitments.map((commitment: any) => (
                  <div key={commitment.id || commitment.statementDate} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-100">{commitment.targetMetric || commitment.category || 'Commitment'}</span>
                      <span className="text-[10px] font-mono text-slate-400">{commitment.status || 'UNASSESSED'}</span>
                    </div>
                    {commitment.targetPeriod && <p className="mt-1 text-[11px] text-slate-400">Target period: {commitment.targetPeriod}</p>}
                  </div>
                ))}
              </div>
            ) : <Unavailable module={managementModule} subject="management commitment evidence" />}
            <div className="mt-3"><EvidenceNote module={managementModule} /></div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><Landmark className="h-5 w-5 text-cyan-300" /><h3 className="text-sm font-black uppercase tracking-wider text-slate-200">Observed valuation</h3></div>
              <StatusBadge module={valuationModule} />
            </div>
            {valuationMetrics.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {valuationMetrics.map((metric: any) => (
                  <div key={metric.metric} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <span className="block text-[10px] font-mono uppercase text-slate-500">{metric.metric}</span>
                    <span className="text-base font-black text-cyan-300">{formatObservedValuation(metric)}</span>
                  </div>
                ))}
              </div>
            ) : <Unavailable module={valuationModule} subject="valuation evidence" />}
            <div className="mt-3"><EvidenceNote module={valuationModule} /></div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-cyan-300" /><h3 className="text-sm font-black uppercase tracking-wider text-slate-200">Living thesis</h3></div>
              <StatusBadge module={thesisModule} />
            </div>
            {rawPillars.length > 0 ? (
              <div className="space-y-2">
                {rawPillars.map((pillar: any) => (
                  <div key={pillar.pillarId || pillar.title} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-slate-100">{pillar.title}</span>
                      <span className="text-[10px] font-mono text-slate-400">{pillar.status}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{pillar.explanation}</p>
                  </div>
                ))}
              </div>
            ) : <Unavailable module={thesisModule} subject="thesis evidence" />}
            <div className="mt-3"><EvidenceNote module={thesisModule} /></div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="mb-3 flex items-center gap-2"><TrendingDown className="h-5 w-5 text-amber-300" /><h3 className="text-sm font-black uppercase tracking-wider text-slate-200">Questions to investigate</h3></div>
            {rawQuestions.length > 0 ? (
              <ul className="space-y-2">
                {rawQuestions.map((question: any) => (
                  <li key={question.questionId || question.question} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-200">{question.question}</li>
                ))}
              </ul>
            ) : <Unavailable module={attentionModule} subject="evidence-triggered investigation questions" />}
            <div className="mt-3"><EvidenceNote module={attentionModule} /></div>
          </div>
        </section>
      </div>
    );
  }

  const drivers = driversModule?.result?.primaryDrivers || driversModule?.result?.drivers || [];
  const walkTheTalk = managementModule?.result?.walkTheTalkLedger || [];
  const contradictions = contradictionModule?.result?.contradictions || [];
  const pillars = thesisModule?.result?.pillars || [];
  const whyInteresting = overview?.whyInteresting || [];
  const whatChanged = overview?.whatChanged || [];
  const whatToMonitor = overview?.whatToMonitorNext || [];
  const activeWatches = monitoring?.activeWatches || [];

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'ACHIEVED':
      case 'DELIVERED':
      case 'WORKING':
      case 'FRESH':
      case 'CURRENT':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'ON_TRACK':
      case 'PARTIAL':
      case 'PARTIALLY_ACHIEVED':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'MISSED':
      case 'CHALLENGED':
      case 'CONFLICTED':
      case 'DETERIORATING':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Freshness & Uncertainty Status Bar (Checkpoint 8) ─────────────── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-200">
              Evidence Freshness & Verification Status
            </h4>
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            Strict PIT Enforced (availableAt &le; evaluation date)
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {[
            { label: 'Market Price', status: freshness?.marketPrice ?? 'UNKNOWN' },
            { label: 'Financial Results', status: freshness?.financialResults ?? 'UNKNOWN' },
            { label: 'Management Proof', status: freshness?.managementEvidence ?? 'UNKNOWN' },
            { label: 'Shareholding', status: freshness?.shareholding ?? 'UNKNOWN' },
            { label: 'Valuation', status: freshness?.valuation ?? 'UNKNOWN' },
            { label: 'Technical State', status: freshness?.technical ?? 'UNKNOWN' },
            { label: 'Corporate Events', status: freshness?.corporateEvents ?? 'UNKNOWN' },
          ].map((item) => (
            <div key={item.label} className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
              <span className="block text-[9px] font-mono text-slate-400 uppercase tracking-tight truncate">
                {item.label}
              </span>
              <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${getStatusBadgeClass(item.status)}`}>
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Q1: What Changed? (Material Snapshot Deltas) ─────────────────── */}
      <section className="rounded-2xl border border-amber-500/30 bg-amber-950/10 p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-black uppercase tracking-wider text-amber-300">
              1. What Changed Since Previous Snapshot?
            </h3>
          </div>
          <span className="text-[10px] font-mono text-amber-400/80">Time-Series Delta</span>
        </div>
        <div className="space-y-2">
          {whatChanged.map((deltaStr: string, idx: number) => (
            <div key={idx} className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-3">
              <ChevronRight className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-200 leading-relaxed font-sans">{deltaStr}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Q2: Why is this company interesting? (3-5 Grounded Observations) ── */}
      <section className="rounded-2xl border border-cyan-500/30 bg-cyan-950/10 p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-black uppercase tracking-wider text-cyan-300">
              2. Why is this company interesting?
            </h3>
          </div>
          <span className="text-[10px] font-mono text-cyan-400/80">Sourced Observations Only</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {whyInteresting.map((item: any, idx: number) => (
            <div key={idx} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-3">
              <div className="flex items-start justify-between gap-2">
                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider bg-slate-800 text-cyan-300 border border-slate-700">
                  {item.domain}
                </span>
                {onViewEvidence && (
                  <button
                    onClick={() => onViewEvidence({
                      headline: item.observation,
                      sourceName: item.evidenceRef?.sourceName ?? 'Primary Filing',
                      documentDate: item.evidenceRef?.documentDate ?? null,
                      availableAt: item.evidenceRef?.availableAt ?? null,
                      sourceType: item.evidenceRef?.sourceType ?? 'AUDITED_FINANCIAL_STATEMENT',
                    })}
                    className="flex items-center gap-1 text-[11px] font-bold text-cyan-400 hover:text-cyan-300 hover:underline cursor-pointer"
                  >
                    <Eye className="w-3 h-3" />
                    <span>View Evidence</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-100 font-medium leading-relaxed">
                {item.observation}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Q3: Business Economics & Structural Drivers ───────────────────── */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">
              3. Business Model & Economics
            </h3>
          </div>
          <span className="text-[10px] font-mono text-emerald-400">Core Value Drivers</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          {overview?.businessEconomics}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {drivers.slice(0, 6).map((driver: any) => (
            <div key={driver.driverId || driver.name} className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-bold text-slate-100 truncate">{driver.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${getStatusBadgeClass(driver.direction || 'ON_TRACK')}`}>
                    {driver.direction || 'STABLE'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-normal line-clamp-2">{driver.description}</p>
              </div>
              {onViewEvidence && (
                <button
                  onClick={() => onViewEvidence({
                    headline: `${driver.name} (${driver.direction || 'Active'})`,
                    sourceName: 'Company Driver Registry & Audited Disclosures',
                    quote: driver.description,
                  })}
                  className="mt-2 text-left text-[10px] font-mono text-cyan-400 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Eye className="w-3 h-3" />
                  <span>View Sourced Lineage</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ─── Q4: Fundamentals Trajectory & Working Capital ─────────────────── */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">
              4. Fundamentals: Multi-Year Trajectory & Working Capital
            </h3>
          </div>
          <span className="text-[10px] font-mono text-indigo-400">Audited Financial Statements</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          {overview?.fundamentalTrajectory}
        </p>
        {overview?.keyMetrics && overview.keyMetrics.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {overview.keyMetrics.map((km: any, idx: number) => (
              <div key={idx} className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-mono text-slate-500 uppercase truncate block">{km.label}</span>
                <span className="block text-base font-black text-white font-mono mt-0.5">{km.value}</span>
                <span className={`text-[10px] font-mono ${km.trend === 'DOWN' ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {km.subtext}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── Q5: Management Walk-the-Talk Ledger ────────────────────────────── */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-violet-400" />
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">
              5. Management Walk-the-Talk: Promises vs Delivery
            </h3>
          </div>
          <span className="text-[10px] font-mono text-violet-400">Verifiable Commitments</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          {overview?.managementDelivery}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] font-mono uppercase text-slate-400">
                <th className="pb-2">What Management Said</th>
                <th className="pb-2">Speaker & Date</th>
                <th className="pb-2">Target</th>
                <th className="pb-2">Subsequent Actual</th>
                <th className="pb-2">Status</th>
                <th className="pb-2 text-right">Proof</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {walkTheTalk.map((row: any) => (
                <tr key={row.commitmentId} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 pr-3 font-medium text-slate-100 max-w-xs">{row.statement}</td>
                  <td className="py-3 pr-3 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                    <div>{row.speaker}</div>
                    <div className="text-[10px] text-slate-500">{row.statementDate}</div>
                  </td>
                  <td className="py-3 pr-3 font-mono text-cyan-300 whitespace-nowrap">
                    {row.targetValue} {row.targetUnit}
                  </td>
                  <td className="py-3 pr-3 font-mono text-slate-200 max-w-[180px] truncate" title={row.subsequentActual}>
                    {row.subsequentActual || 'Pending'}
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${getStatusBadgeClass(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    {onViewEvidence && (
                      <button
                        onClick={() => onViewEvidence({
                          headline: `Commitment: ${row.statement}`,
                          sourceName: row.sourceDocument,
                          documentDate: row.statementDate,
                          availableAt: row.statementDate,
                          currentValue: row.subsequentActual,
                          quote: row.evaluationExplanation,
                          sourceUrl: row.sourceUrl,
                        })}
                        className="p-1 rounded hover:bg-slate-700 text-cyan-400 inline-flex items-center gap-1 cursor-pointer"
                        title="View Evidence"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-mono">Evidence</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── Q6 & Q7: Valuation & Technical Market State (Separated) ───────── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Valuation Lens */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Landmark className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">
                6. Valuation Lenses (Absolute & Peer Context)
              </h3>
            </div>
            <span className="text-[10px] font-mono text-cyan-400">Relative Multiple</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            {overview?.valuationContext}
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[9px] font-mono text-slate-500 uppercase block">P/E Multiple</span>
              <span className="text-base font-black text-cyan-300 font-mono">
                {overview?.valuationMetrics?.peRatio || '—'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[9px] font-mono text-slate-500 uppercase block">Peer Median</span>
              <span className="text-base font-black text-slate-400 font-mono">
                {overview?.valuationMetrics?.peerMedianPe || '—'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[9px] font-mono text-slate-500 uppercase block">Rel. Spread</span>
              <span className="text-base font-black text-amber-300 font-mono">
                {overview?.valuationMetrics?.discount || '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Technical State Lens */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">
                7. Technical Market State (Observational)
              </h3>
            </div>
            <span className="text-[10px] font-mono text-emerald-400">Non-Predictive</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            {overview?.technicalMarketState}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[9px] font-mono text-slate-500 uppercase block">Observed Support Zone</span>
              <span className="text-sm font-black text-emerald-300 font-mono">
                {overview?.technicalRanges?.support || 'Chart Level'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[9px] font-mono text-slate-500 uppercase block">Observed Resistance Zone</span>
              <span className="text-sm font-black text-rose-300 font-mono">
                {overview?.technicalRanges?.resistance || 'Chart Level'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Q8 & Q9: Contradictions & Living Thesis ───────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Contradictions */}
        <div className="rounded-2xl border border-rose-500/30 bg-rose-950/10 p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <FileWarning className="w-4 h-4 text-rose-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-rose-300">
                8. Contradictions & Evidence Tensions
              </h3>
            </div>
            <span className="text-[10px] font-mono text-rose-400">Unresolved Conflicts</span>
          </div>
          <p className="text-xs text-slate-200 leading-relaxed bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            {overview?.contradictionsSummary}
          </p>
          {contradictions.length > 0 && (
            <div className="space-y-2 mt-2">
              {contradictions.map((c: any) => (
                <div key={c.contradictionId} className="p-2.5 rounded-xl bg-slate-950 border border-rose-500/20 text-xs">
                  <div className="font-bold text-rose-300 mb-1">{c.patternId || 'Evidence Conflict'}</div>
                  <div className="text-[11px] text-slate-400">{c.observationA} vs {c.observationB}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Living Thesis */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">
                9. Living Thesis Pillars
              </h3>
            </div>
            <span className="text-[10px] font-mono text-cyan-400">
              {overview?.thesisSummary?.stance ?? 'INSUFFICIENT_EVIDENCE'}
            </span>
          </div>
          <div className="space-y-2">
            {pillars.map((p: any) => (
              <div key={p.pillarId || p.title} className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-bold text-slate-100">{p.title}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${getStatusBadgeClass(p.status === 'SUPPORTED' ? 'ACHIEVED' : 'ON_TRACK')}`}>
                    {p.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{p.summary || p.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Q10: What to Monitor Next & Monitoring Loop ──────────────────── */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <BellRing className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">
              10. What to Monitor Next & Active Watch Loop
            </h3>
          </div>
          <span className="text-[10px] font-mono text-amber-400">Continuous Evaluation</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <h4 className="text-[11px] font-mono font-bold uppercase text-slate-400 mb-2">
              Future Investigation Questions
            </h4>
            <div className="space-y-2">
              {whatToMonitor.map((q: any, idx: number) => (
                <div key={idx} className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                  <p className="text-xs text-slate-200 font-medium">{q.question}</p>
                  <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>Metric: <span className="text-cyan-300">{q.metricToWatch}</span></span>
                    <span>Trigger: <span className="text-amber-300">{q.targetOrTrigger}</span></span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-[11px] font-mono font-bold uppercase text-slate-400 mb-2">
              Active Monitoring Triggers
            </h4>
            <div className="space-y-2">
              {activeWatches.map((w: any) => (
                <div key={w.watchId} className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-slate-100">{w.subject || w.metric}</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">{w.description}</p>
                  </div>
                  <span className="px-2 py-1 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                    WATCHING
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
