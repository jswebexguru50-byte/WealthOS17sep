import fs from 'node:fs';
import { AcquisitionError, type ToolResult, type TrendlyneTransport } from './types.js';

/** Default location of the saved MCP configuration (override with TRENDLYNE_MCP_CONFIG). */
export const DEFAULT_MCP_CONFIG_PATH =
  'C:/Users/GopalSharma/Downloads/WealthOS 04 Oct/WealthOS04Oct/.agents/mcp_config.json';
export const MCP_CONFIG_ENV = 'TRENDLYNE_MCP_CONFIG';
const REDACTED = '[REDACTED_URL]';
const URL_PATTERN = /[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)]+/gi;

/** Minimal shape of the MCP SDK client this module drives. */
export interface McpClientLike {
  connect(transport: unknown): Promise<void>;
  callTool(request: { name: string; arguments: Record<string, unknown> }): Promise<unknown>;
  close?(): Promise<void>;
}

/** Factory seam so tests never import or start the real SDK. */
export interface McpConnector {
  createClient(): Promise<McpClientLike>;
  createHttpTransport(url: URL): Promise<unknown>;
}

export interface McpTransportOptions {
  /** Path of the MCP config; falls back to TRENDLYNE_MCP_CONFIG, then DEFAULT_MCP_CONFIG_PATH. */
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  connector?: McpConnector;
  /** Replaceable for tests. */
  readFile?: (file: string) => string;
}

/** Resolves the config path from options, environment, then the default. */
export function resolveConfigPath(options: McpTransportOptions = {}): string {
  const env = options.env ?? process.env;
  return options.configPath ?? env[MCP_CONFIG_ENV] ?? DEFAULT_MCP_CONFIG_PATH;
}

/** Removes every URL (and the exact secret URL, if known) from a message. */
export function redactUrls(message: string, secretUrl?: string): string {
  let out = message;
  if (secretUrl) out = out.split(secretUrl).join(REDACTED);
  return out.replace(URL_PATTERN, REDACTED);
}

/**
 * Reads the Trendlyne MCP URL from the saved config. The URL is returned only to the caller that
 * connects; it is never logged, stored on an object that gets serialised, or put in an error.
 * @throws AcquisitionError CONFIG_MISSING / CONFIG_INVALID (messages carry the path, never the URL).
 */
export function readTrendlyneUrl(options: McpTransportOptions = {}): string {
  const file = resolveConfigPath(options);
  const read = options.readFile ?? ((p: string) => fs.readFileSync(p, 'utf8'));
  let text: string;
  try {
    text = read(file);
  } catch {
    throw new AcquisitionError('CONFIG_MISSING', `cannot read MCP config at ${file}`);
  }
  let config: any;
  try {
    config = JSON.parse(text);
  } catch {
    throw new AcquisitionError('CONFIG_INVALID', `MCP config at ${file} is not valid JSON`);
  }
  const entry = config?.mcpServers?.trendlyne;
  const url = entry?.serverUrl || entry?.url;
  if (typeof url !== 'string' || url.trim() === '') {
    throw new AcquisitionError('CONFIG_INVALID', `mcpServers.trendlyne.serverUrl|url missing in ${file}`);
  }
  return url;
}

async function defaultConnector(): Promise<McpConnector> {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  return {
    createClient: async () => new Client({ name: 'wealthos-research-v2', version: '1.0.0' }) as McpClientLike,
    createHttpTransport: async (url: URL) => new StreamableHTTPClientTransport(url),
  };
}

/** Production transport over the MCP SDK. Connects lazily on the first call. */
export class McpTrendlyneTransport implements TrendlyneTransport {
  private client: McpClientLike | null = null;
  private secretUrl: string | undefined;

  constructor(private readonly options: McpTransportOptions = {}) {}

  /** Never reveals the URL: the object has no serialisable URL field. */
  toJSON(): Record<string, string> {
    return { transport: 'McpTrendlyneTransport' };
  }

  private async connect(): Promise<McpClientLike> {
    if (this.client) return this.client;
    const url = readTrendlyneUrl(this.options);
    this.secretUrl = url;
    try {
      const connector = this.options.connector ?? (await defaultConnector());
      const client = await connector.createClient();
      await client.connect(await connector.createHttpTransport(new URL(url)));
      this.client = client;
      return client;
    } catch (error) {
      throw this.wrap(error);
    }
  }

  private wrap(error: unknown): AcquisitionError {
    if (error instanceof AcquisitionError) return error;
    const raw = error instanceof Error ? error.message : String(error);
    return new AcquisitionError('TRANSPORT_FAILED', redactUrls(raw, this.secretUrl));
  }

  /** Calls one MCP tool. Transport failures surface as TRANSPORT_FAILED with URLs redacted. */
  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const client = await this.connect();
    try {
      return (await client.callTool({ name, arguments: args })) as ToolResult;
    } catch (error) {
      throw this.wrap(error);
    }
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (client?.close) await client.close();
  }
}
