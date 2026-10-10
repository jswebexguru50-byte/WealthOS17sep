import type { LlmProvider } from '../../domain/index.js';
import { HostAgentProvider, type HostAgentOptions } from './hostAgent.js';
import { MockProvider, type MockScript } from './mock.js';

export * from './hostAgent.js';
export * from './mock.js';

/** API adapters that are intentionally not built yet (owner scope decision, 2026-10-10). */
export const DEFERRED_ADAPTERS = [
  { id: 'claude', status: 'NOT_IMPLEMENTED' },
  { id: 'openai', status: 'NOT_IMPLEMENTED' },
  { id: 'gemini', status: 'NOT_IMPLEMENTED' },
  { id: 'bedrock', status: 'NOT_IMPLEMENTED' },
  { id: 'local', status: 'NOT_IMPLEMENTED' },
] as const;

/** Raised when a deferred adapter is requested. */
export class AdapterNotImplementedError extends Error {
  constructor(readonly adapterId: string) {
    super(`Adapter ${adapterId} is not implemented; use host-agent or mock`);
    this.name = 'AdapterNotImplementedError';
  }
}

/** Adapter spec for {@link createProvider}. */
export type ProviderSpec =
  | { adapter: 'host-agent'; options: HostAgentOptions }
  | { adapter: 'mock'; id: string; script: MockScript }
  | { adapter: 'claude' | 'openai' | 'gemini' | 'bedrock' | 'local' };

/** Creates a provider; deferred adapters throw {@link AdapterNotImplementedError}. */
export function createProvider(spec: ProviderSpec): LlmProvider {
  if (spec.adapter === 'host-agent') return new HostAgentProvider(spec.options);
  if (spec.adapter === 'mock') return new MockProvider(spec.id, spec.script);
  throw new AdapterNotImplementedError(spec.adapter);
}
