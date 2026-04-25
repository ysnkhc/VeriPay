"use client";

import { useState, useEffect } from "react";
import {
  Shield,
  CheckCircle2,
  DollarSign,
  Zap,
  ExternalLink,
  TrendingUp,
  ArrowDownRight,
  Hash,
  Layers,
  ArrowRight,
  AlertTriangle,
  Wallet,
  FileCheck,
} from "lucide-react";
import { fetchDashboard, fetchObserverState } from "@/lib/api";

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
  return (raw / 1_000_000).toFixed(4);
}
function shortHash(hash: string): string {
  if (!hash || hash.startsWith("0x000000")) return "";
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}
function shortAddr(addr: string): string {
  if (!addr) return "\u2014";
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}
function isRealHash(hash?: string): boolean {
  return !!hash && !hash.startsWith("0x000000");
}

export default function ProofPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [session, setSession] = useState<any>(null);
  const [mode, setMode] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [d, obs] = await Promise.all([
          fetchDashboard().catch(() => null),
          fetchObserverState().catch(() => null),
        ]);
        if (d) setDashboard(d);
        if (obs) {
          setMode(obs.mode || "");
          if (obs.sessions?.length) {
            const completed = obs.sessions.find((s: any) => s.status === "completed");
            if (completed) setSession(completed);
            else setSession(obs.sessions[0]);
          }
        }
      } catch {}
      setLoading(false);
    };
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, []);

  // Derive proof data from session
  const actionRoot = session?.actionRoot || "";
  const rootMeta = session?.rootMeta || { firstActionIndex: 0, lastActionIndex: 0, actionCount: 0, totalAmount: 0 };
  const batches: any[] = session?.batches || [];
  const realBatches = batches.filter((b: any) => isRealHash(b.settleTxHash));
  const settleTxHash = realBatches[0]?.settleTxHash || "";
  const isFallback = mode === "fallback" || (batches.length > 0 && realBatches.length === 0);
  const hasProof = session && session.status === "completed" && actionRoot && actionRoot !== "0x0000000000000000000000000000000000000000000000000000000000000000";

  const totalActions = rootMeta.actionCount || session?.settledActions || 0;
  const totalPaidRaw = rootMeta.totalAmount || session?.totalPaid || 0;
  const providerAddress = session?.providerAddress || "";
  const settleTxCount = realBatches.length;
  const totalOnchainTxs = session ? settleTxCount + 3 : 0;

  const hasData = dashboard && dashboard.totalSessions > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Settlement Proof</h1>
        </div>
        <p className="text-gray-400 max-w-2xl">
          VeriPay compresses high-frequency agent actions into one verifiable USDC settlement on Arc.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading proof data...</div>
      ) : !hasData || !session ? (
        <div className="card border-dashed border-gray-700 text-center py-16">
          <Shield className="w-14 h-14 mx-auto mb-4 text-gray-700" />
          <h2 className="text-lg font-semibold text-white mb-2">No session data yet</h2>
          <p className="text-gray-500 text-sm mb-4">
            Run <code className="text-arc-400">npm run demo:live</code> to generate a verifiable settlement proof.
          </p>
        </div>
      ) : (
        <>
          {/* Fallback warning */}
          {isFallback && (
            <div className="mb-6 flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-4">
              <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-red-400 font-semibold text-sm">Not valid proof</p>
                <p className="text-red-400/80 text-xs mt-0.5">
                  This session used fallback mode. Settlement was not submitted onchain.
                  Redeploy contracts with aligned USDC address and re-run the demo.
                </p>
              </div>
            </div>
          )}

          {/* ═══ 1. Action Root ═══ */}
          <div className="card border-arc-500/20 mb-6">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Hash className="w-4 h-4 text-arc-400" />
              Action Root
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              This root commits to every metered agent action in the batch.
            </p>

            <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-xs text-gray-500">Action Root</span>
                <span className="text-sm text-white font-mono break-all text-right max-w-[70%]">
                  {hasProof ? actionRoot : "\u2014"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-500">Actions covered</span>
                <span className="text-sm text-white font-mono">
                  {totalActions > 0 ? `${rootMeta.firstActionIndex}\u2013${rootMeta.firstActionIndex + totalActions - 1}` : "\u2014"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-500">Total actions</span>
                <span className="text-sm text-white font-mono font-bold">{totalActions}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-500">Total paid</span>
                <span className="text-sm text-emerald-400 font-mono font-bold">{formatUSDC(totalPaidRaw)} USDC</span>
              </div>
              {isRealHash(settleTxHash) && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">Settlement TX</span>
                  <a
                    href={`${EXPLORER_URL}/tx/${settleTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-arc-400 font-mono hover:underline flex items-center gap-1"
                  >
                    {shortHash(settleTxHash)}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* ═══ 2. Verification Path ═══ */}
          <div className="card mb-6">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-emerald-400" />
              Verification Path
            </h2>

            <div className="space-y-0">
              <Step num={1} done={totalActions > 0}>
                Customer agent executed <span className="text-white font-bold">{totalActions}</span> paid actions
              </Step>
              <StepConnector />
              <Step num={2} done={hasProof}>
                VeriPay generated an action root <span className="text-arc-400 font-mono text-xs">{hasProof ? actionRoot.slice(0, 18) + "\u2026" : ""}</span>
              </Step>
              <StepConnector />
              <Step num={3} done={isRealHash(settleTxHash)}>
                <code className="text-arc-400 text-xs">settleOffchain</code> submitted root + total amount on Arc
              </Step>
              <StepConnector />
              <Step num={4} done={isRealHash(settleTxHash)}>
                Arc transaction transferred <span className="text-emerald-400 font-bold">{formatUSDC(totalPaidRaw)} USDC</span> to provider
              </Step>
            </div>

            {isRealHash(settleTxHash) && (
              <div className="mt-5">
                <a
                  href={`${EXPLORER_URL}/tx/${settleTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-arc-500/10 hover:bg-arc-500/20 text-arc-400 font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Verify on Arcscan
                </a>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* ═══ 3. TX Breakdown: 100 → 1 ═══ */}
            <div className="card">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                Transaction Breakdown
              </h2>

              <div className="space-y-3">
                <Row label="Agent actions executed" value={String(totalActions)} color="text-white" bold />
                <Row label="Per-action txs" value="0" color="text-emerald-400" />
                <Row label="Settlement txs" value={String(Math.max(settleTxCount, batches.length > 0 ? batches.length : 0))} color="text-arc-400" />
                <Row label="Lifecycle txs (create / deposit / finalize)" value="3" color="text-gray-300" />
                <div className="border-t border-gray-800 pt-3">
                  <Row label="Total onchain txs" value={String(totalOnchainTxs)} color="text-white" bold />
                </div>
                <div className="bg-arc-500/10 rounded-lg px-4 py-3 mt-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-arc-400" />
                    <span className="text-sm font-semibold text-arc-400">
                      {totalActions}:{Math.max(settleTxCount, 1)} compression
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {totalActions} actions settled in {Math.max(settleTxCount, 1)} transaction{settleTxCount !== 1 ? "s" : ""} instead of {totalActions * 2} on Ethereum
                  </p>
                </div>
              </div>
            </div>

            {/* ═══ 4. Provider Payment Proof ═══ */}
            <div className="card">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-400" />
                Provider Payment
              </h2>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">Provider wallet</span>
                  {providerAddress ? (
                    <a
                      href={`${EXPLORER_URL}/address/${providerAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-gray-300 font-mono hover:text-arc-400 flex items-center gap-1"
                    >
                      {shortAddr(providerAddress)}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-sm text-gray-600 font-mono">{"\u2014"}</span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">USDC received</span>
                  <span className="text-lg text-emerald-400 font-mono font-bold">{formatUSDC(totalPaidRaw)} USDC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">Price per action</span>
                  <span className="text-sm text-gray-300 font-mono">{totalActions > 0 ? formatUSDC(totalPaidRaw / totalActions) : "\u2014"} USDC</span>
                </div>

                {/* Batch details */}
                {batches.length > 0 && (
                  <div className="border-t border-gray-800 pt-3 space-y-2">
                    <span className="text-xs text-gray-500">Settlement transactions</span>
                    {batches.map((b: any, i: number) => {
                      const real = isRealHash(b.settleTxHash);
                      return (
                        <div key={i} className="flex items-center justify-between bg-gray-800/40 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className={`w-3.5 h-3.5 ${real ? "text-emerald-400" : "text-amber-400"}`} />
                            <span className="text-xs text-gray-300">
                              Batch #{b.batchIndex ?? i} &middot; {b.actionCount} actions &middot; {formatUSDC(b.totalAmount || 0)} USDC
                            </span>
                          </div>
                          {real ? (
                            <a
                              href={`${EXPLORER_URL}/tx/${b.settleTxHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-arc-400 font-mono hover:underline flex items-center gap-1"
                            >
                              {shortHash(b.settleTxHash)}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-xs text-amber-400 font-mono">fallback</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ═══ 5. Cost Comparison ═══ */}
          {dashboard && (
            <div className="card border-arc-500/20 mb-6">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-5 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-arc-400" />
                Why This Only Works on Arc
              </h2>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-400">Ethereum L1 ({totalActions} per-action txs @ ~$6.93/tx)</span>
                    <span className="text-red-400 font-mono font-semibold">
                      ${dashboard.marginComparison.legacyTotalCost.toFixed(2)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-4">
                    <div className="bg-red-500/50 h-4 rounded-full flex items-center justify-end pr-2">
                      <span className="text-[10px] text-red-300 font-mono">
                        ${dashboard.marginComparison.legacyGasPerTx.toFixed(2)}/tx
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-400">Arc ({totalOnchainTxs} total txs)</span>
                    <span className="text-emerald-400 font-mono font-semibold">
                      ${dashboard.marginComparison.arcTotalCost.toFixed(6)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-4">
                    <div
                      className="bg-emerald-500/50 h-4 rounded-full"
                      style={{
                        width: `${Math.max(2, (dashboard.marginComparison.arcTotalCost / dashboard.marginComparison.legacyTotalCost) * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="bg-gradient-to-r from-arc-900/30 to-emerald-900/20 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-300 font-medium">Total savings</span>
                    <span className="text-lg font-bold text-arc-400 font-mono">
                      ${dashboard.marginComparison.savings.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-400 text-sm">
                    <ArrowDownRight className="w-4 h-4" />
                    <span className="font-mono font-semibold">
                      {dashboard.marginComparison.savingsPercent.toFixed(1)}% cheaper
                    </span>
                  </div>
                </div>

                <p className="text-xs text-gray-600 leading-relaxed">
                  Settling {totalActions} sub-cent payments individually on Ethereum would cost ${dashboard.marginComparison.legacyTotalCost.toFixed(2)} in gas
                  {" \u2014 "}exceeding the total revenue of ${formatUSDC(dashboard.totalPaidUSDC)}.
                  VeriPay on Arc settles the same {totalActions} actions for ${dashboard.marginComparison.arcTotalCost.toFixed(6)}.
                </p>
              </div>
            </div>
          )}

          {/* ═══ Bottom summary ═══ */}
          <div className="card bg-gradient-to-r from-gray-900/80 to-gray-900/80 border-gray-800">
            <div className="text-center py-4">
              <p className="text-gray-300 text-sm max-w-2xl mx-auto leading-relaxed">
                <span className="text-white font-semibold">{totalActions} agent actions</span> were metered offchain,
                committed into <span className="text-arc-400 font-semibold">one action root</span>, and settled as{" "}
                <span className="text-emerald-400 font-semibold">{formatUSDC(totalPaidRaw)} USDC</span> to the provider on Arc.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function Step({ num, done, children }: { num: number; done: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
        done ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-800 text-gray-600"
      }`}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : num}
      </div>
      <p className={`text-sm pt-1 ${done ? "text-gray-300" : "text-gray-600"}`}>
        {children}
      </p>
    </div>
  );
}

function StepConnector() {
  return <div className="ml-3.5 w-px h-4 bg-gray-800" />;
}

function Row({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm font-mono ${color} ${bold ? "font-bold" : ""}`}>{value}</span>
    </div>
  );
}
