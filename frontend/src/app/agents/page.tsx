"use client";

import { useState, useEffect } from "react";
import {
  Bot,
  DollarSign,
  ArrowRight,
  Server,
  User,
  Wifi,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { fetchAgents } from "@/lib/api";

interface PricingEntry {
  actionType: string;
  pricePerUnit: number;
  description: string;
}

interface Agent {
  id: string;
  name: string;
  description: string;
  walletAddress: string;
  role: string;
  mode: string;
  endpoint: string;
  supportedActions: string[];
  pricing: PricingEntry[];
  priceTable: Record<string, number>;
  active: boolean;
  source: string;
}

function formatUSDC(raw: number): string {
  return `$${(raw / 1_000_000).toFixed(3)}`;
}

function shortAddr(addr: string): string {
  if (!addr) return "—";
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function actionColor(type: string): string {
  switch (type) {
    case "API_LOOKUP": return "text-arc-400 bg-arc-500/10";
    case "JSON_TRANSFORM": return "text-amber-400 bg-amber-500/10";
    case "SUMMARIZE": return "text-emerald-400 bg-emerald-500/10";
    case "CLASSIFY": return "text-purple-400 bg-purple-500/10";
    case "FINAL_ANSWER": return "text-rose-400 bg-rose-500/10";
    default: return "text-gray-400 bg-gray-500/10";
  }
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerOnline, setProviderOnline] = useState<boolean | null>(null);

  useEffect(() => {
    fetchAgents()
      .then((data) => { setAgents(data); setLoading(false); })
      .catch(() => setLoading(false));

    // Check provider agent health
    const checkProvider = async () => {
      try {
        const res = await fetch("http://localhost:4101/health", {
          signal: AbortSignal.timeout(3000),
        });
        setProviderOnline(res.ok);
      } catch {
        setProviderOnline(false);
      }
    };
    checkProvider();
    const iv = setInterval(checkProvider, 5000);
    return () => clearInterval(iv);
  }, []);

  // Separate real agents (registered/customer) from seed placeholders
  const realAgents = agents.filter(
    (a) => a.source === "registered" || a.role === "customer"
  );
  const seedAgents = agents.filter(
    (a) => a.source === "seed" && a.role !== "customer"
  );
  const providers = realAgents.filter((a) => a.role === "provider");
  const customers = realAgents.filter((a) => a.role === "customer");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-arc-500/10 flex items-center justify-center">
          <Bot className="w-5 h-5 text-arc-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Agents</h1>
          <p className="text-gray-500 text-sm">
            Real registered agents on the VeriPay network
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-20">Loading agents...</div>
      ) : realAgents.length === 0 ? (
        <div className="text-center py-20">
          <Bot className="w-16 h-16 mx-auto mb-4 text-gray-700" />
          <h2 className="text-xl font-bold text-white mb-2">
            No agents registered yet
          </h2>
          <p className="text-gray-500 mb-4">
            Start the provider and customer agents to see them here.
          </p>
          <div className="flex flex-col items-center gap-2 text-sm text-gray-600">
            <code className="bg-gray-800 px-3 py-1.5 rounded text-arc-400 font-mono text-xs">
              npm run agent:provider
            </code>
            <code className="bg-gray-800 px-3 py-1.5 rounded text-arc-400 font-mono text-xs">
              npm run demo:live
            </code>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Provider Agents */}
          {providers.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Server className="w-4 h-4 text-arc-400" />
                Provider Agents
                <span className="text-[10px] font-mono text-gray-600">
                  ({providers.length})
                </span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {providers.map((agent) => {
                  const minPrice =
                    agent.pricing?.length > 0
                      ? Math.min(...agent.pricing.map((p) => p.pricePerUnit))
                      : 0;
                  return (
                    <div
                      key={agent.id}
                      className="card hover:border-arc-500/30 transition-all group flex flex-col bg-arc-500/5 border-arc-500/10"
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-11 h-11 rounded-xl bg-arc-500/20 flex items-center justify-center">
                          <Server className="w-5 h-5 text-arc-400" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="badge-info text-[10px]">Provider</span>
                          {providerOnline !== null && (
                            <span
                              className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                                providerOnline
                                  ? "bg-emerald-500/20 text-emerald-400"
                                  : "bg-red-500/20 text-red-400"
                              }`}
                            >
                              {providerOnline ? (
                                <Wifi className="w-2.5 h-2.5" />
                              ) : (
                                <WifiOff className="w-2.5 h-2.5" />
                              )}
                              {providerOnline ? "Online" : "Offline"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Name + ID */}
                      <h3 className="text-lg font-semibold text-white mb-0.5 group-hover:text-arc-300 transition-colors">
                        {agent.name}
                      </h3>
                      <p className="text-gray-600 text-xs font-mono mb-1">
                        {agent.id}
                      </p>
                      <p className="text-gray-500 text-sm mb-3 flex-1">
                        {agent.description || "Agent service provider"}
                      </p>

                      {/* Wallet */}
                      <div className="text-xs text-gray-500 font-mono mb-3 bg-gray-800/50 rounded-lg px-3 py-2">
                        <span className="text-gray-600">Wallet: </span>
                        {shortAddr(agent.walletAddress)}
                      </div>

                      {/* Endpoint */}
                      {agent.endpoint && (
                        <div className="text-xs text-gray-500 font-mono mb-3 bg-gray-800/50 rounded-lg px-3 py-2 truncate">
                          <span className="text-gray-600">Endpoint: </span>
                          {agent.endpoint}
                        </div>
                      )}

                      {/* Supported Actions */}
                      {agent.supportedActions?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {agent.supportedActions.map((action) => (
                            <span
                              key={action}
                              className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${actionColor(action)}`}
                            >
                              {action}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Pricing Table */}
                      {agent.pricing?.length > 0 && (
                        <div className="space-y-1 mb-4">
                          {agent.pricing.map((p) => (
                            <div
                              key={p.actionType}
                              className="flex items-center justify-between text-xs bg-gray-900/60 rounded-lg px-3 py-2"
                            >
                              <span className="text-gray-300">
                                {p.description || p.actionType}
                              </span>
                              <span className="text-emerald-400 font-mono font-semibold ml-2 whitespace-nowrap">
                                {formatUSDC(p.pricePerUnit)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-3 border-t border-gray-800/50">
                        <div className="flex items-center gap-1 text-sm text-emerald-400">
                          <DollarSign className="w-4 h-4" />
                          <span className="font-mono font-semibold">
                            from {formatUSDC(minPrice)}/action
                          </span>
                        </div>
                        <Link
                          href="/observer"
                          className="flex items-center gap-1 text-xs text-arc-400 hover:text-arc-300 transition-colors"
                        >
                          Live Demo <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Customer Agents */}
          {customers.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <User className="w-4 h-4 text-purple-400" />
                Customer Agents
                <span className="text-[10px] font-mono text-gray-600">
                  ({customers.length})
                </span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {customers.map((agent) => (
                  <div
                    key={agent.id}
                    className="card hover:border-purple-500/30 transition-all group flex flex-col bg-purple-500/5 border-purple-500/10"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-11 h-11 rounded-xl bg-purple-500/20 flex items-center justify-center">
                        <User className="w-5 h-5 text-purple-400" />
                      </div>
                      <span className="badge bg-purple-500/20 text-purple-300 text-[10px]">
                        Customer
                      </span>
                    </div>

                    {/* Name + ID */}
                    <h3 className="text-lg font-semibold text-white mb-0.5 group-hover:text-purple-300 transition-colors">
                      {agent.name}
                    </h3>
                    <p className="text-gray-600 text-xs font-mono mb-1">
                      {agent.id}
                    </p>
                    <p className="text-gray-500 text-sm mb-3 flex-1">
                      {agent.description || "Customer payment agent"}
                    </p>

                    {/* Wallet */}
                    <div className="text-xs text-gray-500 font-mono bg-gray-800/50 rounded-lg px-3 py-2">
                      <span className="text-gray-600">Wallet: </span>
                      {shortAddr(agent.walletAddress)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Seed agents (collapsed) */}
          {seedAgents.length > 0 && (
            <section>
              <details className="group">
                <summary className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-4 cursor-pointer flex items-center gap-2 hover:text-gray-400 transition-colors">
                  <Bot className="w-4 h-4" />
                  Seed Agents (built-in)
                  <span className="text-[10px] font-mono">
                    ({seedAgents.length})
                  </span>
                </summary>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                  {seedAgents.map((agent) => (
                    <div
                      key={agent.id}
                      className="card opacity-60 flex flex-col"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center">
                          <Bot className="w-4 h-4 text-gray-500" />
                        </div>
                        <span className="badge-neutral text-[10px]">seed</span>
                      </div>
                      <h3 className="text-sm font-semibold text-gray-300 mb-0.5">
                        {agent.name}
                      </h3>
                      <p className="text-gray-600 text-xs font-mono mb-1">
                        {agent.id}
                      </p>
                      <p className="text-gray-600 text-xs flex-1">
                        {agent.description || "Built-in seed agent"}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
