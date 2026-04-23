"use client";

import { useState, useEffect } from "react";
import {
  BarChart3,
  Activity,
  CheckCircle2,
  DollarSign,
  Zap,
  TrendingUp,
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
  Rocket,
} from "lucide-react";
import Link from "next/link";
import { fetchDashboard, fetchTxFeed } from "@/lib/api";

interface AgentRevenue {
  agentId: string;
  agentName: string;
  totalSessions: number;
  totalActions: number;
  totalRevenue: number;
}

interface MarginComparison {
  legacyGasPerTx: number;
  legacyTotalCost: number;
  arcGasPerTx: number;
  arcTotalCost: number;
  savings: number;
  savingsPercent: number;
}

interface Dashboard {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  totalActions: number;
  totalSettled: number;
  totalPaidUSDC: number;
  avgActionsPerSession: number;
  avgPricePerAction: number;
  avgSettlementSpeedMs: number;
  perAgentRevenue: AgentRevenue[];
  marginComparison: MarginComparison;
}

interface TxEntry {
  sessionId: string;
  actionIndex: number;
  actionType: string;
  amount: number;
  txHash: string;
  timestamp: number;
  providerAgentId: string;
}

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

export default function MetricsPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [txFeed, setTxFeed] = useState<TxEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    setRefreshing(true);
    try {
      const [d, t] = await Promise.all([fetchDashboard(), fetchTxFeed(20)]);
      setDashboard(d);
      setTxFeed(t);
    } catch {}
    setRefreshing(false);
  };

  useEffect(() => { loadData(); }, []);

  // Auto-refresh every 5s
  useEffect(() => {
    const iv = setInterval(loadData, 5000);
    return () => clearInterval(iv);
  }, []);

  if (!dashboard) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card py-3 px-4 animate-pulse">
              <div className="h-3 bg-gray-800 rounded w-16 mb-2" />
              <div className="h-6 bg-gray-800 rounded w-20" />
            </div>
          ))}
        </div>
        <div className="text-center text-gray-600 py-8">Connecting to backend...</div>
      </div>
    );
  }

  const hasData = dashboard.totalSessions > 0;

  if (!hasData) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-arc-500/10 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-arc-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Metrics</h1>
            <p className="text-gray-500 text-sm">Network analytics and margin proof</p>
          </div>
        </div>
        <div className="card border-gray-800 text-center py-16">
          <BarChart3 className="w-16 h-16 mx-auto mb-4 text-gray-700" />
          <h2 className="text-lg font-semibold text-gray-300 mb-2">No session data yet</h2>
          <p className="text-gray-500 text-sm mb-6">Run a demo session to see live metrics, margin comparison, and per-agent revenue.</p>
          <Link
            href="/loop"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-arc-600 to-emerald-600 hover:from-arc-500 hover:to-emerald-500 text-white text-sm font-medium transition-all"
          >
            <Rocket className="w-4 h-4" />
            Go to Live Loop
          </Link>
        </div>
      </div>
    );
  }

  const m = dashboard.marginComparison;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-arc-500/10 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-arc-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Metrics</h1>
            <p className="text-gray-500 text-sm">Network analytics and margin proof</p>
          </div>
        </div>
        <button
          onClick={loadData}
          className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5"
          disabled={refreshing}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <SummaryCard label="Sessions" value={dashboard.totalSessions} icon={<Activity className="w-4 h-4" />} color="text-white" />
        <SummaryCard label="Total Actions" value={dashboard.totalActions} icon={<Zap className="w-4 h-4" />} color="text-arc-400" />
        <SummaryCard label="Settled" value={dashboard.totalSettled} icon={<CheckCircle2 className="w-4 h-4" />} color="text-emerald-400" />
        <SummaryCard label="Total Paid" value={formatUSDC(dashboard.totalPaidUSDC)} icon={<DollarSign className="w-4 h-4" />} color="text-emerald-400" />
        <SummaryCard label="Avg Price" value={formatUSDC6(dashboard.avgPricePerAction)} icon={<TrendingUp className="w-4 h-4" />} color="text-amber-400" />
        <SummaryCard label="Avg Actions/Sess" value={dashboard.avgActionsPerSession} icon={<BarChart3 className="w-4 h-4" />} color="text-gray-300" />
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Margin Comparison — most important */}
        <div className="col-span-12 lg:col-span-5">
          <div className="card border-arc-500/20">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-arc-400" />
              Margin Comparison
            </h2>

            {dashboard.totalSettled === 0 ? (
              <p className="text-gray-600 text-sm">Run a session to see margin data.</p>
            ) : (
              <div className="space-y-4">
                {/* Visual bar comparison */}
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500">Legacy Chain ({dashboard.totalSettled} tx)</span>
                      <span className="text-red-400 font-mono">${m.legacyTotalCost.toFixed(2)}</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-3">
                      <div className="bg-red-500/60 h-3 rounded-full" style={{ width: "100%" }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500">Arc ({dashboard.totalSettled} tx)</span>
                      <span className="text-emerald-400 font-mono">${m.arcTotalCost.toFixed(6)}</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-3">
                      <div className="bg-emerald-500/60 h-3 rounded-full" style={{ width: `${Math.max(1, (m.arcTotalCost / m.legacyTotalCost) * 100)}%` }} />
                    </div>
                  </div>
                </div>

                {/* Numbers */}
                <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Gas per tx (legacy)</span>
                    <span className="text-red-400 font-mono">${m.legacyGasPerTx.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Gas per tx (Arc)</span>
                    <span className="text-emerald-400 font-mono">${m.arcGasPerTx.toFixed(6)}</span>
                  </div>
                  <div className="border-t border-gray-700 pt-2 flex justify-between text-sm">
                    <span className="text-gray-300 font-medium">Total savings</span>
                    <span className="text-arc-400 font-bold font-mono">${m.savings.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Savings %</span>
                    <span className="text-arc-400 font-mono">{m.savingsPercent.toFixed(2)}%</span>
                  </div>
                </div>

                <p className="text-xs text-gray-600">
                  At ~$6.93 gas per tx, {dashboard.totalSettled} sub-cent settlements would cost ${m.legacyTotalCost.toFixed(2)} on Ethereum — making the business model impossible. Arc gas is negligible.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Per-Agent Revenue */}
        <div className="col-span-12 lg:col-span-7 space-y-4">
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Per-Agent Revenue</h2>
            {dashboard.perAgentRevenue.length === 0 ? (
              <p className="text-gray-600 text-sm">No agent data yet.</p>
            ) : (
              <div className="space-y-2">
                {dashboard.perAgentRevenue.map((agent) => (
                  <div key={agent.agentId} className="flex items-center justify-between bg-gray-800/40 rounded-lg px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-gray-200">{agent.agentName}</div>
                      <div className="text-xs text-gray-500">{agent.totalSessions} sessions · {agent.totalActions} actions</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-emerald-400 font-mono">{formatUSDC(agent.totalRevenue)}</div>
                      <div className="text-[10px] text-gray-500">revenue</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tx Feed Snapshot */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Recent Settlements</h2>
            {txFeed.length === 0 ? (
              <p className="text-gray-600 text-sm">No transactions yet.</p>
            ) : (
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {txFeed.map((tx, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center text-xs px-2 py-1.5 bg-gray-800/30 rounded">
                    <div className="col-span-3">
                      <span className={`font-mono ${actionColor(tx.actionType)}`}>{tx.actionType}</span>
                    </div>
                    <div className="col-span-2 text-gray-300 font-mono">{formatUSDC6(tx.amount)}</div>
                    <div className="col-span-4 font-mono text-arc-400 text-[10px]">{shortHash(tx.txHash)}</div>
                    <div className="col-span-3 text-gray-600 text-[10px]">
                      {new Date(tx.timestamp).toLocaleTimeString()}
                    </div>
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

function SummaryCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <div className="card py-3 px-4">
      <div className="flex items-center gap-1.5 text-gray-500 mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
    </div>
  );
}
