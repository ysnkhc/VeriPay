import { Request, Response, NextFunction } from "express";
import { ActionType } from "../types/session";
import { getSession } from "../services/session.service";
import {
  generatePaymentPayload,
  verifyPaymentProof,
  getSigningInfo,
  PaymentProof,
} from "../services/payment.service";

// Extend Express Request to carry verified payment proof
declare global {
  namespace Express {
    interface Request {
      paymentProof?: PaymentProof;
    }
  }
}

/**
 * 402 Payment Required middleware for protocol action routes.
 *
 * Flow:
 *   1. Agent sends action request WITHOUT payment → gets 402 + payment payload
 *   2. Agent signs the payment payload with their wallet
 *   3. Agent resends request WITH X-Payment-Authorization header
 *   4. Middleware verifies → attaches proof to req → route handler executes + settles
 *
 * Only enforced on agent-mode sessions. Demo sessions pass through freely.
 */
export function requirePayment() {
  return (req: Request, res: Response, next: NextFunction) => {
    const sessionId = req.params.id;
    if (!sessionId) {
      return res.status(400).json({ error: "Missing session ID" });
    }

    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Demo sessions bypass payment enforcement
    if (session.mode === "demo") {
      return next();
    }

    // Agent-mode: payment required
    const actionType = req.body?.actionType as ActionType;
    if (!actionType) {
      return res.status(400).json({ error: "Missing actionType in request body" });
    }

    // Check for payment authorization header
    const paymentHeader = req.headers["x-payment-authorization"] as string;

    if (!paymentHeader) {
      // No payment proof → return 402 with payment payload
      const payload = generatePaymentPayload(sessionId, actionType);
      if (!payload) {
        return res.status(500).json({ error: "Could not generate payment payload" });
      }

      return res.status(402).json({
        status: 402,
        error: "Payment Required",
        paymentRequired: payload,
        signing: getSigningInfo(),
        instructions: {
          step1: "Sign the paymentRequired object using EIP-712 typed data with the provided domain and types",
          step2: "Resend this request with X-Payment-Authorization header containing JSON: { payload, signature }",
        },
      });
    }

    // Payment proof present → verify it
    let proof: PaymentProof;
    try {
      proof = JSON.parse(paymentHeader);
    } catch {
      return res.status(400).json({
        error: "Invalid X-Payment-Authorization header — must be valid JSON",
        format: '{ "payload": { ... }, "signature": "0x..." }',
      });
    }

    if (!proof.payload || !proof.signature) {
      return res.status(400).json({
        error: "Payment proof must contain 'payload' and 'signature' fields",
      });
    }

    // Derive signer address from the authenticated agent
    const agentWallet = req.agent?.walletAddress;
    if (!agentWallet) {
      return res.status(401).json({ error: "Agent not authenticated" });
    }

    proof.signerAddress = agentWallet;

    const result = verifyPaymentProof(proof, agentWallet, sessionId, actionType);

    if (!result.valid) {
      return res.status(403).json({
        error: "Payment verification failed",
        reason: result.error,
      });
    }

    // Payment verified — attach proof and continue
    req.paymentProof = proof;
    next();
  };
}
