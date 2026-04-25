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

// ── Offchain Metering + Hash Chain ───────────────────────────────────────

export interface PendingAction {
  actionIndex: number;
  actionType: ActionType;
  units: number;
  amount: number;
  actionHash: string;
  provider: string;
  customer: string;
  sessionId: number;
  timestamp: number;
  inputHash: string;
  outputHash: string;
}

// In-memory queue: onchainSessionId → PendingAction[]
const _pendingActions: Map<number, PendingAction[]> = new Map();

// Structured action root per session: Merkle-style incremental root
// Each leaf = keccak256(sessionId, actionIndex, customer, provider, price, timestamp, inputHash, outputHash)
// Root = keccak256(prevRoot ‖ leaf)
const _actionRoots: Map<number, string> = new Map();
const _actionRootMeta: Map<number, { firstActionIndex: number; lastActionIndex: number; actionCount: number; totalAmount: number }> = new Map();

// Track batch results: onchainSessionId → BatchResult[]
export interface BatchResult {
  batchIndex: number;
  actionCount: number;
  totalAmount: number;
  settleTxHash: string;
  proofRoot: string;
  settledAt: number;
  status: "PENDING_CONFIRMATION" | "CONFIRMED" | "FAILED";
}
const _batchResults: Map<number, BatchResult[]> = new Map();

// Per-session batch queue — ensures batches for same session settle sequentially
const _sessionBatchQueue: Map<number, Promise<any>> = new Map();

// Inflight batch promises per session — used by awaitPendingBatches
const _inflightBatches: Map<number, Set<Promise<any>>> = new Map();

// Track total onchain txs for demo metrics
let _totalOnchainTxs = 0;
export function getTotalOnchainTxCount(): number { return _totalOnchainTxs; }
export function incrementTxCount(): void { _totalOnchainTxs++; }

/**
 * Compute structured action leaf and extend Merkle-style action root.
 *
 * leaf = keccak256(sessionId, actionIndex, customer, provider, price, timestamp, inputHash, outputHash)
 * root[0] = keccak256(0x00..00 ‖ leaf0)
 * root[n] = keccak256(root[n-1] ‖ leafN)
 */
function computeActionLeaf(action: PendingAction): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "uint256", "address", "address", "uint256", "uint256", "bytes32", "bytes32"],
      [
        action.sessionId,
        action.actionIndex,
        action.customer,
        action.provider,
        action.amount,
        action.timestamp,
        action.inputHash,
        action.outputHash,
      ]
    )
  );
}

function extendActionRoot(onchainSessionId: number, action: PendingAction): string {
  const prev = _actionRoots.get(onchainSessionId) || ethers.ZeroHash;
  const leaf = computeActionLeaf(action);
  const next = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "bytes32"], [prev, leaf])
  );
  _actionRoots.set(onchainSessionId, next);

  // Update metadata
  const meta = _actionRootMeta.get(onchainSessionId) || {
    firstActionIndex: action.actionIndex,
    lastActionIndex: action.actionIndex,
    actionCount: 0,
    totalAmount: 0,
  };
  meta.lastActionIndex = action.actionIndex;
  meta.actionCount++;
  meta.totalAmount += action.amount;
  _actionRootMeta.set(onchainSessionId, meta);

  return next;
}

export function getActionRoot(onchainSessionId: number): string {
  return _actionRoots.get(onchainSessionId) || ethers.ZeroHash;
}

export function getActionRootMeta(onchainSessionId: number) {
  return _actionRootMeta.get(onchainSessionId) || { firstActionIndex: 0, lastActionIndex: 0, actionCount: 0, totalAmount: 0 };
}

/** @deprecated alias kept for backward compat */
export function getProofRoot(onchainSessionId: number): string {
  return getActionRoot(onchainSessionId);
}

export function addPendingAction(onchainSessionId: number, action: PendingAction): number {
  if (!_pendingActions.has(onchainSessionId)) {
    _pendingActions.set(onchainSessionId, []);
  }
  _pendingActions.get(onchainSessionId)!.push(action);

  // Extend Merkle-style action root — action is now cryptographically committed
  extendActionRoot(onchainSessionId, action);

  return _pendingActions.get(onchainSessionId)!.length;
}

export function getPendingCount(onchainSessionId: number): number {
  return _pendingActions.get(onchainSessionId)?.length ?? 0;
}

export function getPendingAmount(onchainSessionId: number): number {
  const pending = _pendingActions.get(onchainSessionId);
  if (!pending) return 0;
  return pending.reduce((sum, a) => sum + a.amount, 0);
}

export function getBatchResults(onchainSessionId: number): BatchResult[] {
  return _batchResults.get(onchainSessionId) ?? [];
}

// ── Settlement checkpoint thresholds ──────────────────────────────────────
const CHECKPOINT_ACTION_THRESHOLD = 100;       // settle when >= 100 pending actions
const CHECKPOINT_AMOUNT_THRESHOLD = 100_000;   // settle when >= 0.10 USDC pending

/**
 * Check whether a checkpoint settlement should fire.
 * Triggers when pending actions >= 100 OR pendingAmount >= 0.10 USDC.
 * For demo100, the threshold is exactly 100 so it fires at finalize or on the 100th action.
 */
export function shouldTriggerBatch(onchainSessionId: number): boolean {
  const count = getPendingCount(onchainSessionId);
  if (count >= CHECKPOINT_ACTION_THRESHOLD) return true;
  const amount = getPendingAmount(onchainSessionId);
  if (amount >= CHECKPOINT_AMOUNT_THRESHOLD) return true;
  return false;
}

// ── Background Flush (safety net only) ───────────────────────────────────

let _flushStarted = false;

