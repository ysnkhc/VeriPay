import { ActionType } from "./session";

export type AgentMode = "data_lookup" | "summary" | "transform";
export type AgentRole = "provider" | "customer";
export type AgentSource = "seed" | "registered" | "onchain";

export interface PricingEntry {
  actionType: ActionType;
  pricePerUnit: number;
  description: string;
}

export interface AgentReputation {
  totalSessions: number;
  successRate: number;
  avgResponseMs: number;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  walletAddress: string;
  mode: AgentMode;
  endpoint: string;
  supportedActions: ActionType[];
  pricing: PricingEntry[];
  active: boolean;
  registeredAt: number;
  role: AgentRole;
  source: AgentSource;
  apiKeyHash?: string;        // hash of API key
  capabilities?: string[];    // freeform capability tags
  privateKey?: string;        // customer wallet key for onchain funding (Anvil test keys only)
  reputation?: AgentReputation;  // reputation stub — computed from session history
}

export interface RegisterProviderInput {
  name: string;
  walletAddress: string;
  endpoint: string;
  supportedActions: ActionType[];
  pricing: PricingEntry[];
  description?: string;
  mode?: AgentMode;
  capabilities?: string[];
}

export interface RegisterCustomerInput {
  name: string;
  walletAddress?: string;     // if omitted, backend generates keypair
  privateKey?: string;        // Anvil/testnet key for onchain customer funding
  description?: string;
}
