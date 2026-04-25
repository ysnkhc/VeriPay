import { createHash, randomUUID } from "crypto";
import { Session, Action, ActionType, ActionStatus, CreateSessionInput } from "../types/session";
import { TxFeedEntry } from "../types/metrics";

// ── In-memory stores ────────────────────────────────────────────────────
const sessions: Map<string, Session> = new Map();
const actions: Map<string, Action[]> = new Map(); // sessionId => Action[]
const txFeed: TxFeedEntry[] = [];

// ── Session CRUD ────────────────────────────────────────────────────────

export function createSession(input: CreateSessionInput, providerAddress: string): Session {
  const id = randomUUID();
  const session: Session = {
    id,
    mode: input.mode || "demo",
    consumerAddress: input.consumerAddress,
    providerAddress,
    providerAgentId: input.providerAgentId,
    status: "pending",
    budget: input.budget,
    maxActions: input.maxActions,
    totalActions: 0,
    settledActions: 0,
    failedActions: 0,
    totalPaid: 0,
    metadataURI: input.metadata,
    createdAt: Date.now(),
  };
  sessions.set(id, session);
  actions.set(id, []);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function getAllSessions(): Session[] {
  return Array.from(sessions.values());
}

export function updateSession(id: string, patch: Partial<Session>): Session | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;
  Object.assign(session, patch);
  return session;
}

// ── Action CRUD ─────────────────────────────────────────────────────────

export function addAction(
  sessionId: string,
  actionType: ActionType,
  units: number,
  unitPrice: number,
  input: string,
  output: string,
  actionHash: string
): Action {
  const sessionActions = actions.get(sessionId) || [];
  const index = sessionActions.length;

  const action: Action = {
    sessionId,
    index,
    actionType,
    units,
    unitPrice,
    totalPrice: unitPrice * units,
    input,
    output,
    actionHash,
    recordedAt: Date.now(),
    status: "recorded",
  };

  sessionActions.push(action);
  actions.set(sessionId, sessionActions);

  // Update session counters
  const session = sessions.get(sessionId);
  if (session) {
    session.totalActions = sessionActions.length;
  }

  return action;
}

export function markActionSettled(sessionId: string, index: number, txHash: string): Action | undefined {
  const sessionActions = actions.get(sessionId);
  if (!sessionActions || !sessionActions[index]) return undefined;

  const action = sessionActions[index];
  action.status = "settled";
  action.settledAt = Date.now();
  action.txHash = txHash;

  // Update session counters
  const session = sessions.get(sessionId);
  if (session) {
    session.settledActions++;
    session.totalPaid += action.totalPrice;
  }

  // Add to tx feed
  txFeed.unshift({
    sessionId,
    actionIndex: index,
    actionType: action.actionType,
    amount: action.totalPrice,
    txHash,
    timestamp: Date.now(),
    providerAgentId: session?.providerAgentId || "",
  });

  // Cap feed at 500 entries
  if (txFeed.length > 500) txFeed.length = 500;

  return action;
}

// ── Failure tracking ────────────────────────────────────────────────────

export function markActionFailed(
  sessionId: string,
  index: number,
  errorMessage: string
): Action | undefined {
  const sessionActions = actions.get(sessionId);
  if (!sessionActions || !sessionActions[index]) return undefined;

  const action = sessionActions[index];
  action.status = "failed";
  action.errorMessage = errorMessage;

  // Update session counters
  const session = sessions.get(sessionId);
  if (session) {
    session.failedActions = (session.failedActions || 0) + 1;
  }

  return action;
}

export function markActionTimeout(
  sessionId: string,
  index: number,
  errorMessage: string
): Action | undefined {
  const sessionActions = actions.get(sessionId);
  if (!sessionActions || !sessionActions[index]) return undefined;

  const action = sessionActions[index];
  action.status = "timeout";
  action.errorMessage = errorMessage;

  const session = sessions.get(sessionId);
  if (session) {
    session.failedActions = (session.failedActions || 0) + 1;
  }

  return action;
}

// ── Atomic index claim (concurrency-safe) ────────────────────────────────

/**
 * Atomically claim the next action index for a session.
 * MUST be called synchronously (before any await) to prevent
 * concurrent requests from claiming the same index.
 */
export function claimNextActionIndex(sessionId: string): number {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  return session.totalActions++;
}

// ── Budget check ────────────────────────────────────────────────────────

export function getRemainingBudget(sessionId: string): number {
  const session = sessions.get(sessionId);
  if (!session) return 0;
  return session.budget - session.totalPaid;
}

export function getSessionActions(sessionId: string): Action[] {
  return actions.get(sessionId) || [];
}

export function getTxFeed(limit: number = 50): TxFeedEntry[] {
  return txFeed.slice(0, limit);
}

export function computeActionHash(sessionId: string, index: number, actionType: string, output: string): string {
  const payload = `${sessionId}:${index}:${actionType}:${output}`;
  return "0x" + createHash("sha256").update(payload).digest("hex");
}
