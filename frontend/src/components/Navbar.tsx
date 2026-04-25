"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Zap, Eye, Bot, GitBranch, Shield } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();

  const links = [
    { href: "/observer", label: "Live Demo", icon: Eye },
    { href: "/agents", label: "Agents", icon: Bot },
    { href: "/protocol", label: "Protocol", icon: GitBranch },
    { href: "/proof", label: "Proof", icon: Shield },
  ];

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
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-1">
              {links.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                      isActive
                        ? "text-arc-300 bg-arc-500/10"
                        : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                    }`}
                  >
                    <link.icon className="w-3.5 h-3.5" />
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
            <Zap className="w-3 h-3" />
            <span>Arc Testnet</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
