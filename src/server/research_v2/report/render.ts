import type { Bundle, SubAnswer } from '../domain/index.js';

export interface RenderOptions { title?: string; includeEvidenceIndex?: boolean; }
export interface RenderedReport { markdown: string; json: { symbol: string; isin: string; asOf: string; routineVersion: string; answers: SubAnswer[]; readiness: Bundle['readiness']; gaps: Bundle['gaps']; bundleHash: string }; }

const esc = (s: string): string => s.replace(/[|]/g, '\\|').replace(/\r?\n/g, ' ');

/** Renders an immutable bundle and validated terminal answers without adding facts or recommendations. */
export function renderReport(bundle: Bundle, answers: SubAnswer[], options: RenderOptions = {}): RenderedReport {
  const title = options.title ?? `${bundle.symbol} — Fundamental Research Report`;
  const lines: string[] = [`# ${title}`, '', `- **ISIN:** ${bundle.isin}`, `- **As of:** ${bundle.asOf}`, `- **Routine:** ${bundle.routineVersion}`, `- **Bundle hash:** \`${bundle.bundleHash}\``, ''];
  lines.push('## Readiness', '', '| Sub-question | State | Satisfied by | Gaps |', '|---|---|---|---|');
  for (const r of Object.values(bundle.readiness)) lines.push(`| ${r.subQuestionId} | ${r.state} | ${r.satisfiedBy.length} | ${esc(r.gaps.map(g => `${g.input}: ${g.reason}`).join('; ') || '—')} |`);
  lines.push('', '## Answers', '');
  for (const answer of answers) {
    lines.push(`### ${answer.subQuestionId} — ${answer.state}`, '', answer.narrative.trim());
    if (answer.claims.length) {
      lines.push('', '**Claims**', '', '| Claim | Evidence |', '|---|---|');
      for (const claim of answer.claims) lines.push(`| ${esc(claim.text)} | ${esc(claim.refs.join(', ') || 'UNREFERENCED')} |`);
    }
    if (answer.gap) lines.push('', `**Gap:** ${answer.gap}`);
    if (answer.nextAction) lines.push(`**Next action:** ${answer.nextAction}`);
    lines.push('');
  }
  if (bundle.gaps.length) { lines.push('## Open gaps', ''); for (const g of bundle.gaps) lines.push(`- **${g.subQuestionId}:** ${g.missing.join(', ')} — ${g.nextAction}`); lines.push(''); }
  if (options.includeEvidenceIndex !== false) { lines.push('## Evidence index', '', '| ID | Kind | Label | Period | Scope | Value |', '|---|---|---|---|---|---|'); for (const e of evidenceIndex(bundle)) lines.push(`| ${e.id} | ${e.kind} | ${esc(e.label)} | ${e.period ?? '—'} | ${e.scope ?? '—'} | ${e.value ?? '—'} |`); }
  return { markdown: lines.join('\n'), json: { symbol: bundle.symbol, isin: bundle.isin, asOf: bundle.asOf, routineVersion: bundle.routineVersion, answers, readiness: bundle.readiness, gaps: bundle.gaps, bundleHash: bundle.bundleHash } };
}

function evidenceIndex(bundle: Bundle) {
  return [
    ...Object.values(bundle.facts).map(f => ({ id: f.factId, kind: 'FACT' as const, label: f.metric, period: f.periodEnd, scope: f.scope, value: f.valueCr })),
    ...Object.values(bundle.calcs).map(c => ({ id: c.calcId, kind: 'CALC' as const, label: c.name, period: c.period, scope: c.scope ?? undefined, value: c.value })),
    ...bundle.researchItems.map(r => ({ id: r.id, kind: 'RESEARCH' as const, label: r.title, period: r.publishedAt ?? undefined, scope: undefined, value: undefined })),
  ];
}
