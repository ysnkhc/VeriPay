"use client";

import { useState, useEffect, useRef } from "react";
import {
  Activity,
  Bot,
  Wifi,
  WifiOff,
  Eye,
  Zap,
  DollarSign,
  Hash,
  CheckCircle2,
  Clock,
  ExternalLink,
  AlertTriangle,
  Radio,
  User,
  Server,
} from "lucide-react";
import { fetchObserverState } from "@/lib/api";

const EXPLORER_URL = "https://testnet.arcscan.app";
const POLL_INTERVAL = 1500;

// ── Helpers ─────────────────────────────────────────────────────────────

function formatUSDC(raw: number): string {
  return `$${(raw / 1_000_000).toFixed(4)}`;
}
function formatUSDC6(raw: number): string {
  return `$${(raw / 1_000_000).toFixed(6)}`;
}
function shortAddr(addr: string): string {
  if (!addr) return "—";
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}
function shortHash(hash: string): string {
  if (!hash || hash.startsWith("0x000000")) return "—";
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}
function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function statusBadge(status: string) {
  switch (status) {
    case "pending":
      return <span className="badge-warning text-[10px]">Pending</span>;
    case "active":
      return <span className="badge-info text-[10px]">Active</span>;
    case "running":
      return (
        <span className="badge bg-arc-500/30 text-arc-300 animate-pulse text-[10px]">
          Running
        </span>
      );
    case "completed":
      return <span className="badge-success text-[10px]">Finalized</span>;
    case "cancelled":
      return <span className="badge-danger text-[10px]">Cancelled</span>;
    default:
      return <span className="badge-neutral text-[10px]">{status}</span>;
  }
}

// ── Activity feed item builder ──────────────────────────────────────────

interface FeedItem {
  id: string;
  icon: "provider" | "customer" | "session" | "action" | "settle" | "finalize";
  text: string;
  detail?: string;
  ts: number;
}

function buildFeed(
  agents: any[],
  sessions: any[],
  txFeed: any[]
): FeedItem[] {
  const items: FeedItem[] = [];

  // Agent registrations
  for (const a of agents) {
    if (a.source === "registered" || a.role === "customer") {
      items.push({
        id: `agent-${a.id}`,
        icon: a.role === "provider" ? "provider" : "customer",
        text: `${a.role === "provider" ? "Provider" : "Customer"} registered`,
        detail: `${a.name} (${shortAddr(a.walletAddress)})`,
        ts: a.registeredAt || 0,
      });
    }
  }

  // Sessions
  for (const s of sessions) {
    items.push({
      id: `session-create-${s.id}`,
      icon: "session",
      text: "Session created",
      detail: `${s.id.slice(0, 12)}... — budget ${formatUSDC(s.budget)}`,
      ts: s.createdAt,
    });

    if (s.status === "completed" && s.finalizedAt) {
      items.push({
        id: `session-final-${s.id}`,
        icon: "finalize",
        text: "Session finalized",
        detail: `${s.settledActions} settled — ${formatUSDC(s.totalPaid)} paid`,
        ts: s.finalizedAt,
      });
    }
  }

  // TX feed entries → action + settlement events
  const actionMilestones = new Set([1, 25, 50, 75, 100]);
  const seenMilestones = new Set<string>();

  for (const tx of txFeed) {
    const actionNum = tx.actionIndex + 1;
    if (actionMilestones.has(actionNum)) {
      const key = `${tx.sessionId}-action-${actionNum}`;
      if (!seenMilestones.has(key)) {
        seenMilestones.add(key);
        items.push({
          id: key,
          icon: "action",
          text: `Action #${actionNum} executed`,
          detail: `${tx.actionType} — ${formatUSDC6(tx.amount)}`,
          ts: tx.timestamp,
        });
      }
    }

    // Settlement TX entries
    if (tx.txHash && !tx.txHash.startsWith("0x000000")) {
      const settleKey = `settle-${tx.txHash}`;
      if (!seenMilestones.has(settleKey)) {
        seenMilestones.add(settleKey);
        items.push({
          id: settleKey,
          icon: "settle",
          text: "Settlement confirmed",
          detail: shortHash(tx.txHash),
          ts: tx.timestamp,
        });
      }
    }
  }

  return items.sort((a, b) => b.ts - a.ts).slice(0, 50);
}

