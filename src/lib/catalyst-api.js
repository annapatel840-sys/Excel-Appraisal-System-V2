const PROJECT_FUNCTIONS_URL =
  "https://appraisalperformancehike-60088966704.development.catalystserverless.in/server";

const FUNCTIONS_BASE_URL = import.meta.env.DEV
  ? "http://localhost:3000/server"
  : import.meta.env.VITE_CATALYST_FUNCTIONS_URL || PROJECT_FUNCTIONS_URL;

export function catalystFunctionUrl(functionName) {
  return `${FUNCTIONS_BASE_URL.replace(/\/+$/, "")}/${functionName}/`;
}

export async function catalystFetch(input, options = {}) {
  const auth = window.catalyst?.auth;
  if (!auth?.generateAuthToken) {
    throw new Error(
      "Catalyst authentication is unavailable. Open this app through Slate or run it with catalyst serve.",
    );
  }

  const authResponse = await auth.generateAuthToken();
  if (!authResponse?.access_token) {
    throw new Error("Catalyst did not return an authentication token.");
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", authResponse.access_token);

  return fetch(input, {
    ...options,
    credentials: "include",
    headers,
  });
}
