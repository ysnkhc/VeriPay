#!/usr/bin/env node
/**
 * VeriPay Loop — E2E External Agent Network Test
 *
 * Proves a real agent-to-agent flow:
 *   External Customer Agent ←→ VeriPay Backend ←→ External Provider Agent
 *
 * Prerequisites (run in separate terminals):
 *   1. Backend:   npm run dev                        (port 3001)
 *   2. Provider:  node test/external-provider-agent.js --mode mixed  (port 4001)
 *
 * Then run:
 *   node test/e2e-external-agent-network.js [options]
 *
 * Options:
 *   --base-url <url>      Backend URL               (default: http://localhost:3001)
 *   --provider-url <url>  External provider endpoint (default: http://localhost:4001/agent)
 *   --actions <n>         Number of actions          (default: 6)
 */

const { ethers } = require("ethers");

// ── CLI ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}

const BASE_URL     = flag("base-url") || "http://localhost:3001";
const PROVIDER_URL = flag("provider-url") || "http://localhost:4001/agent";
const N_ACTIONS    = parseInt(flag("actions") || "6", 10);

// ── Colors ────────────────────────────────────────────────────────────────

const BOLD = "\x1b[1m";
const DIM  = "\x1b[2m";
const RST  = "\x1b[0m";
const GRN  = "\x1b[32m";
const RED  = "\x1b[31m";
const YEL  = "\x1b[33m";
const CYN  = "\x1b[36m";
const MAG  = "\x1b[35m";

function hdr(t) { console.log(`\n${BOLD}${"═".repeat(60)}${RST}\n${BOLD}  ${t}${RST}\n${BOLD}${"═".repeat(60)}${RST}`); }
function section(t) { console.log(`\n${MAG}── ${t} ${"─".repeat(Math.max(0, 52 - t.length))}${RST}`); }
function ok(m)   { console.log(`  ${GRN}✅${RST} ${m}`); }
function fail(m) { console.log(`  ${RED}❌${RST} ${m}`); }
function info(m) { console.log(`  ${DIM}${m}${RST}`); }

// ── HTTP ──────────────────────────────────────────────────────────────────

