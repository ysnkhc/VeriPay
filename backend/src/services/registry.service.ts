import { config } from "../config";
import { Agent, PricingEntry } from "../types/agent";
import { ActionType } from "../types/session";
import { getAgentByWallet, getAllProviders } from "./agent.service";

// ── Onchain Registry Indexer ────────────────────────────────────────────
// Syncs registered agents from the onchain AgentRegistry contract
// into a local cache that merges with in-memory agents.

interface OnchainAgentEntry {
  owner: string;
  name: string;
  endpointURI: string;
  defaultPricePerAction: number;
  active: boolean;
}

// Onchain agent cache
const onchainAgents: Map<string, OnchainAgentEntry> = new Map();
let lastSyncAt = 0;
const SYNC_INTERVAL_MS = 60_000; // 60s
let syncTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Sync the onchain AgentRegistry into local cache.
 * Reads all registered agents from the contract and stores them.
 * Runs on startup + every 60s if onchain mode is active.
 */
export async function syncRegistryFromChain(): Promise<number> {
  if (!config.onchainMode || !config.contracts.agentRegistry) {
    return 0;
  }

  try {
    const { getAgentRegistryContract, getProvider } = await import("../contracts/provider");

    // Check RPC is reachable
    const provider = getProvider();
    await provider.getBlockNumber();

    const registry = getAgentRegistryContract();
    const count = await registry.agentCount();
    const total = Number(count);

    let synced = 0;

    for (let i = 0; i < total; i++) {
      try {
        const entry = await registry.getAgentByIndex(i);
        const agent: OnchainAgentEntry = {
          owner: entry.owner,
          name: entry.name,
          endpointURI: entry.endpointURI,
          defaultPricePerAction: Number(entry.defaultPricePerAction),
          active: entry.active,
        };

        onchainAgents.set(agent.owner.toLowerCase(), agent);
        synced++;
      } catch {
        // Skip invalid entries
      }
    }

    lastSyncAt = Date.now();
    if (synced > 0) {
      console.log(`[registry] Synced ${synced} agents from onchain registry`);
    }

    return synced;
  } catch (err: any) {
    console.warn(`[registry] Sync failed: ${err.message}`);
    return 0;
  }
}

/**
 * Start periodic registry sync.
 * Call once on server startup.
 */
export function startRegistrySync(): void {
  // Initial sync
  syncRegistryFromChain().catch(() => {});

  // Periodic sync
  if (!syncTimer) {
    syncTimer = setInterval(() => {
      syncRegistryFromChain().catch(() => {});
    }, SYNC_INTERVAL_MS);
  }
}

/**
 * Get a merged view of all providers: in-memory + onchain.
 * In-memory agents take priority (they have richer metadata).
 * Onchain-only agents are included with basic info.
 */
export function getMergedProviders(): Agent[] {
  const inMemory = getAllProviders();
  const knownWallets = new Set(inMemory.map((a) => a.walletAddress.toLowerCase()));

  // Add onchain agents that aren't already in memory
  const onchainOnly: Agent[] = [];
  for (const [wallet, entry] of onchainAgents.entries()) {
    if (!entry.active) continue;
    if (knownWallets.has(wallet)) continue;

    // Convert onchain entry to Agent shape
    const defaultPricing: PricingEntry[] = [
      {
        actionType: "API_LOOKUP" as ActionType,
        pricePerUnit: entry.defaultPricePerAction,
        description: `Default action ($${(entry.defaultPricePerAction / 1_000_000).toFixed(4)})`,
      },
    ];

    onchainOnly.push({
      id: `onchain-${wallet.slice(2, 10)}`,
      name: entry.name,
      description: `Onchain-registered agent: ${entry.name}`,
      walletAddress: entry.owner,
      mode: "data_lookup",
      endpoint: entry.endpointURI,
      supportedActions: ["API_LOOKUP"],
      pricing: defaultPricing,
      active: true,
      registeredAt: lastSyncAt,
      role: "provider",
      source: "onchain",
    });
  }

  return [...inMemory, ...onchainOnly];
}

/**
 * Check if an agent exists in the onchain registry.
 */
export function isOnchainAgent(walletAddress: string): boolean {
  return onchainAgents.has(walletAddress.toLowerCase());
}

/**
 * Get onchain registry stats.
 */
export function getRegistryStats() {
  return {
    onchainAgents: onchainAgents.size,
    lastSyncAt,
    syncIntervalMs: SYNC_INTERVAL_MS,
  };
}
