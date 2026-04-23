import { ActionType } from "../types/session";
import { getAgentById } from "./agent.service";

// USDC has 6 decimals — all prices are in raw token units
// $0.001 = 1000, $0.002 = 2000, etc.

const DEFAULT_PRICES: Record<ActionType, number> = {
  API_LOOKUP: 1000,
  JSON_TRANSFORM: 2000,
  SUMMARIZE: 3000,
  CLASSIFY: 2000,
  FINAL_ANSWER: 5000,
};

export function getActionPrice(agentId: string, actionType: ActionType): number {
  const agent = getAgentById(agentId);
  if (agent) {
    const entry = agent.pricing.find((p) => p.actionType === actionType);
    if (entry) return entry.pricePerUnit;
  }
  return DEFAULT_PRICES[actionType] ?? 1000;
}

export function getPriceTable(agentId: string): Record<ActionType, number> {
  const agent = getAgentById(agentId);
  const table = { ...DEFAULT_PRICES };
  if (agent) {
    for (const entry of agent.pricing) {
      table[entry.actionType] = entry.pricePerUnit;
    }
  }
  return table;
}

export function formatUSDC(rawAmount: number): string {
  return `$${(rawAmount / 1_000_000).toFixed(6)}`;
}
