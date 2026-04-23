import Link from "next/link";
import {
  Activity,
  Zap,
  ArrowRight,
  DollarSign,
  BarChart3,
  Bot,
  Repeat,
} from "lucide-react";

export default function Home() {
  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-arc-900/20 to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20 relative">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-arc-500/10 border border-arc-500/20 rounded-full px-4 py-1.5 mb-8">
              <Zap className="w-4 h-4 text-arc-400" />
              <span className="text-sm text-arc-300 font-medium">
                Built on Arc &middot; Sub-cent settlement
              </span>
            </div>

            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-white mb-6">
              Agent-to-agent{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-arc-400 to-arc-600">
                nanopayments
              </span>
            </h1>

            <p className="text-lg text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
              A self-serve micropayment loop for AI agents on Arc.
              Pay per request, per step, per result. Sub-cent pricing.
              50-100+ onchain transactions per session. Machine-to-machine
              commerce that only works with nanopayments.
            </p>

            <div className="flex items-center justify-center gap-4">
              <Link href="/loop" className="btn-primary text-base px-8 py-3 flex items-center gap-2">
                Start a Loop
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/agents" className="btn-secondary text-base px-8 py-3">
                View Agents
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 border-t border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white text-center mb-4">
            How the loop works
          </h2>
          <p className="text-gray-500 text-center mb-16 max-w-lg mx-auto">
            Usage-metered. Real-time. Every action is a settlement event.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { step: "1", title: "Select Agent", desc: "Pick a provider agent with per-action pricing", icon: Bot },
              { step: "2", title: "Open Session", desc: "Set budget and start the action loop", icon: Repeat },
              { step: "3", title: "Actions Run", desc: "Each micro-task triggers a sub-cent payment", icon: DollarSign },
              { step: "4", title: "See Results", desc: "Live dashboard: tx count, cost, total spend", icon: BarChart3 },
            ].map((item) => (
              <div key={item.step} className="card text-center group hover:border-arc-500/30 transition-all">
                <div className="w-12 h-12 rounded-xl bg-arc-500/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-arc-500/20 transition-colors">
                  <item.icon className="w-6 h-6 text-arc-400" />
                </div>
                <div className="text-xs text-arc-400 font-mono mb-1">STEP {item.step}</div>
                <h3 className="text-white font-semibold mb-1">{item.title}</h3>
                <p className="text-gray-500 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing model */}
      <section className="py-20 border-t border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white text-center mb-4">
            Per-action pricing
          </h2>
          <p className="text-gray-500 text-center mb-16 max-w-lg mx-auto">
            Every agent action has a fixed sub-cent price. Transparent. Deterministic.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="card group hover:border-emerald-500/30 transition-all text-center">
              <div className="text-3xl font-bold text-emerald-400 font-mono mb-2">$0.001</div>
              <h3 className="text-white font-semibold text-lg mb-1">API Lookup</h3>
              <p className="text-gray-500 text-sm">Data retrieval, search, reference queries</p>
            </div>

            <div className="card group hover:border-blue-500/30 transition-all text-center">
              <div className="text-3xl font-bold text-blue-400 font-mono mb-2">$0.002</div>
              <h3 className="text-white font-semibold text-lg mb-1">JSON Transform</h3>
              <p className="text-gray-500 text-sm">Structured data transformation, classification</p>
            </div>

            <div className="card group hover:border-purple-500/30 transition-all text-center">
              <div className="text-3xl font-bold text-purple-400 font-mono mb-2">$0.005</div>
              <h3 className="text-white font-semibold text-lg mb-1">Final Answer</h3>
              <p className="text-gray-500 text-sm">Summarization, reasoning, composite results</p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Arc / Margin explanation */}
      <section className="py-20 border-t border-gray-800/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="card border-arc-500/20 bg-gradient-to-br from-arc-900/30 to-gray-900 text-center py-12">
            <Activity className="w-12 h-12 text-arc-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-3">
              Why this only works on Arc
            </h2>
            <p className="text-gray-400 max-w-lg mx-auto mb-6">
              100 actions at $0.002 each = $0.20 total revenue. On traditional
              chains, gas fees per transaction would exceed the payment itself.
              Arc nanopayments make sub-cent settlement viable.
            </p>
            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto text-center">
              <div>
                <div className="text-xl font-bold text-emerald-400 font-mono">$0.20</div>
                <div className="text-xs text-gray-500">100-action revenue</div>
              </div>
              <div>
                <div className="text-xl font-bold text-red-400 font-mono">$5+</div>
                <div className="text-xs text-gray-500">Traditional gas cost</div>
              </div>
              <div>
                <div className="text-xl font-bold text-arc-400 font-mono">~$0</div>
                <div className="text-xs text-gray-500">Arc settlement cost</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800/50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Activity className="w-4 h-4" />
            <span>VeriPay Loop</span>
          </div>
          <div className="text-gray-600 text-xs">
            Built for Arc Hackathon
          </div>
        </div>
      </footer>
    </div>
  );
}
