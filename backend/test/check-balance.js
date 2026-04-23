const { ethers } = require("ethers");

const RPC = "https://rpc.testnet.arc.network";
const WALLET = process.env.WALLET_ADDRESS || process.argv[2];
if (!WALLET) {
  console.error("Usage: WALLET_ADDRESS=0x... node test/check-balance.js");
  console.error("  or:  node test/check-balance.js 0x...");
  process.exit(1);
}

// Known Circle testnet USDC/EURC addresses on various chains
const KNOWN_TOKENS = [
  "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",
  "0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4",
  "0x5425890298aed601595a70AB815c96711a31Bc65",
  "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);

  // Native balance
  const raw = await provider.getBalance(WALLET);
  console.log("Wallet:", WALLET);
  console.log("Raw native balance (wei):", raw.toString());
  console.log("Formatted (18 dec):", ethers.formatEther(raw));
  console.log("Formatted (6 dec):", ethers.formatUnits(raw, 6));
  console.log("");

  // Check known ERC-20 tokens
  console.log("Checking known ERC-20 token contracts...");
  for (const addr of KNOWN_TOKENS) {
    try {
      const c = new ethers.Contract(addr, ERC20_ABI, provider);
      const [bal, sym, dec, name] = await Promise.all([
        c.balanceOf(WALLET),
        c.symbol().catch(() => "???"),
        c.decimals().catch(() => 18),
        c.name().catch(() => "Unknown"),
      ]);
      if (bal > 0n) {
        console.log(`  FOUND: ${name} (${sym}) at ${addr}`);
        console.log(`    Balance: ${ethers.formatUnits(bal, dec)} (raw: ${bal.toString()})`);
      }
    } catch (e) {
      // Contract doesn't exist on this chain
    }
  }

  // Also try to get recent transactions to the wallet via provider
  console.log("\nChecking nonce (tx count)...");
  const nonce = await provider.getTransactionCount(WALLET);
  console.log("  Nonce:", nonce);

  console.log("\nDone.");
}

main().catch(console.error);
