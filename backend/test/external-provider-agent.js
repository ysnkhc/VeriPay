#!/usr/bin/env node
/**
 * VeriPay Loop — External Provider Agent
 *
 * A standalone HTTP server that acts as a real external provider.
 * It receives action requests from the VeriPay backend, processes them,
 * and returns structured outputs — exactly like a real AI agent would.
 *
 * Usage:
 *   node test/external-provider-agent.js [options]
 *
 * Options:
 *   --port <n>        Port to listen on                (default: 4001)
 *   --name <str>      Provider display name             (default: "External Provider Alpha")
 *   --mode <mode>     success | fail | timeout | mixed  (default: mixed)
 *   --fail-at <n>     In mixed mode, fail at action N   (default: 3)
 *   --timeout-at <n>  In mixed mode, timeout at action N (default: 4)
 *
 * Modes:
 *   success  — all actions succeed
 *   fail     — all actions return 500
 *   timeout  — all actions hang for 30s (triggers caller timeout)
 *   mixed    — success by default, fail at --fail-at, timeout at --timeout-at
 */

const http = require("http");

// ── CLI Args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}

const PORT       = parseInt(flag("port") || "4001", 10);
const NAME       = flag("name") || "External Provider Alpha";
const MODE       = flag("mode") || "mixed";
const FAIL_AT    = parseInt(flag("fail-at") || "3", 10);
const TIMEOUT_AT = parseInt(flag("timeout-at") || "4", 10);

// ── Stats ─────────────────────────────────────────────────────────────────

const stats = {
  totalRequests: 0,
  successes: 0,
  failures: 0,
  timeouts: 0,
  actions: [],
};

// ── Colors ────────────────────────────────────────────────────────────────

const GRN = "\x1b[32m";
const RED = "\x1b[31m";
const YEL = "\x1b[33m";
const CYN = "\x1b[36m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RST = "\x1b[0m";

// ── Realistic AI outputs per action type ──────────────────────────────────

function generateOutput(actionType, input, actionIndex) {
  const ts = new Date().toISOString();
  switch (actionType) {
    case "API_LOOKUP":
      return JSON.stringify({
        provider: NAME,
        type: "lookup",
        query: input,
        results: [
          { title: `Result for "${input}"`, relevance: 0.95, source: "knowledge-base" },
          { title: `Related: ${input} analysis`, relevance: 0.82, source: "web-index" },
        ],
        timestamp: ts,
      });
    case "JSON_TRANSFORM":
      return JSON.stringify({
        provider: NAME,
        type: "transform",
        original: input,
        transformed: {
          normalized: input.toLowerCase().replace(/[^a-z0-9]/g, "_"),
          tokens: input.split(/\s+/).length,
          hash: require("crypto").createHash("md5").update(input).digest("hex").slice(0, 12),
        },
        timestamp: ts,
      });
    case "SUMMARIZE":
      return JSON.stringify({
        provider: NAME,
        type: "summary",
        input_length: input.length,
        summary: `Summary of "${input.slice(0, 30)}": Key findings indicate structured data with ${input.split(/\s+/).length} tokens. Analysis complete.`,
        confidence: 0.91,
        timestamp: ts,
      });
    case "CLASSIFY":
      const categories = ["technical", "financial", "operational", "strategic"];
      const cat = categories[actionIndex % categories.length];
      return JSON.stringify({
        provider: NAME,
        type: "classification",
        input: input.slice(0, 50),
        label: cat,
        confidence: 0.87 + (Math.random() * 0.1),
        alternatives: categories.filter(c => c !== cat).map(c => ({ label: c, score: Math.random() * 0.5 })),
        timestamp: ts,
      });
    case "FINAL_ANSWER":
      return JSON.stringify({
        provider: NAME,
        type: "final_answer",
        conclusion: `Based on ${actionIndex} prior actions, the analysis of "${input.slice(0, 30)}" is complete. All sub-tasks processed successfully.`,
        actionCount: actionIndex,
        confidence: 0.94,
        timestamp: ts,
      });
    default:
      return JSON.stringify({ provider: NAME, output: `Processed: ${input}`, actionType, timestamp: ts });
  }
}

// ── HTTP Server ───────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // Health check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", name: NAME, mode: MODE, stats }));
    return;
  }

  // Only accept POST on root or /agent
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", () => {
    stats.totalRequests++;
    let data;
    try { data = JSON.parse(body); } catch { data = {}; }

    const { sessionId, actionType, actionIndex, input, customerWallet } = data;
    const reqId = `#${stats.totalRequests}`;

    console.log(
      `${CYN}[${reqId}]${RST} ${BOLD}${actionType}${RST} ` +
      `index=${actionIndex} session=${(sessionId || "").slice(0, 8)} ` +
      `customer=${(customerWallet || "").slice(0, 10)} ` +
      `input="${(input || "").slice(0, 30)}"`
    );

    // Determine behavior
    let behavior = MODE;
    if (MODE === "mixed") {
      if (actionIndex === FAIL_AT) behavior = "fail";
      else if (actionIndex === TIMEOUT_AT) behavior = "timeout";
      else behavior = "success";
    }

    if (behavior === "fail") {
      stats.failures++;
      stats.actions.push({ reqId, actionType, actionIndex, behavior: "fail" });
      console.log(`  ${RED}→ FAIL (500)${RST}`);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ output: "", status: "error", errorMessage: "Provider internal error (simulated)" }));
      return;
    }

    if (behavior === "timeout") {
      stats.timeouts++;
      stats.actions.push({ reqId, actionType, actionIndex, behavior: "timeout" });
      console.log(`  ${YEL}→ TIMEOUT (hanging 30s)${RST}`);
      // Don't respond — let the caller's timeout trigger
      setTimeout(() => {
        try { res.writeHead(504); res.end("Timeout"); } catch {}
      }, 30000);
      return;
    }

    // Success
    const output = generateOutput(actionType, input || "", actionIndex || 0);
    stats.successes++;
    stats.actions.push({ reqId, actionType, actionIndex, behavior: "success" });
    console.log(`  ${GRN}→ SUCCESS${RST} output=${output.slice(0, 60)}...`);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ output, status: "success" }));
  });
});

server.listen(PORT, () => {
  console.log(`
${BOLD}═══════════════════════════════════════════════════════${RST}
  ${BOLD}VeriPay Loop — External Provider Agent${RST}
${BOLD}═══════════════════════════════════════════════════════${RST}
  Name:     ${NAME}
  Endpoint: ${CYN}http://localhost:${PORT}/agent${RST}
  Mode:     ${MODE}${MODE === "mixed" ? ` (fail@${FAIL_AT}, timeout@${TIMEOUT_AT})` : ""}

  Waiting for action requests from VeriPay backend...
`);
});
