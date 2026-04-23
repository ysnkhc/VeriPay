import { ethers } from "ethers";
import { getProvider, getOperatorWallet, getUsageMeterContract, getNanoSettlementContract, getUsdcContract, queueOperatorTx } from "../contracts/provider";
import { ActionType } from "../types/session";
import { config } from "../config";

// Map backend ActionType string to Solidity enum index
const ACTION_TYPE_INDEX: Record<ActionType, number> = {
  API_LOOKUP: 0,
  JSON_TRANSFORM: 1,
  SUMMARIZE: 2,
  CLASSIFY: 3,
  FINAL_ANSWER: 4,
};

// ── RPC health check ────────────────────────────────────────────────────

let _rpcConnected: boolean | null = null;

export async function checkRpcConnection(): Promise<boolean> {
  if (!config.onchainMode) {
    _rpcConnected = false;
    return false;
  }
  try {
    const { getProvider } = await import("../contracts/provider");
    const provider = getProvider();
    await provider.getBlockNumber();
    _rpcConnected = true;
    return true;
  } catch {
    _rpcConnected = false;
    return false;
  }
}

export function isRpcConnected(): boolean | null {
  return _rpcConnected;
}

export function getMode(): "onchain" | "fallback" {
  return config.onchainMode && _rpcConnected === true ? "onchain" : "fallback";
}

// ── Mock hash generator (fallback only) ─────────────────────────────────

let _fallbackCounter = 0;
function mockTxHash(): string {
  _fallbackCounter++;
  const hex = _fallbackCounter.toString(16).padStart(62, "0");
  return `0x${hex}`;
}

// ── Onchain wrappers (with fallback) ────────────────────────────────────

export async function createSessionOnchain(
  providerAddress: string,
  pricePerAction: number,
  metadataURI: string
): Promise<{ onchainId: number; txHash: string }> {
  if (getMode() === "fallback") {
    const onchainId = Date.now() % 100000;
    console.log(`[settlement][FALLBACK] Session created offchain: ${onchainId}`);
    return { onchainId, txHash: mockTxHash() };
  }

  return queueOperatorTx(async () => {
    try {
      const wallet = getOperatorWallet();
      const meter = getUsageMeterContract(wallet);

      const tx = await meter.createSession(providerAddress, pricePerAction, metadataURI);
      const receipt = await tx.wait();

      // Parse SessionCreated event to get sessionId
      const log = receipt.logs.find((l: any) => {
        try { meter.interface.parseLog(l); return true; } catch { return false; }
      });
      const parsed = log ? meter.interface.parseLog(log) : null;
      const onchainId = parsed ? Number(parsed.args.sessionId) : 0;

      console.log(`[settlement] Session created onchain: ${onchainId} | tx: ${receipt.hash}`);
      return { onchainId, txHash: receipt.hash };
    } catch (err: any) {
      console.warn(`[settlement] Onchain createSession failed, using fallback: ${err.message}`);
      const onchainId = Date.now() % 100000;
      return { onchainId, txHash: mockTxHash() };
    }
  });
}

export async function depositSessionOnchain(
  onchainSessionId: number,
  amount: number
): Promise<string> {
  if (getMode() === "fallback") {
    console.log(`[settlement][FALLBACK] Deposit ${amount} for session ${onchainSessionId}`);
    return mockTxHash();
  }

  // Step 1: Approve USDC spend (separate queue slot for nonce safety)
  await queueOperatorTx(async () => {
    try {
      const wallet = getOperatorWallet();
      const usdc = getUsdcContract(wallet);
      const settlement = getNanoSettlementContract(wallet);
      const approveTx = await usdc.approve(await settlement.getAddress(), amount);
      await approveTx.wait();
      console.log(`[settlement] Approved ${amount} USDC for session ${onchainSessionId}`);
    } catch (err: any) {
      console.warn(`[settlement] USDC approve failed: ${err.message}`);
    }
  });

  // Step 2: Deposit (separate queue slot)
  return queueOperatorTx(async () => {
    try {
      const wallet = getOperatorWallet();
      const settlement = getNanoSettlementContract(wallet);
      const tx = await settlement.depositSession(onchainSessionId, amount);
      const receipt = await tx.wait();
      console.log(`[settlement] Deposited ${amount} for session ${onchainSessionId} | tx: ${receipt.hash}`);
      return receipt.hash;
    } catch (err: any) {
      console.warn(`[settlement] Onchain deposit failed, using fallback: ${err.message}`);
      return mockTxHash();
    }
  });
}

