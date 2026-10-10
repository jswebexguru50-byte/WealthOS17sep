/** One chat message. */
export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Token usage and optional cost reported by a provider or by the host agent. */
export interface ProviderUsage {
  inTok: number;
  outTok: number;
  costUsd?: number;
}

/** Request to a provider. */
export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  jsonSchema?: object;
  temperature?: number;
  maxTokens?: number;
  seed?: number;
}

/** Provider reply. `json` is the parsed structured output when a schema was supplied. */
export interface LlmResponse {
  text: string;
  json?: unknown;
  usage: ProviderUsage;
}

/** Provider-neutral LLM port (host agent, API adapters, mocks). */
export interface LlmProvider {
  id: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

/** File-exchange task written for the host agent (no API key needed). */
export interface HostTask {
  taskId: string;
  role: 'DRAFTER' | 'REVIEWER';
  symbol: string;
  /** Frozen bundle the host agent may use. */
  bundlePath: string;
  /** The draft under review (reviewer tasks only). */
  draftPath?: string;
  system: string;
  prompt: string;
  jsonSchema: object;
  /** Where the host agent must write its HostResponse JSON. */
  responsePath: string;
  createdAt: string;
}

/** Structured reply read back from the host agent. */
export interface HostResponse {
  taskId: string;
  /** Structured output conforming to HostTask.jsonSchema. */
  json: unknown;
  usage?: ProviderUsage;
  /** Free-text label of the host agent / model, if it reports one. */
  agent?: string;
}
