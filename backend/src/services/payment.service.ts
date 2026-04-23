import { randomBytes, createHash } from "crypto";
import { ethers } from "ethers";
import { ActionType } from "../types/session";
import { getActionPrice } from "./pricing.service";
import { getSession } from "./session.service";
import { getAgentById } from "./agent.service";
import { config } from "../config";

// ── Types ───────────────────────────────────────────────────────────────

export interface PaymentPayload {
  amount: number;
  currency: "USDC";
  recipient: string;          // provider wallet
  sessionId: string;
  actionType: ActionType;
  nonce: string;
  deadline: number;           // unix timestamp
  chainId: number;
}

export interface PaymentProof {
  payload: PaymentPayload;
  signature: string;
  signerAddress: string;
}

// ── Config ──────────────────────────────────────────────────────────────

const PAYMENT_DEADLINE_MS = 2 * 60 * 1000; // 2 minutes to sign and submit
const CHAIN_ID = config.chainId;

// Used nonces — prevents replay attacks
const usedNonces: Set<string> = new Set();

// ── EIP-712 Domain + Types ──────────────────────────────────────────────

const EIP712_DOMAIN = {
  name: "VeriPay Protocol",
  version: "1",
  get chainId() { return config.chainId; },
};

const EIP712_TYPES = {
  PaymentAuthorization: [
    { name: "amount", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "sessionId", type: "string" },
    { name: "actionType", type: "string" },
    { name: "nonce", type: "string" },
    { name: "deadline", type: "uint256" },
  ],
};

// ── Payment Payload Generation ──────────────────────────────────────────

/**
 * Generate a payment payload that the agent must sign to authorize an action.
 * This is returned with a 402 response when payment is required.
 */
export function generatePaymentPayload(
  sessionId: string,
  actionType: ActionType
): PaymentPayload | null {
  const session = getSession(sessionId);
  if (!session) return null;

  const agent = getAgentById(session.providerAgentId);
  if (!agent) return null;

  const amount = getActionPrice(agent.id, actionType);
  const nonce = randomBytes(16).toString("hex");
  const deadline = Math.floor((Date.now() + PAYMENT_DEADLINE_MS) / 1000);

  return {
    amount,
    currency: "USDC",
    recipient: agent.walletAddress,
    sessionId,
    actionType,
    nonce,
    deadline,
    chainId: CHAIN_ID,
  };
}

// ── Payment Proof Verification ──────────────────────────────────────────

/**
 * Verify a signed payment authorization from an agent.
 * Checks: signature recovery, nonce freshness, deadline, amount correctness.
 */
export function verifyPaymentProof(
  proof: PaymentProof,
  expectedWallet: string,
  sessionId: string,
  actionType: ActionType
): { valid: boolean; error?: string } {
  const { payload, signature } = proof;

  // 1. Check deadline
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec > payload.deadline) {
    return { valid: false, error: "Payment authorization expired" };
  }

  // 2. Check nonce hasn't been used (replay protection)
  if (usedNonces.has(payload.nonce)) {
    return { valid: false, error: "Payment nonce already used" };
  }

  // 3. Check session matches
  if (payload.sessionId !== sessionId) {
    return { valid: false, error: "Payment sessionId mismatch" };
  }

  // 4. Check action type matches
  if (payload.actionType !== actionType) {
    return { valid: false, error: "Payment actionType mismatch" };
  }

  // 5. Check amount matches expected price
  const session = getSession(sessionId);
  if (!session) return { valid: false, error: "Session not found" };

  const agent = getAgentById(session.providerAgentId);
  if (!agent) return { valid: false, error: "Provider agent not found" };

  const expectedAmount = getActionPrice(agent.id, actionType);
  if (payload.amount < expectedAmount) {
    return { valid: false, error: `Insufficient payment: got ${payload.amount}, need ${expectedAmount}` };
  }

  // 6. Verify EIP-712 signature
  let recoveredAddress: string;
  try {
    const typedValue = {
      amount: payload.amount,
      recipient: payload.recipient,
      sessionId: payload.sessionId,
      actionType: payload.actionType,
      nonce: payload.nonce,
      deadline: payload.deadline,
    };

    recoveredAddress = ethers.verifyTypedData(EIP712_DOMAIN, EIP712_TYPES, typedValue, signature);
  } catch (err) {
    return { valid: false, error: "Invalid signature format" };
  }

  // 7. Check recovered address matches expected wallet
  if (ethers.getAddress(recoveredAddress) !== ethers.getAddress(expectedWallet)) {
    return { valid: false, error: "Signature does not match agent wallet" };
  }

  // 8. Mark nonce as used
  usedNonces.add(payload.nonce);

  // Cleanup old nonces periodically (keep set from growing unbounded)
  if (usedNonces.size > 10000) {
    const arr = Array.from(usedNonces);
    arr.splice(0, 5000);
    usedNonces.clear();
    arr.forEach((n) => usedNonces.add(n));
  }

  return { valid: true };
}

/**
 * Get the EIP-712 domain and types for client-side signing.
 * Agents need this to construct the correct typed data signature.
 */
export function getSigningInfo() {
  return {
    domain: EIP712_DOMAIN,
    types: EIP712_TYPES,
    primaryType: "PaymentAuthorization",
  };
}
