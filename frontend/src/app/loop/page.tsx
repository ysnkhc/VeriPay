"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Activity,
  Play,
  Square,
  Zap,
  CheckCircle2,
  Clock,
  DollarSign,
  Hash,
  Cpu,
  ArrowRight,
  ChevronDown,
  TrendingUp,
  Rocket,
  Wifi,
  WifiOff,
  Timer,
} from "lucide-react";
import {
  createSession,
  startSession,
  triggerAction,
  completeSession,
  fetchSession,
  fetchSessionActions,
  fetchAgents,
  runDemo,
  fetchStatus,
} from "@/lib/api";

// ── Types ───────────────────────────────────────────────────────────────
interface Agent {
  id: string;
  name: string;
  description: string;
  supportedActions: string[];
  pricing: { actionType: string; pricePerUnit: number; description: string }[];
  priceTable: Record<string, number>;
  walletAddress: string;
}

interface Session {
  id: string;
  onchainId?: number;
  status: string;
  providerAgentId: string;
  providerAddress: string;
  consumerAddress: string;
  budget: number;
  maxActions: number;
  totalActions: number;
  settledActions: number;
  totalPaid: number;
  createdAt: number;
  finalizedAt?: number;
}

interface Action {
  sessionId: string;
  index: number;
  actionType: string;
  units: number;
  unitPrice: number;
  totalPrice: number;
  input: string;
  output: string;
  actionHash: string;
  txHash?: string;
  recordedAt: number;
  settledAt?: number;
  status: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────
function formatUSDC(raw: number): string {
  return `$${(raw / 1_000_000).toFixed(4)}`;
}

function formatUSDC6(raw: number): string {
  return `$${(raw / 1_000_000).toFixed(6)}`;
}

function shortHash(hash: string): string {
  if (!hash) return "—";
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function actionColor(type: string): string {
  switch (type) {
    case "API_LOOKUP": return "text-arc-400";
    case "JSON_TRANSFORM": return "text-amber-400";
    case "SUMMARIZE": return "text-emerald-400";
    case "CLASSIFY": return "text-purple-400";
    case "FINAL_ANSWER": return "text-rose-400";
    default: return "text-gray-400";
  }
}

function actionBg(type: string): string {
  switch (type) {
    case "API_LOOKUP": return "bg-arc-500/10";
    case "JSON_TRANSFORM": return "bg-amber-500/10";
    case "SUMMARIZE": return "bg-emerald-500/10";
    case "CLASSIFY": return "bg-purple-500/10";
    case "FINAL_ANSWER": return "bg-rose-500/10";
    default: return "bg-gray-500/10";
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "pending": return <span className="badge-warning">Pending</span>;
    case "active": return <span className="badge-info">Active</span>;
    case "running": return <span className="badge bg-arc-500/30 text-arc-300 animate-pulse">Running</span>;
    case "completed": return <span className="badge-success">Completed</span>;
    case "cancelled": return <span className="badge-danger">Cancelled</span>;
    default: return <span className="badge-neutral">{status}</span>;
  }
}

// ── Defaults ────────────────────────────────────────────────────────────
const DEFAULT_CONSUMER = "0x0000000000000000000000000000000000000002";
const DEFAULT_BUDGET = 500_000;
const DEFAULT_MAX_ACTIONS = 100;
const DEFAULT_ACTION_COUNT = 100;
const DEFAULT_DELAY_MS = 80;

// ── Main page ───────────────────────────────────────────────────────────
export default function LoopPage() {
  // Agents
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("");

  // Form
  const [consumerAddress, setConsumerAddress] = useState(DEFAULT_CONSUMER);
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [maxActions, setMaxActions] = useState(DEFAULT_MAX_ACTIONS);
  const [actionCount, setActionCount] = useState(DEFAULT_ACTION_COUNT);
  const [delayMs, setDelayMs] = useState(DEFAULT_DELAY_MS);

  // Session state
  const [session, setSession] = useState<Session | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  // Backend mode
  const [backendMode, setBackendMode] = useState<"onchain" | "fallback" | "unknown">("unknown");

  // Elapsed timer
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef<NodeJS.Timeout | null>(null);

  // Polling
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);

  // Load agents + status on mount
  useEffect(() => {
    fetchAgents()
      .then((data: Agent[]) => {
        setAgents(data);
        if (data.length > 0) setSelectedAgent(data[0].id);
      })
      .catch(() => {});
    fetchStatus()
      .then((s) => setBackendMode(s.mode))
      .catch(() => setBackendMode("unknown"));
  }, []);

  // Polling logic
  const startPolling = useCallback((sessionId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const [s, a] = await Promise.all([
          fetchSession(sessionId),
          fetchSessionActions(sessionId),
        ]);
        setSession(s);
        setActions(a);
        if (s.status === "completed" || s.status === "cancelled") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {}
    }, 1000);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // Elapsed timer — runs during active loading
  const startTimer = useCallback(() => {
    setElapsed(0);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    const t0 = Date.now();
    elapsedRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
  }, []);
  const stopTimer = useCallback(() => {
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
  }, []);
  useEffect(() => () => stopTimer(), [stopTimer]);

  // Auto-scroll action feed
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [actions.length]);

