import fs from 'node:fs';
import path from 'node:path';
import type { Bundle, LlmProvider, SubQuestion } from '../domain/index.js';
import { allSubQuestions } from '../contract/questions.js';
import { runReport, type RunInput, type RunResult } from '../agents/orchestrator.js';
import type { RunStore } from '../agents/runStore.js';
import { writeBundleFile } from '../agents/adapters/hostAgent.js';
import { renderReport, type RenderedReport } from '../report/render.js';
import { SIX_SCRIP_SYMBOLS, type SixScripSymbol } from './sixScrip.js';

export interface SixScripRunOptions {
  workDir: string;
  contractVersion?: string;
  subQuestions?: SubQuestion[];
  /** Creates separate drafter and reviewer instances for each symbol. No API key is implied. */
  providerFactory: (symbol: SixScripSymbol, role: 'DRAFTER' | 'REVIEWER', bundlePath: string) => LlmProvider;
  storeFactory: (symbol: SixScripSymbol, bundle: Bundle) => RunStore;
  runIdFactory?: (symbol: SixScripSymbol, bundle: Bundle) => string;
  parallel?: boolean;
}

export interface SixScripRunResult {
  results: Record<SixScripSymbol, RunResult>;
  reports: Partial<Record<SixScripSymbol, RenderedReport>>;
}

/**
 * Runs the six fundamental-only bundles through the host-agent orchestrator.
 * Each symbol receives its own frozen bundle, provider instances and store. A host task may remain
 * AWAITING_HOST; callers can resume that symbol with the same run id through the normal orchestrator.
 */
export async function runSixScripReports(
  bundles: Record<SixScripSymbol, Bundle>,
  options: SixScripRunOptions,
): Promise<SixScripRunResult> {
  fs.mkdirSync(options.workDir, { recursive: true });
  const questions = options.subQuestions ?? allSubQuestions();
  const runOne = async (symbol: SixScripSymbol): Promise<[SixScripSymbol, RunResult, RenderedReport | undefined]> => {
    const bundle = bundles[symbol];
    if (!bundle || bundle.symbol !== symbol) throw new Error(`Bundle missing or mismatched for ${symbol}`);
    const bundlePath = writeBundleFile(options.workDir, bundle);
    const input: RunInput = {
      runId: options.runIdFactory?.(symbol, bundle) ?? `research-v2-${symbol}-${bundle.bundleHash.slice(0, 12)}`,
      bundle, subQuestions: questions, contractVersion: options.contractVersion ?? '29Q-V2',
      drafter: options.providerFactory(symbol, 'DRAFTER', bundlePath),
      reviewer: options.providerFactory(symbol, 'REVIEWER', bundlePath),
      store: options.storeFactory(symbol, bundle), inlineBundle: false,
    };
    const result = await runReport(input);
    const report = result.status === 'READY_FOR_PUBLICATION' ? renderReport(bundle, result.answers) : undefined;
    return [symbol, result, report];
  };
  const entries = options.parallel === false
    ? await SIX_SCRIP_SYMBOLS.reduce(async (p, symbol) => [...await p, await runOne(symbol)], Promise.resolve([] as Array<[SixScripSymbol, RunResult, RenderedReport | undefined]>))
    : await Promise.all(SIX_SCRIP_SYMBOLS.map(runOne));
  const results = {} as Record<SixScripSymbol, RunResult>;
  const reports: Partial<Record<SixScripSymbol, RenderedReport>> = {};
  for (const [symbol, result, report] of entries) { results[symbol] = result; if (report) reports[symbol] = report; }
  return { results, reports };
}
