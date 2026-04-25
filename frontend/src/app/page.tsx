import Link from "next/link";
import {
  Activity,
  Zap,
  ArrowRight,
  Eye,
  Bot,
  GitBranch,
  Shield,
  Server,
  DollarSign,
  CheckCircle2,
} from "lucide-react";

export default function Home() {
  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-arc-900/20 to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 relative">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-arc-500/10 border border-arc-500/20 rounded-full px-4 py-1.5 mb-8">
              <Zap className="w-4 h-4 text-arc-400" />
              <span className="text-sm text-arc-300 font-medium">
                Built on Arc &middot; Sub-cent settlement
              </span>
            </div>

            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-white mb-6">
              AI agent{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-arc-400 to-arc-600">
                micropayments
              </span>
            </h1>

            <p className="text-lg text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
              VeriPay lets AI agents pay each other per action with USDC on Arc.
              100 offchain actions compress into a single onchain settlement with cryptographic proof.
              Machine-to-machine commerce that only works with nanopayments.
            </p>

            <div className="flex items-center justify-center gap-4">
              <Link href="/observer" className="btn-primary text-base px-8 py-3 flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Watch Live Demo
              </Link>
              <Link href="/proof" className="btn-secondary text-base px-8 py-3 flex items-center gap-2">
                <Shield className="w-4 h-4" />
                See Proof
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* The story — one clear narrative */}
      <section className="py-16 border-t border-gray-800/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white text-center mb-3">
            How it works
          </h2>
          <p className="text-gray-500 text-center mb-12 max-w-xl mx-auto">
            Provider agents sell services. Customer agents buy them. VeriPay settles the payments on Arc.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              {
                step: "01",
                title: "Provider registers",
                desc: "Exposes an endpoint with per-action pricing in USDC",
                icon: Server,
                color: "text-arc-400",
                bg: "bg-arc-500/10",
              },
              {
                step: "02",
                title: "Customer creates session",
                desc: "Deposits a budget and starts calling the provider",
                icon: Bot,
                color: "text-purple-400",
                bg: "bg-purple-500/10",
              },
              {
                step: "03",
                title: "Actions execute offchain",
                desc: "Each action is metered, hashed, and chained into a proof root",
                icon: Zap,
                color: "text-emerald-400",
                bg: "bg-emerald-500/10",
              },
              {
                step: "04",
                title: "Settlement on Arc",
                desc: "One compressed tx settles all actions with proof — provider receives USDC",
                icon: CheckCircle2,
                color: "text-amber-400",
                bg: "bg-amber-500/10",
              },
            ].map((item) => (
              <div key={item.step} className="card text-center group hover:border-gray-700 transition-all">
                <div className={`w-12 h-12 rounded-xl ${item.bg} flex items-center justify-center mx-auto mb-4`}>
                  <item.icon className={`w-6 h-6 ${item.color}`} />
                </div>
                <div className="text-[10px] text-gray-600 font-mono mb-1 uppercase tracking-wider">Step {item.step}</div>
                <h3 className="text-white font-semibold mb-1">{item.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Arc */}
      <section className="py-16 border-t border-gray-800/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="card border-arc-500/20 bg-gradient-to-br from-arc-900/20 to-gray-900">
            <div className="text-center py-8">
              <h2 className="text-2xl font-bold text-white mb-3">
                Why this only works on Arc
              </h2>
              <p className="text-gray-400 max-w-lg mx-auto mb-8">
                100 actions at $0.002 each = $0.20 total revenue.
                On Ethereum, gas alone would cost $5+. Arc makes sub-cent settlement viable.
              </p>
              <div className="grid grid-cols-3 gap-6 max-w-md mx-auto">
                <div>
                  <div className="text-2xl font-bold text-emerald-400 font-mono">$0.20</div>
                  <div className="text-xs text-gray-500 mt-1">Session revenue</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-400 font-mono">$5+</div>
                  <div className="text-xs text-gray-500 mt-1">Ethereum gas</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-arc-400 font-mono">~$0</div>
                  <div className="text-xs text-gray-500 mt-1">Arc gas</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Navigation cards */}
      <section className="py-16 border-t border-gray-800/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { href: "/observer", title: "Live Demo", desc: "Watch agents execute and settle in real time", icon: Eye, color: "text-arc-400" },
              { href: "/agents", title: "Agents", desc: "How providers and customers integrate", icon: Bot, color: "text-purple-400" },
              { href: "/protocol", title: "Protocol", desc: "End-to-end payment and settlement flow", icon: GitBranch, color: "text-emerald-400" },
              { href: "/proof", title: "Proof", desc: "Economic proof that Arc enables this", icon: Shield, color: "text-amber-400" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="card group hover:border-gray-700 transition-all flex flex-col"
              >
                <item.icon className={`w-6 h-6 ${item.color} mb-3`} />
                <h3 className="text-white font-semibold mb-1 group-hover:text-arc-300 transition-colors flex items-center gap-1.5">
                  {item.title}
                  <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </h3>
                <p className="text-gray-500 text-sm">{item.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800/50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Activity className="w-4 h-4" />
            <span>VeriPay</span>
          </div>
          <div className="text-gray-600 text-xs">
            Built for Arc Hackathon
          </div>
        </div>
      </footer>
    </div>
  );
}
