/**
 * WealthOS Universal MCP Server — Core Types & Contracts
 * Complies with Section AK, AL, AM, AN of Master Developer Specification
 */

export type McpStatus = 'OK' | 'PARTIAL' | 'MISSING' | 'UNAVAILABLE' | 'ERROR';

export interface McpResponseEnvelope<T = any> {
  status: McpStatus;
  asOf: string;
  data: T;
  evidence: Array<{
    factId?: string;
    sourceType?: string;
    provider?: string;
    verified?: boolean;
    citation?: string;
  }>;
  missing: string[];
  warnings: string[];
  meta: {
    latencyMs?: number;
    source?: string;
    hasMore?: boolean;
    nextCursor?: string;
    [key: string]: any;
  };
}

export function createEnvelope<T>(
  data: T,
  options: {
    status?: McpStatus;
    evidence?: any[];
    missing?: string[];
    warnings?: string[];
    meta?: Record<string, any>;
  } = {}
): McpResponseEnvelope<T> {
  return {
    status: options.status || 'OK',
    asOf: new Date().toISOString(),
    data,
    evidence: options.evidence || [],
    missing: options.missing || [],
    warnings: options.warnings || [],
    meta: {
      source: 'NRI WealthOS Production Core',
      ...options.meta,
    },
  };
}

export enum McpErrorCode {
  SECURITY_NOT_FOUND = 'SECURITY_NOT_FOUND',
  AMBIGUOUS_SECURITY = 'AMBIGUOUS_SECURITY',
  PORTFOLIO_NOT_FOUND = 'PORTFOLIO_NOT_FOUND',
  DATA_UNAVAILABLE = 'DATA_UNAVAILABLE',
  INSUFFICIENT_HISTORY = 'INSUFFICIENT_HISTORY',
  SOURCE_UNAVAILABLE = 'SOURCE_UNAVAILABLE',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  QUOTA_EXHAUSTED = 'QUOTA_EXHAUSTED',
  INVALID_DATE_RANGE = 'INVALID_DATE_RANGE',
  TEST_FAILED = 'TEST_FAILED',
  BUILD_FAILED = 'BUILD_FAILED',
  SERVER_UNAVAILABLE = 'SERVER_UNAVAILABLE',
  DEVELOPER_TASK_FAILED = 'DEVELOPER_TASK_FAILED',
  REPAIR_LIMIT_REACHED = 'REPAIR_LIMIT_REACHED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INVALID_INPUT = 'INVALID_INPUT',
}

export class McpError extends Error {
  code: McpErrorCode;
  details?: any;

  constructor(code: McpErrorCode, message: string, details?: any) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.details = details;
  }
}
