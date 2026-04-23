import { Request, Response, NextFunction } from "express";
import { getAgentByApiKey, getAgentByWallet } from "../services/agent.service";
import { verifyToken } from "../services/wallet-auth.service";
import { Agent } from "../types/agent";

// Extend Express Request to carry authenticated agent + auth method
declare global {
  namespace Express {
    interface Request {
      agent?: Agent;
      authMethod?: "wallet" | "apikey";
    }
  }
}

/**
 * Dual-mode authentication middleware for protocol routes.
 *
 * Priority order:
 *   1. Wallet token — Authorization: Bearer vpt_...
 *   2. API key — X-Agent-Key header (legacy fallback)
 *
 * Attaches the authenticated agent to req.agent and auth method to req.authMethod.
 */
export function agentAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  // ── 1. Try wallet bearer token ─────────────────────────────────────
  const authHeader = req.headers["authorization"] as string;
  if (authHeader?.startsWith("Bearer vpt_")) {
    const token = authHeader.slice(7); // strip "Bearer "

    const walletAddress = verifyToken(token);
    if (!walletAddress) {
      return res.status(401).json({
        error: "Invalid or expired wallet token",
        hint: "Re-authenticate via POST /api/auth/challenge + /api/auth/verify",
      });
    }

    const agent = getAgentByWallet(walletAddress);
    if (!agent) {
      return res.status(401).json({
        error: "No agent registered for this wallet",
      });
    }

    if (!agent.active) {
      return res.status(403).json({ error: "Agent is deactivated" });
    }

    req.agent = agent;
    req.authMethod = "wallet";
    return next();
  }

  // ── 2. Fallback: API key ───────────────────────────────────────────
  const apiKey = req.headers["x-agent-key"] as string;
  if (apiKey) {
    const agent = getAgentByApiKey(apiKey);
    if (!agent) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    if (!agent.active) {
      return res.status(403).json({ error: "Agent is deactivated" });
    }

    req.agent = agent;
    req.authMethod = "apikey";
    return next();
  }

  // ── 3. No credentials ─────────────────────────────────────────────
  return res.status(401).json({
    error: "Authentication required",
    methods: {
      wallet: "Authorization: Bearer vpt_... (recommended — via /api/auth/challenge + /api/auth/verify)",
      apiKey: "X-Agent-Key: vpk_... (legacy fallback)",
    },
  });
}
