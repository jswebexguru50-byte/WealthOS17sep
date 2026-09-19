export type AgentStatus = 'ACQUIRING' | 'BLOCKED' | 'DATA_INSUFFICIENT' | 'FAILED';

export type AgentReasonCode = 
  | 'AUTHENTICATION_REQUIRED'
  | 'INSTRUMENT_RESOLUTION_UNAVAILABLE'
  | 'PROVIDER_UNAVAILABLE'
  | 'UNSUPPORTED_CAPABILITY';

export interface SwarmAgentResult {
  agentId: string;
  runId: string;
  datasetId: string;
  status: AgentStatus;
  reasonCode?: AgentReasonCode | string;
  source: string;
  provider: string;

  rowsAcquired: number;
  rowsValidated: number;
  rowsRejected: number;

  coverageStart?: string;
  coverageEnd?: string;

  rawSha256?: string;
  canonicalSha256?: string;

  pitStatus:
    | 'PIT_VERIFIED'
    | 'PIT_NOT_VERIFIABLE'
    | 'PIT_INVALID'
    | 'NOT_APPLICABLE';

  calendarStatus:
    | 'VALIDATED'
    | 'INVALID'
    | 'UNKNOWN';

  failureReasons: string[];

  /* Operational metadata */
  startedAt: string;
  completedAt: string;
}
