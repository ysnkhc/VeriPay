import { Router } from "express";
import { getAgentById } from "../services/agent.service";
import {
  createSession,
  getSession,
  getAllSessions,
  getSessionActions,
  updateSession,
} from "../services/session.service";
import { runLoop, runSingleAction } from "../services/loop.service";
import {
  createSessionOnchain,
  depositSessionOnchain,
  finalizeSessionOnchain,
  getMode,
} from "../services/settlement.service";

const router = Router();

// GET /api/sessions — list all sessions (optional ?mode=demo|agent filter)
router.get("/", (req, res) => {
  let sessions = getAllSessions();
  const mode = req.query.mode as string | undefined;
  if (mode === "demo" || mode === "agent") {
    sessions = sessions.filter((s) => s.mode === mode);
  }
  res.json(sessions);
});

// POST /api/sessions/demo — one-click demo: create + start 100-action loop
router.post("/demo", async (req, res) => {
  try {
    const agentId = req.body.agentId || "agent-research";
    const actionCount = req.body.actionCount || 100;
    const delayMs = req.body.delayMs ?? 80;

    const agent = getAgentById(agentId);
    if (!agent) {
      return res.status(404).json({ error: "Demo agent not found" });
    }

    // Create session with generous budget
    const session = createSession(
      {
        providerAgentId: agentId,
        consumerAddress: "0x0000000000000000000000000000000000000002",
        budget: 1_000_000, // $1.00 USDC — covers 100+ actions
        maxActions: actionCount,
        mode: "demo",
      },
      agent.walletAddress
    );

    console.log(`[demo] Session ${session.id} created — starting ${actionCount}-action loop (mode: ${getMode()})`);

    // Start loop asynchronously — don't await, return immediately so frontend can poll
    runLoop(session.id, actionCount, delayMs)
      .then(() => {
        console.log(`[demo] Session ${session.id} completed successfully`);
      })
      .catch((err) => {
        console.error(`[demo] Session ${session.id} loop failed: ${err.message}`);
        updateSession(session.id, { status: "cancelled" });
      });

    // Return session immediately — frontend polls for progress
    res.json({
      sessionId: session.id,
      agentId,
      actionCount,
      delayMs,
      mode: getMode(),
      message: `Demo started — ${actionCount} actions in progress`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sessions — create a new session
router.post("/", async (req, res) => {
  try {
    const { providerAgentId, consumerAddress, budget, maxActions, metadata } = req.body;

    if (!providerAgentId || !consumerAddress || !budget || !maxActions) {
      return res.status(400).json({ error: "Missing required fields: providerAgentId, consumerAddress, budget, maxActions" });
    }

    const agent = getAgentById(providerAgentId);
    if (!agent) {
      return res.status(404).json({ error: "Provider agent not found" });
    }

    const session = createSession(
      { providerAgentId, consumerAddress, budget, maxActions, metadata },
      agent.walletAddress
    );

    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sessions/:id/start — start automated action loop
router.post("/:id/start", async (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const { actionCount, delayMs } = req.body;
    const count = actionCount || session.maxActions;
    const delay = delayMs ?? 50;

    // Run the loop (this may take a while for 50-100 actions)
    const result = await runLoop(req.params.id, count, delay);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sessions/:id/action — manually trigger one billable action
router.post("/:id/action", async (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // If session is pending, create + deposit onchain first
    if (session.status === "pending") {
      const agent = getAgentById(session.providerAgentId);
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      const primaryType = agent.supportedActions.find((a) => a !== "FINAL_ANSWER") || "API_LOOKUP";
      const { pricePerUnit } = agent.pricing.find((p) => p.actionType === primaryType) || { pricePerUnit: 1000 };

      const { onchainId } = await createSessionOnchain(
        agent.walletAddress,
        pricePerUnit,
        session.metadataURI || `session://${session.id}`
      );
      await depositSessionOnchain(onchainId, session.budget);
      updateSession(session.id, { onchainId, status: "active" });
      session.onchainId = onchainId;
      session.status = "active";
    }

    const { actionType } = req.body;
    const result = await runSingleAction(req.params.id, actionType);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sessions/:id/complete — finalize session
router.post("/:id/complete", async (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (!session.onchainId) {
      return res.status(400).json({ error: "Session has no onchain ID" });
    }

    await finalizeSessionOnchain(session.onchainId);
    updateSession(session.id, { status: "completed", finalizedAt: Date.now() });

    res.json(getSession(session.id));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sessions/:id — get session detail
router.get("/:id", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.json(session);
});

// GET /api/sessions/:id/actions — get all actions for session
router.get("/:id/actions", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.json(getSessionActions(session.id));
});

// GET /api/sessions/:id/metrics — per-session metrics
router.get("/:id/metrics", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const actions = getSessionActions(session.id);
  const settled = actions.filter((a) => a.status === "settled");
  const avgPrice = settled.length > 0
    ? settled.reduce((sum, a) => sum + a.totalPrice, 0) / settled.length
    : 0;

  res.json({
    sessionId: session.id,
    onchainId: session.onchainId,
    status: session.status,
    totalActions: session.totalActions,
    settledActions: session.settledActions,
    totalPaid: session.totalPaid,
    budget: session.budget,
    budgetRemaining: session.budget - session.totalPaid,
    avgPricePerAction: Math.round(avgPrice),
    durationMs: session.finalizedAt
      ? session.finalizedAt - session.createdAt
      : Date.now() - session.createdAt,
  });
});

export default router;
