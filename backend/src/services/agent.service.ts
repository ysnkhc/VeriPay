import { createHash, randomBytes } from "crypto";
import { ethers } from "ethers";
import { Agent, AgentMode, AgentRole, AgentSource, RegisterProviderInput, RegisterCustomerInput } from "../types/agent";
import { ActionType } from "../types/session";

// ── In-memory agent store ───────────────────────────────────────────────
const agents: Map<string, Agent> = new Map();

// API key index: hash → agentId
const apiKeyIndex: Map<string, string> = new Map();

// ── Helpers ─────────────────────────────────────────────────────────────

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function generateApiKey(): string {
  return `vpk_${randomBytes(24).toString("hex")}`;
}

function generateAgentId(prefix: string, wallet: string): string {
  const suffix = wallet.slice(2, 10).toLowerCase();
  return `${prefix}-${suffix}`;
}

// ── Seed data ───────────────────────────────────────────────────────────
const SEED_AGENTS: Agent[] = [
  {
    id: "agent-research",
    name: "Research Agent",
    description: "High-frequency data lookup agent. Queries external APIs and returns structured results.",
    walletAddress: "0x0000000000000000000000000000000000000003",
    mode: "data_lookup",
    endpoint: "mock://research-agent",
    supportedActions: ["API_LOOKUP", "CLASSIFY", "FINAL_ANSWER"],
    pricing: [
      { actionType: "API_LOOKUP", pricePerUnit: 1000, description: "External API data fetch ($0.001)" },
      { actionType: "CLASSIFY", pricePerUnit: 2000, description: "Classification pass ($0.002)" },
      { actionType: "FINAL_ANSWER", pricePerUnit: 5000, description: "Final compiled answer ($0.005)" },
    ],
    active: true,
    registeredAt: Date.now(),
    role: "provider",
    source: "seed",
  },
  {
    id: "agent-transform",
    name: "Transform Agent",
    description: "Data transformation agent. Converts, reshapes, and normalizes structured data.",
    walletAddress: "0x0000000000000000000000000000000000000004",
    mode: "transform",
    endpoint: "mock://transform-agent",
    supportedActions: ["JSON_TRANSFORM", "API_LOOKUP", "FINAL_ANSWER"],
    pricing: [
      { actionType: "JSON_TRANSFORM", pricePerUnit: 2000, description: "JSON reshape ($0.002)" },
      { actionType: "API_LOOKUP", pricePerUnit: 1000, description: "Source data fetch ($0.001)" },
      { actionType: "FINAL_ANSWER", pricePerUnit: 5000, description: "Final output ($0.005)" },
    ],
    active: true,
    registeredAt: Date.now(),
    role: "provider",
    source: "seed",
  },
  {
    id: "agent-summary",
    name: "Summary Agent",
    description: "Summarization agent. Condenses large payloads into structured briefs.",
    walletAddress: "0x0000000000000000000000000000000000000005",
    mode: "summary",
    endpoint: "mock://summary-agent",
    supportedActions: ["SUMMARIZE", "API_LOOKUP", "FINAL_ANSWER"],
    pricing: [
      { actionType: "SUMMARIZE", pricePerUnit: 3000, description: "Content summarization ($0.003)" },
      { actionType: "API_LOOKUP", pricePerUnit: 1000, description: "Source fetch ($0.001)" },
      { actionType: "FINAL_ANSWER", pricePerUnit: 5000, description: "Final brief ($0.005)" },
    ],
    active: true,
    registeredAt: Date.now(),
    role: "provider",
    source: "seed",
  },
];

// ── Init seed ───────────────────────────────────────────────────────────
function initSeed() {
  if (agents.size === 0) {
    for (const agent of SEED_AGENTS) {
      agents.set(agent.id, agent);
    }
    console.log(`[agents] Seeded ${SEED_AGENTS.length} demo agents`);
  }
}

initSeed();

// ── Public API — queries ────────────────────────────────────────────────