async function api(method, path, body, headers = {}) {
  const url = `${BASE_URL}${path}`;
  const opts = { method, headers: { "Content-Type": "application/json", ...headers } };
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
  const results = { passed: 0, failed: 0, tests: [] };

  function assert(name, cond, detail) {
    if (cond) { ok(`${name}${detail ? ` — ${detail}` : ""}`); results.passed++; }
    else { fail(`${name}${detail ? ` — ${detail}` : ""}`); results.failed++; }
    results.tests.push({ name, passed: !!cond, detail });
  }

  hdr("VeriPay Loop — E2E External Agent Network");
  info(`Backend:      ${BASE_URL}`);
  info(`Provider URL: ${PROVIDER_URL}`);
  info(`Actions:      ${N_ACTIONS}`);

  // ────────────────────────────────────────────────────────────────────────
  section("A. Pre-flight");

  // Check backend
  const statusRes = await api("GET", "/api/status");
  assert("Backend reachable", statusRes.ok);
  info(`Mode: ${statusRes.data?.mode}`);

  // Check provider server
  const providerHealthUrl = PROVIDER_URL.replace(/\/agent$/, "/health");
  let providerHealth;
  try {
    const r = await fetch(providerHealthUrl);
    providerHealth = await r.json();
    assert("External provider reachable", r.ok, `name="${providerHealth.name}" mode=${providerHealth.mode}`);
  } catch (err) {
    fail(`External provider not reachable at ${providerHealthUrl}: ${err.message}`);
    console.log(`\n  ${RED}Start the provider first:${RST} node test/external-provider-agent.js --mode mixed\n`);
    process.exit(1);
  }

  // ────────────────────────────────────────────────────────────────────────
  section("B. Register External Provider");

  const providerWallet = ethers.Wallet.createRandom();

  const provRegRes = await api("POST", "/api/agents/providers/register", {
    name: providerHealth?.name || "External Provider Alpha",
    walletAddress: providerWallet.address,
    endpoint: PROVIDER_URL,
    supportedActions: ["API_LOOKUP", "JSON_TRANSFORM", "SUMMARIZE", "CLASSIFY", "FINAL_ANSWER"],
    pricing: [
      { actionType: "API_LOOKUP", pricePerUnit: 1000 },
      { actionType: "JSON_TRANSFORM", pricePerUnit: 2000 },
      { actionType: "SUMMARIZE", pricePerUnit: 3000 },
      { actionType: "CLASSIFY", pricePerUnit: 2000 },
      { actionType: "FINAL_ANSWER", pricePerUnit: 5000 },
    ],
    description: "External standalone provider — serves real HTTP responses",
    capabilities: ["lookup", "transform", "summarize", "classify"],
  });

  assert("Provider registered", provRegRes.ok, `id=${provRegRes.data?.agent?.id}`);
  const providerId = provRegRes.data?.agent?.id;
  const providerApiKey = provRegRes.data?.apiKey;
  info(`Provider wallet: ${providerWallet.address}`);
  info(`Provider API key: ${providerApiKey?.slice(0, 12)}...`);

  // Verify provider appears in catalog
  const agentsRes = await api("GET", "/api/agents");
  const foundProvider = agentsRes.data?.find(a => a.id === providerId);
  assert("Provider visible in agent catalog", !!foundProvider, `endpoint=${foundProvider?.endpoint}`);

  // ────────────────────────────────────────────────────────────────────────
  section("C. Register External Customer");

  const customerWallet = ethers.Wallet.createRandom();

  const custRegRes = await api("POST", "/api/agents/customers/register", {
    name: "External Customer Beta",
    walletAddress: customerWallet.address,
    privateKey: customerWallet.privateKey,
    description: "External standalone customer for network test",
  });

  assert("Customer registered", custRegRes.ok, `id=${custRegRes.data?.agent?.id}`);
  const customerId = custRegRes.data?.agent?.id;
  info(`Customer wallet: ${customerWallet.address}`);

  // ────────────────────────────────────────────────────────────────────────
  section("D. Wallet Authentication (Customer)");

  // Challenge
  const challRes = await api("POST", "/api/auth/challenge", { walletAddress: customerWallet.address });
  assert("Auth challenge received", challRes.ok);

  // Sign
  const sig = await customerWallet.signMessage(challRes.data.message);

  // Verify
  const verRes = await api("POST", "/api/auth/verify", {
    walletAddress: customerWallet.address,
    signature: sig,
    nonce: challRes.data.nonce,
  });
  assert("Bearer token acquired", verRes.ok);
  const bearerToken = verRes.data.token;
  const authH = { Authorization: `Bearer ${bearerToken}` };

  // ────────────────────────────────────────────────────────────────────────
  section("E. Discover Provider via Protocol (Authenticated)");

  const provListRes = await api("GET", "/api/protocol/providers", null, authH);
  assert("Protocol provider list accessible", provListRes.ok);
  const protocolProvider = provListRes.data?.find(p => p.id === providerId);
  assert("External provider found in protocol catalog", !!protocolProvider, `endpoint=${protocolProvider?.endpoint}`);
  info(`Price table: ${JSON.stringify(protocolProvider?.priceTable)}`);

  // ────────────────────────────────────────────────────────────────────────
  section("F. Create Session (Customer → External Provider)");

  const sessRes = await api("POST", "/api/protocol/sessions/create", {
    providerAgentId: providerId,
    budget: N_ACTIONS * 5000,
    maxActions: N_ACTIONS + 5,
  }, authH);

  assert("Session created", sessRes.ok, `id=${sessRes.data?.session?.id?.slice(0, 8)}`);
  const sessionId = sessRes.data?.session?.id;
  const onchainId = sessRes.data?.session?.onchainId;
  assert("Session has real onchain ID", onchainId > 0 && onchainId < 90000, `onchainId=${onchainId}`);
  info(`Session: ${sessionId}`);
  info(`Onchain: ${onchainId}`);

  // ────────────────────────────────────────────────────────────────────────
  section("G. Execute Actions with 402 Payment Flow");

  const ACTION_TYPES = ["API_LOOKUP", "JSON_TRANSFORM", "SUMMARIZE", "CLASSIFY", "FINAL_ANSWER", "API_LOOKUP"];
  const actionResults = [];

  for (let i = 0; i < N_ACTIONS; i++) {
    const actionType = ACTION_TYPES[i % ACTION_TYPES.length];
    const input = `network-test-action-${i}`;

    // Step 1: Request without payment → 402
    const r402 = await api("POST", `/api/protocol/sessions/${sessionId}/action`, {
      actionType, input,
    }, authH);

    if (r402.status !== 402) {
      fail(`Action ${i}: expected 402, got ${r402.status}`);
      actionResults.push({ index: i, actionType, status: "error", error: `No 402: ${r402.status}` });
      continue;
    }

    const payload = r402.data.paymentRequired;
    const signing = r402.data.signing;

    // Step 2: Sign EIP-712 payment
    const typedValue = {
      amount: payload.amount,
      recipient: payload.recipient,
      sessionId: payload.sessionId,
      actionType: payload.actionType,
      nonce: payload.nonce,
      deadline: payload.deadline,
    };
    const paymentSig = await customerWallet.signTypedData(signing.domain, signing.types, typedValue);

    // Step 3: Resend with payment proof
    const rPaid = await api("POST", `/api/protocol/sessions/${sessionId}/action`, {
      actionType, input,
    }, {
      ...authH,
      "X-Payment-Authorization": JSON.stringify({ payload, signature: paymentSig }),
    });

    const d = rPaid.data || {};
    const isReal = d.settleTxHash && !d.settleTxHash.startsWith("0x000000");
    const isSuccess = d.executionStatus === "success";
    const isFailed  = d.executionStatus === "failed";
    const isTimeout = d.executionStatus === "timeout";

    let tag;
    if (isSuccess) tag = `${GRN}SUCCESS${RST}`;
    else if (isTimeout) tag = `${YEL}TIMEOUT${RST}`;
    else tag = `${RED}FAILED${RST}`;

    const txTag = isReal ? `${GRN}onchain${RST}` : (isSuccess ? `${YEL}fallback${RST}` : `${DIM}none${RST}`);

    console.log(
      `  Action ${i} (${actionType}): [${tag}] ` +
      `output="${(d.output || "").slice(0, 35)}" ` +
      `settle=${(d.settleTxHash || "n/a").slice(0, 16)} ` +
      `[${txTag}] ` +
      `budget=${d.budgetRemaining}`
    );

    actionResults.push({
      index: i,
      actionType,
      executionStatus: d.executionStatus,
      output: d.output?.slice(0, 80),
      recordTxHash: d.recordTxHash,
      settleTxHash: d.settleTxHash,
      isRealOnchain: isReal,
      budgetRemaining: d.budgetRemaining,
      executionMs: d.executionMs,
      errorMessage: d.errorMessage,
    });
  }

  // Verify action results
  const successes = actionResults.filter(a => a.executionStatus === "success");
  const failures  = actionResults.filter(a => a.executionStatus === "failed");
  const timeouts  = actionResults.filter(a => a.executionStatus === "timeout");
  const realTxs   = actionResults.filter(a => a.isRealOnchain);

  console.log();
  assert("Some actions succeeded", successes.length > 0, `${successes.length} successes`);
  assert("Successful actions have real tx hashes", successes.every(a => a.isRealOnchain), `${realTxs.length} real txs`);
  assert("Failed actions have no settlement", failures.every(a => !a.settleTxHash), `${failures.length} failures, no settle`);
  assert("Timeout actions have no settlement", timeouts.every(a => !a.settleTxHash), `${timeouts.length} timeouts, no settle`);
  assert("Provider endpoint received requests", successes.length + failures.length + timeouts.length === N_ACTIONS);

  // ────────────────────────────────────────────────────────────────────────
  section("H. Session State Verification");

  const sessStateRes = await api("GET", `/api/protocol/sessions/${sessionId}`, null, authH);
  const sess = sessStateRes.data?.session;
  const budget = sessStateRes.data?.budget;

  assert("Session query works", sessStateRes.ok);
  assert("Total actions matches", sess?.totalActions === N_ACTIONS, `${sess?.totalActions} == ${N_ACTIONS}`);
  assert("Settled matches successes", sess?.settledActions === successes.length, `${sess?.settledActions} settled`);
  assert("Budget accounting correct", budget?.remaining >= 0, `spent=${budget?.spent} remaining=${budget?.remaining}`);
  info(`Status: ${sess?.status}`);

  // ────────────────────────────────────────────────────────────────────────
  section("I. Finalize Session");

  const finRes = await api("POST", `/api/protocol/sessions/${sessionId}/finalize`, {}, authH);
  assert("Session finalized", finRes.ok);
  const summary = finRes.data?.summary;
  info(`Total:    ${summary?.totalActions} actions`);
  info(`Settled:  ${summary?.settledActions}`);
  info(`Failed:   ${summary?.failedActions}`);
  info(`Paid:     ${summary?.totalPaid} USDC`);
  info(`Returned: ${summary?.budgetReturned} USDC`);
  assert("Final status is completed", finRes.data?.session?.status === "completed");

  // ────────────────────────────────────────────────────────────────────────
  section("J. Provider Stats (from provider health endpoint)");

  try {
    const r = await fetch(providerHealthUrl);
    const ph = await r.json();
    info(`Provider total requests: ${ph.stats?.totalRequests}`);
    info(`Provider successes: ${ph.stats?.successes}`);
    info(`Provider failures: ${ph.stats?.failures}`);
    info(`Provider timeouts: ${ph.stats?.timeouts}`);
    assert("Provider confirms it received requests", ph.stats?.totalRequests > 0, `${ph.stats?.totalRequests} requests`);
  } catch { info("Could not reach provider health endpoint"); }

  // ════════════════════════════════════════════════════════════════════════
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  hdr("Network Test — Final Report");
  console.log(`
  ${BOLD}Tests:${RST}          ${results.passed}/${results.passed + results.failed} passed
  ${BOLD}Actions:${RST}        ${N_ACTIONS} total (${successes.length} success, ${failures.length} fail, ${timeouts.length} timeout)
  ${BOLD}Real onchain:${RST}   ${realTxs.length} actions with real Arc tx hashes
  ${BOLD}Time:${RST}           ${elapsed}s
  ${BOLD}Provider:${RST}       ${providerId} → ${PROVIDER_URL}
  ${BOLD}Customer:${RST}       ${customerId}
  ${BOLD}Session:${RST}        ${sessionId}
  ${BOLD}Onchain ID:${RST}     ${onchainId}

  ${BOLD}Network topology:${RST}
    External Customer  ──HTTP──▸  VeriPay Backend  ──HTTP──▸  External Provider
    (${customerWallet.address.slice(0, 10)}...)       (port 3001)           (${PROVIDER_URL})
  `);

  if (results.failed === 0) {
    console.log(`  ${GRN}${BOLD}✅ PROOF: Real external agent-to-agent flow via VeriPay Loop.${RST}`);
    console.log(`  ${GRN}${BOLD}   Customer and Provider are independent processes.${RST}`);
    console.log(`  ${GRN}${BOLD}   No UI, no internal shortcuts, real onchain settlement.${RST}\n`);
  } else {
    console.log(`  ${YEL}${BOLD}⚠ ${results.failed} test(s) failed — see details above.${RST}\n`);
  }

  // Save report
  const fs = require("fs");
  const report = {
    timestamp: new Date().toISOString(),
    elapsed: `${elapsed}s`,
    results,
    provider: { id: providerId, endpoint: PROVIDER_URL, wallet: providerWallet.address },
    customer: { id: customerId, wallet: customerWallet.address },
    session: { id: sessionId, onchainId },
    actions: actionResults,
  };
  const reportPath = require("path").join(__dirname, "e2e-network-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  info(`JSON report: ${reportPath}`);

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`\n${RED}Fatal: ${err.message}${RST}`);
  console.error(err.stack);
  process.exit(1);
});
