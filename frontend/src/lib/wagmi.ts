import { http, createConfig } from "wagmi";
import { defineChain } from "viem";

// Arc Testnet chain definition
export const arcTestnet = defineChain({
  id: 1868,
  name: "Arc Testnet",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc-testnet.arc.com"],
    },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer-testnet.arc.com" },
  },
  testnet: true,
});

export const config = createConfig({
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
