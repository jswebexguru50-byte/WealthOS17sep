import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Bundle, HostResponse, LlmProvider, LlmRequest, LlmResponse, ProviderUsage } from '../../domain/index.js';
import { ZERO_USAGE } from '../provider.js';

/** Task file the host agent reads; it names every other file the host needs. */
export interface HostTaskFile {
  taskId: string;
  role: 'DRAFTER' | 'REVIEWER';
  symbol: string;
  systemPromptPath: string;
  /** User message(s) of this request (the instructions plus the contract/draft/defects for this round). */
  promptPath: string;
  bundlePath: string;
  /** Draft under review (reviewer tasks) or the previous draft (revision rounds). */
  draftPath?: string;
  schemaPath: string;
  /** Where the host agent writes its JSON answer (raw structured output or a HostResponse envelope). */
  outputPath: string;
  createdAt: string;
}

/** Thrown when no response is available yet and the provider is not allowed to wait. Re-run to resume. */
export class HostTaskPendingError extends Error {
  constructor(readonly taskPath: string, readonly outputPath: string) {
    super(`Host task pending: write the response to ${outputPath} (task file ${taskPath}) and re-run`);
    this.name = 'HostTaskPendingError';
  }
}

/** Thrown when a response envelope names a different task. */
export class HostTaskMismatchError extends Error {
  constructor(expected: string, actual: string) {
    super(`Host response is for task ${actual}, expected ${expected}`);
    this.name = 'HostTaskMismatchError';
  }
}

/** Options for {@link HostAgentProvider}. */
export interface HostAgentOptions {
  role: 'DRAFTER' | 'REVIEWER';
  symbol: string;
  /** Directory for task, prompt, schema and response files (created if missing). */
  workDir: string;
  /** Frozen bundle JSON (see {@link writeBundleFile}). */
  bundlePath: string;
  draftPath?: string;
  /** `file` (default) reads the response file; `stdin` reads one JSON document from stdin. */
  responseSource?: 'file' | 'stdin';
  /** How long to wait for the response file; 0 (default) throws {@link HostTaskPendingError} at once. */
  timeoutMs?: number;
  pollMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable stdin reader for tests; the default reads process.stdin to the end. */
  readStdin?: () => Promise<string>;
  now?: () => Date;
  /** Provider id recorded in run rows (default `host-agent`). */
  id?: string;
}

const defaultSleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

async function readProcessStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString('utf8');
}

/** Deterministic id for a request, so a re-run finds the response written for the same task. */
export function hostTaskId(role: string, symbol: string, request: LlmRequest): string {
  const body = JSON.stringify([role, symbol, request.system, request.messages, request.jsonSchema ?? null]);
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}

/** Writes the frozen bundle for the host agent and returns its path. */
export function writeBundleFile(workDir: string, bundle: Bundle): string {
  mkdirSync(workDir, { recursive: true });
  const file = path.join(workDir, `bundle_${bundle.symbol}_${bundle.bundleHash.slice(0, 12)}.json`);
  writeFileSync(file, JSON.stringify(bundle, null, 2), 'utf8');
  return file;
}

function isEnvelope(value: unknown): value is HostResponse {
  return typeof value === 'object' && value !== null && 'taskId' in value && 'json' in value;
}

/**
 * Host-agent provider: no API key and no network. The pipeline writes a task file; the executing LLM session
 * (the host agent, or a separate reviewer sub-agent) does the thinking and writes its structured answer to the
 * output path (or pipes it on stdin). Tokens the host reports are recorded; nothing is metered or capped.
 */
export class HostAgentProvider implements LlmProvider {
  readonly id: string;

  constructor(private readonly options: HostAgentOptions) {
    this.id = options.id ?? 'host-agent';
  }

  private paths(taskId: string): Record<'task' | 'system' | 'prompt' | 'schema' | 'output', string> {
    const dir = this.options.workDir;
    const stem = path.join(dir, `${this.options.role.toLowerCase()}_${taskId}`);
    return {
      task: `${stem}.task.json`,
      system: `${stem}.system.md`,
      prompt: `${stem}.prompt.md`,
      schema: `${stem}.schema.json`,
      output: `${stem}.response.json`,
    };
  }

  /** Writes the task files for a request and returns the task descriptor. Idempotent for the same request. */
  writeTask(request: LlmRequest): HostTaskFile {
    const { role, symbol, bundlePath, draftPath } = this.options;
    const taskId = hostTaskId(role, symbol, request);
    const p = this.paths(taskId);
    mkdirSync(this.options.workDir, { recursive: true });
    writeFileSync(p.system, request.system, 'utf8');
    writeFileSync(p.prompt, request.messages.map(m => m.content).join('\n\n'), 'utf8');
    writeFileSync(p.schema, JSON.stringify(request.jsonSchema ?? {}, null, 2), 'utf8');
    const task: HostTaskFile = {
      taskId,
      role,
      symbol,
      systemPromptPath: p.system,
      promptPath: p.prompt,
      bundlePath,
      draftPath,
      schemaPath: p.schema,
      outputPath: p.output,
      createdAt: (this.options.now?.() ?? new Date()).toISOString(),
    };
    writeFileSync(p.task, JSON.stringify(task, null, 2), 'utf8');
    return task;
  }

  private async readResponseText(task: HostTaskFile): Promise<string> {
    if (this.options.responseSource === 'stdin') return (this.options.readStdin ?? readProcessStdin)();
    const deadline = Date.now() + (this.options.timeoutMs ?? 0);
    const sleep = this.options.sleep ?? defaultSleep;
    while (!existsSync(task.outputPath)) {
      if (Date.now() >= deadline) throw new HostTaskPendingError(this.paths(task.taskId).task, task.outputPath);
      await sleep(this.options.pollMs ?? 1000);
    }
    return readFileSync(task.outputPath, 'utf8');
  }

  /** Writes the task, then returns the host agent's structured response. */
  async complete(request: LlmRequest): Promise<LlmResponse> {
    const task = this.writeTask(request);
    const text = await this.readResponseText(task);
    const parsed: unknown = JSON.parse(text);
    if (!isEnvelope(parsed)) return { text: JSON.stringify(parsed), json: parsed, usage: ZERO_USAGE };
    if (parsed.taskId !== task.taskId) throw new HostTaskMismatchError(task.taskId, parsed.taskId);
    const usage: ProviderUsage = parsed.usage ?? ZERO_USAGE;
    return { text: JSON.stringify(parsed.json), json: parsed.json, usage };
  }
}
