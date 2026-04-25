#!/usr/bin/env node
"use strict";

require("dotenv").config();
const { ethers } = require("ethers");

// ═══════════════════════════════════════════════════════════════════════════
//  Env validation — fail fast on missing secrets
// ═══════════════════════════════════════════════════════════════════════════

const REQUIRED_ENV = ["CUSTOMER_AGENT_PRIVATE_KEY"];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[FATAL] Missing required env var: ${key}`);
    console.error("        Copy .env.example to .env and fill in real values.");
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Configuration (all from env)
// ═══════════════════════════════════════════════════════════════════════════

// CLI mode — must be resolved before config
const _args = process.argv.slice(2);
const DEMO_MODE = process.env.DEMO_MODE === "true" || _args.includes("--live") || _args.includes("--dry");
const DRY_RUN   = _args.includes("--dry");
const MODE = _args.includes("--demo100") || _args.includes("--live") || _args.includes("--dry")
  ? "demo100" : _args.includes("--demo") ? "demo" : "test";
const ACTION_COUNT = MODE === "demo100" ? 100 : MODE === "demo" ? 50 : 5;

const BACKEND_URL  = process.env.VERIPAY_BACKEND_URL || "http://localhost:3001";
const CUSTOMER_ID  = process.env.CUSTOMER_AGENT_ID || "customer-payment-agent";
const PRICE_PER_ACTION = 0.001; // USDC
const MIN_BUDGET = (ACTION_COUNT * PRICE_PER_ACTION).toFixed(2);
const envBudget = process.env.CUSTOMER_AGENT_BUDGET_USDC;
const BUDGET_USDC = (envBudget && parseFloat(envBudget) >= parseFloat(MIN_BUDGET))
  ? envBudget : MIN_BUDGET;
const PRIVATE_KEY  = process.env.CUSTOMER_AGENT_PRIVATE_KEY;
const ARC_RPC_URL  = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";
const CHAIN_ID     = parseInt(process.env.CHAIN_ID || "5042002", 10);
const PROVIDER_PORT = process.env.PROVIDER_AGENT_PORT || "4101";
const SLOW_THRESHOLD_MS = 30_000;

const EXPLORER_URL = "https://testnet.arcscan.app";

// Derive wallet — never log the private key
const wallet         = new ethers.Wallet(PRIVATE_KEY);
const WALLET_ADDRESS = wallet.address;

// Budget in micro-USDC (backend uses integer micro-units)
const BUDGET_MICRO = Math.round(parseFloat(BUDGET_USDC) * 1_000_000);

// USDC contract ABI (minimal — balanceOf only)
const ERC20_BALANCE_ABI = ["function balanceOf(address) view returns (uint256)"];

// ═══════════════════════════════════════════════════════════════════════════
//  Console formatting
// ═══════════════════════════════════════════════════════════════════════════

const B = "\x1b[1m", D = "\x1b[2m", R = "\x1b[0m";
const G = "\x1b[32m", E = "\x1b[31m", Y = "\x1b[33m", C = "\x1b[36m", M = "\x1b[35m";

function hdr(t) {
  console.log(`\n${B}${"═".repeat(60)}${R}`);
  console.log(`${B}  ${t}${R}`);
  console.log(`${B}${"═".repeat(60)}${R}`);
}
function section(t) { if (!DEMO_MODE) console.log(`\n${M}── ${t} ${"─".repeat(Math.max(0, 52 - t.length))}${R}`); }
function ok(m)   { console.log(`  ${G}✔${R} ${m}`); }
function fail(m) { console.log(`  ${E}❌${R} ${m}`); }
function info(m) { if (!DEMO_MODE) console.log(`  ${D}${m}${R}`); }
function warn(m) { console.log(`  ${Y}⚠${R}  ${m}`); }
function debug(m) { if (!DEMO_MODE && process.env.DEBUG) console.log(`  ${D}[debug] ${m}${R}`); }

// ═══════════════════════════════════════════════════════════════════════════
//  HTTP helper
// ═══════════════════════════════════════════════════════════════════════════

async function api(method, path, body, headers = {}, timeoutMs = 180_000) {
  const url  = `${BACKEND_URL}${path}`;
  const opts = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  };
  if (body) opts.body = JSON.stringify(body);

  const res  = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ok: res.ok };
}

// ═══════════════════════════════════════════════════════════════════════════
//  PREFLIGHT CHECKS — must all pass before demo starts
// ═══════════════════════════════════════════════════════════════════════════

async function runPreflightChecks() {
  console.log("");
  console.log(`${B}--- PREFLIGHT CHECKS ---${R}`);
  let allOk = true;

  // 1. Arc RPC responds
  let rpcProvider;
  try {
    rpcProvider = new ethers.JsonRpcProvider(ARC_RPC_URL, CHAIN_ID);
    const blockNum = await rpcProvider.getBlockNumber();
    ok(`RPC: OK (block #${blockNum})`);
  } catch (err) {
    fail(`RPC: FAILED — ${err.message}`);
    allOk = false;
  }

  // 2. Wallet balance > 0.5 USDC (if USDC address available)
  let usdcBalance = null;
  try {
    const statusRes = await api("GET", "/api/status", null, {}, 10_000);
    const usdcAddr = statusRes.data?.contracts?.usdc;
    if (usdcAddr && rpcProvider) {
      const usdc = new ethers.Contract(usdcAddr, ERC20_BALANCE_ABI, rpcProvider);
      const raw = await usdc.balanceOf(WALLET_ADDRESS);
      usdcBalance = parseFloat(ethers.formatUnits(raw, 6));
      if (usdcBalance >= 0.5) {
        ok(`Wallet: OK (balance: ${usdcBalance.toFixed(2)} USDC)`);
      } else {
        fail(`Wallet: LOW BALANCE — ${usdcBalance.toFixed(2)} USDC (need ≥ 0.5)`);
        allOk = false;
      }
    } else {
      // No USDC address — check gas balance only
      if (rpcProvider) {
        const gasBal = await rpcProvider.getBalance(WALLET_ADDRESS);
        ok(`Wallet: OK (gas: ${parseFloat(ethers.formatEther(gasBal)).toFixed(4)} ETH, USDC: skipped)`);
      } else {
        warn("Wallet: skipped (RPC unavailable)");
      }
    }
  } catch (err) {
    warn(`Wallet: could not check USDC balance — ${err.message}`);
  }

  // 3. Backend online
  try {
    const r = await api("GET", "/api/status", null, {}, 10_000);
    if (r.ok) {
      ok(`Backend: OK (mode: ${r.data?.mode || "unknown"})`);
    } else {
      fail("Backend: NOT OK");
      allOk = false;
    }
  } catch (err) {
    fail(`Backend: UNREACHABLE — ${err.message}`);
    allOk = false;
  }

  // 4. Provider agent online
  try {
    const r = await fetch(`http://localhost:${PROVIDER_PORT}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    const d = await r.json();
    ok(`Provider: OK (${d.name})`);
  } catch (err) {
    fail(`Provider: UNREACHABLE at localhost:${PROVIDER_PORT} — ${err.message}`);
    allOk = false;
  }

  console.log("");
  if (!allOk) {
    fail("Preflight checks FAILED — fix issues above before running demo");
    process.exit(1);
  }
  ok("All preflight checks passed");
  console.log("");
  return { usdcBalance };
}

// ═══════════════════════════════════════════════════════════════════════════
//  Main runner
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const t0 = Date.now();

  // ─── Preflight (always runs for --live and --dry) ───────────────────
  if (DEMO_MODE) {
    await runPreflightChecks();
    if (DRY_RUN) {
      console.log(`${B}--- DRY RUN MODE ---${R}`);
      console.log(`  Onchain transactions will be SKIPPED.\n`);
    }
    console.log(`${B}--- START DEMO ---${R}`);
    console.log(`  Executing ${ACTION_COUNT} agent actions...\n`);
  } else {
    hdr(`VeriPay Customer Agent — ${MODE.toUpperCase()} mode (${ACTION_COUNT} actions)`);
  }

  // ─────────────────────────────────────────────────────────────────────
  // 1. Wallet info
  // ─────────────────────────────────────────────────────────────────────
  section("1. Wallet");
  info(`Customer wallet:  ${WALLET_ADDRESS}`);
  info(`Backend:          ${BACKEND_URL}`);
  info(`Budget:           ${BUDGET_USDC} USDC (${BUDGET_MICRO} micro-USDC)`);

  // Optionally check Arc balance (for gas)
  try {
    const provider = new ethers.JsonRpcProvider(ARC_RPC_URL, CHAIN_ID);
    const balance  = await provider.getBalance(WALLET_ADDRESS);
    info(`Arc balance:      ${ethers.formatEther(balance)} (gas)`);
  } catch (err) {
    debug(`Could not check Arc balance: ${err.message}`);
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2. Backend status
  // ─────────────────────────────────────────────────────────────────────
  section("2. Backend Status");

  const statusRes = await api("GET", "/api/status");
  if (!statusRes.ok) {
    fail(`Backend not reachable at ${BACKEND_URL}`);
    process.exit(1);
  }

  const backendMode = statusRes.data?.mode || "unknown";
  if (!DEMO_MODE) {
    ok(`Backend reachable — mode: ${backendMode}`);
    if (backendMode === "fallback") {
      warn("FALLBACK mode — tx hashes will be mock. Deploy contracts first.");
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 3. Discover provider
  // ─────────────────────────────────────────────────────────────────────
  section("3. Provider Discovery");

  // Check provider agent server is running
  const providerHealthUrl = `http://localhost:${PROVIDER_PORT}/health`;
  let providerInfo = null;
  try {
    const r = await fetch(providerHealthUrl);
    providerInfo = await r.json();
    if (!DEMO_MODE) {
      ok(`Provider server running: ${providerInfo.name}`);
      info(`Provider wallet:  ${providerInfo.wallet}`);
      info(`Provider price:   ${providerInfo.priceUsdc} USDC/action`);
    }
  } catch (err) {
    fail(`Provider server not reachable at ${providerHealthUrl}`);
    process.exit(1);
  }

  // Find registered provider in VeriPay backend
  const agentsRes = await api("GET", "/api/agents");
  let providerId    = null;
  let providerWallet = null;

  if (agentsRes.ok) {
    const providers = (agentsRes.data || []).filter((a) => a.role === "provider" && a.active);

    // Match by wallet if we know the provider server
    if (providerInfo?.wallet) {
      const match = providers.find(
        (a) => a.walletAddress.toLowerCase() === providerInfo.wallet.toLowerCase()
      );
      if (match) {
        providerId     = match.id;
        providerWallet = match.walletAddress;
      }
    }

    // Fallback: first active provider
    if (!providerId && providers.length > 0) {
      providerId     = providers[0].id;
      providerWallet = providers[0].walletAddress;
    }
  }

  if (!providerId) {
    fail("No provider agent registered with VeriPay backend.");
    process.exit(1);
  }

  if (!DEMO_MODE) {
    ok(`Using provider: ${providerId}`);
    info(`Provider wallet:  ${providerWallet}`);
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4. Register customer
  // ─────────────────────────────────────────────────────────────────────
  section("4. Customer Registration");

  const custRes = await api("POST", "/api/agents/customers/register", {
    name:          "Customer Payment Agent",
    walletAddress: WALLET_ADDRESS,
    privateKey:    PRIVATE_KEY,
    description:   `Automated customer agent — ${MODE} mode`,
  });

  if (custRes.ok) {
    if (!DEMO_MODE) ok(`Customer registered: ${custRes.data?.agent?.id}`);
  } else if (custRes.data?.error?.includes("already registered")) {
    debug("Customer wallet already registered");
  } else {
    fail(`Customer registration failed: ${custRes.data?.error}`);
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5. Wallet authentication (challenge/sign/verify → bearer token)
  // ─────────────────────────────────────────────────────────────────────
  section("5. Wallet Authentication");

  const challRes = await api("POST", "/api/auth/challenge", {
    walletAddress: WALLET_ADDRESS,
  });
  if (!challRes.ok) {
    fail(`Auth challenge failed: ${challRes.data?.error}`);
    process.exit(1);
  }
  debug("Auth challenge received");

  const sig    = await wallet.signMessage(challRes.data.message);
  const verRes = await api("POST", "/api/auth/verify", {
    walletAddress: WALLET_ADDRESS,
    signature:     sig,
    nonce:         challRes.data.nonce,
  });

  if (!verRes.ok) {
    fail(`Auth verification failed: ${verRes.data?.error}`);
    process.exit(1);
  }
  if (!DEMO_MODE) ok("Bearer token acquired");
  const bearerToken = verRes.data.token;
  const authH       = { Authorization: `Bearer ${bearerToken}` };

  // ─────────────────────────────────────────────────────────────────────
  // 6. Create session via VeriPay protocol
  // ─────────────────────────────────────────────────────────────────────
  section("6. Session Creation");

  const sessRes = await api(
    "POST",
    "/api/protocol/sessions/create",
    {
      providerAgentId: providerId,
      budget:          BUDGET_MICRO,
      maxActions:      ACTION_COUNT,
      metadata:        `agent-loop://${CUSTOMER_ID}/${MODE}`,
    },
    authH
  );

  if (!sessRes.ok) {
    fail(`Session creation failed: ${sessRes.data?.error}`);
    process.exit(1);
  }

  const sessionId = sessRes.data?.session?.id;
  const onchainId = sessRes.data?.session?.onchainId;

  if (!DEMO_MODE) {
    ok(`Session created: ${sessionId}`);
    info(`Onchain ID:      ${onchainId}`);
    info(`Budget:          ${BUDGET_MICRO} micro-USDC (${BUDGET_USDC} USDC)`);
    info(`Session status:  ${sessRes.data?.session?.status}`);
  }

  // ─────────────────────────────────────────────────────────────────────
  // 7. Action loop — PARALLEL execution through VeriPay 402 payment protocol
  // ─────────────────────────────────────────────────────────────────────
  const CONCURRENCY = 8;
  section(`7. Action Loop (${ACTION_COUNT} actions, concurrency=${CONCURRENCY}, offchain metering)`);
  console.log("");

  const ACTION_TYPES = ["API_LOOKUP", "CLASSIFY", "API_LOOKUP", "CLASSIFY", "FINAL_ANSWER"];
  const results      = new Array(ACTION_COUNT).fill(null);
  const batches      = [];
  let totalPaidMicro = 0;
  let failedCount    = 0;
  let completedCount = 0;

  /**
   * Execute a single action (402 flow). Returns result object.
   */
  async function executeAction(i) {
    const actionType = ACTION_TYPES[i % ACTION_TYPES.length];
    const input      = `risk-assessment-${i}-${Date.now()}`;

    // Step A: Request without payment → expect 402
    const r402 = await api(
      "POST",
      `/api/protocol/sessions/${sessionId}/action`,
      { actionType, input },
      authH
    );

    if (r402.status === 402 && r402.data?.error === "Insufficient budget") {
      return { index: i, actionType, status: "budget_exceeded", price: 0 };
    }

    if (!(r402.status === 402 && r402.data?.paymentRequired)) {
      return { index: i, actionType, status: "error", price: 0,
               error: `HTTP ${r402.status}: ${r402.data?.error || "unknown"}` };
    }

    const payload = r402.data.paymentRequired;
    const signing = r402.data.signing;

    // Step B: Sign EIP-712 payment authorization
    const typedValue = {
      amount:     payload.amount,
      recipient:  payload.recipient,
      sessionId:  payload.sessionId,
      actionType: payload.actionType,
      nonce:      payload.nonce,
      deadline:   payload.deadline,
    };

    const paymentSig = await wallet.signTypedData(
      signing.domain,
      signing.types,
      typedValue
    );

    // Step C: Resend with payment proof
    const rPaid = await api(
      "POST",
      `/api/protocol/sessions/${sessionId}/action`,
      { actionType, input },
      {
        ...authH,
        "X-Payment-Authorization": JSON.stringify({
          payload,
          signature: paymentSig,
        }),
      }
    );

    const d = rPaid.data || {};
    return {
      index:            i,
      actionType,
      status:           d.executionStatus || "unknown",
      price:            d.price || payload.amount,
      settlementStatus: d.settlementStatus || "PENDING",
      batchInfo:        d.batchInfo || {},
      output:           (d.output || "").slice(0, 120),
      budgetLeft:       d.budgetRemaining,
    };
  }

  /**
   * Promise pool — controlled concurrency.
   */
  const actionStartTime = Date.now();
  const pending = new Set();
  let nextIdx = 0;

  function launchNext() {
    if (nextIdx >= ACTION_COUNT) return;
    const i = nextIdx++;
    const p = executeAction(i).then((result) => {
      pending.delete(p);
      results[i] = result;
      completedCount++;

      const success = result.status === "success";
      if (success) totalPaidMicro += result.price;
      else failedCount++;

      // Parse output for display
      let preview = "";
      try {
        const parsed = JSON.parse(result.output || "{}");
        if (parsed.result) preview = `score=${parsed.result.score} level=${parsed.result.level}`;
        else preview = (result.output || "").slice(0, 40);
      } catch { preview = (result.output || "").slice(0, 40); }

      if (!DEMO_MODE) {
        const statusTag = success ? `${G}✔${R}` : `${E}✘${R}`;
        const costTag   = `${C}${(result.price / 1_000_000).toFixed(4)} USDC${R}`;

        console.log(
          `  ${B}#${String(i + 1).padStart(3)}${R} [${statusTag}] ` +
          `${result.actionType.padEnd(14)} → ${preview.padEnd(30)} | ${costTag} [${D}${result.settlementStatus || "PENDING"}${R}]`
        );

        if (result.batchInfo?.batchTriggered) {
          console.log(`  ${G}${B}  ↳ batch triggered (settlement in background)${R}`);
        }
      } else if (completedCount % 25 === 0 || completedCount === ACTION_COUNT) {
        process.stdout.write(`  ${G}✔${R} ${completedCount}/${ACTION_COUNT} actions completed\n`);
      }

      // Launch next action to maintain concurrency
      launchNext();
    }).catch((err) => {
      pending.delete(p);
      completedCount++;
      failedCount++;
      results[i] = { index: i, actionType: ACTION_TYPES[i % ACTION_TYPES.length], status: "error", price: 0, error: err.message };
      console.log(`  ${B}#${String(i + 1).padStart(3)}${R} [${E}✘${R}] error: ${err.message}`);
      launchNext();
    });
    pending.add(p);
  }

  // Seed the pool
  for (let j = 0; j < Math.min(CONCURRENCY, ACTION_COUNT); j++) {
    launchNext();
  }

  // Wait for all to complete
  while (pending.size > 0) {
    await Promise.race([...pending]);
  }

  const actionDuration = ((Date.now() - actionStartTime) / 1000).toFixed(2);
  const actionDurationMs = Date.now() - actionStartTime;

  // ── Timeout guard ──
  if (actionDurationMs > SLOW_THRESHOLD_MS) {
    warn(`Slow execution detected (${actionDuration}s > ${SLOW_THRESHOLD_MS / 1000}s threshold)`);
  }

  if (!DEMO_MODE) {
    console.log(`\n  ${G}${B}→ All ${completedCount} actions executed in ${actionDuration}s${R}`);
    console.log(`  ${D}  (settlement continues in background)${R}`);
  }

  // ─────────────────────────────────────────────────────────────────────
  // 8. Finalize session
  // ─────────────────────────────────────────────────────────────────────
  section("8. Settlement & Finalization");

  let finRes;
  if (DRY_RUN) {
    // Dry run — skip onchain finalization
    finRes = { ok: true, data: { summary: {
      settledActions: completedCount - failedCount,
      failedActions: failedCount,
      totalPaid: totalPaidMicro,
      budgetReturned: BUDGET_MICRO - totalPaidMicro,
      actionRoot: "0x_DRY_RUN_NO_TX",
      metering: "offchain (dry-run)",
      batches: [],
    }}};
    if (!DEMO_MODE) ok("Session finalized (DRY RUN — no onchain tx)");
  } else {
    finRes = await api(
      "POST",
      `/api/protocol/sessions/${sessionId}/finalize`,
      {},
      authH,
      300_000 // 5 min — waits for settleOffchain + finalizeSession onchain
    );

    if (finRes.ok) {
      if (!DEMO_MODE) ok("Session finalized");
      const s = finRes.data?.summary || {};
      info(`Settled actions:  ${s.settledActions}`);
      info(`Failed actions:   ${s.failedActions}`);
      info(`Total paid:       ${s.totalPaid} micro-USDC`);
      info(`Budget returned:  ${s.budgetReturned} micro-USDC`);

      // Collect final batch results from the finalize response
      if (s.batches && s.batches.length > 0) {
        // Merge any batches that happened during finalization (tail batch)
        for (const fb of s.batches) {
          if (!batches.find(b => b.batchIndex === fb.batchIndex)) {
            batches.push(fb);
          }
        }
      }
    } else {
      fail(`Settlement failed: ${finRes.data?.error}`);
      process.exit(1);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 9. Summary
  // ─────────────────────────────────────────────────────────────────────
  const elapsed      = ((Date.now() - t0) / 1000).toFixed(1);
  const successCount = results.filter((r) => r && r.status === "success").length;
  const totalPaidUSDC = (totalPaidMicro / 1_000_000).toFixed(6);
  const batchTxCount  = batches.length;
  const realBatches   = batches.filter(b => b.settleTxHash && !b.settleTxHash.startsWith("0x000000"));
  const totalOnchainTxs = batchTxCount + 3; // settle batches + create + deposit + finalize
  const actionRoot = finRes.data?.summary?.actionRoot || "N/A";

  // ── Find settlement tx link ──
  let settleTxLink = null;
  for (const b of realBatches) {
    if (b.settleTxHash) {
      settleTxLink = `${EXPLORER_URL}/tx/${b.settleTxHash}`;
      break;
    }
  }

  if (DEMO_MODE) {
    // ════════ CLEAN DEMO OUTPUT ════════
    console.log("");
    ok(`Completed ${successCount} actions in ${actionDuration}s`);
    ok(`Price per action: ${PRICE_PER_ACTION} USDC`);
    ok(`Total paid: ${totalPaidUSDC} USDC`);
    console.log("");
    ok(`Action Root: ${actionRoot}`);
    ok(`Actions: [0..${successCount - 1}]`);
    console.log("");
    if (DRY_RUN) {
      ok("Settlement TX: SKIPPED (dry-run)");
    } else if (settleTxLink) {
      ok(`Settlement TX:\n    ${settleTxLink}`);
    } else {
      ok(`Settlement TX: (fallback mode — no onchain tx)`);
    }
    console.log("");
    ok(`Onchain TX count: ${DRY_RUN ? 0 : totalOnchainTxs}`);
    ok(`Compression: ${successCount}:${DRY_RUN ? 0 : Math.max(batchTxCount, 1)}`);
    ok(`Total time: ${elapsed}s`);
    console.log("");
    console.log(`${B}--- END DEMO ---${R}`);
    console.log("");
  } else {
    // ════════ VERBOSE OUTPUT (non-demo) ════════
    hdr("Agent Loop — Summary");
    console.log(`
  ${B}Mode:${R}              ${MODE}
  ${B}Customer wallet:${R}   ${WALLET_ADDRESS}
  ${B}Provider wallet:${R}   ${providerWallet}
  ${B}Session ID:${R}        ${sessionId}
  ${B}Onchain ID:${R}        ${onchainId}
  ${B}Budget:${R}            ${BUDGET_USDC} USDC (${BUDGET_MICRO} micro-USDC)
  ${B}Price/action:${R}      ${process.env.PROVIDER_AGENT_PRICE_USDC || "0.001"} USDC
  ${B}Total actions:${R}     ${completedCount}
  ${B}Successful:${R}        ${successCount}
  ${B}Failed:${R}            ${failedCount}
  ${B}Action exec:${R}       ${actionDuration}s (concurrency=${CONCURRENCY})
  ${B}Batch txs:${R}         ${batchTxCount} (vs ${completedCount} per-action)
  ${B}Total paid:${R}        ${totalPaidMicro} micro-USDC (${totalPaidUSDC} USDC)
  ${B}Total time:${R}        ${elapsed}s (incl. finalization)
  ${B}Backend mode:${R}      ${backendMode}
  ${B}Settlement:${R}        offchain metering → single settleOffchain tx
  ${B}Action root:${R}       ${actionRoot}
  ${B}Actions [first]:${R}   ${finRes.data?.summary?.rootMeta?.firstActionIndex ?? '-'}
  ${B}Actions [last]:${R}    ${finRes.data?.summary?.rootMeta?.lastActionIndex ?? '-'}
  ${B}Metering:${R}          ${finRes.data?.summary?.metering || 'offchain'}
  `);

    // ── Batch settlement details ──
    if (batches.length > 0) {
      section("Batch Settlement Transactions");
      for (const b of batches) {
        const isReal = b.settleTxHash && !b.settleTxHash.startsWith("0x000000");
        const tag = isReal ? `${G}onchain${R}` : `${Y}fallback${R}`;
        const amt = ((b.totalAmount || 0) / 1_000_000).toFixed(4);
        console.log(
          `  ${B}Batch #${b.batchIndex}${R}: ${b.actionCount} actions → ${C}${amt} USDC${R} → [${tag}]`
        );
        if (isReal) {
          info(`  ${EXPLORER_URL}/tx/${b.settleTxHash}`);
        }
      }
    }

    // ── Final verdict ──
    console.log("");
    if (failedCount === 0 && completedCount >= ACTION_COUNT) {
      console.log(`  ${G}${B}✅ All ${completedCount} actions completed successfully.${R}`);
      console.log(`  ${G}${B}   ${completedCount} actions → ${totalOnchainTxs} total onchain txs (${batchTxCount} settle + 3 lifecycle)${R}`);
      console.log(`  ${G}${B}   ${completedCount}:${batchTxCount} action-to-settle compression${R}`);
    } else if (completedCount > 0) {
      console.log(`  ${Y}${B}⚠ ${completedCount}/${ACTION_COUNT} actions completed, ${failedCount} failed.${R}`);
    } else {
      console.log(`  ${E}${B}❌ No actions completed.${R}`);
    }
    console.log("");

    // ── Economic Argument ──
    section("Economic Argument");
    const ethCostPerTx = 0.50;  // average Ethereum L1 cost per tx
    const arcCostPerTx = 0.0001; // Arc testnet cost per tx (~negligible)
    const oldModelTxs = (completedCount * 2) + 3; // old: recordAction + settleAction per action + lifecycle
    const newModelTxs = totalOnchainTxs;
    const ethOldCost = (oldModelTxs * ethCostPerTx).toFixed(2);
    const ethNewCost = (newModelTxs * ethCostPerTx).toFixed(2);
    const arcOldCost = (oldModelTxs * arcCostPerTx).toFixed(4);
    const arcNewCost = (newModelTxs * arcCostPerTx).toFixed(4);
    console.log(`
  ${B}On Ethereum L1 (old per-action model):${R}
    ${completedCount} record txs + ${completedCount} settle txs = ${E}${B}${oldModelTxs} txs × $${ethCostPerTx} = $${ethOldCost}${R} → ${E}impossible at scale${R}

  ${B}On Ethereum L1 (offchain metering):${R}
    ${newModelTxs} txs × $${ethCostPerTx} = ${Y}$${ethNewCost}${R} → viable but expensive

  ${B}On Arc (offchain metering):${R}
    ${newModelTxs} txs × ~$${arcCostPerTx} = ${G}${B}$${arcNewCost}${R} → ${G}${B}negligible${R}

  ${G}${B}Savings: ${oldModelTxs} txs → ${newModelTxs} txs (${Math.round(oldModelTxs / Math.max(newModelTxs, 1))}× reduction)${R}
  ${G}${B}Cost:   $${ethOldCost} → $${arcNewCost} (${Math.round(parseFloat(ethOldCost) / Math.max(parseFloat(arcNewCost), 0.0001))}× cheaper)${R}
  `);
  }

  // Strict exit: fail if any settlement was fallback (no real onchain tx)
  const hasFallback = batches.some(b => !b.settleTxHash || b.settleTxHash.startsWith("0x000000"));
  if (hasFallback && !DRY_RUN) {
    if (DEMO_MODE) {
      console.log(`  ❌ Settlement used fallback mode — no real onchain tx.`);
      console.log(`     Fix contract USDC address alignment and redeploy.`);
    } else {
      fail("Settlement used fallback — no real onchain settlement tx.");
    }
    process.exit(1);
  }

  if (realBatches.length === 0 && !DRY_RUN && successCount > 0) {
    if (DEMO_MODE) {
      console.log(`  ❌ No real settlement transactions found.`);
    } else {
      fail("No real settlement transactions.");
    }
    process.exit(1);
  }

  process.exit(failedCount > 0 ? 1 : 0);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Entry point
// ═══════════════════════════════════════════════════════════════════════════

main().catch((err) => {
  fail(`${err.message}`);
  if (!DEMO_MODE && process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
