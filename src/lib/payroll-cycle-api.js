const API_URL = "/server/payrollcycleapi/execute";

export async function payrollCycleRequest(resource, { method = "GET", body } = {}) {
  const url = new URL(API_URL, window.location.origin);
  url.searchParams.set("resource", resource);

  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`The ${resource} service returned an invalid response.`);
  }

  if (!response.ok || payload.success !== true) {
    const error = new Error(payload.message || "The request failed.");
    error.status = response.status;
    throw error;
  }

  return payload.data;
}
