import { Router } from "express";
import { agentAuthMiddleware } from "../middleware/agent-auth";
import { requirePayment } from "../middleware/payment.middleware";
import { getAgentById, getAllProviders } from "../services/agent.service";
import { getMergedProviders } from "../services/registry.service";
import { getPriceTable } from "../services/pricing.service";
import { getSigningInfo } from "../services/payment.service";
import {
  createSession,
  getSession,
  getAllSessions,
  getSessionActions,
  updateSession,
  getRemainingBudget,
} from "../services/session.service";
import {
  initAgentSession,
  runAgentAction,
  finalizeAgentSession,
} from "../services/loop.service";
import { getMode } from "../services/settlement.service";
import { ActionType } from "../types/session";

const router = Router();

// All protocol routes require agent authentication (wallet-first, API-key fallback)
router.use(agentAuthMiddleware);

// ── GET /api/protocol/info — protocol metadata for agents ───────────────
router.get("/info", (_req, res) => {
  res.json({
    protocol: "VeriPay Loop",
    version: "1.0.0",
    network: "Arc",
    mode: getMode(),
    auth: {
      primary: "wallet — POST /api/auth/challenge + /api/auth/verify",
      fallback: "apikey — X-Agent-Key header",
    },
    payment: {
      model: "per_action",
      currency: "USDC",
      flow: "x402 — request → 402 challenge → signed payment → execute",
      signing: getSigningInfo(),
    },
  });
});

// ── GET /api/protocol/providers — list available providers (merged) ─────
router.get("/providers", (_req, res) => {
  const providers = getMergedProviders();
  res.json(
    providers.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      walletAddress: p.walletAddress,
      endpoint: p.endpoint,
      supportedActions: p.supportedActions,
      pricing: p.pricing,
      priceTable: getPriceTable(p.id),
      source: p.source,
      capabilities: p.capabilities,
      reputation: p.reputation,
    }))
  );
});

// ── GET /api/protocol/providers/:id — single provider detail ────────────
router.get("/providers/:id", (req, res) => {
  const agent = getAgentById(req.params.id);
  if (!agent || agent.role !== "provider") {
    return res.status(404).json({ error: "Provider not found" });
  }

  res.json({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    walletAddress: agent.walletAddress,
    endpoint: agent.endpoint,
    supportedActions: agent.supportedActions,
    pricing: agent.pricing,
    priceTable: getPriceTable(agent.id),
    source: agent.source,
    capabilities: agent.capabilities,
    active: agent.active,
    registeredAt: agent.registeredAt,
  });
});

