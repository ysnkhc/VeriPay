import express from "express";
import cors from "cors";
import { config } from "./config";
import authRouter from "./routes/auth.routes";
import agentsRouter from "./routes/agents.routes";
import sessionsRouter from "./routes/sessions.routes";
import dashboardRouter from "./routes/dashboard.routes";
import protocolRouter from "./routes/protocol.routes";
import operatorRouter from "./routes/operator.routes";
import { getAllAgents } from "./services/agent.service";
import { getTxFeed } from "./services/session.service";
import { checkRpcConnection, isRpcConnected, getMode } from "./services/settlement.service";
import { startRegistrySync } from "./services/registry.service";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ── Health ────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    product: "VeriPay Loop",
    timestamp: Date.now(),
    agents: getAllAgents().length,
  });
});

// ── Status — reports RPC, contracts, mode ─────────────────────────────
app.get("/api/status", async (_req, res) => {
  const rpcConnected = await checkRpcConnection();
  const contractsLoaded = !!(
    config.contracts.usageMeter &&
    config.contracts.nanoSettlement &&
    config.contracts.usdc
  );

  res.json({
    rpcConnected,
    contractsLoaded,
    mode: getMode(),
    rpcUrl: config.arcRpcUrl,
    operatorAddress: config.operatorAddress || null,
    contracts: {
      usageMeter: config.contracts.usageMeter || null,
      nanoSettlement: config.contracts.nanoSettlement || null,
      agentRegistry: config.contracts.agentRegistry || null,
      usdc: config.contracts.usdc || null,
    },
  });
});

// ── Route modules ─────────────────────────────────────────────────────
app.use("/api/auth", authRouter);         // wallet auth (agents)
app.use("/api/protocol", protocolRouter); // protocol layer (agents)
app.use("/api/operator", operatorRouter); // operator layer (monitoring)
app.use("/api/agents", agentsRouter);     // UI layer
app.use("/api/sessions", sessionsRouter); // UI layer (demo)
app.use("/api/dashboard", dashboardRouter); // UI layer

// ── Convenience: tx-feed at top level ─────────────────────────────────
app.get("/api/tx-feed", (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  res.json(getTxFeed(limit));
});

// ── Export for Vercel serverless ──────────────────────────────────────
export default app;

// ── Start (local dev / standalone) ───────────────────────────────────
if (process.env.VERCEL !== "1") {
  app.listen(config.port, async () => {
    console.log("");
    console.log("═══════════════════════════════════════════════════════");
    console.log("  VeriPay Loop — Backend");
    console.log("═══════════════════════════════════════════════════════");
    console.log(`  Port:     ${config.port}`);
    console.log(`  RPC:      ${config.arcRpcUrl}`);
    console.log(`  Operator: ${config.operatorAddress || "(not set)"}`);
    console.log(`  Agents:   ${getAllAgents().length} loaded`);
    console.log("");

    if (config.onchainMode) {
      console.log("  Contracts:");
      console.log(`    UsageMeter:       ${config.contracts.usageMeter}`);
      console.log(`    NanoSettlement:   ${config.contracts.nanoSettlement}`);
      console.log(`    AgentRegistry:    ${config.contracts.agentRegistry || "(none)"}`);
      console.log(`    USDC:             ${config.contracts.usdc}`);
      console.log("");

      const rpcOk = await checkRpcConnection();
      if (rpcOk) {
        console.log("  ✅ ONCHAIN MODE — real settlements via Anvil");
        startRegistrySync();
      } else {
        console.log("  ⚠️  FALLBACK MODE — RPC unreachable, using offchain mock");
        console.log("     Start Anvil and restart to enable onchain mode.");
      }
    } else {
      console.log("  ⚠️  FALLBACK MODE — contract addresses not configured");
      console.log("     Run: cd contracts && bash script/demo-deploy.sh");
    }

    console.log("═══════════════════════════════════════════════════════");
    console.log("");
  });
}
