import {
  GitBranch,
  Server,
  User,
  Zap,
  Hash,
  Shield,
  DollarSign,
  ArrowDown,
  CheckCircle2,
} from "lucide-react";

const steps = [
  {
    num: "01",
    title: "Provider registers",
    desc: "A provider agent registers with VeriPay, declaring its wallet address, HTTP endpoint, supported actions, and per-action pricing in USDC.",
    detail: "POST /api/agents/providers/register",
    icon: Server,
    color: "text-arc-400",
    bg: "bg-arc-500/10",
    border: "border-arc-500/20",
  },
  {
    num: "02",
    title: "Customer creates session",
    desc: "A customer agent registers, then creates a payment session specifying the provider, a USDC budget, and max actions. Budget is deposited onchain from the customer wallet.",
    detail: "POST /api/protocol/sessions/create",
    icon: User,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
  },
  {
    num: "03",
    title: "Actions execute offchain",
    desc: "The customer calls the provider endpoint repeatedly. Each action is metered, priced, and the result is hashed. The 402 payment protocol gates each request \u2014 the customer signs a payment proof before execution.",
    detail: "POST /api/protocol/sessions/:id/action",
    icon: Zap,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
  {
    num: "04",
    title: "Action root generated",
    desc: "Each action hash is chained incrementally using keccak256. After all actions complete, a single proof root represents the entire batch \u2014 a cryptographic commitment covering every action in the session.",
    detail: "keccak256(prevRoot, actionHash)",
    icon: Hash,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  {
    num: "05",
    title: "settleOffchain on Arc",
    desc: "VeriPay calls settleOffchain() on the EscrowVault contract, submitting the action count, total USDC amount, and proof root in a single transaction. 100 actions settle in one tx.",
    detail: "EscrowVault.settleOffchain(sessionId, count, amount, root)",
    icon: Shield,
    color: "text-arc-400",
    bg: "bg-arc-500/10",
    border: "border-arc-500/20",
  },
  {
    num: "06",
    title: "Provider receives USDC",
    desc: "The settlement transfers USDC from the escrow vault to the provider\u2019s wallet. The session is finalized onchain, and any remaining budget is returned to the customer.",
    detail: "USDC.transfer(provider, totalAmount)",
    icon: DollarSign,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
];

export default function ProtocolPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-arc-500/10 flex items-center justify-center">
            <GitBranch className="w-5 h-5 text-arc-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Protocol Flow</h1>
        </div>
        <p className="text-gray-400 max-w-2xl">
          End-to-end payment and settlement flow. From agent registration to compressed onchain settlement with cryptographic proof.
        </p>
      </div>

      {/* Flow steps */}
      <div className="space-y-0">
        {steps.map((step, i) => (
          <div key={step.num}>
            <div className={`card ${step.border} relative`}>
              <div className="flex items-start gap-4">
                {/* Step number + icon */}
                <div className="shrink-0">
                  <div className={`w-12 h-12 rounded-xl ${step.bg} flex items-center justify-center`}>
                    <step.icon className={`w-6 h-6 ${step.color}`} />
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className="text-[10px] text-gray-600 font-mono uppercase tracking-wider">
                      Step {step.num}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {step.title}
                  </h3>
                  <p className="text-gray-400 text-sm leading-relaxed mb-3">
                    {step.desc}
                  </p>
                  <div className="inline-flex items-center gap-1.5 bg-gray-800/60 rounded-lg px-3 py-1.5">
                    <code className="text-[11px] font-mono text-gray-500">
                      {step.detail}
                    </code>
                  </div>
                </div>
              </div>
            </div>

            {/* Connector arrow */}
            {i < steps.length - 1 && (
              <div className="flex justify-center py-1">
                <ArrowDown className="w-4 h-4 text-gray-700" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-10 card border-arc-500/20 bg-gradient-to-br from-arc-900/20 to-gray-900">
        <div className="text-center py-4">
          <CheckCircle2 className="w-8 h-8 text-arc-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-white mb-2">
            Result: Compressed settlement with proof
          </h3>
          <p className="text-gray-400 text-sm max-w-lg mx-auto mb-6">
            100 offchain actions compress into ~4 onchain transactions (create, deposit, settle, finalize).
            The provider receives USDC. The proof root is permanently stored on Arc.
          </p>
          <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
            <div>
              <div className="text-xl font-bold text-white font-mono">100</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Actions</div>
            </div>
            <div>
              <div className="text-xl font-bold text-arc-400 font-mono">4</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Onchain TXs</div>
            </div>
            <div>
              <div className="text-xl font-bold text-emerald-400 font-mono">100:1</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Compression</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
