import { createHash } from "crypto";
import { ActionType } from "../types/session";
import { Agent, AgentMode } from "../types/agent";
import { getAgentById } from "./agent.service";
import { getActionPrice } from "./pricing.service";
import {
  getSession,
  updateSession,
  addAction,
  markActionSettled,
  markActionFailed,
  markActionTimeout,
  computeActionHash,
} from "./session.service";
import {
  createSessionOnchain,
  depositSessionOnchain,
  recordActionOnchain,
  settleActionOnchain,
  finalizeSessionOnchain,
  createSessionAsCustomer,
  depositAsCustomer,
  recordActionAsCustomer,
  finalizeSessionAsCustomer,
  settleActionOnchain as settleAction,
  mintTestUSDC,
  fundCustomerETH,
} from "./settlement.service";
import { invokeProvider } from "./provider-invoke.service";

// ── Mock provider output generators ─────────────────────────────────────

function generateMockOutput(mode: AgentMode, actionType: ActionType, index: number): { input: string; output: string } {
  switch (actionType) {
    case "API_LOOKUP":
      return {
        input: `query:data-point-${index}`,
        output: JSON.stringify({ source: `api-${mode}`, key: `result-${index}`, value: Math.random().toFixed(6), ts: Date.now() }),
      };
    case "JSON_TRANSFORM":
      return {
        input: `{"raw": "record-${index}"}`,
        output: JSON.stringify({ transformed: true, id: index, normalized: `val-${(Math.random() * 100).toFixed(2)}` }),
      };
    case "SUMMARIZE":
      return {
        input: `document-chunk-${index} with ${50 + index} words`,
        output: JSON.stringify({ summary: `Brief ${index}: key findings from chunk ${index}`, confidence: 0.92 + Math.random() * 0.07 }),
      };
    case "CLASSIFY":
      const categories = ["positive", "negative", "neutral", "urgent"];
      return {
        input: `sample-${index}`,
        output: JSON.stringify({ label: categories[index % categories.length], score: 0.85 + Math.random() * 0.14 }),
      };
    case "FINAL_ANSWER":
      return {
        input: `compile-session-results`,
        output: JSON.stringify({ final: true, actionCount: index, compiledAt: Date.now() }),
      };
  }
}

// ── Action sequence builder ─────────────────────────────────────────────

function buildActionSequence(agent: Agent, count: number): ActionType[] {
  const supported = agent.supportedActions;
  // Primary action is the first non-FINAL_ANSWER type
  const primary = supported.find((a) => a !== "FINAL_ANSWER") || "API_LOOKUP";
  const sequence: ActionType[] = [];

  for (let i = 0; i < count; i++) {
    if (i === count - 1) {
      // Last action is always FINAL_ANSWER if supported
      sequence.push(supported.includes("FINAL_ANSWER") ? "FINAL_ANSWER" : primary);
    } else if (i % 5 === 4 && supported.length > 2) {
      // Every 5th action, use the secondary type for variety
      const secondary = supported.find((a) => a !== primary && a !== "FINAL_ANSWER") || primary;
      sequence.push(secondary);
    } else {
      sequence.push(primary);
    }
  }
  return sequence;
}

// ── Delay helper ────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main loop engine ────────────────────────────────────────────────────

export interface LoopResult {
  sessionId: string;
  onchainId: number;
  totalActions: number;
  totalPaid: number;
  settledActions: number;
  durationMs: number;
  actions: Array<{
    index: number;
    actionType: ActionType;
    price: number;
    recordTxHash: string;
    settleTxHash: string;
  }>;
}

