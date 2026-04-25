"use client";

import { useState, useEffect } from "react";
import {
  Bot,
  DollarSign,
  Server,
  User,
  Wifi,
  WifiOff,
  ArrowRight,
  Zap,
  Shield,
  Key,
  Globe,
  CreditCard,
} from "lucide-react";
import Link from "next/link";
import { fetchAgents } from "@/lib/api";

interface Agent {
  id: string;
  name: string;
  description: string;
  walletAddress: string;
  role: string;
  mode: string;
  endpoint: string;
  supportedActions: string[];
  pricing: { actionType: string; pricePerUnit: number; description: string }[];
  active: boolean;
  source: string;
}

function formatUSDC(raw: number): string {
  return `$${(raw / 1_000_000).toFixed(3)}`;
}
function shortAddr(addr: string): string {
  if (!addr) return "\u2014";
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerOnline, setProviderOnline] = useState<boolean | null>(null);

  useEffect(() => {
    fetchAgents()
      .then((data) => { setAgents(data); setLoading(false); })
      .catch(() => setLoading(false));
    const check = async () => {
      try {
        const res = await fetch("http://localhost:4101/health", { signal: AbortSignal.timeout(3000) });
        setProviderOnline(res.ok);
      } catch { setProviderOnline(false); }
    };
    check();
    const iv = setInterval(check, 5000);
    return () => clearInterval(iv);
  }, []);

  const realProviders = agents.filter((a) => (a.source === "registered") && a.role === "provider");
  const realCustomers = agents.filter((a) => a.role === "customer");

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-arc-500/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-arc-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Agent Integration</h1>
        </div>
        <p className="text-gray-400 max-w-2xl">
          Any AI agent can integrate with VeriPay as a provider or customer.
          Providers sell compute per action. Customers pay per action with USDC on Arc.
        </p>
      </div>

      {/* Integration guides — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
        {/* Provider guide */}
        <div className="card border-arc-500/10">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-lg bg-arc-500/20 flex items-center justify-center">
              <Server className="w-4.5 h-4.5 text-arc-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Provider Agent</h2>
              <p className="text-xs text-gray-500">Sells services, receives USDC</p>
            </div>
          </div>
          <div className="space-y-3">
            {[
              { icon: Globe, label: "Register service", desc: "Expose an HTTP endpoint that handles action requests" },
              { icon: DollarSign, label: "Set pricing", desc: "Define per-action prices in USDC (e.g. $0.001 per lookup)" },
              { icon: Key, label: "Authenticate", desc: "Receive wallet-signed requests or API key auth" },
              { icon: CreditCard, label: "Receive payment", desc: "USDC is settled to your wallet via onchain settlement" },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 bg-gray-800/30 rounded-lg px-3.5 py-3">
                <div className="w-7 h-7 rounded-md bg-arc-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <item.icon className="w-3.5 h-3.5 text-arc-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{item.label}</div>
                  <div className="text-xs text-gray-500">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Customer guide */}
        <div className="card border-purple-500/10">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <User className="w-4.5 h-4.5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Customer Agent</h2>
              <p className="text-xs text-gray-500">Buys services, pays per action</p>
            </div>
          </div>
          <div className="space-y-3">
            {[
              { icon: Zap, label: "Create session", desc: "Choose a provider, set a USDC budget and max actions" },
              { icon: ArrowRight, label: "Execute actions", desc: "Call the provider endpoint — each action is metered" },
              { icon: Shield, label: "402 payment flow", desc: "Sign payments per action using the x402 protocol" },
              { icon: DollarSign, label: "Pay per action", desc: "Sub-cent USDC payments, settled in a single compressed tx" },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 bg-gray-800/30 rounded-lg px-3.5 py-3">
                <div className="w-7 h-7 rounded-md bg-purple-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <item.icon className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{item.label}</div>
                  <div className="text-xs text-gray-500">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Real registered agents */}
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
          Registered Agents
          {loading && <span className="text-xs text-gray-600 font-normal">Loading...</span>}
        </h2>
      </div>

      {!loading && realProviders.length === 0 && realCustomers.length === 0 ? (
        <div className="card border-dashed border-gray-700 text-center py-10">
          <Bot className="w-10 h-10 mx-auto mb-3 text-gray-700" />
          <p className="text-gray-500 text-sm mb-1">No agents online yet</p>
          <p className="text-gray-600 text-xs">
            Run <code className="text-arc-400 bg-gray-800 px-1.5 py-0.5 rounded text-[10px]">npm run demo:live</code> to start the full agent demo
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Providers */}
          {realProviders.map((a) => (
            <div key={a.id} className="card border-arc-500/10 bg-arc-500/[0.02]">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-arc-500/20 flex items-center justify-center">
                    <Server className="w-4 h-4 text-arc-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{a.name}</div>
                    <div className="text-[10px] text-gray-600 font-mono">{a.id}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="badge-info text-[10px]">Provider</span>
                  {providerOnline !== null && (
                    <span className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                      providerOnline ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                    }`}>
                      {providerOnline ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
                      {providerOnline ? "Online" : "Offline"}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-xs text-gray-500 font-mono mb-2">{shortAddr(a.walletAddress)}</div>
              {a.endpoint && (
                <div className="text-[10px] text-gray-600 font-mono mb-3 truncate">{a.endpoint}</div>
              )}
              {a.pricing?.length > 0 && (
                <div className="space-y-1 mb-3">
                  {a.pricing.slice(0, 3).map((p) => (
                    <div key={p.actionType} className="flex justify-between text-xs bg-gray-800/40 rounded px-2.5 py-1.5">
                      <span className="text-gray-400">{p.actionType}</span>
                      <span className="text-emerald-400 font-mono">{formatUSDC(p.pricePerUnit)}</span>
                    </div>
                  ))}
                  {a.pricing.length > 3 && (
                    <div className="text-[10px] text-gray-600 text-center">+{a.pricing.length - 3} more</div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Customers */}
          {realCustomers.map((a) => (
            <div key={a.id} className="card border-purple-500/10 bg-purple-500/[0.02]">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <User className="w-4 h-4 text-purple-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{a.name}</div>
                    <div className="text-[10px] text-gray-600 font-mono">{a.id}</div>
                  </div>
                </div>
                <span className="badge bg-purple-500/20 text-purple-300 text-[10px]">Customer</span>
              </div>
              <div className="text-xs text-gray-500 font-mono">{shortAddr(a.walletAddress)}</div>
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      <div className="mt-8 text-center">
        <Link
          href="/observer"
          className="inline-flex items-center gap-2 text-sm text-arc-400 hover:text-arc-300 transition-colors"
        >
          Watch agents in action <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