// ── POST /api/protocol/sessions/create — agent-owned session creation ───
router.post("/sessions/create", async (req, res) => {
  try {
    const customer = req.agent!;
    if (customer.role !== "customer") {
      return res.status(403).json({ error: "Only customer agents can create sessions" });
    }

    const { providerAgentId, budget, maxActions, metadata } = req.body;

    if (!providerAgentId || !budget || !maxActions) {
      return res.status(400).json({
        error: "Missing required fields: providerAgentId, budget, maxActions",
      });
    }

    const provider = getAgentById(providerAgentId);
    if (!provider || provider.role !== "provider") {
      return res.status(404).json({ error: "Provider agent not found" });
    }

    if (!customer.privateKey) {
      return res.status(400).json({
        error: "Customer agent has no wallet key — cannot fund session onchain. Re-register with a privateKey or let the system generate one.",
      });
    }

    // Create session — agent-owned, tied to customer wallet
    const session = createSession(
      {
        providerAgentId,
        consumerAddress: customer.walletAddress,
        budget,
        maxActions,
        metadata,
        mode: "agent",
      },
      provider.walletAddress
    );

    // Mark agent ownership
    updateSession(session.id, {
      createdByWallet: customer.walletAddress,
    });

    // Initialize onchain: create session + mint USDC + deposit (all from customer wallet)
    await initAgentSession(session.id, customer.privateKey);

    const updatedSession = getSession(session.id);

    console.log(
      `[protocol] Session ${session.id} created — customer=${customer.id} provider=${provider.id} budget=${budget} auth=${req.authMethod} mode=${getMode()}`
    );

    res.json({
      session: updatedSession,
      message: `Agent session created and funded. Customer wallet ${customer.walletAddress} is the onchain consumer.`,
      authMethod: req.authMethod,
    });
  } catch (err: any) {
    console.error(`[protocol] Session creation failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/protocol/sessions — alias for backward compat ────────────
router.post("/sessions", async (req, res) => {
  // Re-dispatch to /sessions/create — just call the same logic
  (req as any).url = "/sessions/create";
  try {
    const customer = req.agent!;
    if (customer.role !== "customer") {
      return res.status(403).json({ error: "Only customer agents can create sessions" });
    }
    const { providerAgentId, budget, maxActions, metadata } = req.body;
    if (!providerAgentId || !budget || !maxActions) {
      return res.status(400).json({ error: "Missing required fields: providerAgentId, budget, maxActions" });
    }
    const provider = getAgentById(providerAgentId);
    if (!provider || provider.role !== "provider") {
      return res.status(404).json({ error: "Provider agent not found" });
    }
    if (!customer.privateKey) {
      return res.status(400).json({ error: "Customer agent has no wallet key" });
    }
    const session = createSession(
      { providerAgentId, consumerAddress: customer.walletAddress, budget, maxActions, metadata, mode: "agent" },
      provider.walletAddress
    );
    updateSession(session.id, { createdByWallet: customer.walletAddress });
    await initAgentSession(session.id, customer.privateKey);
    const updatedSession = getSession(session.id);
    res.json({ session: updatedSession, message: `Agent session created and funded.`, authMethod: req.authMethod });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/protocol/sessions — list sessions for authenticated agent ──
router.get("/sessions", (req, res) => {
  const agent = req.agent!;
  const allSessions = getAllSessions();

  // Show only sessions where this agent is a participant
  const agentSessions = allSessions.filter(
    (s) =>
      s.mode === "agent" &&
      (s.consumerAddress.toLowerCase() === agent.walletAddress.toLowerCase() ||
        s.providerAddress.toLowerCase() === agent.walletAddress.toLowerCase() ||
        s.providerAgentId === agent.id)
  );

  res.json(agentSessions);
});

// ── GET /api/protocol/sessions/:id — get session state ──────────────────
router.get("/sessions/:id", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  if (session.mode !== "agent") {
    return res.status(403).json({ error: "This is a demo session — use /api/sessions/:id instead" });
  }

  res.json({
    session,
    actions: getSessionActions(session.id),
    budget: {
      total: session.budget,
      spent: session.totalPaid,
      remaining: getRemainingBudget(session.id),
    },
  });
});

// ── GET /api/protocol/sessions/:id/status — lightweight status poll ─────
router.get("/sessions/:id/status", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  res.json({
    sessionId: session.id,
    status: session.status,
    totalActions: session.totalActions,
    settledActions: session.settledActions,
    failedActions: session.failedActions,
    totalPaid: session.totalPaid,
    budgetRemaining: getRemainingBudget(session.id),
    createdByWallet: session.createdByWallet,
  });
});

// ── POST /api/protocol/sessions/:id/action — execute action (402-gated) ─
router.post("/sessions/:id/action", requirePayment(), async (req, res) => {
  try {
    const customer = req.agent!;
    if (customer.role !== "customer") {
      return res.status(403).json({ error: "Only customer agents can execute actions" });
    }

    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (session.mode !== "agent") {
      return res.status(403).json({ error: "This is a demo session" });
    }
    if (session.consumerAddress.toLowerCase() !== customer.walletAddress.toLowerCase()) {
      return res.status(403).json({ error: "Not your session" });
    }

    if (!customer.privateKey) {
      return res.status(400).json({ error: "Customer has no wallet key" });
    }

    const { actionType, input } = req.body;
    if (!actionType) {
      return res.status(400).json({ error: "Missing required field: actionType" });
    }

    const validTypes: ActionType[] = ["API_LOOKUP", "JSON_TRANSFORM", "SUMMARIZE", "CLASSIFY", "FINAL_ANSWER"];
    if (!validTypes.includes(actionType)) {
      return res.status(400).json({ error: `Invalid actionType. Must be one of: ${validTypes.join(", ")}` });
    }

    // Check budget
    const remaining = getRemainingBudget(session.id);
    const { getActionPrice } = await import("../services/pricing.service");
    const price = getActionPrice(session.providerAgentId, actionType);
    if (remaining < price) {
      return res.status(402).json({
        error: "Insufficient budget",
        budgetRemaining: remaining,
        actionPrice: price,
        hint: "Finalize this session and create a new one with more budget",
      });
    }

    const result = await runAgentAction(
      session.id,
      customer.privateKey,
      actionType as ActionType,
      input || ""
    );

    res.json({
      ...result,
      paymentVerified: !!req.paymentProof,
      budgetRemaining: getRemainingBudget(session.id),
    });
  } catch (err: any) {
    console.error(`[protocol] Action execution failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Note: /sessions/:id/actions (plural) is NOT registered separately.
// Agents should use /sessions/:id/action (singular). This avoids route aliasing complexity.

// ── POST /api/protocol/sessions/:id/finalize — finalize session ─────────
router.post("/sessions/:id/finalize", async (req, res) => {
  try {
    const customer = req.agent!;
    if (customer.role !== "customer") {
      return res.status(403).json({ error: "Only customer agents can finalize sessions" });
    }

    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (session.mode !== "agent") {
      return res.status(403).json({ error: "This is a demo session" });
    }
    if (session.consumerAddress.toLowerCase() !== customer.walletAddress.toLowerCase()) {
      return res.status(403).json({ error: "Not your session" });
    }

    if (!customer.privateKey) {
      return res.status(400).json({ error: "Customer has no wallet key" });
    }

    const { batches, proofRoot, rootMeta } = await finalizeAgentSession(session.id, customer.privateKey);

    const finalSession = getSession(session.id);
    res.json({
      session: finalSession,
      summary: {
        totalActions: finalSession?.totalActions || 0,
        settledActions: finalSession?.settledActions || 0,
        failedActions: finalSession?.failedActions || 0,
        totalPaid: finalSession?.totalPaid || 0,
        budgetReturned: (finalSession?.budget || 0) - (finalSession?.totalPaid || 0),
        batchCount: batches.length,
        actionRoot: proofRoot,
        proofRoot,
        metering: "offchain",
        rootMeta,
        batches: batches.map(b => ({
          batchIndex: b.batchIndex,
          actionCount: b.actionCount,
          totalAmount: b.totalAmount,
          settleTxHash: b.settleTxHash,
          proofRoot: b.proofRoot,
          status: b.status,
        })),
      },
    });
  } catch (err: any) {
    console.error(`[protocol] Session finalization failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/protocol/whoami — check auth + see agent identity ──────────
router.get("/whoami", (req, res) => {
  const agent = req.agent!;
  res.json({
    id: agent.id,
    name: agent.name,
    role: agent.role,
    walletAddress: agent.walletAddress,
    source: agent.source,
    active: agent.active,
    authMethod: req.authMethod,
  });
});

export default router;
