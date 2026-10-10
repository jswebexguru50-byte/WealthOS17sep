#!/usr/bin/env node

import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ResearchAnalysisArchiveService } from '../../../src/server/services/ResearchAnalysisArchiveService.js';
import { Institutional29SynthesisService } from '../../../src/server/services/Institutional29SynthesisService.js';

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const asOfDate = option('--as-of') || new Date().toISOString().slice(0, 10);
const manifestPath = path.resolve(option('--manifest') || path.join('reports', 'fundamental', `on_hand_institutional29_${asOfDate}.json`));
if (!fs.existsSync(manifestPath)) throw new Error(`ON_HAND_MANIFEST_NOT_FOUND: ${manifestPath}`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const allPositions = Array.isArray(manifest.positions) ? manifest.positions : [];
const requestedMax = Number(option('--max-symbols'));
const positions = Number.isFinite(requestedMax) && requestedMax > 0 ? allPositions.slice(0, Math.floor(requestedMax)) : allPositions;
if (!positions.length) throw new Error('ON_HAND_MANIFEST_HAS_NO_POSITIONS');
const synthesizer = Institutional29SynthesisService.getInstance();
if (!synthesizer.isConfigured()) throw new Error('LLM_NOT_CONFIGURED');
const archive = ResearchAnalysisArchiveService.getInstance();
const progressPath = path.join(path.dirname(manifestPath), `on_hand_institutional29_synthesis_${asOfDate}.json`);
const progress: any = fs.existsSync(progressPath)
  ? JSON.parse(fs.readFileSync(progressPath, 'utf8'))
  : { asOfDate, startedAt: new Date().toISOString(), completed: [], failed: [] };
const completed = new Set<string>((progress.completed || []).map((item: any) => String(item.symbol)));

for (const [index, position] of positions.entries()) {
  const symbol = String(position.symbol || '').trim().toUpperCase();
  if (!symbol || completed.has(symbol)) continue;
  console.log(`[${index + 1}/${positions.length}] ${symbol}: synthesis started`);
  try {
    const evidence = await archive.getLatestEvidence(symbol, asOfDate);
    if (!evidence?.evidenceBundle) throw new Error('EVIDENCE_BUNDLE_NOT_FOUND');
    const instructionsPath = path.resolve('outputs', 'institutional29', symbol, 'synthesis_instructions.md');
    if (!fs.existsSync(instructionsPath)) throw new Error('SYNTHESIS_INSTRUCTIONS_NOT_FOUND');
    const instructions = fs.readFileSync(instructionsPath, 'utf8');
    const synthesis = await synthesizer.synthesize(evidence.evidenceBundle, instructions);
    const saved = await archive.save({
      symbol,
      kind: 'LLM_ANALYSIS',
      title: synthesis.analysis.title,
      asOfDate,
      analysisMarkdown: synthesis.markdown,
      analysisJson: synthesis.analysis,
      evidenceBundle: evidence.evidenceBundle,
      citations: synthesis.analysis.citations,
      modelProvider: synthesis.provider,
      modelName: synthesis.model,
      promptVersion: synthesis.promptVersion,
      contractVersion: evidence.contractVersion,
      evidencePolicyVersion: evidence.evidencePolicyVersion,
      validationStatus: 'UNVALIDATED',
      sourceJob: `on-hand-synthesis:${asOfDate}`,
      parentAnalysisId: evidence.analysisId,
      metadata: {
        rawResponseHash: crypto.createHash('sha256').update(synthesis.rawText).digest('hex'),
        holding: { marketValue: position.marketValue, quantity: position.quantity, portfolios: position.portfolios, valuationAsOf: position.valuationAsOf },
        rankByMarketValue: index + 1,
      },
    });
    progress.completed.push({ symbol, rank: index + 1, analysisId: saved.record.analysisId, provider: synthesis.provider, model: synthesis.model, created: saved.created });
    completed.add(symbol);
    console.log(`[${index + 1}/${positions.length}] ${symbol}: saved ${saved.record.analysisId}`);
  } catch (error: any) {
    progress.failed = (progress.failed || []).filter((item: any) => item.symbol !== symbol);
    progress.failed.push({ symbol, rank: index + 1, error: error.message || String(error), at: new Date().toISOString() });
    console.error(`[${index + 1}/${positions.length}] ${symbol}: ${error.message || error}`);
  }
  progress.updatedAt = new Date().toISOString();
  fs.writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`, 'utf8');
}
progress.finishedAt = new Date().toISOString();
fs.writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ total: positions.length, completed: progress.completed.length, failed: progress.failed.length, progressPath }, null, 2));
process.exit(progress.failed.length ? 1 : 0);