  // ── Handlers ────────────────────────────────────────────────────────
  const handleCreateSession = async () => {
    setError("");
    setLoading("creating");
    try {
      const s = await createSession({
        providerAgentId: selectedAgent,
        consumerAddress,
        budget,
        maxActions,
      });
      setSession(s);
      setActions([]);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading("");
  };

  const handleStartLoop = async () => {
    if (!session) return;
    setError("");
    setLoading("starting");
    startPolling(session.id);
    startTimer();
    try {
      const result = await startSession(session.id, { actionCount, delayMs });
      setSession((prev) => prev ? { ...prev, ...result, status: "completed" } : prev);
      // Final fetch
      const [s, a] = await Promise.all([
        fetchSession(session.id),
        fetchSessionActions(session.id),
      ]);
      setSession(s);
      setActions(a);
    } catch (e: any) {
      setError(e.message);
    }
    stopPolling();
    stopTimer();
    setLoading("");
  };

  // ── Demo quick-start ──────────────────────────────────────────────
  const handleRunDemo = async () => {
    setError("");
    setLoading("demo");
    startTimer();
    try {
      const result = await runDemo({ actionCount: 100, delayMs: 80 });
      const sessionId = result.sessionId;
      // Fetch initial session state
      const s = await fetchSession(sessionId);
      setSession(s);
      setActions([]);
      // Start polling for live updates
      startPolling(sessionId);
    } catch (e: any) {
      setError(e.message);
      stopTimer();
      setLoading("");
    }
  };

  const handleSingleAction = async () => {
    if (!session) return;
    setError("");
    setLoading("action");
    try {
      await triggerAction(session.id);
      const [s, a] = await Promise.all([
        fetchSession(session.id),
        fetchSessionActions(session.id),
      ]);
      setSession(s);
      setActions(a);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading("");
  };

  const handleComplete = async () => {
    if (!session) return;
    setError("");
    setLoading("completing");
    try {
      await completeSession(session.id);
      const s = await fetchSession(session.id);
      setSession(s);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading("");
  };

  const handleReset = () => {
    stopPolling();
    stopTimer();
    setSession(null);
    setActions([]);
    setError("");
    setLoading("");
    setElapsed(0);
  };

  const agent = agents.find((a) => a.id === selectedAgent);
  const isActive = session && (session.status === "active" || session.status === "running");
  const isRunning = loading === "starting";
  const settledActions = actions.filter((a) => a.status === "settled");
  const avgPrice = settledActions.length > 0
    ? settledActions.reduce((s, a) => s + a.totalPrice, 0) / settledActions.length
    : 0;

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-arc-500/10 flex items-center justify-center">
            <Activity className="w-5 h-5 text-arc-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Live Loop</h1>
            <p className="text-gray-500 text-sm">Agent-to-agent micropayment terminal</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Mode badge */}
          <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${
            backendMode === "onchain"
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
              : backendMode === "fallback"
              ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
              : "bg-gray-500/10 text-gray-400 border border-gray-500/30"
          }`}>
            {backendMode === "onchain" ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {backendMode === "onchain" ? "Onchain" : backendMode === "fallback" ? "Fallback" : "..."}
          </div>
          {/* Elapsed timer */}
          {(loading === "starting" || loading === "demo") && (
            <div className="flex items-center gap-1 text-xs text-gray-400 font-mono">
              <Timer className="w-3 h-3" />
              {elapsed}s
            </div>
          )}
          {session && (
            <button onClick={handleReset} className="btn-secondary text-sm py-2 px-4">
              New Session
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        {/* ── Left column: Setup + Status + Pricing ──────────────────── */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          {/* Session Setup */}
          {!session ? (
            <div className="card">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Session Setup</h2>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Provider Agent</label>
                  <select
                    className="input text-sm"
                    value={selectedAgent}
                    onChange={(e) => setSelectedAgent(e.target.value)}
                  >
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Consumer Address</label>
                  <input className="input text-sm font-mono" value={consumerAddress} onChange={(e) => setConsumerAddress(e.target.value)} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Budget (USDC raw)</label>
                    <input type="number" className="input text-sm" value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
                    <span className="text-[10px] text-gray-600 mt-0.5 block">{formatUSDC(budget)}</span>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Max Actions</label>
                    <input type="number" className="input text-sm" value={maxActions} onChange={(e) => setMaxActions(Number(e.target.value))} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Loop Count</label>
                    <input type="number" className="input text-sm" value={actionCount} onChange={(e) => setActionCount(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Delay (ms)</label>
                    <input type="number" className="input text-sm" value={delayMs} onChange={(e) => setDelayMs(Number(e.target.value))} />
                  </div>
                </div>

                <button
                  className="btn-primary w-full text-sm mt-2"
                  onClick={handleCreateSession}
                  disabled={!!loading || !selectedAgent}
                >
                  {loading === "creating" ? "Creating..." : "Create Session"}
                </button>

                <div className="relative my-3">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-800" /></div>
                  <div className="relative flex justify-center"><span className="bg-gray-900 px-3 text-[10px] text-gray-600 uppercase tracking-wider">or</span></div>
                </div>

                <button
                  className="w-full text-sm py-2.5 px-4 rounded-lg font-medium flex items-center justify-center gap-2 bg-gradient-to-r from-arc-600 to-emerald-600 hover:from-arc-500 hover:to-emerald-500 text-white transition-all"
                  onClick={handleRunDemo}
                  disabled={!!loading}
                >
                  <Rocket className="w-4 h-4" />
                  {loading === "demo" ? `Running Demo... (${elapsed}s)` : "Run Demo — 100 Actions"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Session Status Card */}
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Session</h2>
                  <div className="flex items-center gap-2">
                    {(session as any).mode === "agent" && <span className="badge-info text-[10px]">Agent Mode</span>}
                    {statusBadge(session.status)}
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">ID</span>
                    <span className="font-mono text-gray-300 text-xs">{session.id.slice(0, 12)}...</span>
                  </div>
                  {session.onchainId && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Onchain ID</span>
                      <span className="font-mono text-arc-400">#{session.onchainId}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Provider</span>
                    <span className="text-gray-300">{agents.find((a) => a.id === session.providerAgentId)?.name || session.providerAgentId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Budget</span>
                    <span className="text-gray-300">{formatUSDC(session.budget)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total Paid</span>
                    <span className="text-emerald-400 font-semibold">{formatUSDC(session.totalPaid)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Remaining</span>
                    <span className="text-gray-300">{formatUSDC(session.budget - session.totalPaid)}</span>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{session.settledActions} / {session.maxActions} actions</span>
                      <span>{Math.round((session.settledActions / session.maxActions) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-2">
                      <div
                        className="bg-arc-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, (session.settledActions / session.maxActions) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Controls */}
                <div className="mt-4 space-y-2">
                  {session.status === "pending" && (
                    <button
                      className="btn-primary w-full text-sm flex items-center justify-center gap-2"
                      onClick={handleStartLoop}
                      disabled={!!loading}
                    >
                      <Play className="w-4 h-4" />
                      {isRunning ? `Running... (${actions.length}/${actionCount})` : `Start Loop (${actionCount} actions)`}
                    </button>
                  )}
                  {isActive && !isRunning && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className="btn-secondary text-sm flex items-center justify-center gap-1"
                        onClick={handleSingleAction}
                        disabled={!!loading}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        {loading === "action" ? "..." : "+1 Action"}
                      </button>
                      <button
                        className="btn-secondary text-sm flex items-center justify-center gap-1"
                        onClick={handleComplete}
                        disabled={!!loading}
                      >
                        <Square className="w-3.5 h-3.5" />
                        Finalize
                      </button>
                    </div>
                  )}
                  {isActive && (
                    <button
                      className="btn-primary w-full text-sm flex items-center justify-center gap-2"
                      onClick={handleStartLoop}
                      disabled={!!loading}
                    >
                      <Play className="w-4 h-4" />
                      {isRunning ? `Running... (${actions.length}/${actionCount})` : `Run Loop (${actionCount} more)`}
                    </button>
                  )}
                </div>
              </div>

              {/* Pricing Panel */}
              {agent && (
                <div className="card">
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    {agent.name} — Pricing
                  </h2>
                  <div className="space-y-1.5">
                    {agent.pricing.map((p) => (
                      <div key={p.actionType} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${actionColor(p.actionType).replace("text-", "bg-")}`} />
                          <span className={`font-mono text-xs ${actionColor(p.actionType)}`}>{p.actionType}</span>
                        </div>
                        <span className="text-gray-300 font-mono text-xs">{formatUSDC6(p.pricePerUnit)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Session complete banner */}
          {session && session.status === "completed" && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 text-emerald-400 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Session complete — {session.settledActions} actions settled{backendMode === "onchain" ? " onchain" : ""}
            </div>
          )}

