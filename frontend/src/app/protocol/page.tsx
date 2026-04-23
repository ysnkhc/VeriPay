"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Terminal, Bot, Wallet, Key, Copy, CheckCircle2,
  ArrowRight, Zap, Shield, Clock, DollarSign, Play, Loader2,
} from "lucide-react";
import {
  fetchProviders, fetchAllSessions, fetchStatus,
  registerProvider, registerCustomer,
  requestChallenge, verifyWalletAuth,
} from "@/lib/api";

function formatUSDC(raw: number): string {
  return `$${(raw / 1_000_000).toFixed(4)}`;
}
function shortAddr(addr: string): string {
  return addr ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : "—";
}

// ── Registration Forms ──────────────────────────────────────────────────

function ProviderRegistration({ onRegistered }: { onRegistered: () => void }) {
  const [name, setName] = useState("");
  const [wallet, setWallet] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const handleRegister = async () => {
    setError(""); setLoading(true); setResult(null);
    try {
      const res = await registerProvider({
        name, walletAddress: wallet, endpoint,
        supportedActions: ["API_LOOKUP", "JSON_TRANSFORM", "SUMMARIZE", "CLASSIFY", "FINAL_ANSWER"],
        pricing: [
          { actionType: "API_LOOKUP", pricePerUnit: 1000, description: "API lookup ($0.001)" },
          { actionType: "JSON_TRANSFORM", pricePerUnit: 2000, description: "Transform ($0.002)" },
          { actionType: "SUMMARIZE", pricePerUnit: 3000, description: "Summarize ($0.003)" },
          { actionType: "CLASSIFY", pricePerUnit: 2000, description: "Classify ($0.002)" },
          { actionType: "FINAL_ANSWER", pricePerUnit: 5000, description: "Final answer ($0.005)" },
        ],
      });
      setResult(res);
      onRegistered();
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Agent Name</label>
        <input className="input text-sm" placeholder="My Provider Agent" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Wallet Address</label>
        <input className="input text-sm font-mono" placeholder="0x..." value={wallet} onChange={(e) => setWallet(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Endpoint URI</label>
        <input className="input text-sm font-mono" placeholder="https://my-agent.example.com/action" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
      </div>
      <button className="btn-primary w-full text-sm" onClick={handleRegister} disabled={loading || !name || !wallet || !endpoint}>
        {loading ? "Registering..." : "Register Provider"}
      </button>
      {error && <div className="text-red-400 text-xs bg-red-500/10 rounded-lg px-3 py-2">{error}</div>}
      {result && <ApiKeyResult result={result} />}
    </div>
  );
}

function CustomerRegistration({ onRegistered }: { onRegistered: () => void }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const handleRegister = async () => {
    setError(""); setLoading(true); setResult(null);
    try {
      const res = await registerCustomer({ name });
      setResult(res);
      onRegistered();
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Agent Name</label>
        <input className="input text-sm" placeholder="My Customer Agent" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <p className="text-[10px] text-gray-600">A wallet keypair will be generated automatically. Test USDC will be minted on session creation.</p>
      <button className="btn-primary w-full text-sm" onClick={handleRegister} disabled={loading || !name}>
        {loading ? "Registering..." : "Register Customer"}
      </button>
      {error && <div className="text-red-400 text-xs bg-red-500/10 rounded-lg px-3 py-2">{error}</div>}
      {result && <ApiKeyResult result={result} />}
    </div>
  );
}

function ApiKeyResult({ result }: { result: any }) {
  const [copied, setCopied] = useState("");
  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  };

  return (
    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" /> Registered successfully
      </div>
      <div className="space-y-1.5">
        <CopyField label="API Key" value={result.apiKey} copied={copied} onCopy={copy} warn />
        <CopyField label="Wallet" value={result.walletAddress || result.agent?.walletAddress} copied={copied} onCopy={copy} />
        {result.generatedPrivateKey && (
          <CopyField label="Private Key" value={result.generatedPrivateKey} copied={copied} onCopy={copy} warn />
        )}
      </div>
      <p className="text-[10px] text-amber-400">⚠ Save these now — they will not be shown again.</p>
    </div>
  );
}

function CopyField({ label, value, copied, onCopy, warn }: { label: string; value: string; copied: string; onCopy: (v: string, l: string) => void; warn?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between bg-gray-900/80 rounded px-2 py-1.5">
      <div>
        <div className="text-[10px] text-gray-500">{label}</div>
        <div className={`text-xs font-mono ${warn ? "text-amber-300" : "text-gray-300"} break-all`}>{value.length > 50 ? `${value.slice(0, 24)}...${value.slice(-12)}` : value}</div>
      </div>
      <button onClick={() => onCopy(value, label)} className="text-gray-500 hover:text-white p-1">
        {copied === label ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

// ── Simulate Agent Button ───────────────────────────────────────────────

function SimulateAgentButton({ onComplete }: { onComplete: () => void }) {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);

  const addLog = (msg: string) => setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const simulate = async () => {
    setRunning(true);
    setShowLog(true);
    setLog([]);

    try {
      // 1. Register a test customer
      addLog("Registering test customer agent...");
      const regRes = await registerCustomer({ name: `Test Agent ${Date.now() % 10000}` });
      const apiKey = regRes.apiKey;
      const wallet = regRes.walletAddress;
      addLog(`✓ Registered: ${wallet.slice(0, 10)}... (API key obtained)`);

      // 2. Create a session via protocol API (using API key auth — fallback)
      addLog("Creating protocol session (provider: agent-research)...");
      const sessionRes = await fetch(`http://localhost:3001/api/protocol/sessions/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Agent-Key": apiKey,
        },
        body: JSON.stringify({
          providerAgentId: "agent-research",
          budget: 500000,
          maxActions: 10,
        }),
      });
      const sessionData = await sessionRes.json();

      if (!sessionRes.ok) {
        addLog(`✗ Session failed: ${sessionData.error}`);
        return;
      }

      const sessionId = sessionData.session?.id;
      addLog(`✓ Session created: ${sessionId?.slice(0, 12)}... (auth: apikey fallback)`);

      // 3. Execute actions
      const actionTypes = ["API_LOOKUP", "API_LOOKUP", "CLASSIFY", "API_LOOKUP", "FINAL_ANSWER"];
      for (let i = 0; i < actionTypes.length; i++) {
        addLog(`Action ${i + 1}/5: ${actionTypes[i]}...`);

        const actionRes = await fetch(
          `http://localhost:3001/api/protocol/sessions/${sessionId}/action`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Agent-Key": apiKey,
            },
            body: JSON.stringify({
              actionType: actionTypes[i],
              input: `test-input-${i}`,
            }),
          }
        );

        const actionData = await actionRes.json();

        if (actionRes.status === 402) {
          addLog(`  → 402 Payment Required (amount: ${actionData.paymentRequired?.amount} USDC)`);
          addLog(`  → In production, agent would sign EIP-712 payment here`);
          addLog(`  → Skipping (demo uses seed agents — no payment enforcement on mocks)`);
          break;
        }

        if (!actionRes.ok) {
          addLog(`  ✗ ${actionData.error}`);
          continue;
        }

        const status = actionData.executionStatus || "success";
        addLog(
          `  ✓ ${status} — settled: ${actionData.settleTxHash?.slice(0, 14) || "n/a"}...`
        );

        await new Promise((r) => setTimeout(r, 200));
        onComplete();
      }

      // 4. Finalize
      addLog("Finalizing session...");
      const finRes = await fetch(
        `http://localhost:3001/api/protocol/sessions/${sessionId}/finalize`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Agent-Key": apiKey,
          },
        }
      );
      const finData = await finRes.json();

      if (finRes.ok) {
        addLog(
          `✓ Session finalized — ${finData.summary?.settledActions || 0} settled, ${finData.summary?.failedActions || 0} failed`
        );
      } else {
        addLog(`✗ Finalize failed: ${finData.error}`);
      }

      addLog("─── Simulation complete ───");
      onComplete();
    } catch (err: any) {
      addLog(`✗ Error: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <button
        onClick={simulate}
        disabled={running}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium bg-arc-500/20 text-arc-300 hover:bg-arc-500/30 transition-colors disabled:opacity-50"
      >
        {running ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Play className="w-3.5 h-3.5" />
        )}
        {running ? "Simulating..." : "Simulate Agent"}
      </button>

      {showLog && (
        <div className="fixed bottom-4 right-4 w-[420px] max-h-[300px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
            <div className="flex items-center gap-1.5 text-xs text-arc-400 font-medium">
              <Terminal className="w-3.5 h-3.5" />
              Agent Simulation
            </div>
            <button
              onClick={() => setShowLog(false)}
              className="text-gray-500 hover:text-white text-xs"
            >
              ×
            </button>
          </div>
          <div className="p-3 overflow-y-auto max-h-[250px] text-[10px] font-mono text-gray-400 space-y-0.5">
            {log.map((line, i) => (
              <div
                key={i}
                className={
                  line.includes("✓")
                    ? "text-emerald-400"
                    : line.includes("✗")
                    ? "text-red-400"
                    : line.includes("→")
                    ? "text-amber-400"
                    : line.includes("───")
                    ? "text-arc-400 font-semibold"
                    : ""
                }
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────

export default function ProtocolPage() {
  const [providers, setProviders] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [mode, setMode] = useState<"onchain" | "fallback" | "unknown">("unknown");
  const [tab, setTab] = useState<"overview" | "register-provider" | "register-customer">("overview");
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    Promise.all([
      fetchProviders().then(setProviders).catch(() => {}),
      fetchAllSessions("agent").then(setSessions).catch(() => {}),
      fetchStatus().then((s) => setMode(s.mode)).catch(() => {}),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); const iv = setInterval(refresh, 5000); return () => clearInterval(iv); }, []);

  const agentSessions = sessions.filter((s: any) => s.mode === "agent");
  const registeredProviders = providers.filter((p: any) => p.source === "registered");
  const seedProviders = providers.filter((p: any) => p.source === "seed");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-arc-500/10 flex items-center justify-center">
            <Terminal className="w-5 h-5 text-arc-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Agent Network</h1>
            <p className="text-gray-500 text-sm">Agent-to-agent payment protocol — wallet auth, 402 payment, onchain settlement</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SimulateAgentButton onComplete={refresh} />
          <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${
            mode === "onchain" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
            : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
          }`}>
            <Shield className="w-3 h-3" />
            {mode === "onchain" ? "Onchain" : "Fallback"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Left: Stats + Actions */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          {/* Protocol Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card py-3 px-3 text-center">
              <div className="text-xl font-bold text-arc-400 font-mono">{registeredProviders.length}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Registered</div>
            </div>
            <div className="card py-3 px-3 text-center">
              <div className="text-xl font-bold text-white font-mono">{seedProviders.length}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Seed</div>
            </div>
            <div className="card py-3 px-3 text-center">
              <div className="text-xl font-bold text-emerald-400 font-mono">{agentSessions.length}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Sessions</div>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="card">
            <div className="flex gap-1 mb-4">
              {(["overview", "register-provider", "register-customer"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    tab === t ? "bg-arc-500/20 text-arc-300" : "text-gray-500 hover:text-gray-300"
                  }`}>
                  {t === "overview" ? "Overview" : t === "register-provider" ? "Provider +" : "Customer +"}
                </button>
              ))}
            </div>

            {tab === "overview" && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Protocol Flow</h3>
                <div className="space-y-2 text-xs text-gray-400">
                  {[
                    { icon: Wallet, text: "Agents authenticate via wallet signature (challenge → sign → token)" },
                    { icon: Bot, text: "Providers register with wallet + endpoint + pricing" },
                    { icon: ArrowRight, text: "Customer creates session → budget deposited from customer wallet" },
                    { icon: Shield, text: "Each action returns 402 → agent signs payment → then executes" },
                    { icon: Zap, text: "Provider endpoint called → result recorded + settled onchain" },
                    { icon: DollarSign, text: "Provider earns USDC directly per action via NanoSettlement" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <item.icon className="w-3.5 h-3.5 text-arc-400 mt-0.5 shrink-0" />
                      <span>{item.text}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-3 border-t border-gray-800">
                  <h4 className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Wallet Auth + Protocol</h4>
                  <pre className="bg-gray-950 rounded-lg p-3 text-[10px] text-gray-400 font-mono overflow-x-auto whitespace-pre">
{`# 1. Register customer agent
curl -X POST localhost:3001/api/agents/customers/register \\
  -H "Content-Type: application/json" \\
  -d '{"name":"My AI Agent"}'

# 2. Get wallet auth challenge
curl -X POST localhost:3001/api/auth/challenge \\
  -H "Content-Type: application/json" \\
  -d '{"walletAddress":"0x..."}'

# 3. Sign challenge → get bearer token
curl -X POST localhost:3001/api/auth/verify \\
  -H "Content-Type: application/json" \\
  -d '{"walletAddress":"0x...","signature":"0x...","nonce":"..."}'

# 4. Create session (wallet auth)
curl -X POST localhost:3001/api/protocol/sessions/create \\
  -H "Authorization: Bearer vpt_..." \\
  -d '{"providerAgentId":"agent-research",
       "budget":500000,"maxActions":50}'

# 5. Execute action (gets 402 → sign payment → resend)
curl -X POST localhost:3001/api/protocol/sessions/<id>/action \\
  -H "Authorization: Bearer vpt_..." \\
  -d '{"actionType":"API_LOOKUP","input":"query"}'`}
                  </pre>
                </div>
              </div>
            )}

            {tab === "register-provider" && <ProviderRegistration onRegistered={refresh} />}
            {tab === "register-customer" && <CustomerRegistration onRegistered={refresh} />}
          </div>
        </div>

        {/* Right: Provider Registry + Agent Sessions */}
        <div className="col-span-12 lg:col-span-8 space-y-4">
          {/* Provider Registry */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Bot className="w-4 h-4" /> Provider Registry
            </h2>
            {loading ? (
              <div className="text-gray-600 text-sm py-8 text-center">Loading...</div>
            ) : providers.length === 0 ? (
              <div className="text-gray-600 text-sm py-8 text-center">No providers registered</div>
            ) : (
              <div className="space-y-2">
                {providers.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between bg-gray-800/40 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        p.source === "registered" ? "bg-arc-500/20" : "bg-gray-700"
                      }`}>
                        <Bot className={`w-4 h-4 ${p.source === "registered" ? "text-arc-400" : "text-gray-400"}`} />
                      </div>
                      <div>
                        <div className="text-sm text-white font-medium flex items-center gap-2">
                          {p.name}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            p.source === "registered" ? "bg-arc-500/20 text-arc-300" : "bg-gray-700 text-gray-400"
                          }`}>
                            {p.source}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono">{shortAddr(p.walletAddress)}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-400 font-mono truncate max-w-[200px]">{p.endpoint}</div>
                      <div className="text-[10px] text-emerald-400">{p.supportedActions?.length || 0} actions</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Agent Sessions */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4" /> Agent Sessions
              {agentSessions.some((s: any) => s.status === "running") && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </h2>
            {agentSessions.length === 0 ? (
              <div className="text-center py-8">
                <Terminal className="w-10 h-10 mx-auto mb-2 text-gray-700" />
                <p className="text-gray-600 text-sm">No agent sessions yet</p>
                <p className="text-gray-700 text-xs mt-1">Register a customer agent and create a session via the protocol API</p>
              </div>
            ) : (
              <div className="space-y-2">
                {agentSessions.map((s: any) => (
                  <div key={s.id} className="bg-gray-800/40 rounded-lg px-3 py-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-300">{s.id.slice(0, 12)}...</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          s.status === "running" ? "bg-arc-500/30 text-arc-300 animate-pulse"
                          : s.status === "completed" ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-gray-700 text-gray-400"
                        }`}>{s.status}</span>
                      </div>
                      <span className="text-[10px] text-gray-600">{new Date(s.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-[10px]">
                      <div><span className="text-gray-600">Actions</span><br /><span className="text-white font-mono">{s.settledActions}/{s.maxActions}</span></div>
                      <div><span className="text-gray-600">Paid</span><br /><span className="text-emerald-400 font-mono">{formatUSDC(s.totalPaid)}</span></div>
                      <div><span className="text-gray-600">Budget</span><br /><span className="text-gray-300 font-mono">{formatUSDC(s.budget)}</span></div>
                      <div><span className="text-gray-600">Provider</span><br /><span className="text-gray-300">{s.providerAgentId}</span></div>
                    </div>
                    {s.status === "running" && (
                      <div className="mt-1.5">
                        <div className="w-full bg-gray-800 rounded-full h-1">
                          <div className="bg-arc-500 h-1 rounded-full transition-all" style={{ width: `${Math.min(100, (s.settledActions / s.maxActions) * 100)}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
