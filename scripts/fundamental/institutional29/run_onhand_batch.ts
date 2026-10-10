#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { OnHandResearchCohortService } from '../../../src/server/services/OnHandResearchCohortService.js';
import { ResearchAnalysisJobService } from '../../../src/server/services/ResearchAnalysisJobService.js';
import { Institutional29SynthesisService } from '../../../src/server/services/Institutional29SynthesisService.js';

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const asOfDate = option('--as-of') || new Date().toISOString().slice(0, 10);
const planOnly = args.includes('--plan');
const requireLlm = args.includes('--require-llm');
const mode = requireLlm ? 'LLM_REQUIRED' : 'LLM_IF_AVAILABLE';
const service = OnHandResearchCohortService.getInstance();
const cohort = await service.build(asOfDate);
const reportDir = path.resolve('reports', 'fundamental');
fs.mkdirSync(reportDir, { recursive: true });
const manifestPath = path.join(reportDir, `on_hand_institutional29_${asOfDate}.json`);

const manifest: any = {
  generatedAt: new Date().toISOString(),
  asOfDate,
  valuationAsOf: cohort.valuationAsOf,
  llmConfigured: Institutional29SynthesisService.getInstance().isConfigured(),
  mode,
  totalMarketValue: cohort.totalMarketValue,
  positions: cohort.positions,
  exclusions: cohort.exclusions,
  job: null,
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  planOnly,
  asOfDate,
  valuationAsOf: cohort.valuationAsOf,
  eligible: cohort.positions.length,
  excludedRows: cohort.exclusions.length,
  totalMarketValue: cohort.totalMarketValue,
  llmConfigured: manifest.llmConfigured,
  firstTen: cohort.positions.slice(0, 10).map(position => ({ symbol: position.symbol, marketValue: position.marketValue })),
  manifestPath,
}, null, 2));

if (planOnly) process.exit(0);
if (requireLlm && !manifest.llmConfigured) throw new Error('LLM_NOT_CONFIGURED: set GEMINI_API_KEY before using --require-llm');

const { job } = await service.start(asOfDate, mode);
let current = job;
let lastLine = '';
while (['QUEUED', 'RUNNING'].includes(current.status)) {
  const line = `${current.status} ${current.completed}/${current.total} complete, ${current.failed} failed${current.currentSymbol ? `, processing ${current.currentSymbol}` : ''}`;
  if (line !== lastLine) {
    console.log(`[${new Date().toISOString()}] ${line}`);
    lastLine = line;
  }
  await new Promise(resolve => setTimeout(resolve, 3000));
  current = (await ResearchAnalysisJobService.getInstance().get(job.jobId)) || current;
}
manifest.job = current;
manifest.finishedAt = new Date().toISOString();
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ jobId: current.jobId, status: current.status, completed: current.completed, failed: current.failed, manifestPath }, null, 2));
process.exit(current.status === 'FAILED' ? 1 : 0);
