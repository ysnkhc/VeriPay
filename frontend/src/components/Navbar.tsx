"use client";

import Link from "next/link";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { Activity, Wallet, Zap } from "lucide-react";

export function Navbar() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  return (
    <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-arc-500 to-arc-700 flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold text-white">
                Veri<span className="text-arc-400">Pay</span>
                <span className="text-gray-500 text-sm ml-1">Loop</span>
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-6">
              <Link
                href="/loop"
                className="text-gray-400 hover:text-white transition-colors text-sm font-medium"
              >
                Demo
              </Link>
              <Link
                href="/agents"
                className="text-gray-400 hover:text-white transition-colors text-sm font-medium"
              >
                Agents
              </Link>
              <Link
                href="/protocol"
                className="text-gray-400 hover:text-white transition-colors text-sm font-medium"
              >
                Agent Network
              </Link>
              <Link
                href="/metrics"
                className="text-gray-400 hover:text-white transition-colors text-sm font-medium"
              >
                Metrics
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">
              <Zap className="w-3 h-3" />
              <span>Arc Testnet</span>
            </div>

            {isConnected ? (
              <div className="flex items-center gap-3">
                <div className="text-sm text-gray-400 font-mono bg-gray-800 px-3 py-1.5 rounded-lg">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </div>
                <button
                  onClick={() => disconnect()}
                  className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={() => connect({ connector: injected() })}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                <Wallet className="w-4 h-4" />
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
