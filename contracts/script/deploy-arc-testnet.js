#!/usr/bin/env node
/**
 * VeriPay Loop — Arc Testnet Deploy Script
 *
 * Deploys all contracts to Arc Testnet using Foundry (forge create).
 * Then writes backend/.env and frontend/.env.local with deployed addresses.
 *
 * Prerequisites:
 *   - Forge installed (~/.foundry/bin/forge.exe)
 *   - PRIVATE_KEY env var set (deployer wallet with testnet USDC for gas)
 *
 * Usage:
 *   set PRIVATE_KEY=0x...
 *   node script/deploy-arc-testnet.js
 */
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

// ── Config ──────────────────────────────────────────────────────────────
const RPC_URL = "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;
const FORGE = process.env.FORGE_PATH || path.join(process.env.USERPROFILE, ".foundry", "bin", "forge.exe");
const CONTRACTS_DIR = path.resolve(__dirname, "..");
const BACKEND_DIR = path.resolve(CONTRACTS_DIR, "..", "backend");
const FRONTEND_DIR = path.resolve(CONTRACTS_DIR, "..", "frontend");

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error("ERROR: Set PRIVATE_KEY env var before running.");
  console.error("  $env:PRIVATE_KEY = '0x...'");
  process.exit(1);
}

// Derive deployer address
const { ethers } = require(path.join(BACKEND_DIR, "node_modules", "ethers"));
const deployerWallet = new ethers.Wallet(PRIVATE_KEY);
const DEPLOYER = deployerWallet.address;

console.log("");
console.log("═══════════════════════════════════════════════════════");
console.log("  VeriPay Loop — Arc Testnet Deploy");
console.log("═══════════════════════════════════════════════════════");
console.log(`  RPC:      ${RPC_URL}`);
console.log(`  Chain ID: ${CHAIN_ID}`);
console.log(`  Deployer: ${DEPLOYER}`);
console.log("");

// ── Helper: run forge create ────────────────────────────────────────────
function forgeCreate(contractPath, contractName, constructorArgs = []) {
  let cmd = `"${FORGE}" create "${contractPath}:${contractName}" --rpc-url "${RPC_URL}" --private-key "${PRIVATE_KEY}" --broadcast --json`;
  if (constructorArgs.length > 0) {
    cmd += ` --constructor-args ${constructorArgs.join(" ")}`;
  }

  console.log(`  Deploying ${contractName}...`);
  try {
    const output = execSync(cmd, { cwd: CONTRACTS_DIR, encoding: "utf-8", timeout: 120000 });
    // Parse JSON output — forge create --json returns JSON with deployedTo
    const lines = output.trim().split("\n");
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.deployedTo) {
          console.log(`    ✓ ${contractName}: ${parsed.deployedTo} (tx: ${parsed.transactionHash})`);
          return { address: parsed.deployedTo, txHash: parsed.transactionHash };
        }
      } catch {}
    }
    // Fallback: try to find address in non-JSON output
    const addrMatch = output.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/);
    if (addrMatch) {
      console.log(`    ✓ ${contractName}: ${addrMatch[1]}`);
      return { address: addrMatch[1], txHash: "" };
    }
    console.error(`    ✗ Could not parse address from output:`);
    console.error(output.slice(0, 500));
    process.exit(1);
  } catch (err) {
    console.error(`    ✗ Failed to deploy ${contractName}:`);
    console.error(err.stderr?.slice(0, 500) || err.message);
    process.exit(1);
  }
}

// ── Helper: run forge send (call contract function) ─────────────────────
function forgeSend(contractAddress, signature, args = []) {
  let cmd = `"${FORGE}" send "${contractAddress}" "${signature}" ${args.join(" ")} --rpc-url "${RPC_URL}" --private-key "${PRIVATE_KEY}"`;
  try {
    execSync(cmd, { cwd: CONTRACTS_DIR, encoding: "utf-8", timeout: 60000 });
    return true;
  } catch (err) {
    console.error(`    ✗ Failed to call ${signature}:`);
    console.error(err.stderr?.slice(0, 300) || err.message);
    return false;
  }
}

// ── 1. Check balance ────────────────────────────────────────────────────
async function checkBalance() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const balance = await provider.getBalance(DEPLOYER);
  console.log(`  Balance: ${ethers.formatEther(balance)} (native)`);
  if (balance === 0n) {
    console.error("  ✗ Deployer has zero balance. Fund with testnet USDC from Circle Faucet first.");
    console.error(`    Wallet: ${DEPLOYER}`);
    process.exit(1);
  }
  console.log("");
}

