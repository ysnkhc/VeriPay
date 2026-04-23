export interface DashboardMetrics {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  totalActions: number;
  totalSettled: number;
  totalPaidUSDC: number;
  avgActionsPerSession: number;
  avgPricePerAction: number;
  avgSettlementSpeedMs: number;
  perAgentRevenue: AgentRevenue[];
  marginComparison: MarginComparison;
}

export interface AgentRevenue {
  agentId: string;
  agentName: string;
  totalSessions: number;
  totalActions: number;
  totalRevenue: number;
}

export interface MarginComparison {
  legacyGasPerTx: number;
  legacyTotalCost: number;
  arcGasPerTx: number;
  arcTotalCost: number;
  savings: number;
  savingsPercent: number;
}

export interface TxFeedEntry {
  sessionId: string;
  actionIndex: number;
  actionType: string;
  amount: number;
  txHash: string;
  timestamp: number;
  providerAgentId: string;
}
