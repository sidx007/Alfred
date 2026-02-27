/**
 * Direct Appwrite REST API calls using the API key,
 * matching exactly how the Python exec.py files invoke functions.
 *
 * Uses **synchronous** execution so the response body is returned
 * inline. Appwrite Cloud does NOT persist responseBody for async
 * executions, which caused empty-body errors.
 */

const ENDPOINT =
  process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT ??
  "https://sgp.cloud.appwrite.io/v1";
const PROJECT_ID = process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID ?? "";
const API_KEY = process.env.EXPO_PUBLIC_APPWRITE_API_KEY ?? "";

/** Max time to wait for a synchronous execution (ms) — 5 minutes */
const SYNC_TIMEOUT_MS = 5 * 60 * 1_000;

// ── Helpers ─────────────────────────────────────────────────────────

function _headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Appwrite-Project": PROJECT_ID,
    "X-Appwrite-Key": API_KEY,
  };
}

/**
 * Invoke an Appwrite function by ID, sending a JSON body.
 * Uses **synchronous execution** — the HTTP call blocks until the
 * function finishes and the full response (including body) is returned.
 */
export async function invokeFunction<T = Record<string, unknown>>(
  functionId: string,
  body: Record<string, unknown>,
): Promise<T> {
  const bodyStr = JSON.stringify(body);
  const url = `${ENDPOINT}/functions/${functionId}/executions`;

  console.log(
    `[Appwrite] POST ${url} (sync) | body size: ${bodyStr.length} chars`,
  );

  // ── 1. Create synchronous execution ────────────────────────────
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: _headers(),
      body: JSON.stringify({
        body: bodyStr,
        async: false,
        method: "POST",
      }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Function ${functionId} timed out after ${SYNC_TIMEOUT_MS / 1000}s`,
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Appwrite] fetch THREW for ${functionId}:`, msg, err);
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const responseText = await response.text();
  console.log(
    `[Appwrite] HTTP ${response.status} | response length: ${responseText.length}`,
  );

  if (!response.ok) {
    console.error(
      `[Appwrite] HTTP ${response.status} error:`,
      responseText.slice(0, 1000),
    );
    throw new Error(
      `Appwrite HTTP ${response.status}: ${responseText.slice(0, 500)}`,
    );
  }

  let execution: Record<string, unknown>;
  try {
    execution = JSON.parse(responseText);
  } catch {
    console.error(`[Appwrite] Non-JSON response:`, responseText.slice(0, 500));
    throw new Error(
      `Appwrite returned non-JSON: ${responseText.slice(0, 200)}`,
    );
  }

  const executionId = execution.$id as string;
  const status = execution.status as string;
  console.log(
    `[Appwrite] Execution — id: ${executionId}, status: ${status}`,
  );

  // ── 2. Parse result ────────────────────────────────────────────
  // Appwrite uses different field names across versions:
  //   responseBody (v1.5+), response (v1.4-), body, output
  const responseBody =
    ((execution.responseBody ??
      execution.response ??
      execution.body ??
      execution.output) as string) ?? "";
  const statusCode = (execution.responseStatusCode ?? execution.statusCode) as
    | number
    | undefined;

  console.log(
    `[Appwrite] Execution — statusCode: ${statusCode}, responseBody length: ${responseBody.length}`,
  );

  if (status !== "completed") {
    console.error(
      `[Appwrite] Execution NOT completed:`,
      JSON.stringify(execution, null, 2).slice(0, 2000),
    );
    throw new Error(
      `Function ${functionId} execution failed: status=${status}`,
    );
  }

  if (statusCode && statusCode >= 400) {
    console.error(
      `[Appwrite] Function HTTP error ${statusCode}:`,
      responseBody,
    );
    throw new Error(
      `Function ${functionId} HTTP ${statusCode}: ${responseBody}`,
    );
  }

  if (!responseBody) {
    console.error(
      `[Appwrite] Empty response body. Execution dump:`,
      JSON.stringify(execution, null, 2).slice(0, 3000),
    );
    throw new Error(
      `Function ${functionId} completed but returned empty response body`,
    );
  }

  try {
    const parsed = JSON.parse(responseBody) as T;
    console.log(
      `[Appwrite] Function ${functionId} response:`,
      JSON.stringify(parsed).slice(0, 500),
    );
    return parsed;
  } catch {
    console.error(
      `[Appwrite] Non-JSON function response from ${functionId}:`,
      responseBody.slice(0, 500),
    );
    throw new Error(
      `Function ${functionId} returned non-JSON: ${responseBody}`,
    );
  }
}
