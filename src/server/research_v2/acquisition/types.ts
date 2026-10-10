/** Shared types for the Trendlyne acquisition layer (S6). */

/** One content part of an MCP tool result. */
export interface ToolContent {
  type: string;
  text?: string;
}

/** Raw MCP tool result, as returned by the SDK client. */
export interface ToolResult {
  isError?: boolean;
  content?: ToolContent[];
  structuredContent?: unknown;
}

/** Minimal transport the client needs. Production: MCP SDK; tests: recorded-response fakes. */
export interface TrendlyneTransport {
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  close?(): Promise<void>;
  /** True only for simulators. The client refuses these unless NODE_ENV === 'test'. */
  readonly isSimulator?: boolean;
}

/** Stable error codes thrown or returned by the acquisition layer. */
export type AcquisitionErrorCode =
  | 'SIMULATOR_DISABLED'
  | 'CALL_CAP_EXCEEDED'
  | 'QUOTA_RESERVE_EXCEEDED'
  | 'QUOTA_STATE_UNKNOWN'
  | 'PROVIDER_LIMIT_EXCEEDED'
  | 'CONFIG_MISSING'
  | 'CONFIG_INVALID'
  | 'TRANSPORT_FAILED'
  | 'RESPONSE_UNPARSEABLE'
  | 'ANCHOR_INVALID'
  | 'LIVE_NOT_ALLOWED';

/** Error with a stable code; messages never contain the MCP URL or any key. */
export class AcquisitionError extends Error {
  constructor(public readonly code: AcquisitionErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'AcquisitionError';
  }
}

/** Provider code for "Maximum weighted channel limit exceeded". */
export const PROVIDER_QUOTA_CODE = '1002';

/** Provider limits proven by reports/data/trendlyne/MCP_CAPABILITY_PROBE.json (10 symbols x 50 parameters). */
export const PROVIDER_MAX_SYMBOLS = 10;
export const PROVIDER_MAX_TOKENS = 50;

/** Views fetched per symbol (get_overview_news_corp_events / get_ownership_deals_insider_sast). */
export type OverviewView = 'overview' | 'technical' | 'news' | 'events';
export type OwnershipView = 'shareholding' | 'sast' | 'bulblockdeal';
export type ViewName = OverviewView | OwnershipView;

export const OVERVIEW_VIEWS: readonly OverviewView[] = ['overview', 'technical', 'news', 'events'];
export const OWNERSHIP_VIEWS: readonly OwnershipView[] = ['shareholding', 'sast', 'bulblockdeal'];
export const ALL_VIEWS: readonly ViewName[] = [...OVERVIEW_VIEWS, ...OWNERSHIP_VIEWS];

/** Quota snapshot used for planning. All counts are provider calls. */
export interface QuotaState {
  dailyUsed: number;
  dailyLimit: number;
  dailyReserve: number;
  monthlyUsed: number;
  monthlyLimit: number;
  /** Where the numbers came from (ledger table, progress file, local call log, explicit). */
  source: string;
  /** Human-readable caveats, e.g. a stale daily snapshot treated as a fresh day. */
  notes: string[];
}

/** Rows of the quota projection printed by dry-run. */
export interface QuotaHeadroom {
  dailyRemaining: number;
  dailyUsableAfterReserve: number;
  monthlyRemaining: number;
  usable: number;
}