// Track per-session action indices locally to avoid event parsing issues
const _sessionActionCounters: Map<number, number> = new Map();

export async function recordActionOnchain(
  onchainSessionId: number,
  actionType: ActionType,
  units: number,
  actionHash: string
): Promise<{ actionIndex: number; txHash: string }> {
  if (getMode() === "fallback") {
    return { actionIndex: 0, txHash: mockTxHash() };
  }

  return queueOperatorTx(async () => {
    try {
      const wallet = getOperatorWallet();
      const meter = getUsageMeterContract(wallet);

      const typeIndex = ACTION_TYPE_INDEX[actionType] ?? 0;
      const tx = await meter.recordAction(onchainSessionId, typeIndex, units, actionHash);
      const receipt = await tx.wait();

      // Use local counter for action index (event parsing unreliable on some chains)
      const currentIndex = _sessionActionCounters.get(onchainSessionId) ?? 0;
      _sessionActionCounters.set(onchainSessionId, currentIndex + 1);

      console.log(`[settlement] Recorded action ${currentIndex} for session ${onchainSessionId} | tx: ${receipt.hash}`);
      return { actionIndex: currentIndex, txHash: receipt.hash };
    } catch (err: any) {
      console.warn(`[settlement] Onchain recordAction failed, using fallback: ${err.message}`);
      return { actionIndex: 0, txHash: mockTxHash() };
    }
  });
}

export async function settleActionOnchain(
  onchainSessionId: number,
  actionIndex: number
): Promise<string> {
  if (getMode() === "fallback") {
    return mockTxHash();
  }

  return queueOperatorTx(async () => {
    try {
      const wallet = getOperatorWallet();
      const settlement = getNanoSettlementContract(wallet);

      const tx = await settlement.settleAction(onchainSessionId, actionIndex);
      const receipt = await tx.wait();

      return receipt.hash;
    } catch (err: any) {
      console.warn(`[settlement] Onchain settle failed, using fallback: ${err.message}`);
      return mockTxHash();
    }
  });
}

export async function finalizeSessionOnchain(onchainSessionId: number): Promise<string> {
  if (getMode() === "fallback") {
    console.log(`[settlement][FALLBACK] Session ${onchainSessionId} finalized offchain`);
    return mockTxHash();
  }

  return queueOperatorTx(async () => {
    try {
      const wallet = getOperatorWallet();
      const meter = getUsageMeterContract(wallet);

      const tx = await meter.finalizeSession(onchainSessionId);
      const receipt = await tx.wait();

      console.log(`[settlement] Session ${onchainSessionId} finalized | tx: ${receipt.hash}`);
      return receipt.hash;
    } catch (err: any) {
      console.warn(`[settlement] Onchain finalize failed, using fallback: ${err.message}`);
      return mockTxHash();
    }
  });
}

export async function getSessionTotalsOnchain(onchainSessionId: number): Promise<{ totalActions: number; totalAmount: number }> {
  try {
    const meter = getUsageMeterContract();
    const [totalActions, totalAmount] = await meter.getSessionTotals(onchainSessionId);
    return { totalActions: Number(totalActions), totalAmount: Number(totalAmount) };
  } catch {
    return { totalActions: 0, totalAmount: 0 };
  }
}