export async function runLoop(
  sessionId: string,
  actionCount: number,
  delayMs: number = 50
): Promise<LoopResult> {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status !== "pending" && session.status !== "active") {
    throw new Error(`Session status is ${session.status}, cannot start loop`);
  }

  const agent = getAgentById(session.providerAgentId);
  if (!agent) throw new Error("Provider agent not found");

  const effectiveCount = Math.min(actionCount, session.maxActions);
  const startTime = Date.now();
  const actionResults: LoopResult["actions"] = [];

  // 1. Create session onchain (if not already)
  if (!session.onchainId) {
    // Use the primary action price for the onchain session
    const primaryType = agent.supportedActions.find((a) => a !== "FINAL_ANSWER") || "API_LOOKUP";
    const pricePerAction = getActionPrice(agent.id, primaryType);

    const { onchainId } = await createSessionOnchain(
      agent.walletAddress,
      pricePerAction,
      session.metadataURI || `session://${sessionId}`
    );
    updateSession(sessionId, { onchainId, status: "active" });
    session.onchainId = onchainId;
  }

  // 2. Deposit budget
  await depositSessionOnchain(session.onchainId!, session.budget);
  updateSession(sessionId, { status: "running" });

  // 3. Build action sequence
  const actionSequence = buildActionSequence(agent, effectiveCount);

  // 4. Execute each action: record → settle (individual tx per action)
  for (let i = 0; i < actionSequence.length; i++) {
    const actionType = actionSequence[i];
    const price = getActionPrice(agent.id, actionType);
    const { input, output } = generateMockOutput(agent.mode, actionType, i);
    const hash = computeActionHash(sessionId, i, actionType, output);

    // Record locally
    addAction(sessionId, actionType, 1, price, input, output, hash);

    // Record onchain
    const { actionIndex, txHash: recordTx } = await recordActionOnchain(
      session.onchainId!,
      actionType,
      1,
      hash
    );

    // Settle onchain (individual tx — the demo showcase)
    const settleTx = await settleActionOnchain(session.onchainId!, actionIndex);

    // Mark settled locally
    markActionSettled(sessionId, i, settleTx);

    actionResults.push({
      index: i,
      actionType,
      price,
      recordTxHash: recordTx,
      settleTxHash: settleTx,
    });

    // Brief delay for demo readability
    if (delayMs > 0 && i < actionSequence.length - 1) {
      await sleep(delayMs);
    }
  }

  // 5. Finalize onchain
  await finalizeSessionOnchain(session.onchainId!);
  updateSession(sessionId, {
    status: "completed",
    finalizedAt: Date.now(),
  });

  const durationMs = Date.now() - startTime;
  const finalSession = getSession(sessionId)!;

  return {
    sessionId,
    onchainId: session.onchainId!,
    totalActions: finalSession.totalActions,
    totalPaid: finalSession.totalPaid,
    settledActions: finalSession.settledActions,
    durationMs,
    actions: actionResults,
  };
}

// ── Single action (manual trigger) ──────────────────────────────────────

export async function runSingleAction(
  sessionId: string,
  actionType?: ActionType
): Promise<{ index: number; actionType: ActionType; price: number; recordTxHash: string; settleTxHash: string }> {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status !== "active" && session.status !== "running") {
    throw new Error(`Session status is ${session.status}, cannot record action`);
  }

  const agent = getAgentById(session.providerAgentId);
  if (!agent) throw new Error("Provider agent not found");

  const type = actionType || agent.supportedActions[0] || "API_LOOKUP";
  const price = getActionPrice(agent.id, type);
  const index = session.totalActions;
  const { input, output } = generateMockOutput(agent.mode, type, index);
  const hash = computeActionHash(sessionId, index, type, output);

  // Record locally
  addAction(sessionId, type, 1, price, input, output, hash);

  // Record onchain
  const { actionIndex, txHash: recordTx } = await recordActionOnchain(
    session.onchainId!,
    type,
    1,
    hash
  );

  // Settle onchain
  const settleTx = await settleActionOnchain(session.onchainId!, actionIndex);

  // Mark settled
  markActionSettled(sessionId, index, settleTx);

  return { index, actionType: type, price, recordTxHash: recordTx, settleTxHash: settleTx };
}

// ── Agent-mode session setup ────────────────────────────────────────────

/**
 * Initialize a session onchain using the OPERATOR as settlement intermediary.
 * - Operator creates session onchain (operator = onchain consumer)
 * - Operator deposits budget into session
 * Customer auth is enforced at the API layer (wallet signatures / bearer tokens).
 */
export async function initAgentSession(
  sessionId: string,
  customerPrivateKey: string
): Promise<void> {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.mode !== "agent") throw new Error("Not an agent-mode session");

  const agent = getAgentById(session.providerAgentId);
  if (!agent) throw new Error("Provider agent not found");

  // Get primary action price for onchain session
  const primaryType = agent.supportedActions.find((a) => a !== "FINAL_ANSWER") || "API_LOOKUP";
  const pricePerAction = getActionPrice(agent.id, primaryType);

  // Use operator wallet for all onchain ops (settlement intermediary model)
  const { onchainId } = await createSessionOnchain(
    agent.walletAddress,
    pricePerAction,
    session.metadataURI || `session://${sessionId}`
  );
  updateSession(sessionId, { onchainId, status: "active" });
  session.onchainId = onchainId;

  // Deposit budget into session (operator has MockUSDC from deploy)
  await depositSessionOnchain(onchainId, session.budget);
  updateSession(sessionId, { status: "running" });

  console.log(`[agent-loop] Session ${sessionId} initialized — budget=${session.budget}, onchainId=${onchainId}`);
}

