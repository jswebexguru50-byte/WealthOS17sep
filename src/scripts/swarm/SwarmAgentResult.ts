export interface SwarmAgentResult {
  agentId: string;
  runId: string;
  datasetId: string;
  status:
    | 'ACQUIRING'
    | 'VALIDATED'
    | 'PROMOTED'
    | 'DATA_INSUFFICIENT'
    | 'BLOCKED'
    | 'FAILED';
  reasonCode?: string;
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