export async function getDepositOnchain(onchainSessionId: number): Promise<{ deposited: number; spent: number; remaining: number }> {
  try {
    const settlement = getNanoSettlementContract();
    const [deposited, spent, remaining] = await settlement.getDeposit(onchainSessionId);
    return { deposited: Number(deposited), spent: Number(spent), remaining: Number(remaining) };
  } catch {
    return { deposited: 0, spent: 0, remaining: 0 };
  }
}

// ── Customer-wallet-funded operations (agent mode) ──────────────────────

/**
 * Get a signer for a customer agent's wallet.
 * Used in agent mode where the customer — not the operator — funds the session.
 */
export function getCustomerWallet(privateKey: string): ethers.Signer {
  const wallet = new ethers.Wallet(privateKey, getProvider());
  return new ethers.NonceManager(wallet);
}

/**
 * Mint test USDC to an address (Anvil only — mock USDC has a mint function).
 */
export async function mintTestUSDC(toAddress: string, amount: number): Promise<string> {
  if (getMode() === "fallback") {
    console.log(`[settlement][FALLBACK] Mock-minted ${amount} USDC to ${toAddress}`);
    return mockTxHash();
  }

  return queueOperatorTx(async () => {
    try {
      const wallet = getOperatorWallet();
      const usdc = getUsdcContract(wallet);
      const tx = await usdc.mint(toAddress, amount);
      const receipt = await tx.wait();
      console.log(`[settlement] Minted ${amount} USDC to ${toAddress} | tx: ${receipt.hash}`);
      return receipt.hash;
    } catch (err: any) {
      console.warn(`[settlement] Mint failed: ${err.message}`);
      return mockTxHash();
    }
  });
}

/**
 * Send ETH from operator to customer wallet for gas fees (Anvil only).
 * Generated customer wallets start with 0 ETH and can't transact without gas.
 */
export async function fundCustomerETH(toAddress: string, amountEth: string = "0.01"): Promise<string> {
  if (getMode() === "fallback") {
    console.log(`[settlement][FALLBACK] Mock-funded ${amountEth} ETH to ${toAddress}`);
    return mockTxHash();
  }

  return queueOperatorTx(async () => {
    try {
      const wallet = getOperatorWallet();
      const tx = await (wallet as ethers.Signer).sendTransaction({
        to: toAddress,
        value: ethers.parseEther(amountEth),
      });
      const receipt = await tx.wait();
      console.log(`[settlement] Funded ${amountEth} ETH to ${toAddress} | tx: ${receipt!.hash}`);
      return receipt!.hash;
    } catch (err: any) {
      console.warn(`[settlement] ETH funding failed: ${err.message}`);
      return mockTxHash();
    }
  });
}

/**
 * Create a session onchain using the CUSTOMER's wallet (agent mode).
 * The customer becomes the onchain consumer (msg.sender).
 */
export async function createSessionAsCustomer(
  customerPrivateKey: string,
  providerAddress: string,
  pricePerAction: number,
  metadataURI: string
): Promise<{ onchainId: number; txHash: string }> {
  if (getMode() === "fallback") {
    const onchainId = Date.now() % 100000;
    console.log(`[settlement][FALLBACK] Customer session created offchain: ${onchainId}`);
    return { onchainId, txHash: mockTxHash() };
  }

  try {
    const customerWallet = getCustomerWallet(customerPrivateKey);
    const meter = getUsageMeterContract(customerWallet);

    const tx = await meter.createSession(providerAddress, pricePerAction, metadataURI);
    const receipt = await tx.wait();

    const log = receipt.logs.find((l: any) => {
      try { meter.interface.parseLog(l); return true; } catch { return false; }
    });
    const parsed = log ? meter.interface.parseLog(log) : null;
    const onchainId = parsed ? Number(parsed.args.sessionId) : 0;

    console.log(`[settlement] Customer session created onchain: ${onchainId} | tx: ${receipt.hash}`);
    return { onchainId, txHash: receipt.hash };
  } catch (err: any) {
    console.warn(`[settlement] Customer createSession failed, using fallback: ${err.message}`);
    const onchainId = Date.now() % 100000;
    return { onchainId, txHash: mockTxHash() };
  }
}

