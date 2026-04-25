// Contract addresses — update after deployment
export const CONTRACTS = {
  usageMeter: (process.env.NEXT_PUBLIC_USAGE_METER_ADDRESS || "0x") as `0x${string}`,
  nanoSettlement: (process.env.NEXT_PUBLIC_NANO_SETTLEMENT_ADDRESS || "0x") as `0x${string}`,
  agentRegistry: (process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS || "0x") as `0x${string}`,
  usdc: (process.env.NEXT_PUBLIC_USDC_ADDRESS || "0x") as `0x${string}`,
};

// In production on Vercel, API calls are proxied via rewrites (same origin → /api/*)
// so BACKEND_URL should be empty string. Locally, it points to the dev backend.
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";

// Session status labels
export const SESSION_STATUS = [
  "None",
  "Active",
  "Completed",
  "Cancelled",
] as const;

// Supported action types and their default prices (in USDC, 6 decimals)
export const ACTION_TYPES = {
  API_LOOKUP: { label: "API Lookup", price: 0.001 },
  JSON_TRANSFORM: { label: "JSON Transform", price: 0.002 },
  SUMMARIZE: { label: "Summarize", price: 0.003 },
  CLASSIFY: { label: "Classify", price: 0.002 },
  FINAL_ANSWER: { label: "Final Answer", price: 0.005 },
} as const;

export type ActionType = keyof typeof ACTION_TYPES;

// ERC20 ABI — reused for USDC interactions
export const ERC20ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
] as const;

// ABIs for UsageMeter and NanoSettlement will be added after contract implementation (Phase 2)
