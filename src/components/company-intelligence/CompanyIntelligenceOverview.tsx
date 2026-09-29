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
} from 'lucide-react';

type ModuleEnvelope = {
  status?: string;
  dataStatus?: string;
  result?: any;
  evidenceRefs?: unknown[];
  missingRequirements?: string[];
  dataAsOf?: string | null;
};

export interface CompanyIntelligenceOverviewProps {
  modules: Record<string, ModuleEnvelope | undefined>;
}

const STATUS_STYLE: Record<string, string> = {
  WORKING: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  PARTIAL: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  DATA_INSUFFICIENT: 'border-slate-600 bg-slate-800 text-slate-300',
  SOURCE_UNAVAILABLE: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  IDENTITY_REVIEW: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  ERROR: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
};

function StatusBadge({ module }: { module?: ModuleEnvelope }) {
  const label = module?.dataStatus || module?.status || 'NOT_REQUESTED';
  return (
    <span className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold ${STATUS_STYLE[label] || 'border-slate-700 bg-slate-900 text-slate-400'}`}>
      {label.replaceAll('_', ' ')}
    </span>
  );
}

function Unavailable({ module, subject }: { module?: ModuleEnvelope; subject: string }) {
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

function EvidenceNote({ module }: { module?: ModuleEnvelope }) {
  const count = module?.evidenceRefs?.length ?? 0;
  const asOf = module?.dataAsOf;
  if (count === 0 && !asOf) return null;
  return <p className="text-[10px] font-mono text-slate-500">{count} evidence reference{count === 1 ? '' : 's'}{asOf ? ` · data as of ${asOf}` : ''}</p>;
}

function hasEvidence(item: any, module?: ModuleEnvelope): boolean {
  return Array.isArray(item?.evidence) ? item.evidence.length > 0 : (module?.evidenceRefs?.length ?? 0) > 0;
}

function evidenceItems(items: any[], module?: ModuleEnvelope): any[] {
  return items.filter(item => hasEvidence(item, module));
}

function formatObservedValuation(metric: any): string {
  if (metric?.current == null) return 'N/A';
  const name = String(metric.metric || '').toLowerCase();
  return name.includes('yield') ? `${metric.current}%` : `${metric.current}x`;
}

/**
 * Overview for existing V2 company-intelligence payloads.
 *
 * This component deliberately renders only evidence-backed records. It never
 * consumes the API's compatibility `dataState`/`decisionStatus` fields because
 * those are transport state, not a statement that a company fact is available.
 */
export function CompanyIntelligenceOverview({ modules }: CompanyIntelligenceOverviewProps) {
  const driversModule = modules.businessDrivers;
  const deltaModule = modules.delta;
  const contradictionModule = modules.contradictions;
  const managementModule = modules.management;
  const valuationModule = modules.valuation;
  const thesisModule = modules.thesis;
  const attentionModule = modules.attention;

  const drivers = evidenceItems(driversModule?.result?.primaryDrivers || driversModule?.result?.drivers || [], driversModule)
    .filter((driver: any) => driver.direction && driver.direction !== 'UNKNOWN')
    .slice(0, 5);
  const deltas = evidenceItems(deltaModule?.result?.deltas || [], deltaModule)
    .filter((delta: any) => delta.materiality === 'HIGH' || delta.materiality === 'MEDIUM')
    .slice(0, 5);
  const contradictions = evidenceItems(contradictionModule?.result?.contradictions || [], contradictionModule)
    .filter((item: any) => item.status === 'OPEN' || item.status === 'EXPLAINED')
    .slice(0, 5);
  const commitments = evidenceItems(managementModule?.result?.commitments || [], managementModule).slice(0, 5);
  const pillars = evidenceItems(thesisModule?.result?.pillars || [], thesisModule).slice(0, 5);
  const questions = (attentionModule?.result?.questions || []).filter((question: any) => Array.isArray(question.triggerEvidence) && question.triggerEvidence.length > 0).slice(0, 5);
  const attention = (attentionModule?.result?.items || []).filter((item: any) => Array.isArray(item.relatedEvidenceIds) && item.relatedEvidenceIds.length > 0).slice(0, 5);

  const valuation = valuationModule?.result;
  // A multiple is a company-level fact, so module-level evidence is not enough:
  // each displayed metric must carry its own provenance.
  const valuationMetrics = [valuation?.pe, valuation?.pb, valuation?.evEbitda, valuation?.dividendYield]
    .filter((metric: any) => metric?.current != null && Array.isArray(metric?.evidence) && metric.evidence.length > 0);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/10 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-emerald-400" /><h3 className="text-sm font-black uppercase tracking-wider text-emerald-300">Business drivers</h3></div>
            <StatusBadge module={driversModule} />
          </div>
          {drivers.length > 0 ? <div className="space-y-2">{drivers.map((driver: any) => <div key={driver.driverId || driver.name} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            <div className="flex items-center justify-between gap-3"><span className="text-xs font-bold text-slate-100">{driver.name}</span><span className={`font-mono text-[10px] font-bold ${driver.direction === 'IMPROVING' ? 'text-emerald-300' : driver.direction === 'DETERIORATING' ? 'text-rose-300' : 'text-amber-300'}`}>{driver.direction}</span></div>
            {driver.currentState && <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{driver.currentState}</p>}
          </div>)}</div> : <Unavailable module={driversModule} subject="business-driver evidence" />}
          <div className="mt-3"><EvidenceNote module={driversModule} /></div>
        </div>

        <div className="rounded-2xl border border-amber-500/30 bg-amber-950/10 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-400" /><h3 className="text-sm font-black uppercase tracking-wider text-amber-300">What changed or needs attention</h3></div>
            <StatusBadge module={attentionModule || deltaModule} />
          </div>
          {attention.length > 0 || deltas.length > 0 ? <div className="space-y-2">
            {attention.map((item: any) => <div key={item.itemId || item.headline} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><p className="text-xs font-bold text-slate-100">{item.headline}</p>{item.reasonChain?.[0] && <p className="mt-1 text-[11px] text-slate-400">{item.reasonChain[0]}</p>}</div>)}
            {deltas.map((delta: any) => <div key={delta.deltaId || delta.item} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><div className="flex items-center justify-between gap-3"><span className="text-xs font-bold text-slate-100">{delta.item}</span><span className="text-[10px] font-mono text-amber-300">{delta.direction} · {delta.materiality}</span></div><p className="mt-1 text-[11px] text-slate-400">{delta.explanation}</p></div>)}
          </div> : <Unavailable module={attentionModule || deltaModule} subject="attention or material-change evidence" />}
          <div className="mt-3"><EvidenceNote module={attentionModule || deltaModule} /></div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><FileWarning className="h-5 w-5 text-rose-300" /><h3 className="text-sm font-black uppercase tracking-wider text-slate-200">Open contradictions</h3></div><StatusBadge module={contradictionModule} /></div>
          {contradictions.length > 0 ? <div className="space-y-2">{contradictions.map((item: any) => <div key={item.contradictionId || item.patternId} className="rounded-xl border border-rose-500/20 bg-slate-950/60 p-3"><p className="text-xs font-bold text-slate-100">{item.observationA}</p><p className="mt-1 text-[11px] text-slate-400">{item.observationB}</p></div>)}</div> : <Unavailable module={contradictionModule} subject="contradiction evidence" />}
          <div className="mt-3"><EvidenceNote module={contradictionModule} /></div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-violet-300" /><h3 className="text-sm font-black uppercase tracking-wider text-slate-200">Management delivery</h3></div><StatusBadge module={managementModule} /></div>
          {commitments.length > 0 ? <div className="space-y-2">{commitments.map((commitment: any) => <div key={commitment.id || commitment.statementDate} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-100">{commitment.targetMetric || commitment.category || 'Commitment'}</span><span className="text-[10px] font-mono text-slate-400">{commitment.status || 'UNASSESSED'}</span></div>{commitment.targetPeriod && <p className="mt-1 text-[11px] text-slate-400">Target period: {commitment.targetPeriod}</p>}</div>)}</div> : <Unavailable module={managementModule} subject="management commitment evidence" />}
          <div className="mt-3"><EvidenceNote module={managementModule} /></div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Landmark className="h-5 w-5 text-cyan-300" /><h3 className="text-sm font-black uppercase tracking-wider text-slate-200">Observed valuation</h3></div><StatusBadge module={valuationModule} /></div>
          {valuationMetrics.length > 0 ? <div className="grid grid-cols-2 gap-2">{valuationMetrics.map((metric: any) => <div key={metric.metric} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><span className="block text-[10px] font-mono uppercase text-slate-500">{metric.metric}</span><span className="text-base font-black text-cyan-300">{formatObservedValuation(metric)}</span></div>)}</div> : <Unavailable module={valuationModule} subject="valuation evidence" />}
          <div className="mt-3"><EvidenceNote module={valuationModule} /></div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-cyan-300" /><h3 className="text-sm font-black uppercase tracking-wider text-slate-200">Living thesis</h3></div><StatusBadge module={thesisModule} /></div>
          {pillars.length > 0 ? <div className="space-y-2">{pillars.map((pillar: any) => <div key={pillar.pillarId || pillar.title} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><div className="flex items-center justify-between gap-3"><span className="text-xs font-bold text-slate-100">{pillar.title}</span><span className="text-[10px] font-mono text-slate-400">{pillar.status}</span></div><p className="mt-1 text-[11px] leading-relaxed text-slate-400">{pillar.explanation}</p></div>)}</div> : <Unavailable module={thesisModule} subject="thesis evidence" />}
          <div className="mt-3"><EvidenceNote module={thesisModule} /></div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="mb-3 flex items-center gap-2"><TrendingDown className="h-5 w-5 text-amber-300" /><h3 className="text-sm font-black uppercase tracking-wider text-slate-200">Questions to investigate</h3></div>
          {questions.length > 0 ? <ul className="space-y-2">{questions.map((question: any) => <li key={question.questionId || question.question} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-200">{question.question}</li>)}</ul> : <Unavailable module={attentionModule} subject="evidence-triggered investigation questions" />}
          <div className="mt-3"><EvidenceNote module={attentionModule} /></div>
        </div>
      </section>
    </div>
  );
}
