import { catalystFetch, catalystFunctionUrl, onCatalystWrite } from "./catalyst-api";

/* Shared reads. Several providers and screens ask for the same cycle list
   (and the eligibility list) during one page load. A GET for one of these
   resources reuses a request already in flight, or a result under
   SHARED_READ_MS old, instead of calling payrollcycleapi again. Any save
   (any non-GET request) and the app's update events clear the shared copies,
   so a read after a change always goes to the server. */
const SHARED_READ_RESOURCES = new Set(["cycles", "eligibility", "locations", "schema"]);
const SHARED_READ_MS = 15000;
const sharedReads = new Map(); // url -> { startedAt, promise }

// Each caller gets its own copy, so one screen sorting or editing the list
// cannot change what another screen receives.
const copyOf = (data) => (data === undefined ? data : JSON.parse(JSON.stringify(data)));

export function invalidatePayrollCycleReads() {
  sharedReads.clear();
}

onCatalystWrite(invalidatePayrollCycleReads);
if (typeof window !== "undefined") {
  [
    "appraisal:cycle-updated",
    "appraisal:payroll-data-updated",
    "appraisal:feedback-data-updated",
    "appraisal:budget-data-updated",
  ].forEach((eventName) => window.addEventListener(eventName, invalidatePayrollCycleReads));
}

async function sendPayrollCycleRequest(url, resource, method, body) {
  const response = await catalystFetch(url, {
    method,
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

export async function payrollCycleRequest(
  resource,
  { method = "GET", body, query = {} } = {},
) {
  // Advanced I/O function URLs do not include /execute.
  const url = new URL(catalystFunctionUrl("payrollcycleapi"));
  url.searchParams.set("resource", resource);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const isSharedRead =
    String(method).toUpperCase() === "GET" && !body && SHARED_READ_RESOURCES.has(resource);
  if (!isSharedRead) return sendPayrollCycleRequest(url, resource, method, body);

  const key = url.toString();
  const shared = sharedReads.get(key);
  if (shared && Date.now() - shared.startedAt <= SHARED_READ_MS) return shared.promise.then(copyOf);
  const entry = { startedAt: Date.now(), promise: null };
  entry.promise = sendPayrollCycleRequest(url, resource, method, body).catch((error) => {
    // A failed read is never shared; the next caller tries again.
    if (sharedReads.get(key) === entry) sharedReads.delete(key);
    throw error;
  });
  sharedReads.set(key, entry);
  return entry.promise.then(copyOf);
}
