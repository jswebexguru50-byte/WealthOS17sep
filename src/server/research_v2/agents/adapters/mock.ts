import type { LlmProvider, LlmRequest, LlmResponse, ProviderUsage } from '../../domain/index.js';
import { ZERO_USAGE } from '../provider.js';

/** One scripted reply: the structured output (or an Error to throw) plus optional reported usage. */
export type MockStep = { json: unknown; usage?: ProviderUsage } | { error: string };

/** Either a fixed script consumed in order or a function of the request and the call index. */
export type MockScript = MockStep[] | ((request: LlmRequest, callIndex: number) => MockStep);

/** Raised when a scripted mock runs out of recorded outputs, so a test never silently loops. */
export class MockScriptExhaustedError extends Error {
  constructor(id: string, calls: number) {
    super(`Mock provider ${id} has no scripted output for call ${calls}`);
    this.name = 'MockScriptExhaustedError';
  }
}

/** Deterministic provider for tests and recorded-output parity runs. Never touches the network. */
export class MockProvider implements LlmProvider {
  readonly calls: LlmRequest[] = [];

  constructor(readonly id: string, private readonly script: MockScript) {}

  /** Builds a mock that replays outputs recorded from another provider (fixtures). */
  static fromRecording(id: string, outputs: unknown[], usage?: ProviderUsage): MockProvider {
    return new MockProvider(id, outputs.map(json => ({ json, usage })));
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const index = this.calls.length;
    this.calls.push(request);
    const step = typeof this.script === 'function' ? this.script(request, index) : this.script[index];
    if (!step) throw new MockScriptExhaustedError(this.id, index);
    if ('error' in step) throw new Error(step.error);
    return { text: JSON.stringify(step.json), json: step.json, usage: step.usage ?? ZERO_USAGE };
  }
}
