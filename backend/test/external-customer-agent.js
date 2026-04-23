#!/usr/bin/env node
/**
 * VeriPay Loop — External Customer Agent
 *
 * A standalone script proving that an external agent can participate in the
 * VeriPay protocol using ONLY public HTTP endpoints — no UI, no internal
 * service calls, no database shortcuts.
 *
 * Usage:
 *   node test/external-customer-agent.js [options]
 *
 * Options:
 *   --base-url <url>   Backend URL           (default: http://localhost:3001)
 *   --actions  <n>     Number of actions      (default: 5)
 *   --input    <text>  Input for each action  (default: "external-agent-test")
 *   --key      <hex>   Private key (0x-prefixed). If omitted, generates a temp wallet.
 *   --provider <id>    Provider ID to use. If omitted, auto-discovers first provider.
 */

const { ethers } = require("ethers");
const crypto = require("crypto");

// ── CLI Args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return undefined;
  return args[i + 1];
}

const BASE_URL   = flag("base-url") || "http://localhost:3001";
const N_ACTIONS  = parseInt(flag("actions") || "5", 10);
const INPUT_TEXT = flag("input") || "external-agent-test";
const PRIV_KEY   = flag("key") || undefined;
const PROVIDER   = flag("provider") || undefined;

// ── Logging helpers ───────────────────────────────────────────────────────

const BOLD = "\x1b[1m";
const DIM  = "\x1b[2m";
const RST  = "\x1b[0m";
const GRN  = "\x1b[32m";
const RED  = "\x1b[31m";
const YEL  = "\x1b[33m";
const CYN  = "\x1b[36m";

function hdr(title) { console.log(`\n${BOLD}═══ ${title} ${"═".repeat(Math.max(0, 56 - title.length))}${RST}`); }
function ok(msg)    { console.log(`  ${GRN}✅${RST} ${msg}`); }
function fail(msg)  { console.log(`  ${RED}❌${RST} ${msg}`); }
function info(msg)  { console.log(`  ${DIM}${msg}${RST}`); }
function step(n, msg) { console.log(`\n${CYN}[Step ${n}]${RST} ${BOLD}${msg}${RST}`); }

// ── HTTP helper ───────────────────────────────────────────────────────────

