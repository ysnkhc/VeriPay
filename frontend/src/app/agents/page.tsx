"use client";

import { useState, useEffect } from "react";
import { Bot, DollarSign, Zap, ArrowRight, Search, Database, FileText } from "lucide-react";
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
  mode: string;
  endpoint: string;
  supportedActions: string[];
  pricing: PricingEntry[];
  priceTable: Record<string, number>;
  active: boolean;
}

function formatUSDC(raw: number): string {
  return `$${(raw / 1_000_000).toFixed(3)}`;
}

function modeIcon(mode: string) {
  switch (mode) {
    case "data_lookup": return <Search className="w-5 h-5 text-arc-400" />;
    case "transform": return <Database className="w-5 h-5 text-amber-400" />;
    case "summary": return <FileText className="w-5 h-5 text-emerald-400" />;
    default: return <Bot className="w-5 h-5 text-arc-400" />;
  }
}

function modeColor(mode: string): string {
  switch (mode) {
    case "data_lookup": return "bg-arc-500/10 border-arc-500/20";
    case "transform": return "bg-amber-500/10 border-amber-500/20";
    case "summary": return "bg-emerald-500/10 border-emerald-500/20";
    default: return "bg-gray-800 border-gray-700";
  }
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

  useEffect(() => {
    fetchAgents()
      .then((data) => { setAgents(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-arc-500/10 flex items-center justify-center">
          <Bot className="w-5 h-5 text-arc-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Provider Agents</h1>
          <p className="text-gray-500 text-sm">Available agents with per-action pricing</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-20">Loading agents...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {agents.map((agent) => {
            const minPrice = Math.min(...agent.pricing.map((p) => p.pricePerUnit));
            return (
              <div
                key={agent.id}
                className={`card hover:border-arc-500/30 transition-all group flex flex-col ${modeColor(agent.mode)}`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="w-11 h-11 rounded-xl bg-gray-800 flex items-center justify-center">
                    {modeIcon(agent.mode)}
                  </div>
                  <span className="badge-success text-xs">active</span>
                </div>

                {/* Name + Description */}
                <h3 className="text-lg font-semibold text-white mb-1 group-hover:text-arc-300 transition-colors">
                  {agent.name}
                </h3>
                <p className="text-gray-500 text-sm mb-4 flex-1">{agent.description}</p>

                {/* Supported Actions */}
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

                {/* Pricing Table */}
                <div className="space-y-1 mb-4">
                  {agent.pricing.map((p) => (
                    <div
                      key={p.actionType}
                      className="flex items-center justify-between text-xs bg-gray-900/60 rounded-lg px-3 py-2"
                    >
                      <div>
                        <span className="text-gray-300">{p.description}</span>
                      </div>
                      <span className="text-emerald-400 font-mono font-semibold ml-2 whitespace-nowrap">
                        {formatUSDC(p.pricePerUnit)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-800/50">
                  <div className="flex items-center gap-1 text-sm text-emerald-400">
                    <DollarSign className="w-4 h-4" />
                    <span className="font-mono font-semibold">
                      from {formatUSDC(minPrice)}/action
                    </span>
                  </div>
                  <Link
                    href="/loop"
                    className="flex items-center gap-1 text-xs text-arc-400 hover:text-arc-300 transition-colors"
                  >
                    Start Loop <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