// ── 2. Deploy ───────────────────────────────────────────────────────────
async function deploy() {
  await checkBalance();

  // Build first
  console.log("  Building contracts...");
  try {
    execSync(`"${FORGE}" build`, { cwd: CONTRACTS_DIR, encoding: "utf-8", timeout: 120000 });
    console.log("    ✓ Build successful");
    console.log("");
  } catch (err) {
    console.error("    ✗ Build failed:");
    console.error(err.stderr?.slice(0, 500) || err.message);
    process.exit(1);
  }

  // Deploy MockUSDC
  const usdc = forgeCreate("src/mocks/MockUSDC.sol", "MockUSDC");
  console.log("");

  // Deploy UsageMeter
  const meter = forgeCreate("src/JobRegistry.sol", "UsageMeter");
  console.log("");

  // Deploy NanoSettlement (constructor args: usdc address, meter address)
  const settlement = forgeCreate("src/EscrowVault.sol", "NanoSettlement", [usdc.address, meter.address]);
  console.log("");

  // Deploy AgentRegistry
  const registry = forgeCreate("src/EvaluatorRouter.sol", "AgentRegistry");
  console.log("");

  // Wire: meter.setSettlement(settlement)
  console.log("  Wiring UsageMeter → NanoSettlement...");
  const wired = forgeSend(meter.address, "setSettlement(address)", [settlement.address]);
  if (wired) {
    console.log("    ✓ setSettlement called");
  }
  console.log("");

  // Mint test USDC to deployer
  console.log("  Minting 10,000 USDC to deployer...");
  const minted = forgeSend(usdc.address, "mint(address,uint256)", [DEPLOYER, "10000000000"]);
  if (minted) {
    console.log("    ✓ 10,000 USDC minted");
  }
  console.log("");

  // ── 3. Write .env files ───────────────────────────────────────────────
  const backendEnv = [
    `PORT=3001`,
    `ARC_RPC_URL=${RPC_URL}`,
    `CHAIN_ID=${CHAIN_ID}`,
    `OPERATOR_PRIVATE_KEY=${PRIVATE_KEY}`,
    `USAGE_METER_ADDRESS=${meter.address}`,
    `NANO_SETTLEMENT_ADDRESS=${settlement.address}`,
    `AGENT_REGISTRY_ADDRESS=${registry.address}`,
    `USDC_ADDRESS=${usdc.address}`,
  ].join("\n") + "\n";

  const backendEnvPath = path.join(BACKEND_DIR, ".env");
  fs.writeFileSync(backendEnvPath, backendEnv);
  console.log(`  ✓ Written: ${backendEnvPath}`);

  const frontendEnv = [
    `NEXT_PUBLIC_ARC_RPC_URL=${RPC_URL}`,
    `NEXT_PUBLIC_CHAIN_ID=${CHAIN_ID}`,
    `NEXT_PUBLIC_USAGE_METER_ADDRESS=${meter.address}`,
    `NEXT_PUBLIC_NANO_SETTLEMENT_ADDRESS=${settlement.address}`,
    `NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS=${registry.address}`,
    `NEXT_PUBLIC_USDC_ADDRESS=${usdc.address}`,
    `NEXT_PUBLIC_BACKEND_URL=http://localhost:3001`,
  ].join("\n") + "\n";

  const frontendEnvPath = path.join(FRONTEND_DIR, ".env.local");
  fs.writeFileSync(frontendEnvPath, frontendEnv);
  console.log(`  ✓ Written: ${frontendEnvPath}`);
  console.log("");

  // ── 4. Summary ────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════");
  console.log("  ✓ All contracts deployed to Arc Testnet!");
  console.log("");
  console.log("  Addresses:");
  console.log(`    MockUSDC:         ${usdc.address}`);
  console.log(`    UsageMeter:       ${meter.address}`);
  console.log(`    NanoSettlement:   ${settlement.address}`);
  console.log(`    AgentRegistry:    ${registry.address}`);
  console.log("");
  console.log("  Explorer:");
  console.log(`    MockUSDC:         https://testnet.arcscan.app/address/${usdc.address}`);
  console.log(`    UsageMeter:       https://testnet.arcscan.app/address/${meter.address}`);
  console.log(`    NanoSettlement:   https://testnet.arcscan.app/address/${settlement.address}`);
  console.log(`    AgentRegistry:    https://testnet.arcscan.app/address/${registry.address}`);
  console.log("");
  console.log("  Next:");
  console.log("    1. cd backend && npm run dev");
  console.log("    2. GET http://localhost:3001/api/status");
  console.log("    3. Confirm mode: onchain + rpcConnected: true");
  console.log("═══════════════════════════════════════════════════════");
}

deploy().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
