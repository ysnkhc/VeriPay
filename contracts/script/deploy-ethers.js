#!/usr/bin/env node
/**
 * Deploy VeriPay contracts to Arc Testnet using ethers.js
 * Handles txpool congestion with retries and gas tuning.
 */
const { ethers } = require(require("path").resolve(__dirname, "..", "..", "backend", "node_modules", "ethers"));
const fs = require("fs");
const path = require("path");

const RPC = "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;
const PK = process.env.PRIVATE_KEY;
if (!PK) {
  console.error("ERROR: Set PRIVATE_KEY env var before running.");
  console.error("  $env:PRIVATE_KEY = '0x...'");
  process.exit(1);
}
const ARC_USDC = "0x3600000000000000000000000000000000000000"; // native Arc USDC

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(PK, provider);

const CONTRACTS_DIR = path.resolve(__dirname, "..");
const BACKEND_DIR = path.resolve(CONTRACTS_DIR, "..", "backend");
const FRONTEND_DIR = path.resolve(CONTRACTS_DIR, "..", "frontend");

// Load compiled artifacts from forge out/
function loadArtifact(contractName, fileName) {
  const artPath = path.join(CONTRACTS_DIR, "out", fileName, `${contractName}.json`);
  const raw = JSON.parse(fs.readFileSync(artPath, "utf-8"));
  return { abi: raw.abi, bytecode: raw.bytecode.object };
}

async function deployContract(name, fileName, constructorArgs = []) {
  const art = loadArtifact(name, fileName);
  const factory = new ethers.ContractFactory(art.abi, art.bytecode, wallet);

  console.log(`  Deploying ${name}...`);
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const feeData = await provider.getFeeData();
      const overrides = {};
      // Bump gas price to get through congested txpool
      if (feeData.maxFeePerGas) {
        overrides.maxFeePerGas = feeData.maxFeePerGas * 2n;
        overrides.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas || 1000000n) * 2n;
      } else if (feeData.gasPrice) {
        overrides.gasPrice = feeData.gasPrice * 2n;
      }

      const contract = await factory.deploy(...constructorArgs, overrides);
      const receipt = await contract.deploymentTransaction().wait(1);
      const addr = await contract.getAddress();
      console.log(`    ✓ ${name}: ${addr}`);
      console.log(`      tx: ${receipt.hash}`);
      console.log(`      explorer: https://testnet.arcscan.app/tx/${receipt.hash}`);
      return { address: addr, txHash: receipt.hash, contract };
    } catch (err) {
      const msg = err.message || "";
      if (msg.includes("txpool is full") || msg.includes("-32003")) {
        console.log(`    ⏳ Attempt ${attempt}/10 — txpool full, waiting ${attempt * 5}s...`);
        await new Promise(r => setTimeout(r, attempt * 5000));
        continue;
      }
      if (msg.includes("nonce") && attempt < 10) {
        console.log(`    ⏳ Attempt ${attempt}/10 — nonce issue, retrying...`);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Failed to deploy ${name} after 10 attempts`);
}

async function sendTx(contract, method, args, label) {
  console.log(`  ${label}...`);
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const feeData = await provider.getFeeData();
      const overrides = {};
      if (feeData.maxFeePerGas) {
        overrides.maxFeePerGas = feeData.maxFeePerGas * 2n;
        overrides.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas || 1000000n) * 2n;
      } else if (feeData.gasPrice) {
        overrides.gasPrice = feeData.gasPrice * 2n;
      }
      const tx = await contract[method](...args, overrides);
      const receipt = await tx.wait(1);
      console.log(`    ✓ ${label} — tx: ${receipt.hash}`);
      return receipt;
    } catch (err) {
      const msg = err.message || "";
      if (msg.includes("txpool is full") || msg.includes("-32003")) {
        console.log(`    ⏳ Attempt ${attempt}/10 — txpool full, waiting ${attempt * 5}s...`);
        await new Promise(r => setTimeout(r, attempt * 5000));
        continue;
      }
      if (msg.includes("nonce") && attempt < 10) {
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Failed: ${label} after 10 attempts`);
}

