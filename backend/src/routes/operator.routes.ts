import { Router } from "express";
import { getDashboardMetrics } from "../services/metrics.service";
import { getAllSessions, getSession, getTxFeed, updateSession } from "../services/session.service";
import { getAllAgents } from "../services/agent.service";
import { getRegistryStats } from "../services/registry.service";
import { checkRpcConnection, getMode } from "../services/settlement.service";
import { config } from "../config";

const router = Router();

// ── GET /api/operator/metrics — full dashboard metrics ──────────────────
router.get("/metrics", (_req, res) => {
  const metrics = getDashboardMetrics();
  res.json(metrics);
});

// ── GET /api/operator/sessions — all sessions across all modes ──────────
router.get("/sessions", (req, res) => {
  let sessions = getAllSessions();
  const mode = req.query.mode as string | undefined;
  if (mode === "demo" || mode === "agent") {
    sessions = sessions.filter((s) => s.mode === mode);
  }
  const status = req.query.status as string | undefined;
  if (status) {
    sessions = sessions.filter((s) => s.status === status);
  }
  res.json(sessions);
});

// ── GET /api/operator/sessions/:id — full session detail ────────────────
router.get("/sessions/:id", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.json(session);
});

// ── POST /api/operator/sessions/:id/override — admin override ───────────
router.post("/sessions/:id/override", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const { status } = req.body;
  if (status && ["cancelled", "completed"].includes(status)) {
    updateSession(session.id, {
      status,
      finalizedAt: status === "completed" ? Date.now() : undefined,
    });
    console.log(`[operator] Session ${session.id} overridden to ${status}`);
    return res.json({ session: getSession(session.id), message: `Session overridden to ${status}` });
  }

  return res.status(400).json({ error: "Invalid override. Allowed status: cancelled, completed" });
});

// ── GET /api/operator/tx-feed — live transaction feed ───────────────────
router.get("/tx-feed", (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  res.json(getTxFeed(limit));
});

// ── GET /api/operator/agents — all agents with internal details ─────────
router.get("/agents", (_req, res) => {
  const agents = getAllAgents();
  res.json(
    agents.map((a) => ({
      ...a,
      apiKeyHash: undefined,
      privateKey: undefined,
    }))
  );
});

// ── GET /api/operator/system — system health + config ───────────────────
router.get("/system", async (_req, res) => {
  const rpcConnected = await checkRpcConnection();
  const registry = getRegistryStats();

  res.json({
    mode: getMode(),
    rpcConnected,
    rpcUrl: config.arcRpcUrl,
    operatorAddress: config.operatorAddress || null,
    operatorFeePercent: config.operatorFeePercent,
    contracts: {
      usageMeter: config.contracts.usageMeter || null,
      nanoSettlement: config.contracts.nanoSettlement || null,
      agentRegistry: config.contracts.agentRegistry || null,
      usdc: config.contracts.usdc || null,
    },
    registry,
    agents: getAllAgents().length,
    sessions: getAllSessions().length,
  });
});

export default router;