/**
 * Deposit USDC into a session using the CUSTOMER's wallet (agent mode).
 * Customer must have USDC balance and approves NanoSettlement to spend.
 */
export async function depositAsCustomer(
  customerPrivateKey: string,
  onchainSessionId: number,
  amount: number
): Promise<string> {
  if (getMode() === "fallback") {
    console.log(`[settlement][FALLBACK] Customer deposit ${amount} for session ${onchainSessionId}`);
    return mockTxHash();
  }

  try {
    const customerWallet = getCustomerWallet(customerPrivateKey);
    const usdc = getUsdcContract(customerWallet);
    const settlement = getNanoSettlementContract(customerWallet);

    // Approve USDC transfer
    const approveTx = await usdc.approve(await settlement.getAddress(), amount);
    await approveTx.wait();

    // Deposit
    const tx = await settlement.depositSession(onchainSessionId, amount);
    const receipt = await tx.wait();

    console.log(`[settlement] Customer deposited ${amount} for session ${onchainSessionId} | tx: ${receipt.hash}`);
    return receipt.hash;
  } catch (err: any) {
    console.warn(`[settlement] Customer deposit failed, using fallback: ${err.message}`);
    return mockTxHash();
  }
}

/**
 * Record an action using the CUSTOMER's wallet (agent mode).
 * The UsageMeter contract requires msg.sender == session.consumer.
 */
export async function recordActionAsCustomer(
  customerPrivateKey: string,
  onchainSessionId: number,
  actionType: ActionType,
  units: number,
  actionHash: string
): Promise<{ actionIndex: number; txHash: string }> {
  if (getMode() === "fallback") {
    return { actionIndex: 0, txHash: mockTxHash() };
  }

  try {
    const customerWallet = getCustomerWallet(customerPrivateKey);
    const meter = getUsageMeterContract(customerWallet);

    const typeIndex = ACTION_TYPE_INDEX[actionType] ?? 0;
    const tx = await meter.recordAction(onchainSessionId, typeIndex, units, actionHash);
    const receipt = await tx.wait();

    const log = receipt.logs.find((l: any) => {
      try {
        const p = meter.interface.parseLog(l);
        return p?.name === "ActionRecorded";
      } catch { return false; }
    });
    const parsed = log ? meter.interface.parseLog(log) : null;
    const actionIndex = parsed ? Number(parsed.args.actionIndex) : 0;

    return { actionIndex, txHash: receipt.hash };
  } catch (err: any) {
    console.warn(`[settlement] Customer recordAction failed, using fallback: ${err.message}`);
    return { actionIndex: 0, txHash: mockTxHash() };
  }
}

/**
 * Finalize a session using the CUSTOMER's wallet (agent mode).
 */
export async function finalizeSessionAsCustomer(
  customerPrivateKey: string,
  onchainSessionId: number
): Promise<string> {
  if (getMode() === "fallback") {
    console.log(`[settlement][FALLBACK] Customer session ${onchainSessionId} finalized`);
    return mockTxHash();
  }

  try {
    const customerWallet = getCustomerWallet(customerPrivateKey);
    const meter = getUsageMeterContract(customerWallet);

    const tx = await meter.finalizeSession(onchainSessionId);
    const receipt = await tx.wait();

    console.log(`[settlement] Customer session ${onchainSessionId} finalized | tx: ${receipt.hash}`);
    return receipt.hash;
  } catch (err: any) {
    console.warn(`[settlement] Customer finalize failed, using fallback: ${err.message}`);
    return mockTxHash();
  }
}

