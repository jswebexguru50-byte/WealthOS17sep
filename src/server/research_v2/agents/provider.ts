import type { LlmProvider, LlmRequest, LlmResponse, ProviderUsage } from '../domain/index.js';

export type { LlmMessage, LlmProvider, LlmRequest, LlmResponse, ProviderUsage } from '../domain/index.js';

/**
 * A provider that bills per call through an API. Spend caps apply only to these; the host agent and the mock
 * are not metered.
 */
export interface MeteredProvider extends LlmProvider {
  readonly meteredByApi: true;
}

/** True for providers whose usage must be checked against a spend cap. */
export function isMetered(provider: LlmProvider): provider is MeteredProvider {
  return (provider as Partial<MeteredProvider>).meteredByApi === true;
}

/** Raised when an API adapter is used without its key configured in the environment. */
export class ProviderDisabledError extends Error {
  constructor(readonly providerId: string, readonly envVar: string) {
    super(`Provider ${providerId} is disabled: environment variable ${envVar} is not set`);
    this.name = 'ProviderDisabledError';
  }
}

/** Raised when the per-run or per-day spend cap would be exceeded by a metered provider. */
export class SpendCapExceededError extends Error {
  constructor(readonly spentUsd: number, readonly capUsd: number) {
    super(`Spend cap exceeded: ${spentUsd.toFixed(4)} USD spent, cap ${capUsd.toFixed(4)} USD`);
    this.name = 'SpendCapExceededError';
  }
}

/** Zero usage, for providers that report none. */
export const ZERO_USAGE: ProviderUsage = { inTok: 0, outTok: 0 };

/** Extracts the first JSON value from free text, accepting a fenced ```json block. Throws on no JSON. */
export function parseJsonFromText(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.search(/[[{]/);
    if (start < 0) throw new Error('Response contains no JSON');
    return JSON.parse(candidate.slice(start));
  }
}

/** Convenience: builds a response with the structured value and its canonical JSON text. */
export function jsonResponse(json: unknown, usage: ProviderUsage = ZERO_USAGE): LlmResponse {
  return { text: JSON.stringify(json), json, usage };
}

/** Request helper used by tests and the orchestrator: one user message with the given content. */
export function simpleRequest(system: string, content: string, jsonSchema?: object): LlmRequest {
  return { system, messages: [{ role: 'user', content }], jsonSchema };
}
