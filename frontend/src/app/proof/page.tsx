"use client";

import { useState, useEffect } from "react";
import {
  Shield,
  Activity,
  CheckCircle2,
  DollarSign,
  Zap,
  Clock,
  ExternalLink,
  TrendingUp,
  ArrowDownRight,
} from "lucide-react";
import { fetchDashboard, fetchTxFeed, fetchObserverState } from "@/lib/api";

const EXPLORER_URL = "https://testnet.arcscan.app";

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
  marginComparison: {
    legacyGasPerTx: number;
    legacyTotalCost: number;
    arcGasPerTx: number;
    arcTotalCost: number;
    savings: number;
    savingsPercent: number;
  };
}

function formatUSDC(raw: number): string {
  return `$${(raw / 1_000_000).toFixed(4)}`;
}
function shortHash(hash: string): string {
  if (!hash || hash.startsWith("0x000000")) return "";
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

export default function ProofPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [txHashes, setTxHashes] = useState<string[]>([]);
  const [sessionData, setSessionData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [d, txFeed, obs] = await Promise.all([
          fetchDashboard().catch(() => null),
          fetchTxFeed(100).catch(() => []),
          fetchObserverState().catch(() => null),
        ]);
        if (d) setDashboard(d);

        // Extract unique real tx hashes
        const seen = new Set<string>();
        const hashes: string[] = [];
        for (const tx of txFeed) {
          if (tx.txHash && !tx.txHash.startsWith("0x000000") && !seen.has(tx.txHash)) {
            seen.add(tx.txHash);
            hashes.push(tx.txHash);
          }
        }
        setTxHashes(hashes);

        // Get latest completed session
        if (obs?.sessions?.length) {
          const completed = obs.sessions.find((s: any) => s.status === "completed");
          if (completed) setSessionData(completed);
        }
      } catch {}
      setLoading(false);
    };
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, []);

  const hasData = dashboard && dashboard.totalSessions > 0;

  // Derived
  const settleTxCount = txHashes.length;
  const totalOnchainTxs = sessionData ? settleTxCount + 3 : settleTxCount;
  const compressionRatio =
    dashboard && dashboard.totalSettled > 0 && settleTxCount > 0
      ? `${dashboard.totalSettled}:${settleTxCount}`
      : dashboard && dashboard.totalSettled > 0
      ? `${dashboard.totalSettled}:1`
      : "\u2014";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Economic Proof</h1>
        </div>
        <p className="text-gray-400 max-w-2xl">
          Real data from demo sessions. Proof that sub-cent agent payments are only viable on Arc.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading proof data...</div>
      ) : !hasData ? (
        <div className="card border-dashed border-gray-700 text-center py-16">
          <Shield className="w-14 h-14 mx-auto mb-4 text-gray-700" />
          <h2 className="text-lg font-semibold text-white mb-2">No session data yet</h2>
          <p className="text-gray-500 text-sm mb-4">
            Run a live demo to generate economic proof.
          </p>
          <code className="inline-block text-arc-400 bg-gray-800 px-4 py-2 rounded-lg text-sm font-mono">
            npm run demo:live
          </code>
        </div>
      ) : (
        <>
          {/* Key metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
            <MetricCard
              label="Actions"
              value={dashboard!.totalSettled}
              icon={<Zap className="w-4 h-4" />}
              color="text-white"
            />
            <MetricCard
              label="Total Paid"
              value={formatUSDC(dashboard!.totalPaidUSDC)}
              icon={<DollarSign className="w-4 h-4" />}
              color="text-emerald-400"
            />
            <MetricCard
              label="Settlement TXs"
              value={settleTxCount || "\u2014"}
              icon={<CheckCircle2 className="w-4 h-4" />}
              color="text-arc-400"
            />
            <MetricCard
              label="Onchain TXs"
              value={totalOnchainTxs || "\u2014"}
              icon={<Activity className="w-4 h-4" />}
              color="text-arc-400"
            />
            <MetricCard
              label="Compression"
              value={compressionRatio}
              icon={<TrendingUp className="w-4 h-4" />}
              color="text-amber-400"
            />
            <MetricCard
              label="Sessions"
              value={dashboard!.totalSessions}
              icon={<Clock className="w-4 h-4" />}
              color="text-gray-300"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cost comparison — the core proof */}
            <div className="card border-arc-500/20">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-5 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-arc-400" />
                Ethereum vs Arc
              </h2>

              <div className="space-y-4">
                {/* Ethereum bar */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-400">Ethereum ({dashboard!.totalSettled} tx @ ~$6.93/tx)</span>
                    <span className="text-red-400 font-mono font-semibold">
                      ${dashboard!.marginComparison.legacyTotalCost.toFixed(2)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-4">
                    <div className="bg-red-500/50 h-4 rounded-full flex items-center justify-end pr-2">
                      <span className="text-[10px] text-red-300 font-mono">
                        ${dashboard!.marginComparison.legacyGasPerTx.toFixed(2)}/tx
                      </span>
                    </div>
                  </div>
                </div>

                {/* Arc bar */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-400">Arc ({dashboard!.totalSettled} tx)</span>
                    <span className="text-emerald-400 font-mono font-semibold">
                      ${dashboard!.marginComparison.arcTotalCost.toFixed(6)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-4">
                    <div
                      className="bg-emerald-500/50 h-4 rounded-full"
                      style={{
                        width: `${Math.max(2, (dashboard!.marginComparison.arcTotalCost / dashboard!.marginComparison.legacyTotalCost) * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Savings */}
                <div className="bg-gradient-to-r from-arc-900/30 to-emerald-900/20 rounded-xl p-4 mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-300 font-medium">Total savings</span>
                    <span className="text-lg font-bold text-arc-400 font-mono">
                      ${dashboard!.marginComparison.savings.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-400 text-sm">
                    <ArrowDownRight className="w-4 h-4" />
                    <span className="font-mono font-semibold">
                      {dashboard!.marginComparison.savingsPercent.toFixed(1)}% cheaper
                    </span>
                  </div>
                </div>

                <p className="text-xs text-gray-600 leading-relaxed">
                  At ~$6.93 gas per transaction, settling {dashboard!.totalSettled} sub-cent
                  payments on Ethereum would cost ${dashboard!.marginComparison.legacyTotalCost.toFixed(2)} —
                  exceeding the total revenue of {formatUSDC(dashboard!.totalPaidUSDC)}.
                  This business model is only viable on Arc.
                </p>
              </div>
            </div>

            {/* Settlement transactions */}
            <div className="card">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-5 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Settlement Transactions
              </h2>

              {txHashes.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                  <p className="text-gray-600 text-sm">No settlement transactions yet</p>
                  <p className="text-gray-700 text-xs mt-1">
                    Transactions appear after session finalization
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {txHashes.map((hash, i) => (
                    <a
                      key={hash}
                      href={`${EXPLORER_URL}/tx/${hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between bg-gray-800/40 rounded-lg px-4 py-3 group hover:bg-gray-800/60 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div>
                          <div className="text-sm text-white font-mono">
                            {shortHash(hash)}
                          </div>
                          <div className="text-[10px] text-gray-600">
                            Settlement #{i + 1}
                          </div>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-gray-600 group-hover:text-arc-400 transition-colors" />
                    </a>
                  ))}
                </div>
              )}

              {/* Session summary if available */}
              {sessionData && (
                <div className="mt-4 pt-4 border-t border-gray-800 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Actions executed</span>
                    <span className="text-white font-mono">{sessionData.settledActions}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total paid</span>
                    <span className="text-emerald-400 font-mono">{formatUSDC(sessionData.totalPaid)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Budget</span>
                    <span className="text-gray-300 font-mono">{formatUSDC(sessionData.budget)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Compression</span>
                    <span className="text-arc-400 font-mono font-semibold">{compressionRatio}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom summary card */}
          <div className="mt-8 card border-gray-800 bg-gradient-to-r from-gray-900 to-gray-900">
            <div className="text-center py-4">
              <p className="text-gray-400 text-sm max-w-xl mx-auto leading-relaxed">
                <span className="text-white font-medium">{dashboard!.totalSettled} paid actions</span> settled
                for <span className="text-emerald-400 font-medium">{formatUSDC(dashboard!.totalPaidUSDC)}</span> total.
                On Ethereum this would cost <span className="text-red-400 font-medium">${dashboard!.marginComparison.legacyTotalCost.toFixed(2)}</span> in gas alone.
                VeriPay on Arc makes agent micropayments economically viable.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}) {
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