export function getAllAgents(): Agent[] {
  return Array.from(agents.values()).filter((a) => a.active);
}

export function getAllProviders(): Agent[] {
  return getAllAgents().filter((a) => a.role === "provider");
}

export function getAllCustomers(): Agent[] {
  return getAllAgents().filter((a) => a.role === "customer");
}

export function getAgentById(id: string): Agent | undefined {
  return agents.get(id);
}

export function getAgentByWallet(wallet: string): Agent | undefined {
  return Array.from(agents.values()).find(
    (a) => a.walletAddress.toLowerCase() === wallet.toLowerCase()
  );
}

export function getAgentByApiKey(apiKey: string): Agent | undefined {
  const hash = hashApiKey(apiKey);
  const agentId = apiKeyIndex.get(hash);
  if (!agentId) return undefined;
  return agents.get(agentId);
}

export function getDefaultPriceForAgent(agentId: string, actionType: ActionType): number {
  const agent = agents.get(agentId);
  if (!agent) return 1000;
  const entry = agent.pricing.find((p) => p.actionType === actionType);
  return entry?.pricePerUnit ?? 1000;
}

// ── Public API — registration ───────────────────────────────────────────

export function registerProvider(input: RegisterProviderInput): { agent: Agent; apiKey: string } {
  // Validate no duplicate wallet
  const existing = getAgentByWallet(input.walletAddress);
  if (existing) {
    throw new Error(`Wallet ${input.walletAddress} is already registered as ${existing.id}`);
  }

  const apiKey = generateApiKey();
  const apiKeyH = hashApiKey(apiKey);
  const id = generateAgentId("provider", input.walletAddress);

  const agent: Agent = {
    id,
    name: input.name,
    description: input.description || `Provider agent: ${input.name}`,
    walletAddress: input.walletAddress,
    mode: input.mode || "data_lookup",
    endpoint: input.endpoint,
    supportedActions: input.supportedActions,
    pricing: input.pricing,
    active: true,
    registeredAt: Date.now(),
    role: "provider",
    source: "registered",
    apiKeyHash: apiKeyH,
    capabilities: input.capabilities,
  };

  agents.set(id, agent);
  apiKeyIndex.set(apiKeyH, id);

  console.log(`[agents] Registered provider: ${agent.name} (${agent.id}) wallet=${agent.walletAddress}`);
  return { agent, apiKey };
}

export function registerCustomer(input: RegisterCustomerInput): { agent: Agent; apiKey: string; walletAddress: string; privateKey?: string } {
  // If no wallet provided, generate a new keypair
  let walletAddress = input.walletAddress || "";
  let privateKey = input.privateKey;

  if (!walletAddress) {
    const wallet = ethers.Wallet.createRandom();
    walletAddress = wallet.address;
    privateKey = wallet.privateKey;
    console.log(`[agents] Generated new wallet for customer: ${walletAddress}`);
  }

  // Validate no duplicate wallet
  const existing = getAgentByWallet(walletAddress);
  if (existing) {
    throw new Error(`Wallet ${walletAddress} is already registered as ${existing.id}`);
  }

  const apiKey = generateApiKey();
  const apiKeyH = hashApiKey(apiKey);
  const id = generateAgentId("customer", walletAddress);

  const agent: Agent = {
    id,
    name: input.name,
    description: input.description || `Customer agent: ${input.name}`,
    walletAddress,
    mode: "data_lookup", // customers don't need a mode, but field is required
    endpoint: "",         // customers don't have endpoints
    supportedActions: [], // customers don't provide actions
    pricing: [],
    active: true,
    registeredAt: Date.now(),
    role: "customer",
    source: "registered",
    apiKeyHash: apiKeyH,
    privateKey,           // stored for onchain funding in agent mode
  };

  agents.set(id, agent);
  apiKeyIndex.set(apiKeyH, id);

  console.log(`[agents] Registered customer: ${agent.name} (${agent.id}) wallet=${walletAddress}`);
  return { agent, apiKey, walletAddress, privateKey };
}
