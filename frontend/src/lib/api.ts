import { BACKEND_URL } from "./contracts";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "API request failed");
  }
  return res.json();
}

// ── Authenticated fetch (with wallet token or API key) ──────────────
function protocolFetch(path: string, token: string, options?: RequestInit) {
  return apiFetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...((options?.headers as Record<string, string>) || {}),
    },
  });
}

// ── Session endpoints ────────────────────────────────────────────────

export async function createSession(params: {
  providerAgentId: string;
  consumerAddress: string;
  budget: number;
  maxActions: number;
  metadata?: string;
}) {
  return apiFetch("/api/sessions", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function startSession(sessionId: string, params: {
  actionCount?: number;
  delayMs?: number;
}) {
  return apiFetch(`/api/sessions/${sessionId}/start`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function triggerAction(sessionId: string, actionType?: string) {
  return apiFetch(`/api/sessions/${sessionId}/action`, {
    method: "POST",
    body: JSON.stringify({ actionType }),
  });
}

export async function completeSession(sessionId: string) {
  return apiFetch(`/api/sessions/${sessionId}/complete`, { method: "POST" });
}

export async function fetchSession(sessionId: string) {
  return apiFetch(`/api/sessions/${sessionId}`);
}

export async function fetchSessionActions(sessionId: string) {
  return apiFetch(`/api/sessions/${sessionId}/actions`);
}

export async function fetchSessionMetrics(sessionId: string) {
  return apiFetch(`/api/sessions/${sessionId}/metrics`);
}

// ── Demo endpoint ───────────────────────────────────────────────────

export async function runDemo(params?: {
  agentId?: string;
  actionCount?: number;
  delayMs?: number;
}) {
  return apiFetch("/api/sessions/demo", {
    method: "POST",
    body: JSON.stringify(params || {}),
  });
}

// ── Agent endpoints ──────────────────────────────────────────────────

export async function fetchAgents() {
  return apiFetch("/api/agents");
}

export async function fetchAgent(id: string) {
  return apiFetch(`/api/agents/${id}`);
}

// ── Dashboard + feed ─────────────────────────────────────────────────

export async function fetchDashboard() {
  return apiFetch("/api/dashboard");
}

export async function fetchTxFeed(limit: number = 50) {
  return apiFetch(`/api/tx-feed?limit=${limit}`);
}

// ── Health + Status ─────────────────────────────────────────────────

export async function healthCheck() {
  return apiFetch("/api/health");
}

export async function fetchStatus(): Promise<{
  rpcConnected: boolean;
  contractsLoaded: boolean;
  mode: "onchain" | "fallback";
  rpcUrl: string;
  operatorAddress: string | null;
}> {
  return apiFetch("/api/status");
}

// ── Registration (UI layer) ─────────────────────────────────────────

export async function registerProvider(params: {
  name: string;
  walletAddress: string;
  endpoint: string;
  supportedActions: string[];
  pricing: { actionType: string; pricePerUnit: number; description: string }[];
  description?: string;
  mode?: string;
}) {
  return apiFetch("/api/agents/providers/register", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function registerCustomer(params: {
  name: string;
  walletAddress?: string;
  privateKey?: string;
  description?: string;
}) {
  return apiFetch("/api/agents/customers/register", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function fetchAllSessions(mode?: "demo" | "agent") {
  const query = mode ? `?mode=${mode}` : "";
  return apiFetch(`/api/sessions${query}`);
}

export async function fetchProviders() {
  return apiFetch("/api/agents/providers");
}

// ── Wallet Auth (Protocol Layer) ────────────────────────────────────

export async function requestChallenge(walletAddress: string) {
  return apiFetch("/api/auth/challenge", {
    method: "POST",
    body: JSON.stringify({ walletAddress }),
  });
}

export async function verifyWalletAuth(walletAddress: string, signature: string, nonce: string) {
  return apiFetch("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ walletAddress, signature, nonce }),
  });
}

// ── Protocol API (Agent Network) ────────────────────────────────────

export async function fetchProtocolInfo(token: string) {
  return protocolFetch("/api/protocol/info", token);
}

export async function fetchProtocolProviders(token: string) {
  return protocolFetch("/api/protocol/providers", token);
}

export async function fetchProtocolProvider(token: string, id: string) {
  return protocolFetch(`/api/protocol/providers/${id}`, token);
}

export async function createProtocolSession(
  token: string,
  params: { providerAgentId: string; budget: number; maxActions: number; metadata?: string }
) {
  return protocolFetch("/api/protocol/sessions/create", token, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function fetchProtocolSessions(token: string) {
  return protocolFetch("/api/protocol/sessions", token);
}

export async function fetchProtocolSessionStatus(token: string, sessionId: string) {
  return protocolFetch(`/api/protocol/sessions/${sessionId}/status`, token);
}

export async function executeProtocolAction(
  token: string,
  sessionId: string,
  actionType: string,
  input: string,
  paymentProof?: { payload: any; signature: string }
) {
  const headers: Record<string, string> = {};
  if (paymentProof) {
    headers["X-Payment-Authorization"] = JSON.stringify(paymentProof);
  }

  return protocolFetch(`/api/protocol/sessions/${sessionId}/action`, token, {
    method: "POST",
    body: JSON.stringify({ actionType, input }),
    headers,
  });
}

export async function finalizeProtocolSession(token: string, sessionId: string) {
  return protocolFetch(`/api/protocol/sessions/${sessionId}/finalize`, token, {
    method: "POST",
  });
}

export async function fetchProtocolWhoami(token: string) {
  return protocolFetch("/api/protocol/whoami", token);
}

// ── Observer API (read-only, no auth) ────────────────────────────────

export async function fetchObserverState(): Promise<{
  mode: "onchain" | "fallback";
  rpcConnected: boolean;
  agents: any[];
  sessions: any[];
  txFeed: any[];
  timestamp: number;
}> {
  return apiFetch("/api/observer/state");
}

// ── Operator API ────────────────────────────────────────────────────

export async function fetchOperatorMetrics() {
  return apiFetch("/api/operator/metrics");
}

export async function fetchOperatorSessions(params?: { mode?: string; status?: string }) {
  const query = new URLSearchParams();
  if (params?.mode) query.set("mode", params.mode);
  if (params?.status) query.set("status", params.status);
  const qs = query.toString();
  return apiFetch(`/api/operator/sessions${qs ? `?${qs}` : ""}`);
}

export async function fetchOperatorSystem() {
  return apiFetch("/api/operator/system");
}

export async function overrideSession(sessionId: string, status: "cancelled" | "completed") {
  return apiFetch(`/api/operator/sessions/${sessionId}/override`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}
