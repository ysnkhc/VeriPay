/**
 * Mock Provider Agent — runs on http://localhost:4000/agent
 * Supports query params: ?mode=fail, ?mode=timeout
 */
const http = require("http");

const PORT = 4000;

const server = http.createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const mode = url.searchParams.get("mode");

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let parsed = {};
    try { parsed = JSON.parse(body); } catch {}

    // Failure mode
    if (mode === "fail") {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ output: "", status: "error", errorMessage: "Simulated provider failure" }));
    }

    // Timeout mode — delay 15s (exceeds 10s timeout)
    if (mode === "timeout") {
      return setTimeout(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ output: "too-late", status: "success" }));
      }, 15000);
    }

    // Normal success
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      output: "processed:" + (parsed.input || ""),
      status: "success",
      metadata: { actionType: parsed.actionType, index: parsed.actionIndex },
    }));
  });
});

server.listen(PORT, () => {
  console.log(`[mock-provider] Listening on http://localhost:${PORT}/agent`);
  console.log(`[mock-provider] Modes: normal, ?mode=fail, ?mode=timeout`);
});