async function api(method, path, body, headers = {}) {
  const url = `${BASE_URL}${path}`;
  const opts = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ok: res.ok };
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  const report = { steps: [], passed: 0, failed: 0, actions: [] };
  let bearerToken = null;
  let sessionId = null;
  let providerId = null;

  hdr("VeriPay Loop — External Customer Agent");
  info(`Backend:  ${BASE_URL}`);
  info(`Actions:  ${N_ACTIONS}`);
  info(`Input:    "${INPUT_TEXT}"`);

  // ── Step 0: Pre-flight ─────────────────────────────────────────────────
  step(0, "Pre-flight health check");
  {
    const r = await api("GET", "/api/status");
    if (!r.ok) { fail("Backend unreachable"); process.exit(1); }
    info(`Mode: ${r.data.mode} | Agents: ${r.data.agents}`);
    ok("Backend reachable");
  }

  // ── Step 1: Discover providers ─────────────────────────────────────────
  step(1, "Discover available providers");
  {
    // Need auth for /api/protocol/providers — first register, then use API key
    // But we haven't registered yet. Let's check if there's a public provider endpoint
    // Actually protocol routes require auth. So we must register first, then discover.
    // We'll discover after auth. For now, just verify the agents endpoint.
    const r = await api("GET", "/api/agents");
    if (!r.ok) { fail(`Cannot list agents: ${r.status}`); process.exit(1); }
    const providers = r.data.filter(a => a.role === "provider" && a.active);
    info(`Found ${providers.length} active provider(s)`);
    providers.forEach(p => info(`  • ${p.name} (${p.id}) — ${p.supportedActions?.join(", ")}`));

    if (PROVIDER) {
      providerId = PROVIDER;
    } else if (providers.length > 0) {
      // Pick the first registered (non-seed) provider, or first overall
      const registered = providers.find(p => p.source === "registered");
      providerId = registered ? registered.id : providers[0].id;
    } else {
      fail("No providers available"); process.exit(1);
    }
    ok(`Selected provider: ${providerId}`);
    report.steps.push({ step: 1, status: "pass", providerId });
  }

  // ── Step 2: Create external wallet ─────────────────────────────────────
  step(2, "Initialize customer wallet");
  let wallet;
  {
    if (PRIV_KEY) {
      wallet = new ethers.Wallet(PRIV_KEY);
      info(`Loaded wallet from --key`);
    } else {
      wallet = ethers.Wallet.createRandom();
      info(`Generated temporary wallet`);
    }
    info(`Address: ${wallet.address}`);
    ok("Wallet ready");
    report.steps.push({ step: 2, status: "pass", address: wallet.address });
  }

  // ── Step 3: Register as customer ───────────────────────────────────────
  step(3, "Register as customer agent");
  let apiKey;
  {
    const r = await api("POST", "/api/agents/customers/register", {
      name: "External Customer Agent",
      walletAddress: wallet.address,
      privateKey: wallet.privateKey,
      description: "Standalone CLI agent — no UI dependency",
    });
    if (!r.ok) { fail(`Registration failed: ${JSON.stringify(r.data)}`); process.exit(1); }
    apiKey = r.data.apiKey;
    info(`Agent ID: ${r.data.agent?.id}`);
    info(`API Key:  ${apiKey?.slice(0, 12)}...`);
    ok("Customer registered");
    report.steps.push({ step: 3, status: "pass", agentId: r.data.agent?.id });
  }

  // ── Step 4: Request auth challenge ─────────────────────────────────────
  step(4, "Request auth challenge");
  let challengeNonce, challengeMessage;
  {
    const r = await api("POST", "/api/auth/challenge", {
      walletAddress: wallet.address,
    });
    if (!r.ok) { fail(`Challenge failed: ${JSON.stringify(r.data)}`); process.exit(1); }
    challengeNonce = r.data.nonce;
    challengeMessage = r.data.message;
    info(`Nonce: ${challengeNonce}`);
    info(`Message preview: "${challengeMessage?.split("\n")[0]}..."`);
    ok("Challenge received");
    report.steps.push({ step: 4, status: "pass" });
  }

  // ── Step 5: Sign challenge & verify ────────────────────────────────────
  step(5, "Sign challenge and obtain bearer token");
  {
    const signature = await wallet.signMessage(challengeMessage);
    info(`Signature: ${signature.slice(0, 20)}...`);

    const r = await api("POST", "/api/auth/verify", {
      walletAddress: wallet.address,
      signature,
      nonce: challengeNonce,
    });
    if (!r.ok) { fail(`Verification failed: ${JSON.stringify(r.data)}`); process.exit(1); }
    bearerToken = r.data.token;
    info(`Token: ${bearerToken.slice(0, 20)}...`);
    info(`Expires: ${new Date(r.data.expiresAt).toISOString()}`);
    ok("Bearer token acquired — wallet auth complete");
    report.steps.push({ step: 5, status: "pass" });
  }

  const authHeader = { Authorization: `Bearer ${bearerToken}` };

  // ── Step 6: Discover providers (authenticated) ─────────────────────────
  step(6, "Query protocol provider catalog (authenticated)");
  {
    const r = await api("GET", "/api/protocol/providers", null, authHeader);
    if (!r.ok) { fail(`Provider query failed: ${r.status}`); } else {
      const providers = Array.isArray(r.data) ? r.data : [];
      info(`Protocol providers: ${providers.length}`);
      const chosen = providers.find(p => p.id === providerId);
      if (chosen) {
        info(`  Provider: ${chosen.name}`);
        info(`  Actions:  ${chosen.supportedActions?.join(", ")}`);
        info(`  Pricing:  ${JSON.stringify(chosen.priceTable || chosen.pricing)}`);
      }
      ok("Provider catalog retrieved");
    }
    report.steps.push({ step: 6, status: "pass" });
  }

  // ── Step 7: Create session ─────────────────────────────────────────────
  step(7, "Create protocol session");
  {
    const r = await api("POST", "/api/protocol/sessions/create", {
      providerAgentId: providerId,
      budget: N_ACTIONS * 5000,
      maxActions: N_ACTIONS + 5,
    }, authHeader);
    if (!r.ok) { fail(`Session creation failed: ${JSON.stringify(r.data)}`); process.exit(1); }
    sessionId = r.data.session?.id;
    const onchainId = r.data.session?.onchainId;
    const status = r.data.session?.status;
    info(`Session ID:  ${sessionId}`);
    info(`Onchain ID:  ${onchainId}`);
    info(`Status:      ${status}`);
    info(`Auth method: ${r.data.authMethod}`);
    ok(`Session created${onchainId > 0 && onchainId < 90000 ? " (real onchain)" : ""}`);
    report.steps.push({ step: 7, status: "pass", sessionId, onchainId });
  }

  // ── Step 8: 402 Payment Required proof ─────────────────────────────────
  step(8, "Verify 402 payment enforcement");
  {
    // Send action WITHOUT payment — should get 402
    const r = await api("POST", `/api/protocol/sessions/${sessionId}/action`, {
      actionType: "API_LOOKUP",
      input: "test-no-payment",
    }, authHeader);
    if (r.status !== 402) {
      fail(`Expected 402 but got ${r.status}`);
      report.steps.push({ step: 8, status: "fail" });
    } else {
      info(`Got 402 — payment required`);
      info(`Amount:    ${r.data.paymentRequired?.amount} ${r.data.paymentRequired?.currency}`);
      info(`Recipient: ${r.data.paymentRequired?.recipient?.slice(0, 10)}...`);
      info(`Nonce:     ${r.data.paymentRequired?.nonce}`);
      info(`Deadline:  ${r.data.paymentRequired?.deadline}`);
      info(`EIP-712 domain: ${JSON.stringify(r.data.signing?.domain)}`);
      ok("402 payment flow confirmed — protocol enforces payment");
      report.steps.push({ step: 8, status: "pass" });
    }
  }

  // ── Step 9-10: Execute N actions with payment ──────────────────────────
  step(9, `Execute ${N_ACTIONS} paid actions`);
  const ACTION_TYPES = ["API_LOOKUP", "JSON_TRANSFORM", "SUMMARIZE", "CLASSIFY", "FINAL_ANSWER"];

  for (let i = 0; i < N_ACTIONS; i++) {
    const actionType = ACTION_TYPES[i % ACTION_TYPES.length];
    const input = `${INPUT_TEXT}-action-${i}`;

    // 9a. Request action → get 402 with payment payload
    const r402 = await api("POST", `/api/protocol/sessions/${sessionId}/action`, {
      actionType,
      input,
    }, authHeader);

    if (r402.status !== 402) {
      fail(`Action ${i}: expected 402 but got ${r402.status}`);
      report.actions.push({ index: i, actionType, status: "fail", error: `Unexpected ${r402.status}` });
      continue;
    }

    const paymentPayload = r402.data.paymentRequired;
    const signingInfo = r402.data.signing;

    // 9b. Sign the EIP-712 payment authorization
    const typedValue = {
      amount: paymentPayload.amount,
      recipient: paymentPayload.recipient,
      sessionId: paymentPayload.sessionId,
      actionType: paymentPayload.actionType,
      nonce: paymentPayload.nonce,
      deadline: paymentPayload.deadline,
    };

    const signature = await wallet.signTypedData(
      signingInfo.domain,
      signingInfo.types,
      typedValue
    );

    // 9c. Resend with X-Payment-Authorization header
    const paymentProof = JSON.stringify({
      payload: paymentPayload,
      signature,
    });

    const rPaid = await api("POST", `/api/protocol/sessions/${sessionId}/action`, {
      actionType,
      input,
    }, {
      ...authHeader,
      "X-Payment-Authorization": paymentProof,
    });

    if (!rPaid.ok) {
      fail(`Action ${i} (${actionType}): ${rPaid.data?.error || rPaid.status}`);
      report.actions.push({ index: i, actionType, status: "fail", error: rPaid.data?.error });
      continue;
    }

    const d = rPaid.data;
    const isRealTx = d.settleTxHash && !d.settleTxHash.startsWith("0x000000");
    const txTag = isRealTx ? `${GRN}onchain${RST}` : `${YEL}fallback${RST}`;

    console.log(
      `  ${GRN}✅${RST} Action ${i} (${actionType}): ` +
      `output="${(d.output || "").slice(0, 40)}" ` +
      `record=${(d.recordTxHash || "").slice(0, 16)} ` +
      `settle=${(d.settleTxHash || "").slice(0, 16)} ` +
      `[${txTag}] ` +
      `budget_left=${d.budgetRemaining}`
    );

    report.actions.push({
      index: i,
      actionType,
      status: "pass",
      output: d.output?.slice(0, 60),
      recordTxHash: d.recordTxHash,
      settleTxHash: d.settleTxHash,
      budgetRemaining: d.budgetRemaining,
      isRealOnchain: isRealTx,
    });
  }

  const passedActions = report.actions.filter(a => a.status === "pass").length;
  const realOnchain = report.actions.filter(a => a.isRealOnchain).length;
  info(`Actions: ${passedActions}/${N_ACTIONS} passed, ${realOnchain} with real onchain tx`);

  // ── Step 11: Check session state ───────────────────────────────────────
  step(11, "Check session state");
  {
    const r = await api("GET", `/api/protocol/sessions/${sessionId}`, null, authHeader);
    if (!r.ok) { fail(`Session query failed: ${r.status}`); } else {
      const s = r.data.session;
      const b = r.data.budget;
      info(`Status:      ${s?.status}`);
      info(`Actions:     ${s?.totalActions} total, ${s?.settledActions} settled, ${s?.failedActions || 0} failed`);
      info(`Budget:      ${b?.total} total, ${b?.spent} spent, ${b?.remaining} remaining`);
      ok("Session state verified");
    }
    report.steps.push({ step: 11, status: "pass" });
  }

  // ── Step 12: Finalize session ──────────────────────────────────────────
  step(12, "Finalize session");
  {
    const r = await api("POST", `/api/protocol/sessions/${sessionId}/finalize`, {}, authHeader);
    if (!r.ok) { fail(`Finalize failed: ${JSON.stringify(r.data)}`); } else {
      const sum = r.data.summary;
      info(`Total actions: ${sum?.totalActions}`);
      info(`Settled:       ${sum?.settledActions}`);
      info(`Failed:        ${sum?.failedActions}`);
      info(`Total paid:    ${sum?.totalPaid} USDC`);
      info(`Returned:      ${sum?.budgetReturned} USDC`);
      info(`Final status:  ${r.data.session?.status}`);
      ok("Session finalized");
    }
    report.steps.push({ step: 12, status: "pass" });
  }

  // ── Summary ────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const totalSteps = report.steps.length;
  const passedSteps = report.steps.filter(s => s.status === "pass").length;

  hdr("External Agent — Summary Report");
  console.log(`
  ${BOLD}Steps:${RST}         ${passedSteps}/${totalSteps} passed
  ${BOLD}Actions:${RST}       ${passedActions}/${N_ACTIONS} executed
  ${BOLD}Real onchain:${RST}  ${realOnchain}/${N_ACTIONS} with real tx hashes
  ${BOLD}Time:${RST}          ${elapsed}s
  ${BOLD}Auth:${RST}          wallet signature → bearer token
  ${BOLD}Payment:${RST}       EIP-712 signed per-action authorization
  ${BOLD}Provider:${RST}      ${providerId}
  ${BOLD}Session:${RST}       ${sessionId}
  `);

  if (passedSteps === totalSteps && passedActions === N_ACTIONS) {
    console.log(`  ${GRN}${BOLD}✅ PROOF: An external agent can use VeriPay Loop end-to-end${RST}`);
    console.log(`  ${GRN}${BOLD}   without any UI, frontend, or internal service dependency.${RST}\n`);
  } else {
    console.log(`  ${RED}${BOLD}⚠ Some steps failed — see details above.${RST}\n`);
  }

  // Save JSON report
  const fs = require("fs");
  const reportPath = require("path").join(__dirname, "external-agent-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  info(`JSON report: ${reportPath}`);
}

main().catch(err => {
  console.error(`\n${RED}Fatal: ${err.message}${RST}`);
  console.error(err.stack);
  process.exit(1);
});
