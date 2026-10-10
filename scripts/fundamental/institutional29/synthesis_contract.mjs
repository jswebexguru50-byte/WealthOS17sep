import { EVIDENCE_POLICY_VERSION, SYNTHESIS_GUARDRAILS } from './evidence_policy.mjs';

export function buildSynthesisInstructions(bundle) {
  const questionRules = bundle.questions
    .filter(item => item.evidenceRules?.length)
    .map(item => `Q${item.id} ${item.topic}:\n${item.evidenceRules.map(rule => `- ${rule}`).join('\n')}`)
    .join('\n\n');

  return `# WealthOS Institutional-29 synthesis contract

Evidence policy: ${EVIDENCE_POLICY_VERSION}
Symbol: ${bundle.symbol}
As of: ${bundle.asOf}

Use only the frozen research_bundle.json and its cited primary documents. Reviewer prose, prior reports and user-supplied narratives are leads, not facts, until corroborated by the bundle.

## Mandatory controls

- Every financial amount must state period, period type and scope. Never silently combine standalone and consolidated figures.
- Prefer primary verified evidence. If sources materially disagree, preserve the conflict and explain which fact governs the conclusion.
- Every numerical or qualitative company claim must cite a factId or a named primary document, page/section and date.
- Missing extraction means “not located in the current evidence bundle”; it does not prove the company omitted the disclosure.
- Do not infer customer/supplier concentration, contractual pass-through, customer funding, TAM, order-book conversion or management quality from ratios, logos or generic industry practice.
- Distinguish reported facts, deterministic calculations, management guidance and analyst inference in the prose.
- Do not annualise backlog without contract-specific delivery schedules. Do not calculate reverse DCF outputs unless every assumption is printed.
- Exceptional items must carry period, scope and economic direction. Quarterly and annual items must not be blended.
- Technical indicators must come from sorted adjusted OHLCV. A mixed moving-average order is not a data error when integrity diagnostics pass.
- Do not issue buy/sell, target-price or probability language from incomplete evidence.

## Global policy

${Object.entries(SYNTHESIS_GUARDRAILS).map(([name, rule]) => `- ${name}: ${rule}`).join('\n')}

## Question-specific rules

${questionRules || '- No additional rules.'}
`;
}
