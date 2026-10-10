/** Regenerates the recorded provider outputs: tsx tests/research_v2/agents/fixtures/gen_recordings.ts */
import { writeFileSync } from 'node:fs';
import { clone, goodAnswers } from './fixture.js';

const dir = new URL('./', import.meta.url);
const providerA = { answers: goodAnswers() };

// Provider B words things differently but cites the same evidence.
const providerB = clone(providerA);
providerB.answers[1].narrative =
  'FY26 consolidated EBITDA came to \u20B9852.95 Cr; operating cash flow of 775.7 Cr gives 0.909x conversion.';
providerB.answers[2].narrative = 'Peers are only partly covered; Beta Industries is the nearest listed comparison.';
providerB.answers[3].narrative = 'No order book is reported, hence conversion is not assessable.';

// Provider C injects a wrong EBITDA number into claim and narrative.
const providerC = clone(providerA);
providerC.answers[1].claims[0].value = 925.95;
providerC.answers[1].narrative = providerC.answers[1].narrative.replace('852.95', '925.95');

const review = { verdict: 'PASS', findings: [] };
const out: Record<string, unknown> = {
  'recorded_provider_a.json': providerA,
  'recorded_provider_b.json': providerB,
  'recorded_provider_c_wrong_number.json': providerC,
  'recorded_review_pass.json': review,
};
for (const [name, body] of Object.entries(out)) writeFileSync(new URL(name, dir), JSON.stringify(body, null, 2));
