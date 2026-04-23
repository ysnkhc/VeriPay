import { randomBytes, createHmac } from "crypto";
import { ethers } from "ethers";

// ── Types ───────────────────────────────────────────────────────────────

export interface AuthChallenge {
  message: string;
  nonce: string;
  walletAddress: string;
  expiresAt: number;
}

export interface AuthToken {
  token: string;
  walletAddress: string;
  issuedAt: number;
  expiresAt: number;
}

// ── Config ──────────────────────────────────────────────────────────────

const CHALLENGE_TTL_MS = 5 * 60 * 1000;   // 5 minutes to sign
const TOKEN_TTL_MS = 60 * 60 * 1000;      // 1 hour session
const HMAC_SECRET = process.env.AUTH_HMAC_SECRET || randomBytes(32).toString("hex");

// ── Stores ──────────────────────────────────────────────────────────────

// Pending challenges: nonce → challenge data
const pendingChallenges: Map<string, AuthChallenge> = new Map();

// Active tokens: tokenHash → decoded token data (for revocation/lookup)
const activeTokens: Map<string, AuthToken> = new Map();

// ── Challenge Generation ────────────────────────────────────────────────

/**
 * Generate a cryptographic challenge for an agent wallet.
 * The agent must sign this message to prove wallet ownership.
 */
export function generateChallenge(walletAddress: string): AuthChallenge {
  const normalized = ethers.getAddress(walletAddress); // checksummed
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;

  // Plain message — agent signs this with their private key
  const message = [
    "VeriPay Protocol Authentication",
    "",
    `Wallet: ${normalized}`,
    `Nonce: ${nonce}`,
    `Issued: ${new Date().toISOString()}`,
    "",
    "Sign this message to authenticate your agent with the VeriPay protocol.",
    "This signature will not trigger any blockchain transaction.",
  ].join("\n");

  const challenge: AuthChallenge = {
    message,
    nonce,
    walletAddress: normalized,
    expiresAt,
  };

  pendingChallenges.set(nonce, challenge);

  // Auto-cleanup expired challenges
  setTimeout(() => pendingChallenges.delete(nonce), CHALLENGE_TTL_MS + 1000);

  return challenge;
}

// ── Challenge Verification ──────────────────────────────────────────────

/**
 * Verify a signed challenge and issue a bearer token.
 * Returns null if verification fails.
 */
export function verifyChallenge(
  walletAddress: string,
  signature: string,
  nonce: string
): AuthToken | null {
  const challenge = pendingChallenges.get(nonce);

  // Challenge must exist
  if (!challenge) {
    return null;
  }

  // Challenge must not be expired
  if (Date.now() > challenge.expiresAt) {
    pendingChallenges.delete(nonce);
    return null;
  }

  // Wallet must match
  const normalized = ethers.getAddress(walletAddress);
  if (challenge.walletAddress !== normalized) {
    return null;
  }

  // Verify signature — recover signer from the signed message
  let recoveredAddress: string;
  try {
    recoveredAddress = ethers.verifyMessage(challenge.message, signature);
  } catch {
    return null;
  }

  if (ethers.getAddress(recoveredAddress) !== normalized) {
    return null;
  }

  // Challenge consumed — single use
  pendingChallenges.delete(nonce);

  // Issue bearer token
  const issuedAt = Date.now();
  const expiresAt = issuedAt + TOKEN_TTL_MS;
  const token = mintToken(normalized, issuedAt, expiresAt);

  const authToken: AuthToken = { token, walletAddress: normalized, issuedAt, expiresAt };

  // Store for lookup/revocation
  const tokenHash = hashToken(token);
  activeTokens.set(tokenHash, authToken);

  // Auto-cleanup expired tokens
  setTimeout(() => activeTokens.delete(tokenHash), TOKEN_TTL_MS + 1000);

  console.log(`[wallet-auth] Token issued for ${normalized}`);
  return authToken;
}

// ── Token Verification ──────────────────────────────────────────────────

/**
 * Verify a bearer token and return the wallet address it belongs to.
 * Returns null if token is invalid or expired.
 */
export function verifyToken(token: string): string | null {
  // Decode and verify HMAC
  const parts = decodeToken(token);
  if (!parts) return null;

  const { walletAddress, issuedAt, expiresAt } = parts;

  // Check expiry
  if (Date.now() > expiresAt) {
    // Cleanup
    activeTokens.delete(hashToken(token));
    return null;
  }

  // Verify HMAC integrity
  const expectedHmac = computeHmac(walletAddress, issuedAt, expiresAt);
  if (parts.hmac !== expectedHmac) {
    return null;
  }

  return walletAddress;
}

// ── Token Minting ───────────────────────────────────────────────────────

function mintToken(walletAddress: string, issuedAt: number, expiresAt: number): string {
  const hmac = computeHmac(walletAddress, issuedAt, expiresAt);
  const payload = `${walletAddress}:${issuedAt}:${expiresAt}:${hmac}`;
  return `vpt_${Buffer.from(payload).toString("base64url")}`;
}

function decodeToken(token: string): { walletAddress: string; issuedAt: number; expiresAt: number; hmac: string } | null {
  if (!token.startsWith("vpt_")) return null;

  try {
    const payload = Buffer.from(token.slice(4), "base64url").toString("utf-8");
    const [walletAddress, issuedAtStr, expiresAtStr, hmac] = payload.split(":");
    if (!walletAddress || !issuedAtStr || !expiresAtStr || !hmac) return null;

    return {
      walletAddress,
      issuedAt: parseInt(issuedAtStr, 10),
      expiresAt: parseInt(expiresAtStr, 10),
      hmac,
    };
  } catch {
    return null;
  }
}

function computeHmac(walletAddress: string, issuedAt: number, expiresAt: number): string {
  return createHmac("sha256", HMAC_SECRET)
    .update(`${walletAddress}:${issuedAt}:${expiresAt}`)
    .digest("hex");
}

function hashToken(token: string): string {
  return createHmac("sha256", HMAC_SECRET).update(token).digest("hex").slice(0, 16);
}