          {/* Why This Matters — show after session completes */}
          {session && session.status === "completed" && settledActions.length > 0 && (
            <div className="card border-arc-500/30 bg-arc-500/5">
              <h2 className="text-sm font-semibold text-arc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Why This Matters
              </h2>
              <div className="space-y-2 text-sm text-gray-300">
                <p>
                  This session generated <span className="text-white font-semibold">{settledActions.length}</span> paid
                  actions, each settled as an individual onchain transaction.
                </p>
                <p>
                  Total revenue: <span className="text-emerald-400 font-semibold">{formatUSDC(session.totalPaid)}</span>
                </p>
                <div className="bg-gray-900/50 rounded-lg p-3 mt-2 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Legacy gas cost ({settledActions.length} tx × ~$6.93)</span>
                    <span className="text-red-400">${(settledActions.length * 6.93).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Arc gas cost ({settledActions.length} tx × ~$0.000001)</span>
                    <span className="text-emerald-400">${(settledActions.length * 0.000001).toFixed(6)}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-800 pt-1 mt-1">
                    <span className="text-gray-400 font-medium">Margin saved</span>
                    <span className="text-arc-400 font-semibold">${(settledActions.length * 6.93 - settledActions.length * 0.000001).toFixed(2)}</span>
                  </div>
                </div>
                <p className="text-gray-500 text-xs mt-1">
                  On a gas-heavy chain, sub-cent payments are economically impossible.
                  Arc makes per-action monetization viable.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Right column: Counters + Action Feed ───────────────────── */}
        <div className="col-span-12 lg:col-span-8 space-y-4">
          {/* Live Counters */}
          {session && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="card py-3 px-4 text-center">
                <div className="text-2xl font-bold text-white font-mono">{session.totalActions}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Actions</div>
              </div>
              <div className="card py-3 px-4 text-center">
                <div className="text-2xl font-bold text-arc-400 font-mono">{session.settledActions}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Settled</div>
              </div>
              <div className="card py-3 px-4 text-center">
                <div className="text-2xl font-bold text-emerald-400 font-mono">{formatUSDC(session.totalPaid)}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Total Paid</div>
              </div>
              <div className="card py-3 px-4 text-center">
                <div className="text-2xl font-bold text-amber-400 font-mono">{formatUSDC6(avgPrice)}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Avg Price</div>
              </div>
              <div className="card py-3 px-4 text-center">
                <div className="text-2xl font-bold text-gray-300 font-mono">
                  {session.totalPaid > 0 && session.totalActions > 0
                    ? `${((session.totalPaid / session.budget) * 100).toFixed(0)}%`
                    : "0%"
                  }
                </div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Budget Used</div>
              </div>
            </div>
          )}

          {/* Action Feed */}
          <div className="card flex flex-col" style={{ minHeight: session ? "500px" : "300px" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                Action Stream
                {isRunning && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
              </h2>
              {actions.length > 0 && (
                <span className="text-xs text-gray-600">{actions.length} actions</span>
              )}
            </div>

            {actions.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-600">
                <div className="text-center">
                  <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">{session ? "Waiting for actions..." : "Create a session to begin"}</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-1 pr-1 scrollbar-thin" style={{ maxHeight: "600px" }}>
                {/* Header row */}
                <div className="grid grid-cols-12 gap-2 text-[10px] text-gray-600 uppercase tracking-wider px-2 py-1 sticky top-0 bg-gray-900 z-10">
                  <div className="col-span-1">#</div>
                  <div className="col-span-2">Type</div>
                  <div className="col-span-2">Price</div>
                  <div className="col-span-3">Output</div>
                  <div className="col-span-2">Tx Hash</div>
                  <div className="col-span-2">Status</div>
                </div>

                {actions.map((action) => (
                  <div
                    key={action.index}
                    className={`grid grid-cols-12 gap-2 items-center text-xs px-2 py-1.5 rounded-lg transition-colors ${
                      action.status === "settled" ? "bg-gray-800/50" : "bg-gray-800/20"
                    } ${action.index === actions.length - 1 && isRunning ? "ring-1 ring-arc-500/30" : ""}`}
                  >
                    <div className="col-span-1 text-gray-500 font-mono">{action.index}</div>
                    <div className="col-span-2">
                      <span className={`font-mono text-[11px] px-1.5 py-0.5 rounded ${actionBg(action.actionType)} ${actionColor(action.actionType)}`}>
                        {action.actionType.replace("_", " ")}
                      </span>
                    </div>
                    <div className="col-span-2 text-gray-300 font-mono">{formatUSDC6(action.totalPrice)}</div>
                    <div className="col-span-3 text-gray-500 font-mono truncate text-[10px]">
                      {(() => {
                        try {
                          const o = JSON.parse(action.output);
                          return Object.values(o).slice(0, 2).join(", ");
                        } catch {
                          return action.output?.slice(0, 40) || "—";
                        }
                      })()}
                    </div>
                    <div className="col-span-2 font-mono text-[10px]">
                      {action.txHash ? (
                        <span className="text-arc-400">{shortHash(action.txHash)}</span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </div>
                    <div className="col-span-2">
                      {action.status === "settled" ? (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" /> Settled
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-gray-500">
                          <Clock className="w-3 h-3" /> Pending
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={feedEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
