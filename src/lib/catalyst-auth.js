/* ============================================================
   CATALYST HOSTED AUTHENTICATION
   Relies on the Catalyst Web SDK loaded in index.html:
     catalystWebSDK.js  +  /__catalyst/sdk/init.js
   ============================================================ */

export const LOGIN_URL = "/__catalyst/auth/login";

const SDK_TIMEOUT_MS = 10000;

let sdkPromise = null;

export function waitForCatalyst() {
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const check = () => {
      const sdk = window.catalyst;

      if (sdk?.auth?.isUserAuthenticated) {
        resolve(sdk);
        return;
      }

      if (Date.now() - startedAt > SDK_TIMEOUT_MS) {
        sdkPromise = null;
        reject(
          new Error(
            "Catalyst Web SDK did not load. Run the app with `catalyst serve` or open the deployed Slate URL.",
          ),
        );
        return;
      }

      setTimeout(check, 100);
    };

    check();
  });

  return sdkPromise;
}

// Resolves with the logged-in user, or null when not authenticated.
export async function getCurrentUser() {
  const sdk = await waitForCatalyst();

  try {
    const result = await sdk.auth.isUserAuthenticated();
    return result?.content ?? null;
  } catch {
    return null;
  }
}

export function redirectToLogin() {
  window.location.href = LOGIN_URL;
}

export function signOut() {
  // signOut requires a redirect URL and does not return a promise.
  window.catalyst?.auth?.signOut(window.location.origin + "/");
}

/* ============================================================
   AUTHENTICATED FETCH
   The functions live on the project domain (*.catalystserverless.in),
   a different origin from Slate (*.onslate.in), so session cookies are not sent.
   Attach a Catalyst auth token instead.
   ============================================================ */

function isCatalystFunctionUrl(input) {
  const url = typeof input === "string" ? input : input?.url ?? String(input);
  return url.includes(".catalystserverless.") && url.includes("/server/");
}

export async function authFetch(input, init = {}) {
  if (!isCatalystFunctionUrl(input)) {
    return fetch(input, init);
  }

  const sdk = await waitForCatalyst();
  const tokenResponse = await sdk.auth.generateAuthToken();
  const token = tokenResponse?.access_token;

  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", token);

  const response = await fetch(input, { ...init, headers });

  if (response.status === 401) {
    redirectToLogin();
  }

  return response;
}
