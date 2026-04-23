export type SessionStatus = "pending" | "active" | "running" | "completed" | "cancelled";
export type ActionStatus = "recorded" | "settled" | "failed" | "timeout";
export type SessionMode = "demo" | "agent";

export type ActionType = "API_LOOKUP" | "JSON_TRANSFORM" | "SUMMARIZE" | "CLASSIFY" | "FINAL_ANSWER";

export interface Session {
  id: string;
  mode: SessionMode;
  onchainId?: number;
  consumerAddress: string;
  providerAddress: string;
  providerAgentId: string;
  status: SessionStatus;
  budget: number;
  maxActions: number;
  totalActions: number;
  settledActions: number;
  failedActions: number;
  totalPaid: number;
  metadataURI?: string;
  createdAt: number;
  startedAt?: number;
  finalizedAt?: number;
  createdByWallet?: string;    // wallet that signed session creation (agent mode)
  signatureHash?: string;      // hash of creation signature for audit trail
}

export interface Action {
  sessionId: string;
  index: number;
  actionType: ActionType;
  units: number;
  unitPrice: number;
  totalPrice: number;
  input: string;
  output: string;
  actionHash: string;
  txHash?: string;
  recordedAt: number;
  settledAt?: number;
  status: ActionStatus;
  retryCount?: number;
  errorMessage?: string;
  executionMs?: number;        // provider response time
}

export interface CreateSessionInput {
  providerAgentId: string;
  consumerAddress: string;
  budget: number;
  maxActions: number;
  metadata?: string;
  mode?: SessionMode;
}

export interface StartSessionInput {
  actionCount?: number;
  delayMs?: number;
}