async function main() {
  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  VeriPay Loop — Arc Testnet Deploy (ethers.js)");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  RPC:      ${RPC}`);
  console.log(`  Chain ID: ${CHAIN_ID}`);
  console.log(`  Deployer: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`  Balance:  ${ethers.formatEther(balance)} native`);

  // Also check USDC balance
  const usdcAbi = ["function balanceOf(address) view returns (uint256)"];
  const arcUsdc = new ethers.Contract(ARC_USDC, usdcAbi, provider);
  const usdcBal = await arcUsdc.balanceOf(wallet.address);
  console.log(`  USDC:     ${ethers.formatUnits(usdcBal, 6)} USDC`);
  console.log("");

  if (balance === 0n) {
    console.error("  ✗ No native balance. Fund wallet first.");
    process.exit(1);
  }

  // 1. Deploy MockUSDC (our own test USDC for app-level payments)
  const usdc = await deployContract("MockUSDC", "MockUSDC.sol");
  console.log("");

  // 2. Deploy UsageMeter
  const meter = await deployContract("UsageMeter", "JobRegistry.sol");
  console.log("");

  // 3. Deploy NanoSettlement
  const settlement = await deployContract("NanoSettlement", "EscrowVault.sol", [usdc.address, meter.address]);
  console.log("");

  // 4. Deploy AgentRegistry
  const registry = await deployContract("AgentRegistry", "EvaluatorRouter.sol");
  console.log("");

  // 5. Wire meter → settlement
  const meterContract = new ethers.Contract(meter.address, ["function setSettlement(address) external"], wallet);
  await sendTx(meterContract, "setSettlement", [settlement.address], "Wire UsageMeter → NanoSettlement");
  console.log("");

  // 6. Mint test USDC to deployer
  const mockUsdc = new ethers.Contract(usdc.address, ["function mint(address,uint256) external"], wallet);
  await sendTx(mockUsdc, "mint", [wallet.address, 10_000_000_000n], "Mint 10,000 MockUSDC to deployer");
  console.log("");

  // 7. Write .env files
  const backendEnv = [
    `PORT=3001`,
    `ARC_RPC_URL=${RPC}`,
    `CHAIN_ID=${CHAIN_ID}`,
    `OPERATOR_PRIVATE_KEY=${PK}`,
    `USAGE_METER_ADDRESS=${meter.address}`,
    `NANO_SETTLEMENT_ADDRESS=${settlement.address}`,
    `AGENT_REGISTRY_ADDRESS=${registry.address}`,
    `USDC_ADDRESS=${usdc.address}`,
  ].join("\n") + "\n";

  fs.writeFileSync(path.join(BACKEND_DIR, ".env"), backendEnv);
  console.log("  ✓ backend/.env written");

  const frontendEnv = [
    `NEXT_PUBLIC_ARC_RPC_URL=${RPC}`,
    `NEXT_PUBLIC_CHAIN_ID=${CHAIN_ID}`,
    `NEXT_PUBLIC_USAGE_METER_ADDRESS=${meter.address}`,
    `NEXT_PUBLIC_NANO_SETTLEMENT_ADDRESS=${settlement.address}`,
    `NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS=${registry.address}`,
    `NEXT_PUBLIC_USDC_ADDRESS=${usdc.address}`,
    `NEXT_PUBLIC_BACKEND_URL=http://localhost:3001`,
  ].join("\n") + "\n";

  fs.writeFileSync(path.join(FRONTEND_DIR, ".env.local"), frontendEnv);
  console.log("  ✓ frontend/.env.local written");
  console.log("");

  // 8. Summary
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
  console.log("    2. GET http://localhost:3001/api/status → mode: onchain");
  console.log("    3. node test/mock-provider.js");
  console.log("    4. node test/e2e-protocol-test.js");
  console.log("═══════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
