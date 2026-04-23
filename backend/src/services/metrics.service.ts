import { DashboardMetrics, AgentRevenue, MarginComparison } from "../types/metrics";
import { getAllSessions, getSessionActions } from "./session.service";
import { getAllAgents } from "./agent.service";

// ── Legacy gas cost assumptions (for margin comparison) ─────────────────
const LEGACY_ETH_GAS_PER_TX = 21000 + 45000; // base + contract interaction
const LEGACY_GAS_PRICE_GWEI = 30;
const LEGACY_ETH_PRICE_USD = 3500;
const LEGACY_COST_PER_TX =
  (LEGACY_ETH_GAS_PER_TX * LEGACY_GAS_PRICE_GWEI * 1e-9) * LEGACY_ETH_PRICE_USD;

// Arc gas is near-zero for demo
const ARC_COST_PER_TX = 0.000001;

export function getDashboardMetrics(): DashboardMetrics {
  const sessions = getAllSessions();
  const agents = getAllAgents();

  let totalActions = 0;
  let totalSettled = 0;
  let totalPaidUSDC = 0;
  let totalSettlementTimeMs = 0;
  let settlementCount = 0;

  const agentRevenueMap: Map<string, AgentRevenue> = new Map();

  // Init agent revenue entries
  for (const agent of agents) {
    agentRevenueMap.set(agent.id, {
      agentId: agent.id,
      agentName: agent.name,
      totalSessions: 0,
      totalActions: 0,
      totalRevenue: 0,
    });
  }

  for (const session of sessions) {
    totalActions += session.totalActions;
    totalSettled += session.settledActions;
    totalPaidUSDC += session.totalPaid;

    // Per-agent revenue
    const agentRev = agentRevenueMap.get(session.providerAgentId);
    if (agentRev) {
      agentRev.totalSessions++;
      agentRev.totalActions += session.totalActions;
      agentRev.totalRevenue += session.totalPaid;
    }

    // Settlement speed
    const actions = getSessionActions(session.id);
    for (const action of actions) {
      if (action.settledAt && action.recordedAt) {
        totalSettlementTimeMs += action.settledAt - action.recordedAt;
        settlementCount++;
      }
    }
  }

  const activeSessions = sessions.filter((s) => s.status === "active" || s.status === "running").length;
  const completedSessions = sessions.filter((s) => s.status === "completed").length;
  const avgActionsPerSession = sessions.length > 0 ? totalActions / sessions.length : 0;
  const avgPricePerAction = totalSettled > 0 ? totalPaidUSDC / totalSettled : 0;
  const avgSettlementSpeedMs = settlementCount > 0 ? totalSettlementTimeMs / settlementCount : 0;

  // Margin comparison
  const legacyTotalCost = totalSettled * LEGACY_COST_PER_TX;
  const arcTotalCost = totalSettled * ARC_COST_PER_TX;
  const savings = legacyTotalCost - arcTotalCost;

  const marginComparison: MarginComparison = {
    legacyGasPerTx: LEGACY_COST_PER_TX,
    legacyTotalCost,
    arcGasPerTx: ARC_COST_PER_TX,
    arcTotalCost,
    savings,
    savingsPercent: legacyTotalCost > 0 ? (savings / legacyTotalCost) * 100 : 0,
  };

  return {
    totalSessions: sessions.length,
    activeSessions,
    completedSessions,
    totalActions,
    totalSettled,
    totalPaidUSDC,
    avgActionsPerSession: Math.round(avgActionsPerSession * 100) / 100,
    avgPricePerAction: Math.round(avgPricePerAction),
    avgSettlementSpeedMs: Math.round(avgSettlementSpeedMs),
    perAgentRevenue: Array.from(agentRevenueMap.values()),
    marginComparison,
  };
}
