import { ethers } from "ethers";
import { config } from "../config";
import { UsageMeterABI, NanoSettlementABI, AgentRegistryABI, ERC20ABI } from "./abis";

let provider: ethers.JsonRpcProvider;
let operatorSigner: ethers.Signer;

export function getProvider(): ethers.JsonRpcProvider {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(config.arcRpcUrl);
  }
  return provider;
}

export function getOperatorWallet(): ethers.Signer {
  if (!operatorSigner) {
    // Plain wallet — queueOperatorTx serializes all txs, so NonceManager is not needed.
    // NonceManager caused nonce desync after failed txs on Arc testnet.
    operatorSigner = new ethers.Wallet(config.operatorPrivateKey, getProvider());
  }
  return operatorSigner;
}

// ── Operator Tx Queue — serializes all operator txs to prevent nonce races ──

let _opTxQueue: Promise<any> = Promise.resolve();

/**
 * Queue a callback that sends operator tx(s). Only one runs at a time.
 * This prevents nonce races on slow testnets (Arc ~10s blocks).
 */
export function queueOperatorTx<T>(fn: () => Promise<T>): Promise<T> {
  const p = _opTxQueue.then(fn, () => fn()); // run even if previous failed
  _opTxQueue = p.catch(() => {}); // swallow to keep queue alive
  return p;
}

export function getUsageMeterContract(signerOrProvider?: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(
    config.contracts.usageMeter,
    UsageMeterABI,
    signerOrProvider || getProvider()
  );
}

export function getNanoSettlementContract(signerOrProvider?: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(
    config.contracts.nanoSettlement,
    NanoSettlementABI,
    signerOrProvider || getProvider()
  );
}

export function getAgentRegistryContract(signerOrProvider?: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(
    config.contracts.agentRegistry,
    AgentRegistryABI,
    signerOrProvider || getProvider()
  );
}

export function getUsdcContract(signerOrProvider?: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(
    config.contracts.usdc,
    ERC20ABI,
    signerOrProvider || getProvider()
  );
}
