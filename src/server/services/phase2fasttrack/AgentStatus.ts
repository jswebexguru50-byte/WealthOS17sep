export type AgentState =
  | "NOT_STARTED"
  | "RUNNING"
  | "BLOCKED"
  | "COMPLETED"
  | "FAILED";

export interface AgentStatus {
  agentId: string;
  state: AgentState;

  startedAt?: string;
  completedAt?: string;

  gitSha: string;

  inputHashes: string[];
  outputHashes: string[];

  recordsRead: number;
  recordsProduced: number;

  dataInsufficient: number;
  pitInvalid: number;

  errors: string[];
  blockers: string[];

  evidenceArtifacts: string[];
}