function feedIcon(type: FeedItem["icon"]) {
  switch (type) {
    case "provider":
      return <Server className="w-3.5 h-3.5 text-arc-400" />;
    case "customer":
      return <User className="w-3.5 h-3.5 text-purple-400" />;
    case "session":
      return <Zap className="w-3.5 h-3.5 text-amber-400" />;
    case "action":
      return <Activity className="w-3.5 h-3.5 text-emerald-400" />;
    case "settle":
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    case "finalize":
      return <CheckCircle2 className="w-3.5 h-3.5 text-arc-400" />;
  }
}

// ── Main Page ───────────────────────────────────────────────────────────

export default function ObserverPage() {
  const [state, setState] = useState<{
    mode: string;
    rpcConnected: boolean;
    agents: any[];
    sessions: any[];
    txFeed: any[];
    timestamp: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [providerOnline, setProviderOnline] = useState<boolean | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Poll the observer state
  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      try {
        const data = await fetchObserverState();
        if (mounted) {
          setState(data);
          setError("");
        }
      } catch {
        if (mounted) setError("Backend offline.");
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL);
    return () => {
      mounted = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Check provider health separately
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const res = await fetch("http://localhost:4101/health", {
          signal: AbortSignal.timeout(3000),
        });
        if (mounted) setProviderOnline(res.ok);
      } catch {
        if (mounted) setProviderOnline(false);
      }
    };
    check();
    const iv = setInterval(check, 5000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, []);

  // Derived data
  const agents = state?.agents || [];
  const sessions = state?.sessions || [];
  const txFeed = state?.txFeed || [];
  const providers = agents.filter((a) => a.role === "provider");
  const customers = agents.filter((a) => a.role === "customer");
  const latestSession = sessions[0] || null;
  const feed = state ? buildFeed(agents, sessions, txFeed) : [];

  // Compute settlement tx hashes from tx feed for the latest session
  const latestSessionTxHashes: string[] = [];
  if (latestSession) {
    const seen = new Set<string>();
    for (const tx of txFeed) {
      if (
        tx.sessionId === latestSession.id &&
        tx.txHash &&
        !tx.txHash.startsWith("0x000000") &&
        !seen.has(tx.txHash)
      ) {
        seen.add(tx.txHash);
        latestSessionTxHashes.push(tx.txHash);
      }
    }
  }

  const totalOnchainTxs = latestSession
    ? latestSessionTxHashes.length + 3
    : 0;
  const compression =
    latestSession && latestSession.settledActions > 0
      ? `${latestSession.settledActions}:${Math.max(latestSessionTxHashes.length, 1)}`
      : "—";

  // ── Backend offline state ──
  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-24 text-center">
        <WifiOff className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Backend offline</h2>
        <p className="text-gray-500">
          Start the backend with <code className="text-arc-400 bg-gray-800 px-2 py-0.5 rounded">npm run backend</code> and refresh.
        </p>
      </div>
    );
  }

  // ── Loading state ──
  if (!state) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-24 text-center">
        <Radio className="w-12 h-12 text-arc-400 mx-auto mb-4 animate-pulse" />
        <p className="text-gray-500">Connecting to backend...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-arc-500/10 flex items-center justify-center">
            <Eye className="w-5 h-5 text-arc-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Live Demo Observer</h1>
            <p className="text-gray-500 text-sm">
              Real-time view of the agent demo — polling every {POLL_INTERVAL / 1000}s
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Backend mode badge */}
          <div
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${
              state.mode === "onchain"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
            }`}
          >
            {state.mode === "onchain" ? (
              <Wifi className="w-3 h-3" />
            ) : (
              <WifiOff className="w-3 h-3" />
            )}
            {state.mode === "onchain" ? "Onchain" : "Fallback"}
          </div>
          {/* Live pulse */}
          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* ── LEFT COLUMN: System Status + Agents + Session Detail ──── */}
        <div className="col-span-12 lg:col-span-5 space-y-4">
          {/* System Status Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card py-3 px-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                {state.mode === "onchain" ? (
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                )}
              </div>
              <div className={`text-sm font-bold font-mono ${state.mode === "onchain" ? "text-emerald-400" : "text-amber-400"}`}>
                {state.mode === "onchain" ? "Onchain" : "Fallback"}
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
                Backend
              </div>
            </div>
            <div className="card py-3 px-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Server className={`w-3.5 h-3.5 ${providerOnline ? "text-emerald-400" : "text-red-400"}`} />
              </div>
              <div className={`text-sm font-bold font-mono ${providerOnline ? "text-emerald-400" : "text-red-400"}`}>
                {providerOnline ? "Online" : "Offline"}
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
                Provider
              </div>
            </div>
            <div className="card py-3 px-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <User className={`w-3.5 h-3.5 ${customers.length > 0 ? "text-emerald-400" : "text-gray-500"}`} />
              </div>
              <div className={`text-sm font-bold font-mono ${customers.length > 0 ? "text-emerald-400" : "text-gray-500"}`}>
                {customers.length > 0 ? "Registered" : "None"}
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
                Customer
              </div>
            </div>
          </div>

          {/* Agents */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Bot className="w-4 h-4" /> Registered Agents
              <span className="text-[10px] font-mono text-gray-600 ml-auto">{agents.length}</span>
            </h2>
            {agents.length === 0 ? (
              <div className="text-center py-6">
                <Bot className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                <p className="text-gray-600 text-sm">No agents registered yet</p>
                <p className="text-gray-700 text-xs mt-1">
                  Start provider and customer agents
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {agents
                  .filter((a) => a.source === "registered" || a.role === "customer")
                  .map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between bg-gray-800/40 rounded-lg px-3 py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            a.role === "provider"
                              ? "bg-arc-500/20"
                              : "bg-purple-500/20"
                          }`}
                        >
                          {a.role === "provider" ? (
                            <Server className="w-4 h-4 text-arc-400" />
                          ) : (
                            <User className="w-4 h-4 text-purple-400" />
                          )}
                        </div>
                        <div>
                          <div className="text-sm text-white font-medium flex items-center gap-2">
                            {a.name}
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                a.role === "provider"
                                  ? "bg-arc-500/20 text-arc-300"
                                  : "bg-purple-500/20 text-purple-300"
                              }`}
                            >
                              {a.role === "provider" ? "Provider" : "Customer"}
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-500 font-mono">
                            {shortAddr(a.walletAddress)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        {a.role === "provider" && a.endpoint && (
                          <div className="text-[10px] text-gray-500 font-mono truncate max-w-[140px]">
                            {a.endpoint}
                          </div>
                        )}
                        {a.role === "provider" && (
                          <div className="text-[10px] text-emerald-400">
                            {a.pricing?.[0]
                              ? `from ${formatUSDC6(a.pricing[0].pricePerUnit)}/action`
                              : ""}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Current Session Detail */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4" /> Current Session
              {latestSession &&
                (latestSession.status === "active" ||
                  latestSession.status === "running") && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
            </h2>

            {!latestSession ? (
              <div className="text-center py-6">
                <Clock className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                <p className="text-gray-600 text-sm">
                  No live demo session yet.
                </p>
                <p className="text-gray-700 text-xs mt-1">
                  Start{" "}
                  <code className="text-arc-400 bg-gray-800 px-1.5 py-0.5 rounded text-[10px]">
                    npm run demo:live
                  </code>
                </p>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Session ID</span>
                  <span className="font-mono text-gray-300 text-xs">
                    {latestSession.id.slice(0, 16)}...
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Status</span>
                  {statusBadge(latestSession.status)}
                </div>
                {latestSession.onchainId && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Onchain ID</span>
                    <span className="font-mono text-arc-400">
                      #{latestSession.onchainId}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Customer</span>
                  <span className="font-mono text-gray-300 text-xs">
                    {shortAddr(latestSession.consumerAddress)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Provider</span>
                  <span className="text-gray-300 text-xs">
                    {latestSession.providerAgentId}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Budget</span>
                  <span className="text-gray-300">
                    {formatUSDC(latestSession.budget)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Paid</span>
                  <span className="text-emerald-400 font-semibold">
                    {formatUSDC(latestSession.totalPaid)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Started</span>
                  <span className="text-gray-300 text-xs">
                    {new Date(latestSession.createdAt).toLocaleTimeString()}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>
                      {latestSession.settledActions} /{" "}
                      {latestSession.maxActions} actions
                    </span>
                    <span>
                      {Math.round(
                        (latestSession.settledActions /
                          latestSession.maxActions) *
                          100
                      )}
                      %
                    </span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-500 ${
                        latestSession.status === "completed"
                          ? "bg-emerald-500"
                          : "bg-arc-500"
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          (latestSession.settledActions /
                            latestSession.maxActions) *
                            100
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Settlement info */}
                {latestSession.status === "completed" && (
                  <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Onchain TXs</span>
                      <span className="text-white font-mono font-semibold">
                        {totalOnchainTxs}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Compression</span>
                      <span className="text-arc-400 font-mono font-semibold">
                        {compression}
                      </span>
                    </div>
                    {latestSessionTxHashes.map((hash, i) => (
                      <div key={hash} className="flex items-center justify-between">
                        <span className="text-gray-500 text-xs">
                          Settlement #{i + 1}
                        </span>
                        <a
                          href={`${EXPLORER_URL}/tx/${hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-arc-400 hover:text-arc-300 text-xs font-mono transition-colors"
                        >
                          {shortHash(hash)}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                )}

                {/* Fallback warning */}
                {state.mode === "fallback" && (
                  <div className="mt-2 flex items-center gap-1.5 text-amber-400 text-[10px] bg-amber-500/10 rounded-lg px-2.5 py-1.5">
                    <AlertTriangle className="w-3 h-3" />
                    Fallback mode — TX hashes are mock. Deploy contracts for
                    real settlement.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN: Live Counters + Activity Feed ──────────── */}
        <div className="col-span-12 lg:col-span-7 space-y-4">
          {/* Live Counters */}
          {latestSession && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="card py-3 px-4 text-center">
                <div className="text-2xl font-bold text-white font-mono">
                  {latestSession.settledActions}
                </div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
                  Actions
                </div>
              </div>
              <div className="card py-3 px-4 text-center">
                <div className="text-2xl font-bold text-emerald-400 font-mono">
                  {formatUSDC(latestSession.totalPaid)}
                </div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
                  Total Paid
                </div>
              </div>
              <div className="card py-3 px-4 text-center">
                <div className="text-2xl font-bold text-arc-400 font-mono">
                  {totalOnchainTxs}
                </div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
                  Onchain TXs
                </div>
              </div>
              <div className="card py-3 px-4 text-center">
                <div className="text-2xl font-bold text-amber-400 font-mono">
                  {compression}
                </div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
                  Compression
                </div>
              </div>
              <div className="card py-3 px-4 text-center">
                <div className={`text-2xl font-bold font-mono ${
                  latestSession.status === "completed" ? "text-emerald-400"
                  : latestSession.status === "running" || latestSession.status === "active" ? "text-arc-400"
                  : "text-gray-400"
                }`}>
                  {latestSession.status === "completed"
                    ? "Done"
                    : latestSession.status === "running" || latestSession.status === "active"
                    ? "Live"
                    : latestSession.status.charAt(0).toUpperCase() + latestSession.status.slice(1)}
                </div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
                  Status
                </div>
              </div>
            </div>
          )}

          {/* Activity Feed */}
          <div
            className="card flex flex-col"
            style={{ minHeight: latestSession ? "520px" : "400px" }}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <Radio className="w-4 h-4" />
                Live Activity Feed
                {latestSession &&
                  (latestSession.status === "active" ||
                    latestSession.status === "running") && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  )}
              </h2>
              <span className="text-xs text-gray-600">
                {feed.length} events
              </span>
            </div>

            {feed.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-600">
                <div className="text-center">
                  <Radio className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Waiting for demo activity...</p>
                  <p className="text-xs text-gray-700 mt-1">
                    Run{" "}
                    <code className="text-arc-400 bg-gray-800 px-1.5 py-0.5 rounded text-[10px]">
                      npm run demo:live
                    </code>{" "}
                    to start
                  </p>
                </div>
              </div>
            ) : (
              <div
                className="flex-1 overflow-y-auto space-y-1 pr-1 scrollbar-thin"
                style={{ maxHeight: "600px" }}
              >
                {feed.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-800/30 transition-colors"
                  >
                    <div className="mt-0.5">{feedIcon(item.icon)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white">{item.text}</div>
                      {item.detail && (
                        <div className="text-[10px] text-gray-500 font-mono truncate">
                          {item.detail}
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-600 whitespace-nowrap">
                      {item.ts > 0 ? timeAgo(item.ts) : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Provider offline warning */}
          {providerOnline === false && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex items-center gap-2 text-red-400 text-sm">
              <WifiOff className="w-4 h-4" />
              Provider offline — start provider agent with{" "}
              <code className="bg-gray-800 px-1.5 py-0.5 rounded text-[10px] font-mono">
                npm run agent:provider
              </code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
