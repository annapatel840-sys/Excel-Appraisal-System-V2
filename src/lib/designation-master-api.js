import { catalystFetch, catalystFunctionUrl, onCatalystWrite } from "@/lib/catalyst-api";

const API_URL = catalystFunctionUrl("designationmasterapi");

async function request({ method = "GET", body, params } = {}) {
  const url = new URL(API_URL);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));

  const response = await catalystFetch(url.toString(), {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });

  const result = await response.json().catch(() => null);

  if (!response.ok || result?.success !== true) {
    throw new Error(
      result?.message || `Designation Master request failed (${response.status}).`,
    );
  }

  return result.data;
}

/* Shared read. Designation Master and the Eligibility Criteria panel both load
   the same data; a request in flight, or a result under SHARED_READ_MS old, is
   reused instead of calling designationmasterapi again. Any save (any non-GET
   request) and the app's update events clear it, and { fresh: true } (the
   screen's Refresh / Retry buttons) always reads from the server. */
const SHARED_READ_MS = 15000;
let sharedLoad = null; // { startedAt, promise }
const copyOf = (data) => (data === undefined ? data : JSON.parse(JSON.stringify(data)));

export function invalidateDesignationMasterRead() {
  sharedLoad = null;
}

onCatalystWrite(invalidateDesignationMasterRead);
if (typeof window !== "undefined") {
  [
    "appraisal:cycle-updated",
    "appraisal:payroll-data-updated",
    "appraisal:feedback-data-updated",
    "appraisal:budget-data-updated",
  ].forEach((eventName) => window.addEventListener(eventName, invalidateDesignationMasterRead));
}

export function loadDesignationMaster({ fresh = false } = {}) {
  if (!fresh && sharedLoad && Date.now() - sharedLoad.startedAt <= SHARED_READ_MS) {
    return sharedLoad.promise.then(copyOf);
  }
  const entry = { startedAt: Date.now(), promise: null };
  entry.promise = request().catch((error) => {
    // A failed read is never shared; the next caller tries again.
    if (sharedLoad === entry) sharedLoad = null;
    throw error;
  });
  sharedLoad = entry;
  return entry.promise.then(copyOf);
}

export function saveDesignationMaster(data) {
  return request({
    method: "POST",
    body: data,
  });
}

/* ------------------------------------------------------------------
   Appraisal Sheet "New title" dropdown.
   loadDesignationRules() once per sheet load, then call newTitleChoices()
   when the user opens the dropdown for a row.
   ------------------------------------------------------------------ */
export function loadDesignationRules() {
  return request({ params: { view: "appraisal" } });
}

/* -> { ok, options, prefill, message }
   ok === false means: do not open the dropdown, show `message` in the
   Appraisal Sheet's existing error popup. */
export function newTitleChoices(rules, designation) {
  const name = String(designation || "").trim();
  const rule = rules?.rules?.[name.toLowerCase()];
  if (!rule) {
    return {
      ok: false,
      options: [],
      prefill: "",
      message: `${name || "This designation"} is not mapped to a next designation. Ask HR to map it in Designation Master.`,
    };
  }
  if (!rule.mapped) {
    return { ok: false, options: [], prefill: "", message: rule.message };
  }
  return {
    ok: true,
    options: rule.free ? rules.freeOptions || [] : rule.options,
    prefill: rule.prefill || "",
    message: "",
  };
}