import { catalystFetch, catalystFunctionUrl } from "./catalyst-api";

// historicalimportapi (HR only): previous-year payroll and review / feedback
// imported straight into storage for Closed or archived cycles.
export async function historicalImportRequest(
  resource,
  { method = "GET", body } = {},
) {
  const url = new URL(catalystFunctionUrl("historicalimportapi"));
  url.searchParams.set("resource", resource);

  const response = await catalystFetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`The historical import service returned an invalid response.`);
  }

  if (!response.ok || payload.success !== true) {
    // Catalyst (API Gateway, platform) errors put the text under data.message.
    const detail =
      payload.message ||
      payload.data?.message ||
      (payload.data?.error_code ? `Catalyst error ${payload.data.error_code}` : "");
    const error = new Error(
      detail
        ? `${detail} (HTTP ${response.status})`
        : `The historical import service could not be reached (HTTP ${response.status}).`,
    );
    error.status = response.status;
    throw error;
  }

  return payload.data;
}
