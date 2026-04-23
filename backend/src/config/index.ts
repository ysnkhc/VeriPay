import dotenv from "dotenv";
import { ethers } from "ethers";
dotenv.config();

const operatorKey = process.env.OPERATOR_PRIVATE_KEY || "";

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  arcRpcUrl: process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network",
  chainId: parseInt(process.env.CHAIN_ID || "5042002", 10),
  operatorPrivateKey: operatorKey,
  operatorAddress: operatorKey
    ? (() => { try { return new ethers.Wallet(operatorKey).address; } catch { return ""; } })()
    : "",
  contracts: {
    usageMeter: process.env.USAGE_METER_ADDRESS || "",
    nanoSettlement: process.env.NANO_SETTLEMENT_ADDRESS || "",
    agentRegistry: process.env.AGENT_REGISTRY_ADDRESS || "",
    usdc: process.env.USDC_ADDRESS || "",
  },
  // Operator fee: configurable, default OFF
  operatorFeePercent: parseFloat(process.env.OPERATOR_FEE_PERCENT || "0"),
  // Auto-detected: true only if all contract addresses AND operator key are set
  get onchainMode(): boolean {
    return !!(
      this.operatorPrivateKey &&
      this.contracts.usageMeter &&
      this.contracts.nanoSettlement &&
      this.contracts.usdc
    );
  },
};
