import { ActionType } from "../types/session";

// ── Provider endpoint contract ──────────────────────────────────────────
// External provider agents must implement:
//   POST <endpoint>
//   Content-Type: application/json
//   Body: ProviderRequest
//   Response 200: ProviderResponse

export interface ProviderRequest {
  sessionId: string;
  actionType: ActionType;
  actionIndex: number;
  input: string;
  customerWallet: string;
}

export interface ProviderResponse {
  output: string;
  status: "success" | "error";
  metadata?: Record<string, unknown>;
  errorMessage?: string;
}

const PROVIDER_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Invoke a provider agent's endpoint with retry and timeout handling.
 * Returns structured result including execution status.
 *
 * On failure after retries:
 *   - throws with descriptive error
 *   - caller decides whether to record as failed action
 */
export async function invokeProvider(
  endpoint: string,
  request: ProviderRequest
): Promise<ProviderResponse & { executionMs: number; retries: number }> {
  // Mock endpoints don't do real HTTP calls
  if (endpoint.startsWith("mock://")) {
    throw new Error(`Cannot invoke mock endpoint: ${endpoint}`);
  }

  let lastError: Error | null = null;
  let retries = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      retries++;
      console.log(`[provider-invoke] Retry ${attempt}/${MAX_RETRIES} for ${endpoint}`);
      await sleep(RETRY_DELAY_MS);
    }

    const startMs = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      const executionMs = Date.now() - startMs;

      if (!res.ok) {
        const body = await res.text().catch(() => "");

        // 5xx = server error, retry
        if (res.status >= 500 && attempt < MAX_RETRIES) {
          lastError = new Error(`Provider returned ${res.status}: ${body.slice(0, 200)}`);
          continue;
        }

        // 4xx or final 5xx = permanent failure
        return {
          output: "",
          status: "error",
          errorMessage: `Provider returned ${res.status}: ${body.slice(0, 200)}`,
          executionMs,
          retries,
        };
      }

      const data = (await res.json()) as {
        output?: string;
        status?: string;
        metadata?: Record<string, unknown>;
        errorMessage?: string;
      };

      if (typeof data.output !== "string") {
        return {
          output: "",
          status: "error",
          errorMessage: "Provider response missing 'output' string field",
          executionMs,
          retries,
        };
      }

      return {
        output: data.output,
        status: (data.status as "success" | "error") || "success",
        metadata: data.metadata,
        errorMessage: data.errorMessage,
        executionMs,
        retries,
      };
    } catch (err: any) {
      const executionMs = Date.now() - startMs;

      if (err.name === "AbortError") {
        console.warn(
          `[provider-invoke] Timeout after ${PROVIDER_TIMEOUT_MS}ms calling ${endpoint} (attempt ${attempt + 1})`
        );
        lastError = new Error(`Provider timeout after ${PROVIDER_TIMEOUT_MS / 1000}s`);

        // Timeout on last attempt → return timeout result
        if (attempt >= MAX_RETRIES) {
          return {
            output: "",
            status: "error",
            errorMessage: `Provider timeout after ${PROVIDER_TIMEOUT_MS / 1000}s (${MAX_RETRIES + 1} attempts)`,
            executionMs,
            retries,
          };
        }
        continue;
      }

      // Network error
      if (attempt >= MAX_RETRIES) {
        return {
          output: "",
          status: "error",
          errorMessage: `Provider unreachable: ${err.message}`,
          executionMs,
          retries,
        };
      }

      lastError = err;
    } finally {
      clearTimeout(timeout);
    }
  }

  // Should not reach here, but safety net
  return {
    output: "",
    status: "error",
    errorMessage: lastError?.message || "Unknown provider error",
    executionMs: 0,
    retries,
  };
}
