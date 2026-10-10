import type { Bundle, SubAnswer } from '../domain/index.js';
import { QUESTIONS } from '../contract/questions.js';

export interface RenderOptions { title?: string; includeEvidenceIndex?: boolean; }
export interface RenderedReport { markdown: string; json: { symbol: string; isin: string; asOf: string; routineVersion: string; answers: SubAnswer[]; readiness: Bundle['readiness']; gaps: Bundle['gaps']; bundleHash: string }; }

const esc = (s: string): string => s.replace(/[|]/g, '\\|').replace(/\r?\n/g, ' ');

/** Renders an immutable bundle and validated terminal answers without adding facts or recommendations. */
export function renderReport(bundle: Bundle, answers: SubAnswer[], options: RenderOptions = {}): RenderedReport {
  const title = options.title ?? `${bundle.symbol} — Fundamental Research Report`;
  const byId = new Map(answers.map(answer => [answer.subQuestionId, answer]));
  const lines: string[] = [
    `# ${title}`, '',
    `**ISIN:** ${bundle.isin}  `,
    `**Evidence cut-off:** ${bundle.asOf}  `,
    `**Routine:** ${bundle.routineVersion}  `,
    `**Bundle hash:** \`${bundle.bundleHash}\``, '',
    '## Executive assessment', '',
    executiveAssessment(bundle, answers), '',
    '## Institutional due-diligence answers', '',
  ];
  for (const question of QUESTIONS) {
    const questionAnswers = question.subQuestions.map(sub => byId.get(sub.id)).filter((answer): answer is SubAnswer => Boolean(answer));
    lines.push(`### ${question.id}. ${question.topic} — ${question.question}`, '');
    for (const sub of question.subQuestions) {
      const answer = byId.get(sub.id);
      lines.push(`**${sub.id} — ${sub.text}**`);
      if (!answer) {
        lines.push('No terminal answer was supplied for this required sub-question.', '');
        continue;
      }
      lines.push(answer.narrative.trim() || terminalStateText(answer));
      if (answer.gap) lines.push('', `**Evidence gap:** ${answer.gap}`);
      if (answer.nextAction) lines.push(`**Next action:** ${answer.nextAction}`);
      if (answer.sourcesSearched?.length) lines.push(`**Sources searched:** ${answer.sourcesSearched.join('; ')}`);
      if (answer.premiseCheck) lines.push(`**Premise check:** ${answer.premiseCheck.note}`);
      lines.push('');
    }
    lines.push(`**Evidence state:** ${questionEvidenceState(questionAnswers)}.`, '');
  }
  if (bundle.gaps.length) { lines.push('## Open gaps', ''); for (const g of bundle.gaps) lines.push(`- **${g.subQuestionId}:** ${g.missing.join(', ')} — ${g.nextAction}`); lines.push(''); }
  if (options.includeEvidenceIndex !== false) { lines.push('## Primary evidence used', '', '| ID | Kind | Label | Period | Scope | Value |', '|---|---|---|---|---|---|'); for (const e of evidenceIndex(bundle)) lines.push(`| ${e.id} | ${e.kind} | ${esc(e.label)} | ${e.period ?? '—'} | ${e.scope ?? '—'} | ${e.value ?? '—'} |`); }
  return { markdown: lines.join('\n'), json: { symbol: bundle.symbol, isin: bundle.isin, asOf: bundle.asOf, routineVersion: bundle.routineVersion, answers, readiness: bundle.readiness, gaps: bundle.gaps, bundleHash: bundle.bundleHash } };
}

function executiveAssessment(bundle: Bundle, answers: SubAnswer[]): string {
  const answered = answers.filter(answer => answer.state === 'ANSWERED').length;
  const partial = answers.filter(answer => answer.state === 'PARTIAL').length;
  const unavailable = answers.filter(answer => answer.state === 'NOT_DISCLOSED').length;
  const total = QUESTIONS.flatMap(question => question.subQuestions).length;
  return `${bundle.symbol} is presented as an independent fundamental-research dossier. The frozen evidence bundle contains ${answered} answered, ${partial} partial and ${unavailable} not-disclosed sub-questions out of ${total}. The report does not infer missing facts: each open item identifies the evidence gap and the next source action. The seven-row fundamental scorecard and all numerical claims remain in the evidence appendix.`;
}

function terminalStateText(answer: SubAnswer): string {
  if (answer.state === 'NOT_APPLICABLE') return answer.premiseCheck?.note ?? 'Not applicable under the approved scope.';
  if (answer.state === 'NOT_DISCLOSED') return 'The prescribed sources did not disclose this item.';
  return 'The available evidence is partial; see the stated gap and next action.';
}

function questionEvidenceState(answers: SubAnswer[]): string {
  if (!answers.length) return 'Unreviewed';
  if (answers.every(answer => answer.state === 'ANSWERED')) return 'Supported';
  if (answers.every(answer => answer.state === 'NOT_APPLICABLE')) return 'Not applicable under approved scope';
  if (answers.some(answer => answer.state === 'PARTIAL')) return 'Partially supported';
  if (answers.some(answer => answer.state === 'NOT_DISCLOSED')) return 'Not disclosed after prescribed-source search';
  return 'Requires review';
}

function evidenceIndex(bundle: Bundle) {
  return [
    ...Object.values(bundle.facts).map(f => ({ id: f.factId, kind: 'FACT' as const, label: f.metric, period: f.periodEnd, scope: f.scope, value: f.valueCr })),
    ...Object.values(bundle.calcs).map(c => ({ id: c.calcId, kind: 'CALC' as const, label: c.name, period: c.period, scope: c.scope ?? undefined, value: c.value })),
    ...bundle.researchItems.map(r => ({ id: r.id, kind: 'RESEARCH' as const, label: r.title, period: r.publishedAt ?? undefined, scope: undefined, value: undefined })),
  ];
}
