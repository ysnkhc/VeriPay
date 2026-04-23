import { Router } from "express";
import { generateChallenge, verifyChallenge } from "../services/wallet-auth.service";
import { getAgentByWallet } from "../services/agent.service";

const router = Router();

// ── POST /api/auth/challenge — request a signable challenge ─────────────
router.post("/challenge", (req, res) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress || typeof walletAddress !== "string") {
      return res.status(400).json({
        error: "Missing required field: walletAddress",
      });
    }

    // Wallet must belong to a registered agent
    const agent = getAgentByWallet(walletAddress);
    if (!agent) {
      return res.status(404).json({
        error: "No agent registered with this wallet",
        hint: "Register first at POST /api/agents/providers/register or /api/agents/customers/register",
      });
    }

    const challenge = generateChallenge(walletAddress);

    res.json({
      message: challenge.message,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
      agentId: agent.id,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/auth/verify — exchange signed challenge for bearer token ──
router.post("/verify", (req, res) => {
  try {
    const { walletAddress, signature, nonce } = req.body;

    if (!walletAddress || !signature || !nonce) {
      return res.status(400).json({
        error: "Missing required fields: walletAddress, signature, nonce",
      });
    }

    const authToken = verifyChallenge(walletAddress, signature, nonce);

    if (!authToken) {
      return res.status(401).json({
        error: "Authentication failed",
        reasons: [
          "Invalid or expired nonce",
          "Signature does not match wallet",
          "Challenge already consumed",
        ],
      });
    }

    // Resolve the agent for the response
    const agent = getAgentByWallet(walletAddress);

    res.json({
      token: authToken.token,
      expiresAt: authToken.expiresAt,
      agent: agent
        ? {
            id: agent.id,
            name: agent.name,
            role: agent.role,
            walletAddress: agent.walletAddress,
          }
        : null,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