// ── Agent-mode single action execution ──────────────────────────────────

export interface AgentActionResult {
  index: number;
  actionType: ActionType;
  price: number;
  input: string;
  output: string;
  recordTxHash: string;
  settleTxHash: string;
  executionStatus: "success" | "failed" | "timeout";
  executionMs?: number;
  retryCount?: number;
  errorMessage?: string;
}

/**
 * Execute a single action in agent mode:
 * 1. Call provider endpoint (real HTTP) or generate mock output (seed agents)
 * 2. On success: record action onchain + settle (pays provider)
 * 3. On failure/timeout: record action as failed, NO settlement
 */
export async function runAgentAction(
  sessionId: string,
  customerPrivateKey: string,
  actionType: ActionType,
  input: string
): Promise<AgentActionResult> {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.mode !== "agent") throw new Error("Not an agent-mode session");
  if (session.status !== "active" && session.status !== "running") {
    throw new Error(`Session status is ${session.status}, cannot execute action`);
  }

  const agent = getAgentById(session.providerAgentId);
  if (!agent) throw new Error("Provider agent not found");

  const price = getActionPrice(agent.id, actionType);
  const index = session.totalActions;

  // 1. Get output — real endpoint or mock
  let output: string;
  let executionStatus: "success" | "failed" | "timeout" = "success";
  let executionMs: number | undefined;
  let retryCount: number | undefined;
  let errorMessage: string | undefined;

  if (agent.source === "registered" && !agent.endpoint.startsWith("mock://")) {
    // Real provider invocation — handles retries and timeouts internally
    const response = await invokeProvider(agent.endpoint, {
      sessionId,
      actionType,
      actionIndex: index,
      input,
      customerWallet: session.consumerAddress,
    });

    output = response.output;
    executionMs = response.executionMs;
    retryCount = response.retries;

    if (response.status === "error") {
      executionStatus = response.errorMessage?.includes("timeout") ? "timeout" : "failed";
      errorMessage = response.errorMessage;
      output = ""; // no output on failure
    }
  } else {
    // Fallback to mock for seed agents
    const mock = generateMockOutput(agent.mode, actionType, index);
    input = mock.input;
    output = mock.output;
  }

  const hash = computeActionHash(sessionId, index, actionType, output || "FAILED");

  // 2. Record locally
  addAction(sessionId, actionType, 1, price, input, output || "", hash);

  // 3. Handle based on execution result
  if (executionStatus !== "success") {
    // Failed/timeout → record but do NOT settle (no payment on failure)
    if (executionStatus === "timeout") {
      markActionTimeout(sessionId, index, errorMessage || "Provider timeout");
    } else {
      markActionFailed(sessionId, index, errorMessage || "Provider execution failed");
    }

    console.warn(
      `[agent-loop] Action ${index} FAILED in session ${sessionId}: ${errorMessage}`
    );

    return {
      index,
      actionType,
      price,
      input,
      output: "",
      recordTxHash: "",
      settleTxHash: "",
      executionStatus,
      executionMs,
      retryCount,
      errorMessage,
    };
  }

  // 4. Success — record onchain using operator (settlement intermediary)
  const { actionIndex, txHash: recordTx } = await recordActionOnchain(
    session.onchainId!,
    actionType,
    1,
    hash
  );

  // 5. Settle onchain (operator settles — pays provider from deposited funds)
  const settleTx = await settleActionOnchain(session.onchainId!, actionIndex);

  // 6. Mark settled locally
  markActionSettled(sessionId, index, settleTx);

  return {
    index,
    actionType,
    price,
    input,
    output,
    recordTxHash: recordTx,
    settleTxHash: settleTx,
    executionStatus: "success",
    executionMs,
    retryCount,
  };
}

/**
 * Finalize an agent-mode session using the customer's wallet.
 */
export async function finalizeAgentSession(
  sessionId: string,
  customerPrivateKey: string
): Promise<void> {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.mode !== "agent") throw new Error("Not an agent-mode session");
  if (!session.onchainId) throw new Error("Session has no onchain ID");

  await finalizeSessionOnchain(session.onchainId);
  updateSession(sessionId, { status: "completed", finalizedAt: Date.now() });

  console.log(
    `[agent-loop] Session ${sessionId} finalized — ${session.settledActions} settled, ${session.failedActions || 0} failed`
  );
}

