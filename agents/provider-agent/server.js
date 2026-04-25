#!/usr/bin/env node
"use strict";

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");

// ═══════════════════════════════════════════════════════════════════════════
//  Env validation — fail fast on missing secrets
// ═══════════════════════════════════════════════════════════════════════════

const REQUIRED_ENV = ["PROVIDER_AGENT_PRIVATE_KEY"];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[FATAL] Missing required env var: ${key}`);
    console.error("        Copy .env.example to .env and fill in real values.");
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Configuration (all from env — no hardcoded secrets)
// ═══════════════════════════════════════════════════════════════════════════

const PORT         = parseInt(process.env.PROVIDER_AGENT_PORT || "4101", 10);
const AGENT_ID     = process.env.PROVIDER_AGENT_ID || "provider-risk-agent";
const AGENT_NAME   = process.env.PROVIDER_AGENT_NAME || "Risk Analysis Provider";
const PRICE_USDC   = process.env.PROVIDER_AGENT_PRICE_USDC || "0.001";
const BACKEND_URL  = process.env.VERIPAY_BACKEND_URL || "http://localhost:3001";
const PRIVATE_KEY  = process.env.PROVIDER_AGENT_PRIVATE_KEY;

// Derive wallet address from private key — never log the key itself
const wallet         = new ethers.Wallet(PRIVATE_KEY);
const WALLET_ADDRESS = wallet.address;

// Convert USDC price to micro-units (backend uses integer micro-USDC)
const PRICE_MICRO = Math.round(parseFloat(PRICE_USDC) * 1_000_000);

// ═══════════════════════════════════════════════════════════════════════════
//  Stats tracker
// ═══════════════════════════════════════════════════════════════════════════

const stats = {
  totalRequests: 0,
  successes: 0,
  failures: 0,
  startedAt: Date.now(),
};

// ═══════════════════════════════════════════════════════════════════════════
//  Deterministic risk analysis engine
//  Uses keccak256(input + actionIndex) for reproducible scoring.
//  No external API calls — demo never fails due to rate limits or billing.
// ═══════════════════════════════════════════════════════════════════════════

function analyzeRisk(input, actionIndex) {
  const seed  = ethers.id((input || "") + String(actionIndex || 0));
  const score = parseInt(seed.slice(2, 4), 16) % 101; // 0-100

  let level, reason;
  if (score <= 33) {
    level  = "LOW";
    reason = `Input "${(input || "").slice(0, 30)}" shows low risk indicators. Standard processing recommended.`;
  } else if (score <= 66) {
    level  = "MEDIUM";
    reason = `Input "${(input || "").slice(0, 30)}" contains moderate risk signals. Enhanced monitoring suggested.`;
  } else {
    level  = "HIGH";
    reason = `Input "${(input || "").slice(0, 30)}" triggers high risk markers. Manual review recommended.`;
  }

  return { score, level, reason };
}

// ═══════════════════════════════════════════════════════════════════════════
//  Express app
// ═══════════════════════════════════════════════════════════════════════════

const app = express();
app.use(cors());
app.use(express.json());

// ── GET /health ──────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    agentId:   AGENT_ID,
    name:      AGENT_NAME,
    wallet:    WALLET_ADDRESS,
    service:   "risk-analysis",
    priceUsdc: PRICE_USDC,
    status:    "running",
    uptime:    Date.now() - stats.startedAt,
    stats,
  });
});

// ── POST /provider/analyze-risk — public demo endpoint ───────────────────
// Accepts:  { input, sessionId?, actionIndex? }
// Returns:  { agentId, service, priceUsdc, result: { score, level, reason } }
app.post("/provider/analyze-risk", (req, res) => {
  stats.totalRequests++;
  try {
    const { input, sessionId, actionIndex } = req.body;

    if (!input) {
      stats.failures++;
      return res.status(400).json({ error: "Missing required field: input" });
    }

    const result = analyzeRisk(input, actionIndex || 0);
    stats.successes++;

    res.json({
      agentId:   AGENT_ID,
      service:   "risk-analysis",
      priceUsdc: PRICE_USDC,
      result,
    });
  } catch (err) {
    stats.failures++;
    res.status(500).json({ error: err.message });
  }
});

// ── POST /agent — VeriPay backend invocation endpoint ────────────────────
// Backend sends:  { sessionId, actionType, actionIndex, input, customerWallet }
// Must return:    { output: string, status: "success"|"error" }
app.post("/agent", (req, res) => {
  stats.totalRequests++;
  try {
    const { sessionId, actionType, actionIndex, input, customerWallet } = req.body;

    const result = analyzeRisk(input || `action-${actionIndex}`, actionIndex || 0);
    stats.successes++;

    res.json({
      output: JSON.stringify({
        agentId:   AGENT_ID,
        service:   "risk-analysis",
        priceUsdc: PRICE_USDC,
        result,
      }),
      status: "success",
      metadata: { sessionId, actionType, actionIndex, customerWallet },
    });
  } catch (err) {
    stats.failures++;
    res.status(500).json({
      output:       "",
      status:       "error",
      errorMessage: err.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  Self-registration with VeriPay backend
// ═══════════════════════════════════════════════════════════════════════════

async function selfRegister() {
  const endpoint = `http://localhost:${PORT}/agent`;

  try {
    const res = await fetch(`${BACKEND_URL}/api/agents/providers/register`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:             AGENT_NAME,
        walletAddress:    WALLET_ADDRESS,
        endpoint,
        supportedActions: ["API_LOOKUP", "CLASSIFY", "FINAL_ANSWER"],
        pricing: [
          { actionType: "API_LOOKUP",    pricePerUnit: PRICE_MICRO },
          { actionType: "CLASSIFY",      pricePerUnit: PRICE_MICRO },
          { actionType: "FINAL_ANSWER",  pricePerUnit: PRICE_MICRO },
        ],
        description:  `${AGENT_NAME} — deterministic risk analysis service`,
        mode:         "data_lookup",
        capabilities: ["risk-analysis", "scoring", "classification"],
      }),
    });

    const data = await res.json();

    if (res.ok) {
      console.log(`  Registered with VeriPay backend`);
      console.log(`    Agent ID:  ${data.agent?.id}`);
      console.log(`    API Key:   ${(data.apiKey || "").slice(0, 16)}...`);
      return data;
    }

    // Duplicate wallet is expected on restart — not an error
    if (data.error && data.error.includes("already registered")) {
      console.log("  Already registered with VeriPay backend (wallet exists)");
      return null;
    }

    console.warn(`  Registration failed: ${data.error || JSON.stringify(data)}`);
    return null;
  } catch (err) {
    console.warn(`  Could not reach VeriPay backend at ${BACKEND_URL}`);
    console.warn(`    ${err.message}`);
    console.warn("  Provider will run standalone — start backend first or register manually.");
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Start server
// ═══════════════════════════════════════════════════════════════════════════

app.listen(PORT, async () => {
  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  ${AGENT_NAME}`);
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Port:          ${PORT}`);
  console.log(`  Wallet:        ${WALLET_ADDRESS}`);
  console.log(`  Price:         ${PRICE_USDC} USDC/action (${PRICE_MICRO} micro-USDC)`);
  console.log(`  VeriPay:       ${BACKEND_URL}`);
  console.log("");

  await selfRegister();

  console.log("");
  console.log("  Endpoints:");
  console.log(`    GET  http://localhost:${PORT}/health`);
  console.log(`    POST http://localhost:${PORT}/provider/analyze-risk`);
  console.log(`    POST http://localhost:${PORT}/agent  (VeriPay invocation)`);
  console.log("═══════════════════════════════════════════════════════");
  console.log("");
});
