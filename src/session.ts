/**
 * Browserbase session lifecycle helpers.
 *
 * Browserbase's REST API is the only way to list/release sessions out-of-band.
 * Stagehand creates the session for us on `init()`, but two things still need
 * direct API calls:
 *   1. Dodging the concurrency limit (free tier = 1) by releasing any sessions
 *      left RUNNING by a previous crashed/aborted run — otherwise the next
 *      `init()` 429s. See `releaseRunningSessions`.
 *   2. Explicitly releasing a `keepAlive` session when we're done so it stops
 *      billing (keepAlive sessions stay up until released or they time out).
 *
 * The wire format is camelCase and auth is the `X-BB-API-Key` header.
 */

const BB_API = "https://api.browserbase.com/v1";

export interface BrowserbaseSession {
  id: string;
  status: string;
}

async function bbFetch(path: string, apiKey: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BB_API}${path}`, {
    ...init,
    headers: {
      "X-BB-API-Key": apiKey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

/** List sessions, optionally filtered by status (e.g. "RUNNING"). */
export async function listSessions(apiKey: string, status?: string): Promise<BrowserbaseSession[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await bbFetch(`/sessions${qs}`, apiKey);
  if (!res.ok) return [];
  return (await res.json()) as BrowserbaseSession[];
}

/** Ask Browserbase to release a single session (stops it + frees the slot). */
export async function requestRelease(apiKey: string, projectId: string, sessionId: string): Promise<boolean> {
  const res = await bbFetch(`/sessions/${sessionId}`, apiKey, {
    method: "POST",
    body: JSON.stringify({ projectId, status: "REQUEST_RELEASE" }),
  });
  return res.ok;
}

/**
 * Release every currently-RUNNING session for the project. Call this before
 * `init()` when you're on a low concurrency tier and a prior run may have left
 * a session alive — it turns a guaranteed 429 into a clean start.
 * Returns the number of sessions it released.
 */
export async function releaseRunningSessions(apiKey: string, projectId: string): Promise<number> {
  const running = await listSessions(apiKey, "RUNNING");
  await Promise.all(running.map((s) => requestRelease(apiKey, projectId, s.id)));
  return running.length;
}

/** The interactive live-view URL for a session (watch the cloud browser in real time). */
export async function liveViewUrl(apiKey: string, sessionId: string): Promise<string | null> {
  const res = await bbFetch(`/sessions/${sessionId}/debug`, apiKey);
  if (!res.ok) return null;
  const debug = (await res.json()) as { debuggerFullscreenUrl?: string; debuggerUrl?: string };
  return debug.debuggerFullscreenUrl ?? debug.debuggerUrl ?? null;
}
