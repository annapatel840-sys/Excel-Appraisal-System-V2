/* ============================================================
   API FETCH (login token for Catalyst functions)

   The React app (Catalyst Slate: *.onslate.in) and the functions
   (*.catalystserverless.in) live on DIFFERENT domains, so browser
   cookies are not enough. Catalyst gives us a user token:
   catalyst.auth.generateAuthToken()  (Web SDK v4.6.1+)
   and the function reads it from the Authorization header.

   This file wraps window.fetch ONCE so every existing fetch() call
   to a Catalyst function automatically carries the token.
   No other file has to change.
   ============================================================ */

const FUNCTION_URL_PATTERN = /\.catalystserverless\.[a-z.]+\/server\//i;

// Catalyst tokens live for 1 hour; refresh a little earlier.
const TOKEN_LIFETIME_MS = 50 * 60 * 1000;

let cachedToken = null;
let cachedUntil = 0;

export function clearAuthToken() {
  cachedToken = null;
  cachedUntil = 0;
}

async function getAuthToken() {
  const now = Date.now();

  if (cachedToken && now < cachedUntil) {
    return cachedToken;
  }

  const auth = window.catalyst && window.catalyst.auth;

  if (!auth || typeof auth.generateAuthToken !== "function") {
    throw new Error(
      "Catalyst Web SDK is missing or older than v4.6.1 (generateAuthToken not found). Check the script tags in index.html.",
    );
  }

  const response = await auth.generateAuthToken();
  const token = response && response.access_token;

  if (!token) {
    throw new Error("Could not get a login token. Please log in again.");
  }

  cachedToken = token;
  cachedUntil = now + TOKEN_LIFETIME_MS;

  return token;
}

const nativeFetch = window.fetch.bind(window);

window.fetch = async function (input, init) {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input && input.url
          ? input.url
          : "";

  if (!FUNCTION_URL_PATTERN.test(url)) {
    return nativeFetch(input, init);
  }

  const token = await getAuthToken();

  const headers = new Headers(
    (init && init.headers) || (input instanceof Request ? input.headers : {}),
  );

  headers.set("Authorization", token);

  const response = await nativeFetch(input, { ...(init || {}), headers });

  if (response.status === 401) {
    clearAuthToken();
    window.dispatchEvent(new Event("auth:unauthorized"));
  }

  return response;
};