export function startBackgroundFlush(): void {
  if (_flushStarted) return;
  _flushStarted = true;

  console.log(`[batch] Offchain metering active — settle at finalize only (zero per-action txs)`);
}

// ── Non-blocking Batch Settlement ────────────────────────────────────────

/**
 * Trigger batch settlement in background. DOES NOT BLOCK.
 * Returns immediately. Settlement runs asynchronously.
 */
export function triggerBatchSettlement(
  onchainSessionId: number,
  localSessionId?: string
): void {
  const pending = _pendingActions.get(onchainSessionId);
  if (!pending || pending.length === 0) return;

  // Drain the queue atomically
  const batch = pending.splice(0);

  // Chain onto per-session queue (ensures batches settle in order)
  const current = _sessionBatchQueue.get(onchainSessionId) || Promise.resolve();
  const batchPromise = current.then(
    () => _doSettleOffchain(onchainSessionId, batch),
    () => _doSettleOffchain(onchainSessionId, batch)
  );
  _sessionBatchQueue.set(onchainSessionId, batchPromise.catch(() => {}));

  // Track inflight for awaitPendingBatches
  if (!_inflightBatches.has(onchainSessionId)) {
    _inflightBatches.set(onchainSessionId, new Set());
  }
  const tracked = batchPromise.finally(() => {
    _inflightBatches.get(onchainSessionId)?.delete(tracked);
  });
  _inflightBatches.get(onchainSessionId)!.add(tracked);
}

/**
 * Wait for ALL inflight batches to complete (used before finalization).
 * Flushes any remaining pending actions first.
 */
export async function awaitPendingBatches(onchainSessionId: number): Promise<void> {
  // Flush remaining pending actions as final batch
  const remaining = _pendingActions.get(onchainSessionId);
  if (remaining && remaining.length > 0) {
    triggerBatchSettlement(onchainSessionId);
  }

  // Wait for all inflight batches to finish
  const inflight = _inflightBatches.get(onchainSessionId);
  if (inflight && inflight.size > 0) {
    console.log(`[batch] Waiting for ${inflight.size} inflight batch(es) to complete…`);
    await Promise.all([...inflight]);
  }
}

/**
 * Offchain batch settlement:
 * 1. Compute proof root from hash chain (ZERO onchain writes for actions)
 * 2. Submit SINGLE settleOffchain tx (1 USDC transfer for entire batch)
 * 3. Wait for confirmation
 */
async function _doSettleOffchain(
  onchainSessionId: number,
  batch: PendingAction[]
): Promise<BatchResult> {
  const count = batch.length;
  const batchIndex = _batchResults.get(onchainSessionId)?.length ?? 0;
  const totalAmount = batch.reduce((sum, a) => sum + a.amount, 0);
  const proofRoot = getActionRoot(onchainSessionId);

  console.log(
    `[batch] Offchain #${batchIndex}: ${count} actions, ${totalAmount} μUSDC, session ${onchainSessionId}, proof: ${proofRoot.slice(0, 18)}…`
  );

  // Submit SINGLE settleOffchain tx — the only onchain write for this batch
  let settleTxHash: string;
  try {
    settleTxHash = await _fireSettleOffchain(onchainSessionId, count, totalAmount, proofRoot);
  } catch (err: any) {
    console.warn(`[batch] settleOffchain submit failed: ${err.message}`);
    settleTxHash = mockTxHash();
  }

  // _fireSettleOffchain already does tx.wait() — no second wait needed.
  // If we got a real hash, the tx is already confirmed.
  const isFallback = settleTxHash.startsWith("0x000000");
  const status: BatchResult["status"] = isFallback ? "PENDING_CONFIRMATION" : "CONFIRMED";

  const result: BatchResult = {
    batchIndex,
    actionCount: count,
    totalAmount,
    settleTxHash,
    proofRoot,
    settledAt: Date.now(),
    status,
  };

  if (!_batchResults.has(onchainSessionId)) {
    _batchResults.set(onchainSessionId, []);
  }
  _batchResults.get(onchainSessionId)!.push(result);

  console.log(
    `[batch] ✅ Batch #${batchIndex} ${status}: ${count} actions, ${totalAmount} μUSDC | 1 tx: ${settleTxHash.slice(0, 20)}… | proof: ${proofRoot.slice(0, 18)}…`
  );

  return result;
}

// ── Single tx helper ─────────────────────────────────────────────────────

/**
 * Submit settleOffchain tx — SINGLE onchain write for the entire batch.
 * No per-action recording. Hash chain proof stored via event log.
 */
async function _fireSettleOffchain(
  onchainSessionId: number,
  actionCount: number,
  totalAmount: number,
  proofRoot: string
): Promise<string> {
  if (getMode() === "fallback") return mockTxHash();

  return queueOperatorTx(async () => {
    const wallet = getOperatorWallet();
    const settlement = getNanoSettlementContract(wallet);

    const tx = await settlement.settleOffchain(onchainSessionId, actionCount, totalAmount, proofRoot);
    const receipt = await tx.wait();

    _totalOnchainTxs++;
    console.log(
      `[settlement] settleOffchain(${onchainSessionId}, ${actionCount} actions, ${totalAmount}μ) confirmed | tx: ${receipt.hash.slice(0, 20)}…`
    );
    return receipt.hash;
  });
}

// ── Legacy wrappers (kept for demo runLoop backward compat) ──────────────

export async function recordActionOnchain(
  onchainSessionId: number,
  actionType: ActionType,
  units: number,
  actionHash: string
): Promise<{ actionIndex: number; txHash: string }> {
  // In offchain metering mode, recordAction is a NO-OP
  // Actions are stored in memory only + hash chain
  return { actionIndex: 0, txHash: "OFFCHAIN_RECORDED" };
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

