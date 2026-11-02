// Default production functions domain. This project currently deploys only the
// Catalyst Development environment, so the ".development." domain is intended.
// Override per build with VITE_CATALYST_FUNCTIONS_URL (e.g. for Production).
const PROJECT_FUNCTIONS_URL =
  "https://excelappraisalmanagement-60090194508.development.catalystserverless.in/server";

const FUNCTIONS_BASE_URL = import.meta.env.DEV
  ? "http://localhost:3000/server"
  : import.meta.env.VITE_CATALYST_FUNCTIONS_URL || PROJECT_FUNCTIONS_URL;

const AUTH_TOKEN_TIMEOUT_MS = 15000;
const SESSION_ENDED_MESSAGE =
  "Your Catalyst session has ended. Reload the page and sign in again.";

// The auth gate listens for this event and returns the user to sign-in.
export const CATALYST_SESSION_EXPIRED_EVENT = "catalyst-session-expired";

export function catalystFunctionUrl(functionName) {
  return `${FUNCTIONS_BASE_URL.replace(/\/+$/, "")}/${functionName}/`;
}

// Read caches (cycle list, eligibility, employee roster) register here and are
// cleared whenever any request other than GET/HEAD is sent through
// catalystFetch, so a read after a save never reuses data from before it.
const writeListeners = new Set();

export function onCatalystWrite(listener) {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

function notifyWrite() {
  writeListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error("Read cache invalidation failed:", error);
    }
  });
}

function notifySessionExpired() {
  window.dispatchEvent(new Event(CATALYST_SESSION_EXPIRED_EVENT));
}

// generateAuthToken() never settles when there is no session, so bound it.
function generateAuthTokenWithTimeout(auth) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(
      () => reject(new Error(SESSION_ENDED_MESSAGE)),
      AUTH_TOKEN_TIMEOUT_MS,
    );
  });
  return Promise.race([auth.generateAuthToken(), timeout]).finally(() =>
    window.clearTimeout(timer),
  );
}

// Catalyst applies a shared COMPONENT concurrency limit across functions.
// A screen mount can request the roster, cycles, budget, feedback and audit at
 // once. Keep browser-originated function calls bounded so those independent
 // providers do not overwhelm Catalyst during initial load.
const MAX_CATALYST_REQUESTS = 3;
let activeCatalystRequests = 0;
const catalystRequestQueue = [];

async function acquireCatalystSlot() {
  if (activeCatalystRequests < MAX_CATALYST_REQUESTS) {
    activeCatalystRequests += 1;
    return;
  }
  // A queued caller inherits the slot released by the previous request.
  await new Promise((resolve) => catalystRequestQueue.push(resolve));
}

function releaseCatalystSlot() {
  const next = catalystRequestQueue.shift();
  if (next) {
    next();
    return;
  }
  activeCatalystRequests = Math.max(0, activeCatalystRequests - 1);
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get("Retry-After"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 5000);
  }
  return 400 * (2 ** attempt) + Math.floor(Math.random() * 250);
}

export async function catalystFetch(input, options = {}) {
  const auth = window.catalyst?.auth;
  if (!auth?.generateAuthToken) {
    throw new Error(
      "Catalyst authentication is unavailable. Open this app through Slate or run it with catalyst serve.",
    );
  }

  let authResponse;
  try {
    authResponse = await generateAuthTokenWithTimeout(auth);
  } catch (error) {
    if (error?.message === SESSION_ENDED_MESSAGE) notifySessionExpired();
    throw error;
  }
  if (!authResponse?.access_token) {
    throw new Error("Catalyst did not return an authentication token.");
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", authResponse.access_token);

  const method = String(options.method || "GET").toUpperCase();
  const isWrite = method !== "GET" && method !== "HEAD";
  if (isWrite) notifyWrite();

  const canRetryRead = !isWrite && !options.signal?.aborted;
  let response;
  try {
    await acquireCatalystSlot();
    try {
      for (let attempt = 0; ; attempt += 1) {
        response = await fetch(input, {
          ...options,
          credentials: "include",
          headers,
        });
        const retryable = canRetryRead && [408, 429, 502, 503, 504].includes(response.status);
        if (!retryable || attempt >= 3 || options.signal?.aborted) break;
        const delay = retryDelay(response, attempt);
        console.warn(
          "Catalyst read throttled; retrying after backoff:",
          response.status,
          String(input),
          "attempt",
          attempt + 1,
        );
        await new Promise((resolve) => window.setTimeout(resolve, delay));
      }
    } finally {
      releaseCatalystSlot();
    }
  } finally {
    // Clear again once the write has landed: a read that started during the
    // write must not be shared with callers that come after it.
    if (isWrite) notifyWrite();
  }

  if (response.status === 401) notifySessionExpired();

  return response;
}
